# Process Performance Baseline (PPB) helper

A small tool that runs on your own computer. Upload your project data (Excel or CSV) and it
generates a process performance baseline for each productivity and quality metric. For every
metric you get lower limit / centre line / upper limit, a stability check, the distribution fit and
summary statistics. Download the result as a Word report, a PowerPoint deck or an Excel workbook.

Everything stays on the machine: the accounts, the uploaded data and past runs are stored in a local
file (`backend/ppb.db`).

## Install and start

You only need **Python 3.9 or newer** ([python.org](https://www.python.org/downloads/); on Windows
tick "Add Python to PATH").

1. Unzip the tool into a folder.
2. Start it:
   * **Windows:** double-click `start.bat` (step-by-step guide: [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md))
   * **Mac / Linux:** run `./start.sh` in a terminal
3. Open **http://localhost:8000**. The first time, create your account.

The first start installs packages (2–3 minutes). Keep the window open while you use the tool, and
close it to stop.

## Using it

1. **Home → New PPB:** drop your data file. The tool shows which columns it found (size, effort,
   defects) and any data-quality notes. Name the run and click **Generate PPB**.
2. **Result:** a summary table of all metrics, with lower limit, centre line and upper limit. Click a
   metric to see its control chart, distribution and statistics. If a point is not representative,
   you can exclude it with a recorded reason, and the baseline recalculates.
3. **Export:** download the Word, PowerPoint or Excel output.
4. **Past runs:** listed on Home. Open one to review it again or re-download its reports.

### Input format

Download **Input template** on the Home screen. It has one row per completed requirement or project,
in completion order, with these columns:

* an ID column
* `Initial Project Size`
* phase-wise effort columns (person-days), e.g. `Design Efforts (MD)`
* phase-wise defect columns, e.g. `SIT Defects`

Extra or renamed phases are fine: any header containing "effort" or "defect" is picked up. Aim for
20 or more rows.

### Metrics produced

* Effort per size unit for each phase, and in total
* Defect density for each phase, and in total
* Defect removal efficiency

## For developers

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
cd backend && uvicorn app.main:app --reload --port 8000    # API + built UI
cd frontend && npm install && npm run dev                  # UI dev server on :5173
cd backend && pytest -q                                    # tests
```

The built UI (`frontend/dist`) is committed. Run `npm run build` after changing the frontend.

```
backend/app/engine/   ingest.py (columns, metrics, data quality) · stats.py · baseline.py
backend/app/routers/  auth.py (local accounts) · runs.py (upload, results, exclusions, export, template)
backend/app/reports/  export.py (Word / PowerPoint / Excel)
frontend/src/views/   Login.jsx · Home.jsx · Run.jsx
```

For production, set `PPB_SECRET_KEY` to a long random value.

[`docs/ASSESSMENT.md`](docs/ASSESSMENT.md) records the review of the original tool.
