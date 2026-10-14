"""
Data ingestion: read the upload, infer what each column means, propose metrics
and report data-quality issues before anything is baselined.
"""
from __future__ import annotations

import io
import re
from typing import Any

import numpy as np
import pandas as pd


def read_table(content: bytes, filename: str) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(content))
    elif name.endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(content))
    else:
        raise ValueError("Unsupported file type. Upload .xlsx, .xls or .csv.")
    # Trailing spaces in headers silently broke the original tool's column lookups.
    df.columns = [re.sub(r"\s+", " ", str(c)).strip() for c in df.columns]
    df = df.dropna(how="all")
    df = df.loc[:, [not str(c).startswith("Unnamed") or df[c].notna().any() for c in df.columns]]
    return df.reset_index(drop=True)


def _norm(c: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", c.lower())


def phase_label(col: str) -> str:
    s = re.sub(r"\(.*?\)", "", col)
    s = re.sub(r"\b(actual|efforts?|defects?|md|hours?|hrs|person days?)\b", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip(" -_")
    return s or col


def infer_mapping(df: pd.DataFrame) -> dict:
    """Guess id / size / effort / defect / grouping columns from header names and dtypes."""
    cols = list(df.columns)
    numeric = {c for c in cols if pd.to_numeric(df[c], errors="coerce").notna().mean() > 0.8}
    m: dict[str, Any] = {"id": None, "size": None, "effort": [], "defect": [], "group": [], "date": None}

    for c in cols:
        n = _norm(c)
        if m["id"] is None and c not in numeric and re.search(r"\b(id|requirement|project|code|ref)\b", n):
            m["id"] = c
        elif m["size"] is None and c in numeric and re.search(r"\b(size|fp|function points?|kloc|loc|story points?|sp)\b", n):
            m["size"] = c
        elif m["date"] is None and re.search(r"\b(date|month|period|closed|completed)\b", n):
            m["date"] = c
        elif c in numeric and re.search(r"\b(defects?|bugs?|issues?|ncs?)\b", n):
            m["defect"].append(c)
        elif c in numeric and re.search(r"\b(efforts?|md|hours?|hrs|person)\b", n):
            m["effort"].append(c)

    for c in cols:
        if c in numeric or c == m["id"] or c == m["date"]:
            continue
        nun = df[c].nunique(dropna=True)
        if 1 < nun <= max(8, len(df) // 4):
            m["group"].append(c)
    return m


def id_prefix(series: pd.Series) -> pd.Series:
    """'LISC0300028' -> 'LISC'. Often the line of business / application, a natural stratum."""
    return series.astype(str).str.extract(r"^([A-Za-z]+)", expand=False).fillna("—")


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def propose_metrics(mapping: dict, size_unit: str = "FP") -> list[dict]:
    """Default metric catalogue: per-phase effort & defect density, totals, DRE."""
    out: list[dict] = []
    size = mapping.get("size")
    if not size:
        return out
    eff, dfx = mapping.get("effort", []), mapping.get("defect", [])
    for c in eff:
        out.append({
            "key": "eff_" + slug(c), "name": f"{phase_label(c)} effort per {size_unit}", "family": "Effort",
            "numerator": [c], "denominator": [size], "multiplier": 1, "unit": f"MD/{size_unit}",
            "direction": "lower", "zero_as_missing": True, "enabled": True, "lsl": None, "usl": None, "goal": None,
        })
    if len(eff) > 1:
        out.append({
            "key": "eff_total", "name": f"Total effort per {size_unit} (delivery rate)", "family": "Effort",
            "numerator": eff, "denominator": [size], "multiplier": 1, "unit": f"MD/{size_unit}",
            "direction": "lower", "zero_as_missing": True, "enabled": True, "lsl": None, "usl": None, "goal": None,
        })
    for c in dfx:
        out.append({
            "key": "dd_" + slug(c), "name": f"{phase_label(c)} defect density", "family": "Quality",
            "numerator": [c], "denominator": [size], "multiplier": 1, "unit": f"defects/{size_unit}",
            "direction": "lower", "zero_as_missing": False, "enabled": True, "lsl": None, "usl": None, "goal": None,
        })
    if len(dfx) > 1:
        out.append({
            "key": "dd_total", "name": "Total defect density", "family": "Quality",
            "numerator": dfx, "denominator": [size], "multiplier": 1, "unit": f"defects/{size_unit}",
            "direction": "lower", "zero_as_missing": False, "enabled": True, "lsl": None, "usl": None, "goal": None,
        })
        last = [c for c in dfx if re.search(r"\b(uat|production|prod|post release|field)\b", _norm(c))]
        if last:
            out.append({
                "key": "dre", "name": "Defect removal efficiency", "family": "Quality",
                "numerator": [c for c in dfx if c not in last], "denominator": dfx, "multiplier": 100, "unit": "%",
                "direction": "higher", "zero_as_missing": False, "enabled": True, "lsl": None, "usl": None, "goal": None,
            })
    return out


def compute_metric(df: pd.DataFrame, md: dict) -> pd.Series:
    num = sum(pd.to_numeric(df[c], errors="coerce").fillna(0) for c in md["numerator"] if c in df)
    den = sum(pd.to_numeric(df[c], errors="coerce").fillna(0) for c in md["denominator"] if c in df) \
        if md.get("denominator") else 1
    with np.errstate(divide="ignore", invalid="ignore"):
        s = num / den * float(md.get("multiplier") or 1)
    s = pd.Series(s, index=df.index).replace([np.inf, -np.inf], np.nan)
    # A ratio with no valid denominator is missing, not zero
    if md.get("denominator"):
        s[den <= 0] = np.nan
    if md.get("zero_as_missing"):
        s[s == 0] = np.nan
    return s


def quality_report(df: pd.DataFrame, mapping: dict, metrics: list[dict] | None = None) -> dict:
    issues: list[dict] = []
    cols: list[dict] = []
    mapped = [mapping.get("size")] + mapping.get("effort", []) + mapping.get("defect", [])
    for c in [c for c in mapped if c]:
        raw = df[c]
        num = pd.to_numeric(raw, errors="coerce")
        info = {
            "column": c,
            "missing": int(raw.isna().sum()),
            "non_numeric": int((num.isna() & raw.notna()).sum()),
            "negative": int((num < 0).sum()),
            "zero": int((num == 0).sum()),
        }
        cols.append(info)
        if info["non_numeric"]:
            issues.append({"level": "red", "text": f"'{c}' has {info['non_numeric']} non-numeric value(s)."})
        if info["negative"]:
            issues.append({"level": "red", "text": f"'{c}' has {info['negative']} negative value(s)."})
        if info["missing"]:
            issues.append({"level": "amber", "text": f"'{c}' has {info['missing']} missing value(s)."})

    size = mapping.get("size")
    if not size:
        issues.append({"level": "red", "text": "No size column mapped; ratio metrics cannot be computed."})
    else:
        bad = int((pd.to_numeric(df[size], errors="coerce").fillna(0) <= 0).sum())
        if bad:
            issues.append({"level": "amber", "text": f"{bad} row(s) have zero or missing size and are excluded from ratio metrics."})

    if mapping.get("id"):
        d = df[mapping["id"]].astype(str)
        dups = d[d.duplicated()].unique().tolist()
        if dups:
            issues.append({"level": "amber", "text": f"Duplicate IDs: {', '.join(dups[:5])}{'…' if len(dups) > 5 else ''}."})
    else:
        issues.append({"level": "grey", "text": "No ID column mapped; points will be labelled by row number."})

    if not mapping.get("date"):
        issues.append({"level": "grey", "text": "No completion date mapped. Control charts assume the file is in time order."})

    if len(df) < 20:
        issues.append({"level": "amber", "text": f"Only {len(df)} rows. Aim for 20+ data points per baseline."})

    for md in metrics or []:
        if not md.get("enabled", True):
            continue
        n = int(compute_metric(df, md).notna().sum())
        if n < 10:
            issues.append({"level": "red", "text": f"{md['name']}: only {n} usable points; too few to baseline."})
        elif n < 20:
            issues.append({"level": "amber", "text": f"{md['name']}: {n} usable points; baseline will be indicative."})

    score = 100 - 15 * sum(i["level"] == "red" for i in issues) - 5 * sum(i["level"] == "amber" for i in issues)
    return {"rows": len(df), "columns": cols, "issues": issues, "score": max(score, 0)}
