from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from .. import db, services
from ..engine import stats as st
from ..engine.baseline import DEFAULT_SETTINGS
from ..reports import export
from ..security import APPROVER_ROLES, current_user, project_for, require_gt

router = APIRouter(prefix="/api", tags=["baselines"])


def _load(bid: int, u: dict) -> tuple[dict, dict]:
    b = db.one("""SELECT b.*, c.name AS created_by_name, a.name AS approved_by_name, s.name AS submitted_by_name
                  FROM baselines b LEFT JOIN users c ON c.id = b.created_by
                  LEFT JOIN users a ON a.id = b.approved_by LEFT JOIN users s ON s.id = b.submitted_by
                  WHERE b.id = ?""", bid)
    if not b:
        raise HTTPException(404, "Baseline not found")
    return project_for(b["project_id"], u), b


def _editable(b: dict) -> None:
    if b["status"] != "draft":
        raise HTTPException(409, f"Baseline v{b['version']} is {b['status']}. Return it to draft to change it.")


def _save_results(b: dict) -> None:
    b["results"] = services.run(b)
    db.exec_("UPDATE baselines SET results = ?, exclusions = ?, settings = ?, updated_at = ? WHERE id = ?",
             b["results"], b["exclusions"], b["settings"], db.now(), b["id"])


@router.get("/settings/defaults")
def defaults(_: dict = Depends(current_user)):
    return DEFAULT_SETTINGS


class NewBaseline(BaseModel):
    label: str | None = None
    settings: dict[str, Any] | None = None
    carry_exclusions_from: int | None = None


@router.post("/projects/{pid}/baselines")
def create(pid: int, body: NewBaseline, u: dict = Depends(require_gt)):
    p = project_for(pid, u)
    ds = services.require_dataset(pid)
    if not any(m.get("enabled", True) for m in p["metrics"]):
        raise HTTPException(400, "Enable at least one metric first.")
    v = (db.one("SELECT MAX(version) AS v FROM baselines WHERE project_id = ?", pid)["v"] or 0) + 1
    excl: dict = {}
    if body.carry_exclusions_from:
        prev = db.one("SELECT exclusions, dataset_id FROM baselines WHERE id = ? AND project_id = ?", body.carry_exclusions_from, pid)
        if prev and prev["dataset_id"] == ds["id"]:
            excl = prev["exclusions"]
    b = {"project_id": pid, "dataset_id": ds["id"], "version": v, "metrics": p["metrics"],
         "settings": {**DEFAULT_SETTINGS, **(body.settings or {})}, "exclusions": excl}
    b["results"] = services.run(b)
    bid = db.exec_("""INSERT INTO baselines (project_id, dataset_id, version, label, status, settings, metrics,
                      exclusions, results, created_at, created_by, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                   pid, ds["id"], v, body.label or f"Baseline v{v}", "draft", b["settings"], p["metrics"],
                   excl, b["results"], db.now(), u["id"], db.now())
    db.audit(pid, u, "Ran baseline", f"v{v} · {b['results']['summary']['metrics']} metrics")
    return get(bid, u)


@router.get("/baselines/{bid}")
def get(bid: int, u: dict = Depends(current_user)):
    _, b = _load(bid, u)
    return b


class ExclusionIn(BaseModel):
    metric: str
    row: int
    reason: str | None = None  # None/empty re-includes the point


@router.patch("/baselines/{bid}/exclusions")
def exclude(bid: int, body: ExclusionIn, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    _editable(b)
    ex = b["exclusions"].setdefault(body.metric, {})
    reason = (body.reason or "").strip()
    if reason:
        if len(reason) < 10:
            raise HTTPException(400, "Record the assignable cause (at least 10 characters).")
        ex[str(body.row)] = f"{reason} — {u['name']}, {db.now()[:10]}"
        action = "Excluded data point"
    else:
        ex.pop(str(body.row), None)
        action = "Re-included data point"
    _save_results(b)
    db.audit(p["id"], u, action, f"v{b['version']} · {body.metric} · row {body.row + 1}" + (f" · {reason}" if reason else ""))
    return get(bid, u)


class SettingsIn(BaseModel):
    settings: dict[str, Any]
    label: str | None = None


@router.patch("/baselines/{bid}/settings")
def settings(bid: int, body: SettingsIn, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    _editable(b)
    b["settings"] = {**b["settings"], **body.settings}
    if body.label:
        db.exec_("UPDATE baselines SET label = ? WHERE id = ?", body.label, bid)
    _save_results(b)
    db.audit(p["id"], u, "Changed baseline settings", f"v{b['version']}")
    return get(bid, u)


@router.post("/baselines/{bid}/refresh-metrics")
def refresh_metrics(bid: int, u: dict = Depends(require_gt)):
    """Pull the project's current metric definitions into a draft."""
    p, b = _load(bid, u)
    _editable(b)
    b["metrics"] = p["metrics"]
    db.exec_("UPDATE baselines SET metrics = ? WHERE id = ?", p["metrics"], bid)
    _save_results(b)
    db.audit(p["id"], u, "Refreshed metric definitions in baseline", f"v{b['version']}")
    return get(bid, u)


class ReviewIn(BaseModel):
    note: str | None = None


@router.post("/baselines/{bid}/submit")
def submit(bid: int, body: ReviewIn, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    _editable(b)
    db.exec_("UPDATE baselines SET status='submitted', submitted_by=?, submitted_at=?, review_note=? WHERE id=?",
             u["id"], db.now(), body.note, bid)
    db.audit(p["id"], u, "Submitted baseline for approval", f"v{b['version']}" + (f" · {body.note}" if body.note else ""))
    return get(bid, u)


@router.post("/baselines/{bid}/approve")
def approve(bid: int, body: ReviewIn, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    if u["role"] not in APPROVER_ROLES:
        raise HTTPException(403, "Only a GT Director or Admin can approve baselines")
    if b["status"] != "submitted":
        raise HTTPException(409, "Only submitted baselines can be approved")
    if b["submitted_by"] == u["id"]:
        raise HTTPException(403, "You submitted this baseline. Another approver must approve it.")
    # The previously approved version is superseded, so exactly one baseline is in force.
    db.exec_("UPDATE baselines SET status='superseded' WHERE project_id=? AND status='approved'", p["id"])
    db.exec_("UPDATE baselines SET status='approved', approved_by=?, approved_at=?, review_note=? WHERE id=?",
             u["id"], db.now(), body.note or b["review_note"], bid)
    db.audit(p["id"], u, "Approved baseline", f"v{b['version']}" + (f" · {body.note}" if body.note else ""))
    return get(bid, u)


@router.post("/baselines/{bid}/return")
def return_to_draft(bid: int, body: ReviewIn, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    if b["status"] == "approved" and u["role"] not in APPROVER_ROLES:
        raise HTTPException(403, "Only a GT Director or Admin can reopen an approved baseline")
    if b["status"] not in ("submitted", "approved"):
        raise HTTPException(409, "Baseline is already a draft")
    db.exec_("UPDATE baselines SET status='draft', approved_by=NULL, approved_at=NULL, review_note=? WHERE id=?",
             body.note, bid)
    db.audit(p["id"], u, "Returned baseline to draft", f"v{b['version']}" + (f" · {body.note}" if body.note else ""))
    return get(bid, u)


@router.delete("/baselines/{bid}")
def delete(bid: int, u: dict = Depends(require_gt)):
    p, b = _load(bid, u)
    _editable(b)
    db.exec_("DELETE FROM baselines WHERE id = ?", bid)
    db.audit(p["id"], u, "Deleted draft baseline", f"v{b['version']}")
    return {"ok": True}


@router.get("/baselines/{a}/compare/{b}")
def compare(a: int, b: int, u: dict = Depends(current_user)):
    pa, A = _load(a, u)
    pb, B = _load(b, u)
    if pa["id"] != pb["id"]:
        raise HTTPException(400, "Compare versions of the same project")
    keys = [m["key"] for m in A["results"]["metrics"]]
    rows = []
    for k in keys:
        ma = next((m for m in A["results"]["metrics"] if m["key"] == k), None)
        mb = next((m for m in B["results"]["metrics"] if m["key"] == k), None)
        if not mb or "stats" not in ma or "stats" not in mb:
            continue
        xa, xb = services.included_values(A, k), services.included_values(B, k)
        t = st.compare_two(xa, xb)
        rows.append({
            "key": k, "name": ma["name"], "unit": ma.get("unit"), "direction": ma.get("direction"),
            "a": {"n": ma["stats"]["n"], "mean": ma["stats"]["mean"], "median": ma["stats"]["median"],
                  "sd": ma["stats"]["sd"], "baseline": ma["baseline"], "rag": ma["rag"]},
            "b": {"n": mb["stats"]["n"], "mean": mb["stats"]["mean"], "median": mb["stats"]["median"],
                  "sd": mb["stats"]["sd"], "baseline": mb["baseline"], "rag": mb["rag"]},
            "tests": t,
        })
    return {"a": {"id": A["id"], "version": A["version"], "label": A["label"], "status": A["status"]},
            "b": {"id": B["id"], "version": B["version"], "label": B["label"], "status": B["status"]},
            "rows": rows}


MEDIA = {
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


@router.get("/baselines/{bid}/export/{fmt}")
def export_file(bid: int, fmt: str, u: dict = Depends(current_user)):
    p, b = _load(bid, u)
    if fmt not in MEDIA:
        raise HTTPException(400, "Format must be xlsx, docx or pptx")
    data = export.build(fmt, p, b)
    name = f"PPB_{re.sub(r'[^A-Za-z0-9]+', '_', p['name']).strip('_')}_v{b['version']}.{fmt}"
    db.audit(p["id"], u, "Exported report", f"v{b['version']} · {fmt.upper()}")
    return Response(data, media_type=MEDIA[fmt], headers={"Content-Disposition": f'attachment; filename="{name}"'})
