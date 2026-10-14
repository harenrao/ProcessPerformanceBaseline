# PPB Generator: assessment of v1 and what v2 changes

This review covers the original Flask tool (`PPB-main.zip`: `app.py`, `baseline_analyzer.py`,
`report_generator.py`, `index.html`, `main.js`). I ran its analyzer on the bundled
`Baseline_data.xlsx` (43 change requests, 20 columns), so the findings below come from that run.

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

## 4. What v2 delivers

| Area | v1 | v2 |
|------|----|----|
| Stack | Flask + jQuery/Bootstrap | FastAPI + SQLite, React (Vite), GT design tokens |
| Access | None | JWT sign-in, GT Admin / Director / Consultant / Client roles, client org isolation, login rate limit |
| Structure | Single page | Login → Projects → workspace: Overview, Data, Metrics, Baselines, Baseline detail, Stratification, Models (PPM), Compare, Audit; plus Users and Methodology |
| Ingestion | Hard-coded columns | Header normalisation, auto-mapping (size, effort, defects, ID, date, grouping) that the user can edit, data-quality score and issues |
| Metrics | 15 fixed ratios | Per-phase effort/size, total delivery rate, per-phase and total DD, DRE, plus **custom ratios** (Σ num ÷ Σ den × k), spec limits and goal (QPPO) |
| Outliers | 3 auto-removal passes | IQR / Grubbs / I-MR **flag only**. Exclusion requires an **assignable cause**, stamped with name and date, and can be re-included. Optional capped auto-exclude |
| Stability | I-MR, rule 1 only | I-MR in time order, Nelson/WE tests 1, 2, 3, 5, 6, log-scale charting for lognormal metrics |
| Distribution | KS mislabelled as AD | Real Anderson-Darling: Minitab p-values for Normal/Lognormal, Stephens tables for Exponential/Weibull, AD statistic for Gamma |
| Baseline | Mean/SD only | **LCL / CL / UCL** by distribution, 95% CI of mean and median, percentiles, Cpk/Ppk and % within spec, goal check, RAG per metric |
| Analysis | — | Stratification (Kruskal-Wallis, ANOVA, Levene, with a recommendation), PPM regression (coefficients, VIF, residual AD, Cook's distance, what-if with 95% PI), version comparison (Mann-Whitney, Welch, Levene) |
| Governance | — | Versioned baselines, Draft → In review → Approved, segregation of duties (the submitter can't approve), approval supersedes the previous version, full audit trail with CSV export |
| Reports | Plain Word/PPT/Excel | GT-styled Word (summary, method, per-metric charts, exclusions, approval block), PPT (summary + slide per metric), Excel (limits, data points with flags and causes, fits, method) |
| Quality | No tests | 9 backend tests (stats checked against SciPy; API flow incl. org isolation and approvals) |

On the same sample, v2 baselines **20 metrics** with all 43 points kept by default. Every flagged
point waits for an analyst to decide, instead of being removed automatically.

## 5. Recommended next enhancements (prioritised)

**Next (high value, moderate effort)**
1. **Project-level QPM tracking.** Projects post actuals against the approved org baseline (a control chart with org limits) and get alerts on signals. This closes the loop from OPP to QPM.
2. **Monte Carlo QPPO probability.** Use the saved PPMs and the baseline distributions to estimate "probability of meeting the QPPO" at project planning and at each milestone.
3. **Attribute charts for defect data.** u-charts / Laney U′ for defect density, where size varies a lot between items. This is more defensible than I-MR on ratios.
4. **Transformations.** Box-Cox and Johnson, for metrics that fit no distribution.
5. **Data connectors.** Jira / Azure DevOps / ServiceNow pulls, so nobody re-keys data, plus scheduled re-baselining with drift detection (the compare test run automatically).

**Later**
6. SSO (Entra ID), per-project membership, and e-signature on approval.
7. Comment threads on points and metrics, plus notifications (submitted, approved, returned).
8. A metric library per CMMI model (DEV / SVC), with standard operational definitions.
9. An assistant (the GT platform chat pattern) that explains a chart, drafts assignable-cause narratives and summarises a version for the approver.
10. Report export from the GT PowerPoint master and PDF, plus a client-facing read-only dashboard.
11. Postgres, a background job queue for large files, and CI that runs the test suite.
