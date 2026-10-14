# PPB helper: how to run it on Windows

This takes about 10 minutes the first time, and a few seconds after that.

## 1. Install Python (one time only)

1. Go to https://www.python.org/downloads/windows/ and download **Python 3.12**: scroll to the
   latest 3.12.x release and choose *Windows installer (64-bit)*.
   Use 3.12 rather than the newest version, because all the packages the tool needs are ready for it.
2. Run the installer. **On the first screen, tick "Add python.exe to PATH"** at the bottom, then
   click **Install Now**.
3. When it finishes, click **Close**.

To check it worked, open the **Start** menu, type `cmd`, press Enter, and run `py --version`.
It should print `Python 3.12.x`. If it does, close that window.

## 2. Unzip the tool

1. Save the zip file you were sent, for example in **Documents**.
2. Right-click it → **Extract All…** → **Extract**.
3. Open the extracted folder. You should see `start.bat`, `backend`, `frontend` and `README.md`.
   If you only see one folder inside, open that folder.

Don't run the tool from inside the zip without extracting it; that won't work.

## 3. Start it

1. Double-click **`start.bat`**.
2. If Windows shows **"Windows protected your PC"**, click **More info** → **Run anyway**.
   This appears because the file came from the internet.
3. **First time only:** a black window installs what the tool needs. This takes 2–5 minutes and
   needs internet. Wait until you see:

   ```
   PPB helper is running at  http://localhost:8000
   ```

4. Your browser opens the tool automatically. If it doesn't, open **http://localhost:8000** yourself.

**Keep the black window open while you use the tool.** Closing it stops the tool.

## 4. First sign-in

The first time, the tool asks you to **create your account**: your name, a username and a password
of at least 8 characters. Next time, sign in with the same username and password.

Your account, uploaded files and past runs are stored only on this computer.

## 5. Create a PPB

1. On **Home**, click **↓ Input template** if you need the expected Excel layout. It has one row per
   completed requirement or project, oldest first.
2. Drop your Excel or CSV file into the **New PPB** box, or click it to browse.
3. Check the detected columns (size, effort and defect columns), give the run a name, and click
   **Generate PPB**.
4. Review the summary. Click a metric to see its control chart, distribution and statistics.
5. Click **Export** to download the Word, PowerPoint or Excel output.

Past runs are listed on **Home**; click one to open it again.

## Next time

Double-click `start.bat`, wait a few seconds for the browser, and sign in.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Python was not found" | Do step 1 again and make sure **Add python.exe to PATH** is ticked. Then restart the computer and try again. |
| "Setup did not finish" | Check the internet connection. On a company network a proxy may block downloads; ask IT to allow `pypi.org` and `files.pythonhosted.org`, or try from another network. Then double-click `start.bat` again. |
| Errors mentioning "build" or "Microsoft Visual C++" | The Python version is too new for one of the packages. Uninstall it and install **Python 3.12** (step 1). Delete the `.venv` folder inside the tool folder, then start again. |
| Browser says "This site can't be reached" | The black window must be open and show *running at http://localhost:8000*. Wait a few seconds and refresh. |
| "address already in use" / port 8000 | The tool is already running in another black window; use that one. Or restart the computer. |
| Forgot the password | Close the tool, delete `backend\ppb.db` inside the tool folder, and start again. **This also deletes all past runs.** |

If you're stuck, send a screenshot of the black window.
