"""
Excel / Word / PowerPoint exports in GT house style.

Charts are drawn with matplotlib using the same tokens as the web app so the
documents read as the same product.
"""
from __future__ import annotations

import io
from datetime import datetime

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter, LogLocator, NullFormatter  # noqa: E402
from docx import Document  # noqa: E402
from docx.enum.text import WD_ALIGN_PARAGRAPH  # noqa: E402
from docx.oxml import OxmlElement  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Inches, Pt, RGBColor  # noqa: E402
from openpyxl import Workbook  # noqa: E402
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side  # noqa: E402
from openpyxl.utils import get_column_letter  # noqa: E402
from pptx import Presentation  # noqa: E402
from pptx.dml.color import RGBColor as PRGB  # noqa: E402
from pptx.util import Inches as PI  # noqa: E402
from pptx.util import Pt as PPt  # noqa: E402

BRAND = "4E2A84"
INK = "1B1B24"
MUTED = "6C6C78"
FAINT = "9A9AA4"
LINE = "E7E4EC"
SOFT = "F1ECF8"
SERIES = "#3B5BA5"
RAG = {"green": ("2F7D5B", "E7F3EC"), "amber": ("B7830B", "FBF2DD"), "red": ("BC3A2E", "FBEAE7"), "grey": ("6C6C78", "F0EFF2")}
RAG_TEXT = {"green": "Green", "amber": "Amber", "red": "Red"}

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9, "axes.edgecolor": "#" + LINE, "axes.labelcolor": "#" + MUTED,
    "xtick.color": "#" + MUTED, "ytick.color": "#" + MUTED, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": "#F0EEF3", "grid.linewidth": 0.8, "axes.titleweight": "bold",
    "axes.titlesize": 10, "axes.titlecolor": "#" + INK,
})


def fmt(v, digits: int = 4) -> str:
    if v is None:
        return "—"
    if isinstance(v, (int,)) and not isinstance(v, bool):
        return str(v)
    try:
        f = float(v)
    except (TypeError, ValueError):
        return str(v)
    if f == 0:
        return "0"
    a = abs(f)
    if a >= 100:
        return f"{f:,.1f}"
    if a >= 1:
        return f"{f:.3f}"
    return f"{f:.{digits}f}"


def _ok(metrics: list[dict]) -> list[dict]:
    return [m for m in metrics if "stats" in m]


# ------------------------------------------------------------------ charts --
def control_chart_png(m: dict) -> bytes:
    pts = m["points"]
    seq = m["chart"]["seq"]
    vals = [pts[i]["value"] for i in seq]
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(8, 4.2), gridspec_kw={"height_ratios": [2.2, 1]}, sharex=True)
    xs = list(range(1, len(vals) + 1))
    a1.plot(xs, vals, color=SERIES, lw=1.4, marker="o", ms=3.5, zorder=2)
    for j, i in enumerate(seq):
        if pts[i].get("rules"):
            a1.scatter([j + 1], [vals[j]], s=40, color="#BC3A2E", zorder=3, edgecolor="white", linewidth=1.2)
    c = m["chart"]
    for y, lab, ls in ((c["ucl"], "UCL", "--"), (c["cl"], "CL", "-"), (c["lcl"], "LCL", "--")):
        a1.axhline(y, color="#" + (INK if lab == "CL" else MUTED), lw=1, ls=ls, zorder=1)
        a1.text(1.01, y, f"{lab} {fmt(y)}", va="center", fontsize=7.5, color="#" + MUTED,
                transform=a1.get_yaxis_transform(), clip_on=False)
    if c["scale"] == "log":
        a1.set_yscale("log")
        a1.yaxis.set_major_locator(LogLocator(base=10, subs=(1, 2, 5)))
        a1.yaxis.set_major_formatter(FuncFormatter(lambda v, _: fmt(v)))
        a1.yaxis.set_minor_formatter(NullFormatter())
    a1.set_xlim(0.3, len(vals) + 0.7)
    a1.set_title(f"I-MR chart · {m['name']}", loc="left")
    mr = [v for v in c["mr"]]
    a2.plot(xs, [v if v is not None else float("nan") for v in mr], color=SERIES, lw=1.2, marker="o", ms=3)
    if c["scale"] == "linear":
        a2.axhline(c["mr_bar"], color="#" + INK, lw=1)
        a2.axhline(c["mr_ucl"], color="#" + MUTED, lw=1, ls="--")
    a2.set_xlim(0.3, len(vals) + 0.7)
    a2.set_ylabel("Moving range" + (" (log)" if c["scale"] == "log" else ""), fontsize=8)
    a2.set_xlabel("Observation (time order)", fontsize=8)
    fig.tight_layout()
    return _png(fig)


def histogram_png(m: dict) -> bytes:
    fig, ax = plt.subplots(figsize=(5, 3.2))
    h = m["histogram"]
    for b in h["bins"]:
        ax.bar(b["x0"], b["count"], width=(b["x1"] - b["x0"]) * 0.94, align="edge", color=SERIES, alpha=0.85)
    if h["curve"]:
        ax.plot([p[0] for p in h["curve"]], [p[1] for p in h["curve"]], color="#" + INK, lw=1.4)
    bl = m["baseline"]
    for y, lab in ((bl["lcl"], "LCL"), (bl["cl"], "CL"), (bl["ucl"], "UCL")):
        ax.axvline(y, color="#" + MUTED, lw=1, ls="-" if lab == "CL" else "--")
    ax.set_title(f"Distribution · best fit {m['fit']['best']}", loc="left")
    ax.set_xlabel(m.get("unit") or "")
    fig.tight_layout()
    return _png(fig)


def _png(fig) -> bytes:
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=160)
    plt.close(fig)
    return buf.getvalue()


# ------------------------------------------------------------------- excel --
def build_xlsx(b: dict) -> bytes:
    wb = Workbook()
    head = Font(bold=True, color="FFFFFF", size=10)
    headfill = PatternFill("solid", fgColor=BRAND)
    thin = Border(bottom=Side(style="thin", color=LINE))
    res = b["results"]

    ws = wb.active
    ws.title = "Baseline"
    ws["A1"] = f"Process Performance Baseline — {b['name']}"
    ws["A1"].font = Font(bold=True, size=14, color=BRAND)
    ws["A2"] = f"Source {b['filename']} · {b['n_rows']} rows · generated {datetime.now():%d %b %Y}"
    ws["A2"].font = Font(color=MUTED)
    cols = ["Metric", "Unit", "n", "Excluded", "Mean", "Median", "Std dev", "LCL", "CL", "UCL", "Limit method",
            "Best fit", "AD p-value", "Stable", "RAG", "Mean 95% CI", "Goal", "Cpk/Ppk"]
    ws.append([])
    ws.append(cols)
    for c in ws[4]:
        c.font, c.fill = head, headfill
    for m in res["metrics"]:
        if "stats" not in m:
            ws.append([m["name"], m.get("unit"), m.get("n_used"), m.get("n_excluded"), m.get("error")])
            continue
        s, bl, fit = m["stats"], m["baseline"], m["fit"]
        bf = next((f for f in fit["fits"] if f["name"] == fit["best"]), {})
        cap = m.get("capability") or {}
        ci = s.get("mean_ci")
        ws.append([m["name"], m.get("unit"), m["n_used"], m["n_excluded"], s["mean"], s["median"], s["sd"],
                   bl["lcl"], bl["cl"], bl["ucl"], bl["method"], fit["best"], bf.get("p_label", "—"),
                   "Yes" if m["status"]["stable"] else "No", RAG_TEXT.get(m["rag"], m["rag"]),
                   f"{fmt(ci[0])} – {fmt(ci[1])}" if ci else "—", m.get("goal"),
                   fmt(cap.get("cpk") or cap.get("ppk")) if cap else "—"])
        rag = ws.cell(ws.max_row, 15)
        fg, bg = RAG.get(m["rag"], RAG["grey"])
        rag.fill, rag.font = PatternFill("solid", fgColor=bg), Font(color=fg, bold=True)
    for row in ws.iter_rows(min_row=5, max_row=ws.max_row):
        for c in row:
            c.border = thin
            if isinstance(c.value, float):
                c.number_format = "0.0000"
    _widths(ws, [38, 12, 6, 9, 10, 10, 10, 10, 10, 10, 34, 13, 11, 8, 8, 22, 8, 9])
    ws.freeze_panes = "B5"

    ws2 = wb.create_sheet("Data points")
    ws2.append(["Metric", "Row", "ID", "Value", "Included", "Flagged by", "Run rules", "Exclusion reason"])
    for c in ws2[1]:
        c.font, c.fill = head, headfill
    for m in res["metrics"]:
        for pt in m.get("points", []):
            ws2.append([m["name"], pt["row"] + 1, pt["id"], pt["value"], "No" if pt["excluded"] else "Yes",
                        ", ".join(pt.get("flags") or []), ", ".join(str(r) for r in pt.get("rules") or []),
                        pt.get("reason") or ""])
    _widths(ws2, [38, 6, 16, 12, 9, 16, 10, 60])
    ws2.freeze_panes = "A2"

    ws3 = wb.create_sheet("Distribution fits")
    ws3.append(["Metric", "Distribution", "AD statistic", "p-value", "Selected"])
    for c in ws3[1]:
        c.font, c.fill = head, headfill
    for m in _ok(res["metrics"]):
        for f in m["fit"]["fits"]:
            ws3.append([m["name"], f["name"], f["ad"], f["p_label"], "✓" if f["name"] == m["fit"]["best"] else ""])
    _widths(ws3, [38, 14, 13, 10, 9])

    ws4 = wb.create_sheet("Method")
    st = b["settings"]
    lines = [
        ("Outlier screening", f"{st['outlier_method'].upper()} (flags only)" + (", auto-exclusion capped at "
                                                                                 f"{st['max_auto_exclude_pct']}%" if st["auto_exclude"] else "")),
        ("Run rules", ", ".join(str(r) for r in st["rules"]) + " (Minitab numbering)"),
        ("Transform", "Lognormal data charted on log scale" if st["transform"] == "auto" else "None"),
        ("Normality test", "Anderson-Darling; p-value per Minitab (D'Agostino & Stephens)"),
        ("Limits", "Normal: I-MR natural limits. Other fits: 0.135/50/99.865 percentiles. No fit: empirical percentiles."),
        ("Exclusions", "Only with a recorded assignable cause; see 'Data points'."),
    ]
    for k, v in lines:
        ws4.append([k, v])
        ws4.cell(ws4.max_row, 1).font = Font(bold=True)
    _widths(ws4, [22, 100])
    for row in ws4.iter_rows():
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical="top")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _widths(ws, ws_widths: list[int]) -> None:
    for i, w in enumerate(ws_widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


# -------------------------------------------------------------------- word --
def _shade(cell, hex_color: str) -> None:
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def build_docx(b: dict) -> bytes:
    res = b["results"]
    doc = Document()
    st = doc.styles["Normal"]
    st.font.name, st.font.size = "Calibri", Pt(10)
    for s in ("Heading 1", "Heading 2", "Title"):
        doc.styles[s].font.color.rgb = RGBColor.from_string(BRAND)

    t = doc.add_paragraph()
    r = t.add_run("GRANT THORNTON · PROCESS PERFORMANCE BASELINE")
    r.font.size, r.font.bold, r.font.color.rgb = Pt(9), True, RGBColor.from_string(FAINT)
    doc.add_heading(b["name"], 0)
    meta = doc.add_paragraph()
    meta.add_run(f"Source data: {b['filename']} ({b['n_rows']} rows)\n").bold = True
    meta.add_run(f"Prepared by {b.get('created_by_name') or '—'}. Generated {datetime.now():%d %B %Y}.")

    doc.add_heading("Executive summary", 1)
    s = res["summary"]
    doc.add_paragraph(
        f"{s['metrics']} metrics were baselined from {s['rows']} data points. {s['green']} are green "
        f"(stable, sufficient data, distribution identified), {s['amber']} amber and {s['red']} red. "
        f"{s['excluded']} point(s) were excluded with a recorded assignable cause; {s['flagged']} were flagged "
        f"by outlier screening for review.")

    doc.add_heading("Baseline summary", 1)
    cols = ["Metric", "n", "Mean", "Median", "LCL", "CL", "UCL", "Fit", "RAG"]
    tbl = doc.add_table(rows=1, cols=len(cols))
    tbl.style = "Table Grid"
    for i, c in enumerate(cols):
        cell = tbl.rows[0].cells[i]
        cell.text = c
        cell.paragraphs[0].runs[0].font.bold = True
        cell.paragraphs[0].runs[0].font.color.rgb = RGBColor(255, 255, 255)
        _shade(cell, BRAND)
    for m in _ok(res["metrics"]):
        bl = m["baseline"]
        vals = [m["name"], str(m["n_used"]), fmt(m["stats"]["mean"]), fmt(m["stats"]["median"]), fmt(bl["lcl"]),
                fmt(bl["cl"]), fmt(bl["ucl"]), m["fit"]["best"], RAG_TEXT[m["rag"]]]
        cells = tbl.add_row().cells
        for i, v in enumerate(vals):
            cells[i].text = v
            cells[i].paragraphs[0].runs[0].font.size = Pt(8.5)
        _shade(cells[-1], RAG[m["rag"]][1])
    for r in tbl.rows:
        for i, w in enumerate([2.1, 0.4, 0.6, 0.6, 0.6, 0.6, 0.6, 0.9, 0.6]):
            r.cells[i].width = Inches(w)

    doc.add_heading("Method", 1)
    stt = b["settings"]
    for line in [
        f"Outlier screening: {stt['outlier_method'].upper()}. Flagged points are reviewed; a point is excluded only "
        "when an assignable cause is recorded.",
        "Stability: I-MR chart with Western Electric / Nelson tests " + ", ".join(map(str, stt["rules"])) +
        ". Lognormal metrics are charted on the log scale.",
        "Distribution: Anderson-Darling goodness of fit across Normal, Lognormal, Exponential, Weibull and Gamma.",
        "Limits: Normal → I-MR natural process limits; other fits → 0.135 / 50 / 99.865 percentiles of the fitted "
        "distribution; no fit → empirical percentiles.",
    ]:
        doc.add_paragraph(line, style="List Bullet")

    for m in _ok(res["metrics"]):
        doc.add_page_break()
        doc.add_heading(m["name"], 1)
        ss, bl = m["stats"], m["baseline"]
        doc.add_paragraph(f"Unit {m.get('unit') or '—'} · n = {m['n_used']} ({m['n_excluded']} excluded) · "
                          f"best fit {m['fit']['best']} · {bl['method']} · RAG {RAG_TEXT[m['rag']]}")
        doc.add_picture(io.BytesIO(control_chart_png(m)), width=Inches(6.3))
        doc.add_picture(io.BytesIO(histogram_png(m)), width=Inches(4.2))
        tb = doc.add_table(rows=0, cols=4)
        tb.style = "Table Grid"
        pairs = [("Mean", fmt(ss["mean"])), ("Median", fmt(ss["median"])), ("Std dev", fmt(ss["sd"])),
                 ("CV", fmt(ss.get("cv"))), ("LCL", fmt(bl["lcl"])), ("CL", fmt(bl["cl"])), ("UCL", fmt(bl["ucl"])),
                 ("P10–P90", f"{fmt(ss['p10'])} – {fmt(ss['p90'])}")]
        for i in range(0, len(pairs), 2):
            c = tb.add_row().cells
            c[0].text, c[1].text, c[2].text, c[3].text = pairs[i][0], pairs[i][1], pairs[i + 1][0], pairs[i + 1][1]
        for w in m.get("warnings", []):
            doc.add_paragraph(w, style="List Bullet")
        ex = [pt for pt in m["points"] if pt["excluded"]]
        if ex:
            doc.add_heading("Excluded points", 2)
            for pt in ex:
                doc.add_paragraph(f"{pt['id']} ({fmt(pt['value'])}): {pt['reason']}", style="List Bullet")

    for par in doc.paragraphs[:1]:
        par.alignment = WD_ALIGN_PARAGRAPH.LEFT
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# -------------------------------------------------------------------- pptx --
def _tx(slide, text, x, y, w, h, size=12, bold=False, color=INK):
    tb = slide.shapes.add_textbox(PI(x), PI(y), PI(w), PI(h))
    tf = tb.text_frame
    tf.word_wrap = True
    para = tf.paragraphs[0]
    para.text = text
    para.font.size, para.font.bold = PPt(size), bold
    para.font.color.rgb = PRGB.from_string(color)
    para.font.name = "Arial"
    return tb


def _bar(slide):
    s = slide.shapes.add_shape(1, 0, 0, PI(13.333), PI(0.12))
    s.fill.solid()
    s.fill.fore_color.rgb = PRGB.from_string(BRAND)
    s.line.fill.background()


def build_pptx(b: dict) -> bytes:
    res = b["results"]
    prs = Presentation()
    prs.slide_width, prs.slide_height = PI(13.333), PI(7.5)
    blank = prs.slide_layouts[6]

    s = prs.slides.add_slide(blank)
    _bar(s)
    _tx(s, "PROCESS PERFORMANCE BASELINE", 0.8, 2.3, 11, 0.4, 12, True, FAINT)
    _tx(s, b["name"], 0.8, 2.7, 11, 1, 36, True, BRAND)
    _tx(s, f"Source {b['filename']} · {b['n_rows']} rows", 0.8, 3.8, 11, 0.5, 16, False, MUTED)
    _tx(s, f"Grant Thornton · {datetime.now():%B %Y}", 0.8, 6.6, 11, 0.4, 11, False, FAINT)

    s = prs.slides.add_slide(blank)
    _bar(s)
    _tx(s, "Baseline summary", 0.5, 0.35, 12, 0.6, 24, True)
    sm = res["summary"]
    _tx(s, f"{sm['metrics']} metrics · {sm['green']} green · {sm['amber']} amber · {sm['red']} red · "
           f"{sm['excluded']} justified exclusions", 0.5, 0.95, 12, 0.4, 12, False, MUTED)
    ok = _ok(res["metrics"])[:16]
    cols = ["Metric", "n", "LCL", "CL", "UCL", "Fit", "RAG"]
    tbl = s.shapes.add_table(len(ok) + 1, len(cols), PI(0.5), PI(1.5), PI(12.3), PI(0.3 * (len(ok) + 1))).table
    widths = [5.0, 0.8, 1.3, 1.3, 1.3, 1.6, 1.0]
    for i, w in enumerate(widths):
        tbl.columns[i].width = PI(w)
    for i, c in enumerate(cols):
        cell = tbl.cell(0, i)
        cell.text = c
        cell.fill.solid()
        cell.fill.fore_color.rgb = PRGB.from_string(BRAND)
        cell.text_frame.paragraphs[0].font.size = PPt(10)
        cell.text_frame.paragraphs[0].font.bold = True
        cell.text_frame.paragraphs[0].font.color.rgb = PRGB(255, 255, 255)
    for r, m in enumerate(ok, 1):
        bl = m["baseline"]
        for i, v in enumerate([m["name"], str(m["n_used"]), fmt(bl["lcl"]), fmt(bl["cl"]), fmt(bl["ucl"]),
                               m["fit"]["best"], RAG_TEXT[m["rag"]]]):
            cell = tbl.cell(r, i)
            cell.text = v
            cell.fill.solid()
            cell.fill.fore_color.rgb = PRGB.from_string(RAG[m["rag"]][1] if i == 6 else "FFFFFF")
            para = cell.text_frame.paragraphs[0]
            para.font.size = PPt(9)
            para.font.color.rgb = PRGB.from_string(RAG[m["rag"]][0] if i == 6 else INK)

    for m in ok:
        s = prs.slides.add_slide(blank)
        _bar(s)
        _tx(s, m["name"], 0.5, 0.35, 12, 0.6, 22, True)
        bl, ss = m["baseline"], m["stats"]
        _tx(s, f"{m.get('unit') or ''} · n = {m['n_used']} · {bl['method']}", 0.5, 0.95, 12, 0.4, 11, False, MUTED)
        s.shapes.add_picture(io.BytesIO(control_chart_png(m)), PI(0.4), PI(1.5), width=PI(8.4))
        y = 1.6
        for k, v in [("LCL", bl["lcl"]), ("CL", bl["cl"]), ("UCL", bl["ucl"]), ("Mean", ss["mean"]),
                     ("Median", ss["median"]), ("Std dev", ss["sd"])]:
            _tx(s, k.upper(), 9.2, y, 1.6, 0.3, 9, True, FAINT)
            _tx(s, fmt(v), 10.6, y - 0.05, 2.2, 0.4, 16, True, INK)
            y += 0.55
        _tx(s, f"Best fit: {m['fit']['best']}  ·  Stable: {'yes' if m['status']['stable'] else 'no'}  ·  "
               f"RAG: {RAG_TEXT[m['rag']]}", 9.2, y + 0.1, 3.9, 0.5, 10, False, MUTED)
        if m.get("warnings"):
            _tx(s, " ".join(m["warnings"][:2]), 0.5, 6.4, 12.3, 0.8, 10, False, MUTED)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def build(fmt_: str, run: dict) -> bytes:
    return {"xlsx": build_xlsx, "docx": build_docx, "pptx": build_pptx}[fmt_](run)
