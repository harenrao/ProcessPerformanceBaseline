"""
Baseline orchestration. For every metric:

  1. dot plot of all points
  2. box plot -> remove outliers -> rebuild, repeated until clean
     (capped at max_auto_exclude_pct of the points)
  3. I-MR chart on the cleaned data (signals are flagged, not removed)
  4. basic statistics, histogram and distribution fit
  5. outlier list

Users can override a point: "keep" an auto-removed point, or "exclude" one by hand.
"""
from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np
import pandas as pd

from . import stats as st
from .ingest import compute_metric

DEFAULT_SETTINGS: dict[str, Any] = {
    "max_auto_exclude_pct": 10,   # box-plot removal stops once this share of points is removed
    "transform": "auto",          # auto: chart lognormal data on the log scale
    "rules": [1, 2, 3, 5, 6],
    "confidence": 0.95,
    "min_points": 20,
}


def ordered_frame(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """Control charts need time order; sort by the mapped date when there is one."""
    out = df.copy()
    out["__row"] = np.arange(len(out))
    d = mapping.get("date")
    if d and d in out:
        out["__date"] = pd.to_datetime(out[d], errors="coerce")
        out = out.sort_values(["__date", "__row"], kind="stable")
    return out


def point_ids(df: pd.DataFrame, mapping: dict) -> list[str]:
    c = mapping.get("id")
    if c and c in df:
        return df[c].astype(str).tolist()
    return [f"Row {int(r) + 1}" for r in df["__row"]]


def _override(v: Any) -> tuple[str, str]:
    """Stored per point: a plain string (legacy manual exclusion) or {"action", "reason"}."""
    if isinstance(v, dict):
        return v.get("action", "exclude"), v.get("reason", "")
    return "exclude", str(v)


def box_stats(x: np.ndarray) -> dict:
    """Box plot as Minitab draws it: quartiles, 1.5×IQR fences, whiskers to the last point inside."""
    q1, med, q3 = (float(v) for v in np.percentile(x, [25, 50, 75]))
    iqr = q3 - q1
    lo_f, hi_f = q1 - 1.5 * iqr, q3 + 1.5 * iqr
    inside = x[(x >= lo_f) & (x <= hi_f)]
    return {"q1": q1, "median": med, "q3": q3, "iqr": iqr, "lower_fence": lo_f, "upper_fence": hi_f,
            "whisker_low": float(inside.min()) if len(inside) else q1,
            "whisker_high": float(inside.max()) if len(inside) else q3,
            "min": float(x.min()), "max": float(x.max()), "mean": float(x.mean())}


def iterative_box(points: list[dict], active: list[int], keep: set[int], cap: int) -> tuple[list[dict], list[str]]:
    """Box plot, remove outliers, rebuild; repeat until clean or the cap is reached."""
    iterations: list[dict] = []
    warnings: list[str] = []
    removed = 0
    it = 1
    while len(active) >= 4 and it <= 25:
        vals = np.array([points[i]["value"] for i in active])
        b = box_stats(vals)
        outl = [i for i in active if points[i]["value"] < b["lower_fence"] or points[i]["value"] > b["upper_fence"]]
        to_remove = [i for i in outl if i not in keep]
        kept = [i for i in outl if i in keep]
        room = cap - removed
        capped = []
        if len(to_remove) > room:
            to_remove.sort(key=lambda i: -abs(points[i]["value"] - b["median"]))
            capped = to_remove[max(room, 0):]
            to_remove = to_remove[:max(room, 0)]
        rec = {"iteration": it, "n": len(active), "box": b,
               "values": [points[i]["value"] for i in active],
               "removed": [{"row": points[i]["row"], "id": points[i]["id"], "value": points[i]["value"]} for i in to_remove],
               "kept": [{"row": points[i]["row"], "id": points[i]["id"], "value": points[i]["value"],
                         "why": "kept by user"} for i in kept] +
                       [{"row": points[i]["row"], "id": points[i]["id"], "value": points[i]["value"],
                         "why": "10% removal limit reached"} for i in capped]}
        iterations.append(rec)
        if capped and not warnings:
            warnings.append(f"Box-plot removal stopped at the 10% limit ({cap} point(s)); "
                            f"{len(capped)} outlier(s) were kept. The data may need stratifying.")
        if not to_remove:
            break
        for i in to_remove:
            points[i].update(excluded=True, removed_by="box", removed_in=it,
                             reason=f"Box plot outlier (iteration {it}), beyond 1.5×IQR fence")
        rm = set(to_remove)
        active = [i for i in active if i not in rm]
        removed += len(to_remove)
        it += 1
    return iterations, warnings


def _histogram(x: np.ndarray, fit: dict) -> dict:
    if len(x) == 0:
        return {"bins": [], "curve": []}
    nb = int(np.clip(math.ceil(math.log2(len(x)) + 1), 6, 15))
    counts, edges = np.histogram(x, bins=nb)
    width = float(edges[1] - edges[0]) if len(edges) > 1 else 1.0
    best = fit.get("best")
    curve: list[list[float]] = []
    if best and best != "Nonparametric":
        params = next(f["params"] for f in fit["fits"] if f["name"] == best)
        lo = max(float(edges[0]) - width, 0.0) if np.all(x >= 0) else float(edges[0]) - width
        curve = [[a, b * len(x) * width] for a, b in st.dist_pdf_curve(best, params, lo, float(edges[-1]) + width)]
    return {
        "bins": [{"x0": float(edges[i]), "x1": float(edges[i + 1]), "count": int(counts[i])} for i in range(len(counts))],
        "curve": curve,
    }


def analyse_metric(frame: pd.DataFrame, ids: list[str], md: dict, settings: dict,
                   exclusions: dict[str, str]) -> dict:
    series = compute_metric(frame, md)
    rows = frame["__row"].to_numpy()
    vals = series.to_numpy(dtype=float)
    valid = ~np.isnan(vals)

    points = [
        {"row": int(r), "id": ids[i], "value": float(v), "excluded": False, "reason": None, "flags": []}
        for i, (r, v) in enumerate(zip(rows, vals)) if valid[i]
    ]
    warnings: list[str] = []
    if not points:
        return {"key": md["key"], "name": md["name"], "error": "No usable data points.", "n_total": 0}

    allv = np.array([p["value"] for p in points])
    keep: set[int] = set()
    for i, p in enumerate(points):
        p.update(removed_by=None, removed_in=None, kept_reason=None)
        ov = exclusions.get(str(p["row"]))
        if ov is None:
            continue
        action, reason = _override(ov)
        if action == "keep":
            keep.add(i)
            p["kept_reason"] = reason
        else:
            p.update(excluded=True, removed_by="manual", reason=reason)

    active = [i for i, p in enumerate(points) if not p["excluded"]]
    cap = int(len(points) * settings.get("max_auto_exclude_pct", 10) / 100)
    box_iterations, box_warn = iterative_box(points, active, keep, cap)
    warnings += box_warn

    inc_idx = [i for i, p in enumerate(points) if not p["excluded"]]
    x = allv[inc_idx]
    n = len(x)
    out: dict[str, Any] = {
        "key": md["key"], "name": md["name"], "family": md.get("family"), "unit": md.get("unit"),
        "direction": md.get("direction"), "n_total": len(points), "n_used": n,
        "n_excluded": len(points) - n,
        "n_box_removed": sum(p["removed_by"] == "box" for p in points),
        "n_manual_removed": sum(p["removed_by"] == "manual" for p in points),
    }
    if n < 5:
        out.update({"points": points, "box_iterations": box_iterations,
                    "error": f"Only {n} points after outlier removal; at least 5 needed.", "rag": "red"})
        return out

    desc = st.describe(x, settings["confidence"])
    fit = st.fit_distributions(x)
    best = fit["best"]
    params = next((f["params"] for f in fit["fits"] if f["name"] == best), None)

    log_scale = settings.get("transform") == "auto" and best == "Lognormal"
    chart_vals = np.log(x) if log_scale else x
    ch = st.imr(chart_vals, rules=tuple(settings["rules"]))
    if log_scale:
        chart = {"scale": "log", "cl": math.exp(ch["cl"]), "ucl": math.exp(ch["ucl"]), "lcl": math.exp(ch["lcl"])}
    else:
        chart = {"scale": "linear", "cl": ch["cl"], "ucl": ch["ucl"], "lcl": ch["lcl"]}
    nonneg = bool(np.all(allv >= 0))
    if nonneg and chart["lcl"] is not None and chart["lcl"] < 0:
        chart["lcl"] = 0.0
    chart.update({"mr": ch["mr"], "mr_bar": ch["mr_bar"], "mr_ucl": ch["mr_ucl"], "sigma_within": ch["sigma_within"]})

    # map chart violations (index into included series) back onto points
    viol_points: dict[int, list[int]] = {}
    for ci, r in ch["violations"].items():
        pi = inc_idx[ci]
        points[pi]["rules"] = r
        viol_points[pi] = r
    chart["seq"] = inc_idx

    # baseline limits
    if best == "Normal" or log_scale:
        bl = {"cl": chart["cl"], "lcl": chart["lcl"], "ucl": chart["ucl"],
              "method": "I-MR natural process limits" + (" (log scale)" if log_scale else "")}
    elif best != "Nonparametric" and params:
        lcl = st.dist_ppf(best, params, 0.00135)
        bl = {"cl": st.dist_ppf(best, params, 0.5), "lcl": max(lcl, 0.0) if nonneg else lcl,
              "ucl": st.dist_ppf(best, params, 0.99865),
              "method": f"{best} 0.135 / 50 / 99.865 percentiles"}
    else:
        lo_q, hi_q = (10, 90) if n < 30 else (5, 95)
        bl = {"cl": desc["median"], "lcl": float(np.percentile(x, lo_q)), "ucl": float(np.percentile(x, hi_q)),
              "method": f"Empirical P{lo_q} / P50 / P{hi_q} (no distribution fits)"}
        warnings.append("No distribution fits at α = 0.05; limits are empirical percentiles. "
                        "Consider stratifying the data.")

    if md.get("unit") == "%":
        bl["ucl"] = min(bl["ucl"], 100.0)
        chart["ucl"] = min(chart["ucl"], 100.0)

    cap = st.capability(x, ch["sigma_within"] if not log_scale else None, md.get("lsl"), md.get("usl"), best, params)

    rule1 = sum(1 in r for r in viol_points.values())
    other = len(viol_points) - rule1
    stable = len(viol_points) == 0
    normal = best == "Normal"
    if n < 10 or rule1 > 0:
        rag = "red"
    elif not stable or n < settings.get("min_points", 20) or best == "Nonparametric":
        rag = "amber"
    else:
        rag = "green"
    if rule1:
        warnings.append(f"{rule1} point(s) beyond the I-MR 3σ limits after outlier removal: "
                        "investigate for an assignable cause.")
    if other:
        warnings.append(f"{other} point(s) break run rules: the process may have shifted or be mixed.")
    if n < settings.get("min_points", 20):
        warnings.append(f"n = {n} is below the recommended {settings.get('min_points', 20)} points.")
    if md.get("goal") is not None:
        g = float(md["goal"])
        better = desc["mean"] <= g if md.get("direction") == "lower" else desc["mean"] >= g
        out["goal_met"] = bool(better)

    out["n_flagged"] = len(viol_points)
    normal_fit = next(f for f in fit["fits"] if f["name"] == "Normal")
    desc["normality_ad"] = normal_fit["ad"]
    desc["normality_p"] = normal_fit["p"]
    out.update({
        "points": points, "box_iterations": box_iterations, "stats": desc, "fit": fit, "chart": chart, "baseline": bl,
        "capability": cap, "histogram": _histogram(x, fit),
        "status": {"stable": stable, "normal": normal, "rule1": rule1, "run_rules": other},
        "rag": rag, "warnings": warnings, "goal": md.get("goal"), "lsl": md.get("lsl"), "usl": md.get("usl"),
    })
    return out


def run_baseline(df: pd.DataFrame, mapping: dict, metrics: list[dict], settings: Optional[dict],
                 exclusions: Optional[dict]) -> dict:
    s = {**DEFAULT_SETTINGS, **(settings or {})}
    exclusions = exclusions or {}
    frame = ordered_frame(df, mapping)
    ids = point_ids(frame, mapping)
    results = []
    for md in metrics:
        if not md.get("enabled", True):
            continue
        try:
            results.append(analyse_metric(frame, ids, md, s, exclusions.get(md["key"], {})))
        except Exception as e:  # noqa: BLE001 - one bad metric must not sink the run
            results.append({"key": md["key"], "name": md["name"], "error": str(e), "rag": "red"})
    ok = [r for r in results if "error" not in r]
    summary = {
        "metrics": len(results),
        "green": sum(r.get("rag") == "green" for r in results),
        "amber": sum(r.get("rag") == "amber" for r in results),
        "red": sum(r.get("rag") == "red" for r in results),
        "stable": sum(r["status"]["stable"] for r in ok),
        "normal": sum(r["status"]["normal"] for r in ok),
        "excluded": sum(r.get("n_excluded", 0) for r in results),
        "flagged": sum(r.get("n_flagged", 0) for r in results),
        "rows": len(df),
    }
    return {"settings": s, "summary": summary, "metrics": results}
