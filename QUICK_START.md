# PPB helper: quick start

This tool builds a process performance baseline (PPB) from your project data in Excel. It runs on your
own computer, and your data stays there.

## 1. Get it (one time only)

Download the ZIP:
https://github.com/harenrao/processperformancebaseline/archive/refs/heads/claude/brave-noether-hjlw56.zip

Unzip it. In the folder you get, you should see `start.bat`, `start.sh`, `backend` and `frontend`.

## 2. Install Python (one time only)

* **Windows:** download **Python 3.12** from https://www.python.org/downloads/windows/ and run the
  installer. **Tick "Add python.exe to PATH"** on the first screen, then click **Install Now**.
* **Mac:** nothing to do. The built-in Python is fine.

## 3. Start the app

* **Windows:** double-click **`start.bat`**. If you see "Windows protected your PC", click
  **More info → Run anyway**.
* **Mac:** open Terminal in the folder and run `bash start.sh`.

The **first start takes 2–5 minutes** and needs internet. After that it starts in seconds.
Then open **http://localhost:8000** (Windows opens it for you).

**Keep the black / Terminal window open** while you use the app. Closing it stops the app.

## 4. Use it

1. **Create your account** the first time: name, username, password (8+ characters).
2. On **Home**, click **↓ Input template** to see the Excel layout. It has one row per completed
   requirement or project, oldest first, with a size column, phase-wise effort columns and phase-wise
   defect columns.
3. Drop your Excel file into **New PPB**, check the detected columns, name the run, and click
   **Generate PPB**.
4. Click any metric and step through its tabs:
   **Dot plot → Box plot → I-MR chart → Basic statistics → Histogram → Outlier list**.
   Outliers are removed automatically by the box plot (up to 10% of points). You can put a point
   back, or remove one, with a reason.
5. Click **Export…**, choose **PowerPoint**, **Word** or **Excel**, tick the metrics (or
   **Select all**), and click **Download**.
6. Your **past runs** are listed on Home. Click one to open it again.

## If something goes wrong

| Problem | Fix |
|---|---|
| "Python was not found" (Windows) | Reinstall Python 3.12 with **Add python.exe to PATH** ticked, restart the PC, try again. |
| "Setup did not finish" | Check the internet connection. A company network may block downloads; try another network. |
| "This site can't be reached" | The black / Terminal window must still be open. Wait a few seconds and refresh. |
| Forgot your password | Close the app, delete `backend/ppb.db`, start again. *This deletes past runs.* |

More detail for Windows: [`docs/WINDOWS_SETUP.md`](docs/WINDOWS_SETUP.md).
