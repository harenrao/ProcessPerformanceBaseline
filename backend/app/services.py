"""Glue between stored records and the analysis engine."""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException

from . import db
from .engine import baseline as bl
from .engine import stats as st
from .engine.ingest import quality_report


def latest_dataset(project_id: int) -> Optional[dict]:
    return db.one("SELECT * FROM datasets WHERE project_id = ? ORDER BY id DESC LIMIT 1", project_id)


def frame_of(ds: dict) -> pd.DataFrame:
    return pd.DataFrame(ds["rows"], columns=ds["columns"])


def require_dataset(project_id: int) -> dict:
    ds = latest_dataset(project_id)
    if not ds:
        raise HTTPException(400, "Upload a dataset first.")
    return ds


def dataset_view(ds: dict, metrics: list[dict], include_rows: bool = True) -> dict:
    df = frame_of(ds)
    out = {k: ds[k] for k in ("id", "filename", "uploaded_at", "columns", "mapping")}
    out["n_rows"] = len(df)
    out["quality"] = quality_report(df, ds["mapping"], metrics)
    if include_rows:
        out["rows"] = ds["rows"][:2000]
    return out


def run(b: dict) -> dict:
    ds = db.one("SELECT * FROM datasets WHERE id = ?", b["dataset_id"])
    if not ds:
        raise HTTPException(400, "The dataset behind this baseline was removed.")
    return bl.run_baseline(frame_of(ds), ds["mapping"], b["metrics"], b["settings"], b["exclusions"])


def summary_of(b: dict) -> dict:
    r = b.get("results") or {}
    return {k: b.get(k) for k in ("id", "project_id", "dataset_id", "version", "label", "status", "created_at",
                                  "updated_at", "submitted_at", "approved_at", "review_note")} | {
        "summary": r.get("summary"), "created_by_name": b.get("created_by_name"),
        "approved_by_name": b.get("approved_by_name"),
    }


def included_values(b: dict, key: str) -> Optional[np.ndarray]:
    m = next((m for m in (b.get("results") or {}).get("metrics", []) if m["key"] == key), None)
    if not m or "points" not in m:
        return None
    return np.array([p["value"] for p in m["points"] if not p["excluded"]])


def metric_table(project: dict, baseline: Optional[dict]) -> pd.DataFrame:
    """Row-level metric values, with a baseline's exclusions applied when one is given."""
    ds = baseline and db.one("SELECT * FROM datasets WHERE id = ?", baseline["dataset_id"]) or require_dataset(project["id"])
    metrics = baseline["metrics"] if baseline else project["metrics"]
    t = bl.metric_frame(frame_of(ds), ds["mapping"], metrics)
    if baseline:
        for key, ex in (baseline.get("exclusions") or {}).items():
            if key in t:
                t.loc[t["__row"].astype(str).isin(ex.keys()), key] = np.nan
    return t


def stratify(project: dict, baseline: Optional[dict], metric: str, group: str) -> dict:
    t = metric_table(project, baseline)
    if metric not in t:
        raise HTTPException(400, "Unknown metric")
    gcol = "grp:" + group
    if gcol not in t:
        raise HTTPException(400, "Unknown grouping column")
    sub = t[[metric, gcol]].dropna()
    groups = {str(k): v[metric].to_numpy(float) for k, v in sub.groupby(gcol)}
    res = st.compare_groups(groups)
    res["points"] = [{"group": g, "value": float(v)} for g, v in zip(sub[gcol], sub[metric])]
    small = [k for k, v in groups.items() if len(v) < 10]
    if res.get("differ"):
        res["recommendation"] = ("Groups differ significantly (Kruskal-Wallis p < 0.05). Publish a separate "
                                 "baseline per group" + (f"; {', '.join(small)} need more data first." if small else "."))
    elif "tests" in res:
        res["recommendation"] = "No significant difference between groups. One pooled baseline is defensible."
    return res


def fit_model(project: dict, baseline: Optional[dict], y: str, xs: list[str]) -> dict:
    if not xs:
        raise HTTPException(400, "Pick at least one predictor.")
    t = metric_table(project, baseline)
    raw = frame_of(require_dataset(project["id"]) if not baseline else
                   db.one("SELECT * FROM datasets WHERE id = ?", baseline["dataset_id"]))
    cols = {}
    for c in [y] + xs:
        if c in t:
            cols[c] = t[c].to_numpy(float)
        elif c in raw:
            cols[c] = pd.to_numeric(raw.loc[t.index, c], errors="coerce").to_numpy(float)
        else:
            raise HTTPException(400, f"Unknown variable: {c}")
    d = pd.DataFrame(cols).dropna()
    try:
        m = st.ols(d[y].to_numpy(), d[xs].to_numpy(), xs)
    except ValueError as e:
        raise HTTPException(400, str(e))
    m["y"], m["xs"] = y, xs
    m["observed"] = d[y].tolist()
    m["x_values"] = {x: d[x].tolist() for x in xs}
    m["x_ranges"] = {x: [float(d[x].min()), float(d[x].max())] for x in xs}
    sig = [c["term"] for c in m["coefficients"][1:] if c["p"] is not None and c["p"] < 0.05]
    notes = []
    if m["r2"] is not None and m["r2"] < 0.5:
        notes.append("R² below 0.5: the model explains less than half the variation; treat predictions with caution.")
    if len(sig) < len(xs):
        notes.append("Predictors with p ≥ 0.05 add little; consider removing them.")
    if any((c.get("vif") or 0) > 5 for c in m["coefficients"]):
        notes.append("VIF above 5 indicates collinear predictors.")
    if (m["max_cooks"] or 0) > 1:
        notes.append(f"{len(m['influential'])} point(s) dominate the fit (Cook's distance > 1). Check them, or stratify, "
                     "before trusting the model.")
    if (m["residual_normality"]["p"] or 1) < 0.05:
        notes.append("Residuals are not normal; prediction intervals may be unreliable.")
    m["notes"] = notes
    m["usable"] = bool((m["f_p"] or 1) < 0.05 and (m["r2"] or 0) >= 0.5 and (m["max_cooks"] or 0) <= 1)
    return m
