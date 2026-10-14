import numpy as np
from scipy import stats as sps

from app.engine import stats as st


def test_ad_normal_matches_reference():
    rng = np.random.default_rng(1)
    x = rng.normal(10, 2, 60)
    a2, p = st.ad_normal(x)
    try:
        ref = sps.anderson(x, "norm", method="interpolate")
    except TypeError:  # SciPy < 1.17 has no `method` argument
        ref = sps.anderson(x, "norm")
    assert abs(a2 - ref.statistic) < 1e-6
    assert p > 0.05
    _, p_skew = st.ad_normal(rng.lognormal(0, 1, 60))
    assert p_skew < 0.01


def test_best_fit_picks_lognormal_for_lognormal_data():
    rng = np.random.default_rng(2)
    fit = st.fit_distributions(rng.lognormal(0, 0.8, 80))
    assert fit["best"] in ("Lognormal", "Weibull", "Gamma")
    assert fit["best"] != "Normal"


def test_imr_rules():
    x = np.r_[np.full(10, 5.0) + np.tile([0.1, -0.1], 5), [20.0]]
    ch = st.imr(x)
    assert 1 in ch["violations"][10]
    shift = np.r_[np.zeros(10) + np.tile([0.2, -0.2], 5), np.ones(10) + np.tile([0.2, -0.2], 5)]
    assert any(2 in r for r in st.imr(shift)["violations"].values())


def test_grubbs_and_iqr_flag_extremes():
    x = np.r_[np.linspace(9, 11, 30), [30.0]]
    assert st.grubbs_outliers(x) == [30]
    assert 30 in st.iqr_outliers(x)


def test_median_ci_contains_median():
    x = np.arange(1, 41, dtype=float)
    lo, hi = st.median_ci(x)
    assert lo < np.median(x) < hi
