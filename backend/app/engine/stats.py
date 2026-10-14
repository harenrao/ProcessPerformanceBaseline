"""
Statistical primitives for process performance baselines.

Everything here is pure numpy/scipy and returns plain JSON-serialisable values,
so the API can hand results to the React charts without rendering images.
"""
from __future__ import annotations

import math
from typing import Any, Optional

import numpy as np
from scipy import stats

# I-MR constants (n = 2 subgroup)
D2 = 1.128
D4 = 3.267


def _f(x: Any) -> Optional[float]:
    """Float that is safe to put in JSON (NaN/inf become None)."""
    if x is None:
        return None
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


# --------------------------------------------------------------------------- #
# Descriptive statistics
# --------------------------------------------------------------------------- #
def describe(x: np.ndarray, conf: float = 0.95) -> dict:
    x = np.asarray(x, dtype=float)
    n = len(x)
    if n == 0:
        return {"n": 0}
    mean = float(np.mean(x))
    sd = float(np.std(x, ddof=1)) if n > 1 else 0.0
    out = {
        "n": n,
        "mean": mean,
        "median": float(np.median(x)),
        "sd": sd,
        "min": float(np.min(x)),
        "max": float(np.max(x)),
        "cv": _f(sd / mean) if mean else None,
        "skewness": _f(stats.skew(x, bias=False)) if n > 2 else None,
        "p10": float(np.percentile(x, 10)),
        "p25": float(np.percentile(x, 25)),
        "p75": float(np.percentile(x, 75)),
        "p90": float(np.percentile(x, 90)),
    }
    if n > 1:
        h = stats.t.ppf(0.5 + conf / 2, n - 1) * sd / math.sqrt(n)
        out["mean_ci"] = [mean - h, mean + h]
        out["median_ci"] = median_ci(x, conf)
    return out


def median_ci(x: np.ndarray, conf: float = 0.95) -> Optional[list[float]]:
    """Distribution-free CI for the median from binomial order statistics."""
    xs = np.sort(x)
    n = len(xs)
    if n < 6:
        return None
    k = int(stats.binom.ppf((1 - conf) / 2, n, 0.5))
    k = max(k, 1)
    return [float(xs[k - 1]), float(xs[n - k])]


# --------------------------------------------------------------------------- #
# Anderson-Darling goodness of fit
# --------------------------------------------------------------------------- #
def _ad_stat(cdf_sorted: np.ndarray) -> float:
    n = len(cdf_sorted)
    u = np.clip(cdf_sorted, 1e-12, 1 - 1e-12)
    i = np.arange(1, n + 1)
    return float(-n - np.sum((2 * i - 1) * (np.log(u) + np.log(1 - u[::-1]))) / n)


def ad_normal(x: np.ndarray) -> tuple[float, float]:
    """AD statistic and p-value for normality (mean/sd estimated), as Minitab reports it."""
    xs = np.sort(np.asarray(x, dtype=float))
    n = len(xs)
    sd = np.std(xs, ddof=1)
    if n < 3 or sd == 0:
        return float("nan"), float("nan")
    a2 = _ad_stat(stats.norm.cdf((xs - xs.mean()) / sd))
    a = a2 * (1 + 0.75 / n + 2.25 / n**2)
    if a >= 0.6:
        p = math.exp(1.2937 - 5.709 * a + 0.0186 * a**2)
    elif a >= 0.34:
        p = math.exp(0.9177 - 4.279 * a - 1.38 * a**2)
    elif a >= 0.2:
        p = 1 - math.exp(-8.318 + 42.796 * a - 59.938 * a**2)
    else:
        p = 1 - math.exp(-13.436 + 101.14 * a - 223.73 * a**2)
    return a2, float(min(max(p, 0.0), 1.0))


def _p_from_critical(stat: float, levels: list[float], crit: list[float]) -> tuple[float, str]:
    """Bracket a p-value from tabulated critical values (levels descending)."""
    if stat < crit[0]:
        return levels[0], f"> {levels[0]:g}"
    for i in range(1, len(levels)):
        if stat < crit[i]:
            # p lies between levels[i] and levels[i-1]; report the bracket midpoint
            return math.sqrt(levels[i] * levels[i - 1]), f"{levels[i]:g}–{levels[i - 1]:g}"
    return levels[-1] / 2, f"< {levels[-1]:g}"


def fit_distributions(x: np.ndarray) -> dict:
    """
    Fit candidate distributions and choose the one to baseline with.

    p-values are exact (Minitab formula) for Normal/Lognormal and bracketed from
    Stephens' critical values for Exponential/Weibull. Gamma has no closed-form
    table, so it reports the AD statistic only and can win only on that statistic
    when nothing else fits.
    """
    x = np.asarray(x, dtype=float)
    n = len(x)
    fits: list[dict] = []
    positive = bool(np.all(x > 0))

    a2, p = ad_normal(x)
    fits.append({"name": "Normal", "ad": _f(a2), "p": _f(p), "p_label": _plabel(p),
                 "params": {"mean": float(x.mean()), "sd": float(x.std(ddof=1))}})

    if positive:
        lx = np.log(x)
        a2, p = ad_normal(lx)
        fits.append({"name": "Lognormal", "ad": _f(a2), "p": _f(p), "p_label": _plabel(p),
                     "params": {"mu": float(lx.mean()), "sigma": float(lx.std(ddof=1))}})
    else:
        fits.append({"name": "Lognormal", "ad": None, "p": None, "p_label": "n/a",
                     "note": "Not applicable: data contains zeros"})

    if np.all(x >= 0) and x.mean() > 0:
        scale = float(x.mean())
        a2 = _ad_stat(stats.expon.cdf(np.sort(x) / scale))
        a = a2 * (1 + 0.6 / n)
        p, lab = _p_from_critical(a, [0.15, 0.10, 0.05, 0.025, 0.01], [0.922, 1.078, 1.341, 1.606, 1.957])
        fits.append({"name": "Exponential", "ad": _f(a2), "p": p, "p_label": lab, "params": {"scale": scale}})

    if positive and n >= 5:
        try:
            c, _, scale = stats.weibull_min.fit(x, floc=0)
            a2 = _ad_stat(stats.weibull_min.cdf(np.sort(x), c, scale=scale))
            a = a2 * (1 + 0.2 / math.sqrt(n))
            p, lab = _p_from_critical(a, [0.10, 0.05, 0.025, 0.01], [0.637, 0.757, 0.877, 1.038])
            fits.append({"name": "Weibull", "ad": _f(a2), "p": p, "p_label": lab,
                         "params": {"shape": float(c), "scale": float(scale)}})
        except Exception:  # noqa: BLE001 - optimiser failures just drop the candidate
            pass
        try:
            k, _, scale = stats.gamma.fit(x, floc=0)
            a2 = _ad_stat(stats.gamma.cdf(np.sort(x), k, scale=scale))
            fits.append({"name": "Gamma", "ad": _f(a2), "p": None, "p_label": "—",
                         "params": {"shape": float(k), "scale": float(scale)}})
        except Exception:  # noqa: BLE001
            pass

    best = _choose(fits)
    return {"fits": fits, "best": best}


def _plabel(p: float) -> str:
    if p is None or not math.isfinite(p):
        return "—"
    return "< 0.005" if p < 0.005 else f"{p:.3f}"


def _choose(fits: list[dict]) -> str:
    normal = next(f for f in fits if f["name"] == "Normal")
    if normal["p"] is not None and normal["p"] > 0.05:
        return "Normal"
    ok = [f for f in fits if f.get("p") is not None and f["p"] > 0.05]
    if ok:
        ok.sort(key=lambda f: (-f["p"], f["ad"] if f["ad"] is not None else 1e9))
        return ok[0]["name"]
    return "Nonparametric"


def dist_ppf(name: str, params: dict, q: float) -> Optional[float]:
    if name == "Normal":
        return float(stats.norm.ppf(q, params["mean"], params["sd"]))
    if name == "Lognormal":
        return float(math.exp(stats.norm.ppf(q, params["mu"], params["sigma"])))
    if name == "Exponential":
        return float(stats.expon.ppf(q, scale=params["scale"]))
    if name == "Weibull":
        return float(stats.weibull_min.ppf(q, params["shape"], scale=params["scale"]))
    if name == "Gamma":
        return float(stats.gamma.ppf(q, params["shape"], scale=params["scale"]))
    return None


def dist_pdf_curve(name: str, params: dict, lo: float, hi: float, points: int = 80) -> list[list[float]]:
    xs = np.linspace(lo, hi, points)
    if name == "Normal":
        ys = stats.norm.pdf(xs, params["mean"], params["sd"])
    elif name == "Lognormal":
        with np.errstate(divide="ignore"):
            ys = np.where(xs > 0, stats.lognorm.pdf(xs, params["sigma"], scale=math.exp(params["mu"])), 0)
    elif name == "Exponential":
        ys = stats.expon.pdf(xs, scale=params["scale"])
    elif name == "Weibull":
        ys = stats.weibull_min.pdf(xs, params["shape"], scale=params["scale"])
    elif name == "Gamma":
        ys = stats.gamma.pdf(xs, params["shape"], scale=params["scale"])
    else:
        return []
    return [[float(a), _f(b) or 0.0] for a, b in zip(xs, ys)]


# --------------------------------------------------------------------------- #
# Control charts (I-MR) and run rules
# --------------------------------------------------------------------------- #
RULES = {
    1: "1 point beyond 3σ",
    2: "9 points in a row on one side of CL",
    3: "6 points in a row steadily increasing or decreasing",
    5: "2 of 3 points beyond 2σ (same side)",
    6: "4 of 5 points beyond 1σ (same side)",
}


def imr(x: np.ndarray, rules: tuple[int, ...] = (1, 2, 3, 5, 6)) -> dict:
    """Individuals & moving-range chart with Western Electric / Nelson tests (Minitab numbering)."""
    x = np.asarray(x, dtype=float)
    n = len(x)
    if n < 3:
        return {"n": n, "violations": {}, "stable": None}
    mr = np.abs(np.diff(x))
    mr_bar = float(mr.mean())
    cl = float(x.mean())
    sigma = mr_bar / D2
    ucl, lcl = cl + 3 * sigma, cl - 3 * sigma
    z = (x - cl) / sigma if sigma > 0 else np.zeros(n)

    viol: dict[int, list[int]] = {}

    def flag(i: int, r: int) -> None:
        viol.setdefault(i, [])
        if r not in viol[i]:
            viol[i].append(r)

    if sigma > 0:
        for i in range(n):
            if 1 in rules and abs(z[i]) > 3:
                flag(i, 1)
            if 2 in rules and i >= 8:
                w = z[i - 8:i + 1]
                if np.all(w > 0) or np.all(w < 0):
                    flag(i, 2)
            if 3 in rules and i >= 5:
                d = np.diff(x[i - 5:i + 1])
                if np.all(d > 0) or np.all(d < 0):
                    flag(i, 3)
            if 5 in rules and i >= 2:
                w = z[i - 2:i + 1]
                if (np.sum(w > 2) >= 2 and z[i] > 2) or (np.sum(w < -2) >= 2 and z[i] < -2):
                    flag(i, 5)
            if 6 in rules and i >= 4:
                w = z[i - 4:i + 1]
                if (np.sum(w > 1) >= 4 and z[i] > 1) or (np.sum(w < -1) >= 4 and z[i] < -1):
                    flag(i, 6)

    return {
        "n": n,
        "cl": cl,
        "ucl": ucl,
        "lcl": lcl,
        "sigma_within": sigma,
        "mr_bar": mr_bar,
        "mr_ucl": D4 * mr_bar,
        "mr": [None] + [float(v) for v in mr],
        "violations": {int(k): sorted(v) for k, v in viol.items()},
        "stable": len(viol) == 0,
    }


# --------------------------------------------------------------------------- #
# Outlier tests (flag only; exclusion is a separate, justified decision)
# --------------------------------------------------------------------------- #
def iqr_outliers(x: np.ndarray, k: float = 1.5) -> list[int]:
    if len(x) < 4:
        return []
    q1, q3 = np.percentile(x, [25, 75])
    iqr = q3 - q1
    return [int(i) for i in np.where((x < q1 - k * iqr) | (x > q3 + k * iqr))[0]]


def grubbs_outliers(x: np.ndarray, alpha: float = 0.05, max_iter: int = 10) -> list[int]:
    """Iterative two-sided Grubbs test; returns original indices."""
    idx = np.arange(len(x))
    vals = np.asarray(x, dtype=float)
    found: list[int] = []
    for _ in range(max_iter):
        n = len(vals)
        if n < 7:
            break
        sd = vals.std(ddof=1)
        if sd == 0:
            break
        dev = np.abs(vals - vals.mean())
        j = int(np.argmax(dev))
        g = dev[j] / sd
        t = stats.t.ppf(1 - alpha / (2 * n), n - 2)
        gcrit = (n - 1) / math.sqrt(n) * math.sqrt(t**2 / (n - 2 + t**2))
        if g <= gcrit:
            break
        found.append(int(idx[j]))
        idx = np.delete(idx, j)
        vals = np.delete(vals, j)
    return sorted(found)


# --------------------------------------------------------------------------- #
# Capability against organisational spec limits / goals
# --------------------------------------------------------------------------- #
def capability(x: np.ndarray, sigma_within: Optional[float], lsl: Optional[float], usl: Optional[float],
               dist: Optional[str] = None, params: Optional[dict] = None) -> Optional[dict]:
    if lsl is None and usl is None:
        return None
    x = np.asarray(x, dtype=float)
    mean, sd = float(x.mean()), float(x.std(ddof=1))
    out: dict[str, Any] = {"lsl": lsl, "usl": usl}
    within = np.ones(len(x), dtype=bool)
    if lsl is not None:
        within &= x >= lsl
    if usl is not None:
        within &= x <= usl
    out["pct_within_observed"] = float(within.mean() * 100)

    def idx(s: float) -> dict:
        r: dict[str, Optional[float]] = {}
        if s and s > 0:
            if lsl is not None and usl is not None:
                r["p"] = (usl - lsl) / (6 * s)
            parts = []
            if usl is not None:
                parts.append((usl - mean) / (3 * s))
            if lsl is not None:
                parts.append((mean - lsl) / (3 * s))
            r["pk"] = min(parts)
        return r

    w = idx(sigma_within or 0)
    o = idx(sd)
    out.update({"cp": _f(w.get("p")), "cpk": _f(w.get("pk")), "pp": _f(o.get("p")), "ppk": _f(o.get("pk"))})

    # Expected % within spec from the fitted distribution (honest for skewed data)
    if dist and params and dist != "Nonparametric":
        lo = _cdf(dist, params, lsl) if lsl is not None else 0.0
        hi = _cdf(dist, params, usl) if usl is not None else 1.0
        if lo is not None and hi is not None:
            out["pct_within_expected"] = float((hi - lo) * 100)
    return out


def _cdf(name: str, params: dict, v: float) -> Optional[float]:
    if name == "Normal":
        return float(stats.norm.cdf(v, params["mean"], params["sd"]))
    if name == "Lognormal":
        return float(stats.norm.cdf(math.log(v), params["mu"], params["sigma"])) if v > 0 else 0.0
    if name == "Exponential":
        return float(stats.expon.cdf(v, scale=params["scale"]))
    if name == "Weibull":
        return float(stats.weibull_min.cdf(v, params["shape"], scale=params["scale"]))
    if name == "Gamma":
        return float(stats.gamma.cdf(v, params["shape"], scale=params["scale"]))
    return None
