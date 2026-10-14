# PPB Generator: assessment of v1 and what v2 changes

This review covers the original Flask tool (`PPB-main.zip`: `app.py`, `baseline_analyzer.py`,
`report_generator.py`, `index.html`, `main.js`). I ran its analyzer on the reference input
workbook (43 change requests, 20 columns), so the findings below come from that run.

## Verdict

The v1 pipeline works: upload, analyze, then export to Word, PPT or Excel. But it has two kinds
of problem. Some are statistical issues that an appraiser would challenge. Others are product gaps:
it computes statistics, but it never produces a **baseline**, meaning the approved limits that
projects use for QPM. The look is also stock Bootstrap. Fixing it took a rebuild, not a re-skin.

## 1. Statistical correctness (high priority)

| # | Finding | Evidence on sample data | Impact |
|---|---------|-------------------------|--------|
| S1 | **Metrics silently skipped.** Column names are hard-coded, and three headers in the file have trailing spaces (`'UAT Efforts '`, `'UAT Defects '`, `'Unit Test Review Efforts '`). | Only 12 metrics are analysed. UAT effort, UAT defect density and UT-review effort are missing with no warning, and both Documentation columns are never considered. | The baseline is incomplete, and the most important quality metric (UAT/escaped defects) is absent. |
| S2 | **Zeros are dropped** (`data = data[data > 0]`). | Analysis-review DD loses 11 of 43 points and design-review DD loses 12 of 43 (≈ 27%). | Zero defects is real, good performance. Dropping it inflates the defect-density baseline. |
| S3 | **Three stacked auto-removals.** Iterative IQR until clean, then a 2.5σ "dotplot" rule, then iterative I-MR until clean. No cause is recorded. | Up to 6 of 43 points removed (Coding). Iterative IQR on right-skewed data keeps peeling off the tail. | This over-trims and narrows the limits. "Removed for being an outlier" without an assignable cause is a classic appraisal finding. |
| S4 | **Mislabelled goodness of fit.** The value shown as the "AD statistic" is the Kolmogorov-Smirnov D. Its p-values are computed with parameters estimated from the same data. | Every report column headed "AD" is a KS D. | KS with estimated parameters is anti-conservative (the Lilliefors problem), and it does not match the Minitab output appraisers expect. |
| S5 | **No baseline limits.** The tool reports n, mean, median, SD and p-value, but no LCL / CL / UCL and no confidence intervals. | — | The core PPB deliverable is missing. Projects have no limits to plan against. |
| S6 | **I-MR on skewed data, without transform or time order.** | Effort ratios are lognormal, so raw I-MR flags the long tail as instability. Rows are charted in file order. | False stability signals, which then feed S3's removals. |
| S7 | Minor issues: population SD (`ddof=0`) in the dotplot rule, best fit chosen by the largest KS p, no check on n. | — | Small biases, and no warning when n is too low to baseline. |

## 2. Engineering and security

* **It doesn't start as shipped.** `run.py` imports `backend.app`, but the files are flat. `statistical_tests.py` and `report.html` are empty.
* **`debug=True` on `0.0.0.0`.** This exposes the Werkzeug debugger, which allows remote code execution on the network. Error responses also return full tracebacks.
* **No authentication or roles.** Every upload lands in one shared `uploads/` folder under its original filename, so users can overwrite each other's data.
* **State lives only in memory** (`analysis_store`). It is lost on restart, grows without bound, and has no history or versions.
* **Charts are sent as base64 PNGs inside the JSON.** Responses run to several MB, the charts are not interactive, and they can't be restyled.
* **Unused or heavy dependencies** (`fitter`, `statsmodels`, `seaborn`), and no tests.

## 3. UX

* It is one long Bootstrap page in default blue/green/red. Nothing about it says GT.
* There is no notion of a project, client, version or approval. Each run is a throwaway.
* There is no way to see *why* a point was removed, or to undo the removal.

## 4. What the new version delivers

The tool is now a focused PPB helper that a client installs and runs on their own machine.

| Area | Original | New |
|------|----------|-----|
| Flow | One long page, nothing saved | Sign in → Home (upload + past runs) → PPB result |
| Accounts | None | Local accounts created on first launch; each user sees only their own runs |
| Input | Hard-coded column names | Header normalisation and automatic detection of size, effort, defect and ID columns, a data-quality check before running, and a downloadable input template |
| Metrics | Per-phase ratios only (5 silently missing) | Per-phase and total effort per size unit, per-phase and total defect density, defect removal efficiency |
| Outliers | Three automatic removal passes | Flagged for review. A point is excluded only with a recorded reason, and can be re-included |
| Stability | I-MR, rule 1 only | I-MR in time order with Nelson/WE tests 1, 2, 3, 5 and 6; log-scale charting for skewed metrics |
| Distribution | KS mislabelled as AD | Real Anderson-Darling across Normal, Lognormal, Exponential, Weibull and Gamma |
| Baseline | Mean/SD only | **Lower limit / centre line / upper limit** per metric, confidence intervals, percentiles, red/amber/green status |
| Output | Plain Word/PPT/Excel | GT-styled Word, PowerPoint and Excel |
| Charts | Static images | Interactive control chart and histogram |
| Quality | No tests | Automated tests for the statistics and the upload → run → export flow |

## 5. Possible later additions

These are out of scope for now (PPB only), but are natural next steps:

1. Control charts built for defect counts (u-chart / Laney U′) for defect density, where size varies a lot.
2. Box-Cox / Johnson transformations for metrics that fit no distribution.
3. Comparing two runs to show whether performance shifted.
4. Grouping the data (by technology or application) to check whether it needs separate baselines.
5. Process performance models (regression) built on the baseline.
