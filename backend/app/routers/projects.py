from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from .. import db, services
from ..config import MAX_UPLOAD_MB, SAMPLE_DATA
from ..engine import stats as st
from ..engine.ingest import infer_mapping, propose_metrics, read_table
from ..security import current_user, is_gt, project_for, require_gt

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _card(p: dict) -> dict:
    ds = db.one("SELECT id, filename, uploaded_at, rows FROM datasets WHERE project_id = ? ORDER BY id DESC LIMIT 1", p["id"])
    bls = db.all_("SELECT id, version, status, results, updated_at FROM baselines WHERE project_id = ? ORDER BY version DESC", p["id"])
    latest = bls[0] if bls else None
    approved = next((b for b in bls if b["status"] == "approved"), None)
    focus = approved or latest
    return {
        "id": p["id"], "name": p["name"], "client": p["client"], "org_id": p["org_id"],
        "lifecycle": p["lifecycle"], "size_unit": p["size_unit"], "period": p["period"],
        "description": p["description"], "created_at": p["created_at"],
        "n_metrics": sum(m.get("enabled", True) for m in p["metrics"]),
        "n_rows": len(ds["rows"]) if ds else 0,
        "dataset": ds and {"filename": ds["filename"], "uploaded_at": ds["uploaded_at"]},
        "versions": len(bls),
        "latest": latest and {"id": latest["id"], "version": latest["version"], "status": latest["status"],
                              "updated_at": latest["updated_at"]},
        "approved_version": approved and approved["version"],
        "summary": focus and (focus["results"] or {}).get("summary"),
    }


@router.get("")
def list_projects(limit: int = 100, offset: int = 0, u: dict = Depends(current_user)):
    if is_gt(u):
        ps = db.all_("SELECT * FROM projects ORDER BY id DESC LIMIT ? OFFSET ?", limit, offset)
    else:
        ps = db.all_("SELECT * FROM projects WHERE org_id = ? ORDER BY id DESC LIMIT ? OFFSET ?", u["org_id"], limit, offset)
    return [_card(p) for p in ps]


class ProjectIn(BaseModel):
    name: str
    client: str
    org_id: Optional[int] = None
    description: Optional[str] = None
    lifecycle: Optional[str] = "Development"
    size_unit: Optional[str] = "FP"
    period: Optional[str] = None
    use_sample: bool = False


@router.post("")
def create_project(body: ProjectIn, u: dict = Depends(require_gt)):
    org_id = body.org_id
    if not org_id:
        org = db.one("SELECT id FROM orgs WHERE name = ?", body.client.strip())
        org_id = org["id"] if org else db.exec_("INSERT INTO orgs (name) VALUES (?)", body.client.strip())
    pid = db.exec_("""INSERT INTO projects (name, client, org_id, description, lifecycle, size_unit, period,
                      metrics, models, created_at, created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                   body.name.strip(), body.client.strip(), org_id, body.description, body.lifecycle,
                   body.size_unit or "FP", body.period, [], [], db.now(), u["id"])
    db.audit(pid, u, "Created project", body.name)
    if body.use_sample:
        _ingest(pid, SAMPLE_DATA.read_bytes(), SAMPLE_DATA.name, u)
    return _card(db.one("SELECT * FROM projects WHERE id = ?", pid))


@router.get("/{pid}")
def get_project(pid: int, u: dict = Depends(current_user)):
    p = project_for(pid, u)
    card = _card(p)
    card["metrics"] = p["metrics"]
    card["models"] = p["models"]
    ds = services.latest_dataset(pid)
    card["dataset"] = ds and services.dataset_view(ds, p["metrics"], include_rows=False)
    card["baselines"] = [services.summary_of(b) for b in db.all_(
        """SELECT b.*, u.name AS created_by_name, a.name AS approved_by_name FROM baselines b
           LEFT JOIN users u ON u.id = b.created_by LEFT JOIN users a ON a.id = b.approved_by
           WHERE project_id = ? ORDER BY version DESC""", pid)]
    return card


class ProjectPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    lifecycle: Optional[str] = None
    size_unit: Optional[str] = None
    period: Optional[str] = None


@router.patch("/{pid}")
def patch_project(pid: int, body: ProjectPatch, u: dict = Depends(require_gt)):
    project_for(pid, u)
    for k, v in body.model_dump(exclude_none=True).items():
        db.exec_(f"UPDATE projects SET {k} = ? WHERE id = ?", v, pid)  # k is from the model's fixed fields
    db.audit(pid, u, "Updated project details")
    return get_project(pid, u)


@router.delete("/{pid}")
def delete_project(pid: int, u: dict = Depends(require_gt)):
    p = project_for(pid, u)
    db.exec_("DELETE FROM projects WHERE id = ?", pid)
    db.audit(None, u, "Deleted project", p["name"])
    return {"ok": True}


# ---------------------------------------------------------------- dataset ---
def _ingest(pid: int, content: bytes, filename: str, u: dict) -> dict:
    try:
        df = read_table(content, filename)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(400, f"Could not read file: {e}")
    if df.empty:
        raise HTTPException(400, "The file has no data rows.")
    mapping = infer_mapping(df)
    rows = df.astype(object).where(df.notna(), None).to_dict("records")
    for r in rows:
        for k, v in r.items():
            if hasattr(v, "isoformat"):
                r[k] = v.isoformat()
    db.exec_("INSERT INTO datasets (project_id, filename, uploaded_at, uploaded_by, columns, rows, mapping) VALUES (?,?,?,?,?,?,?)",
             pid, filename, db.now(), u["id"], list(df.columns), rows, mapping)
    p = db.one("SELECT * FROM projects WHERE id = ?", pid)
    if not p["metrics"]:
        db.exec_("UPDATE projects SET metrics = ? WHERE id = ?", propose_metrics(mapping, p["size_unit"] or "FP"), pid)
    db.audit(pid, u, "Uploaded dataset", f"{filename} · {len(df)} rows")
    return get_dataset(pid, u)


@router.post("/{pid}/dataset")
async def upload(pid: int, file: UploadFile = File(...), u: dict = Depends(require_gt)):
    project_for(pid, u)
    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File is larger than {MAX_UPLOAD_MB} MB.")
    return _ingest(pid, content, file.filename or "upload.xlsx", u)


@router.post("/{pid}/dataset/sample")
def load_sample(pid: int, u: dict = Depends(require_gt)):
    project_for(pid, u)
    return _ingest(pid, SAMPLE_DATA.read_bytes(), SAMPLE_DATA.name, u)


@router.get("/{pid}/dataset")
def get_dataset(pid: int, u: dict = Depends(current_user)):
    p = project_for(pid, u)
    ds = services.latest_dataset(pid)
    if not ds:
        return None
    return services.dataset_view(ds, p["metrics"])


class MappingIn(BaseModel):
    mapping: dict[str, Any]
    regenerate_metrics: bool = False


@router.put("/{pid}/dataset/mapping")
def put_mapping(pid: int, body: MappingIn, u: dict = Depends(require_gt)):
    p = project_for(pid, u)
    ds = services.require_dataset(pid)
    cols = set(ds["columns"])
    m = body.mapping
    for k in ("id", "size", "date"):
        if m.get(k) and m[k] not in cols:
            raise HTTPException(400, f"Unknown column: {m[k]}")
    for k in ("effort", "defect", "group"):
        m[k] = [c for c in (m.get(k) or []) if c in cols]
    db.exec_("UPDATE datasets SET mapping = ? WHERE id = ?", m, ds["id"])
    if body.regenerate_metrics:
        db.exec_("UPDATE projects SET metrics = ? WHERE id = ?", propose_metrics(m, p["size_unit"] or "FP"), pid)
    db.audit(pid, u, "Updated column mapping", "metrics regenerated" if body.regenerate_metrics else "")
    return get_dataset(pid, u)


# ---------------------------------------------------------------- metrics ---
class MetricsIn(BaseModel):
    metrics: list[dict[str, Any]]


@router.put("/{pid}/metrics")
def put_metrics(pid: int, body: MetricsIn, u: dict = Depends(require_gt)):
    project_for(pid, u)
    keys = [m.get("key") for m in body.metrics]
    if len(set(keys)) != len(keys) or not all(keys):
        raise HTTPException(400, "Every metric needs a unique key")
    for m in body.metrics:
        if not m.get("name") or not m.get("numerator"):
            raise HTTPException(400, "Every metric needs a name and a numerator")
        for f in ("lsl", "usl", "goal"):
            if m.get(f) in ("", None):
                m[f] = None
            else:
                m[f] = float(m[f])
    db.exec_("UPDATE projects SET metrics = ? WHERE id = ?", body.metrics, pid)
    db.audit(pid, u, "Updated metric definitions", f"{sum(m.get('enabled', True) for m in body.metrics)} enabled")
    return body.metrics


# ---------------------------------------------------------------- analysis ---
def _baseline_or_none(pid: int, bid: Optional[int]) -> Optional[dict]:
    if not bid:
        return None
    b = db.one("SELECT * FROM baselines WHERE id = ? AND project_id = ?", bid, pid)
    if not b:
        raise HTTPException(404, "Baseline not found")
    return b


class StratIn(BaseModel):
    metric: str
    group: str
    baseline_id: Optional[int] = None


@router.post("/{pid}/stratify")
def stratify(pid: int, body: StratIn, u: dict = Depends(current_user)):
    p = project_for(pid, u)
    return services.stratify(p, _baseline_or_none(pid, body.baseline_id), body.metric, body.group)


@router.get("/{pid}/variables")
def variables(pid: int, u: dict = Depends(current_user)):
    """Everything that can be a model variable or a stratification group."""
    p = project_for(pid, u)
    ds = services.latest_dataset(pid)
    if not ds:
        return {"metrics": [], "columns": [], "groups": []}
    m = ds["mapping"]
    numeric = [c for c in [m.get("size")] + m.get("effort", []) + m.get("defect", []) if c]
    groups = list(m.get("group", [])) + (["ID prefix"] if m.get("id") else [])
    return {
        "metrics": [{"key": x["key"], "name": x["name"], "unit": x.get("unit")} for x in p["metrics"] if x.get("enabled", True)],
        "columns": numeric,
        "groups": groups,
    }


class ModelIn(BaseModel):
    y: str
    xs: list[str]
    baseline_id: Optional[int] = None
    name: Optional[str] = None


def _public_model(m: dict) -> dict:
    return {k: v for k, v in m.items() if not k.startswith("_")}


@router.post("/{pid}/model")
def model(pid: int, body: ModelIn, u: dict = Depends(current_user)):
    p = project_for(pid, u)
    return _public_model(services.fit_model(p, _baseline_or_none(pid, body.baseline_id), body.y, body.xs))


class PredictIn(ModelIn):
    values: list[float]


@router.post("/{pid}/model/predict")
def predict(pid: int, body: PredictIn, u: dict = Depends(current_user)):
    p = project_for(pid, u)
    m = services.fit_model(p, _baseline_or_none(pid, body.baseline_id), body.y, body.xs)
    if len(body.values) != len(body.xs):
        raise HTTPException(400, "One value per predictor")
    out = st.ols_predict(m, body.values)
    out["extrapolating"] = [x for x, v in zip(body.xs, body.values)
                            if not (m["x_ranges"][x][0] <= v <= m["x_ranges"][x][1])]
    return out


@router.post("/{pid}/models")
def save_model(pid: int, body: ModelIn, u: dict = Depends(require_gt)):
    p = project_for(pid, u)
    m = services.fit_model(p, _baseline_or_none(pid, body.baseline_id), body.y, body.xs)
    entry = {
        "id": max([x["id"] for x in p["models"]] + [0]) + 1, "name": body.name or f"{body.y} model",
        "y": body.y, "xs": body.xs, "baseline_id": body.baseline_id, "r2": m["r2"], "adj_r2": m["adj_r2"],
        "n": m["n"], "usable": m["usable"], "saved_at": db.now(), "saved_by": u["name"],
        "equation": {c["term"]: c["coef"] for c in m["coefficients"]},
    }
    db.exec_("UPDATE projects SET models = ? WHERE id = ?", p["models"] + [entry], pid)
    db.audit(pid, u, "Saved process performance model", entry["name"])
    return entry


@router.delete("/{pid}/models/{mid}")
def delete_model(pid: int, mid: int, u: dict = Depends(require_gt)):
    p = project_for(pid, u)
    db.exec_("UPDATE projects SET models = ? WHERE id = ?", [m for m in p["models"] if m["id"] != mid], pid)
    db.audit(pid, u, "Deleted process performance model", str(mid))
    return {"ok": True}


@router.get("/{pid}/audit")
def audit(pid: int, u: dict = Depends(current_user)):
    project_for(pid, u)
    return db.all_("SELECT * FROM audit WHERE project_id = ? ORDER BY id DESC LIMIT 500", pid)
