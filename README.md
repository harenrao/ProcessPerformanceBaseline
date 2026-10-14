# GT Process Performance Baseline (v2)

This tool builds a CMMI process performance baseline (OPP / MPM) from project data. Load a dataset
and the app derives productivity and quality metrics and checks each one for stability. It fits a
distribution, sets baseline limits and records an assignable cause for every excluded point. Baselines
are versioned and go through an approval step before they are used. You can also build process
performance models and export reports in GT style.

It replaces the earlier Flask PPB generator. [`docs/ASSESSMENT.md`](docs/ASSESSMENT.md) explains
what was wrong with v1, what changed, and the recommended roadmap.

## Quick start (no developer tools needed)

You only need **Python 3.10 or newer** ([python.org](https://www.python.org/downloads/); on Windows tick "Add Python to PATH").

1. Download this branch: **Code → Download ZIP** on GitHub, then unzip it.
2. Start it:
   * **Windows:** double-click `start.bat`
   * **Mac / Linux:** run `./start.sh` in a terminal
3. Open **http://localhost:8000** and sign in as `gt.diksha` / `gt-2026`.

The first start installs packages (2–3 minutes). Keep the window open while you use the app.

## Run it (development)

```bash
# backend (Python 3.11+)
python -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && uvicorn app.main:app --reload --port 8000

# frontend (Node 18+), in a second terminal
cd frontend && npm install && npm run dev      # http://localhost:5173
```

The built UI in `frontend/dist` is committed, so FastAPI also serves the full app at
http://localhost:8000 without Node. Run `npm run build` after changing the frontend.

On first start the app seeds demo users and three projects (two of them with the sample dataset). To
reset, delete `backend/ppb.db`.

| Username | Password | Role |
|---|---|---|
| gt.admin | gt-admin | GT Admin |
| gt.kalpana | gt-2026 | GT Director (can approve) |
| gt.diksha | gt-2026 | GT Consultant |
| meridian.cio / acme.cto / nordwind.it | client-2026 | Client (own org, read-only) |

For production, set `PPB_SECRET_KEY`, change the demo passwords, and hide the demo panel on the
login page.

## Screens

* **Login**: the sign-in form, plus a click-to-fill demo panel.
* **Projects**: cards showing metric-health RAG, status and version, plus the setup wizard.
* **Overview**: KPIs, the baseline in force, a path-to-approval checklist and recent activity.
* **Data**: upload or replace a dataset, edit column roles, view the data-quality score, preview and column profile.
* **Metrics**: the default and custom ratio metrics, with spec limits and goals.
* **Baselines**: version history, and a run dialog with the analysis settings.
* **Baseline detail**: a metric list with RAG, LCL/CL/UCL, an interactive I-MR chart, distribution fits, statistics and capability, and point review with assignable causes. Also submit, approve and return, plus Word/PPT/Excel export.
* **Stratification**: box plots by group, Kruskal-Wallis / ANOVA / Levene, and a pool-or-split recommendation.
* **Models (PPM)**: multiple regression with diagnostics, a what-if prediction with a 95% PI, and saved models.
* **Compare versions**: shift tests per metric.
* **Audit trail**: searchable, with CSV export.
* **Users** and **Methodology** pages.

## Layout

```
backend/app/engine/   ingest.py (mapping, metrics, quality) · stats.py · baseline.py
backend/app/routers/  auth · projects (data, metrics, stratify, models) · baselines (runs, review, export)
backend/app/reports/  export.py (Word / PowerPoint / Excel in GT style)
backend/tests/        pytest suite
frontend/src/         App.jsx · api.js · views/ · charts/ (SVG charts) · styles.css (GT tokens)
```

## Tests

```bash
cd backend && pytest -q
```

## Screenshots

See [`docs/screenshots/`](docs/screenshots/): login, projects, overview, data mapping, I-MR chart,
distribution fit, point review, stratification, PPM and the client's read-only view.
