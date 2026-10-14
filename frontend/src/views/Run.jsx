import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { BoxPlot, ControlChart, DotPlot, Histogram } from '../charts/charts.jsx'
import { Empty, Kpi, Loading, Modal, PageHead, Pill, RagPill, useToast } from '../components/ui.jsx'
import { datetime, fmt, RULES } from '../helpers.js'

export default function Run({ id, metricKey }) {
  const [b, setB] = useState(null)
  const [renaming, setRenaming] = useState(false)
  const toast = useToast()
  useEffect(() => { api.get(`/runs/${id}`).then(setB).catch((e) => { toast(e.message, 'err'); go('') }) }, [id])
  if (!b) return <Loading />
  const res = b.results
  const metric = metricKey && res.metrics.find((m) => m.key === metricKey)

  return (
    <div className="content"><div className="content-inner">
      <PageHead crumbs={<><a href="#/">Home</a> / {b.name}</>}
        title={b.name}
        sub={<>{b.filename} · {b.n_rows} rows · run {datetime(b.created_at)}{b.updated_at !== b.created_at && ` · updated ${datetime(b.updated_at)}`}</>}>
        <button className="btn btn-ghost" onClick={() => setRenaming(true)}>Rename</button>
        <ExportMenu b={b} />
      </PageHead>

      <div className="grid-2" style={{ gridTemplateColumns: '290px 1fr', alignItems: 'start' }}>
        <div className="card pad-0">
          <div className={`metric-item ${!metric ? 'on' : ''}`} onClick={() => go(`run/${id}`)} style={{ fontWeight: 600 }}>
            <span className="glyph">▤</span><span className="nm">Baseline summary</span></div>
          <div className="metric-list">
            {res.metrics.map((m) => (
              <div key={m.key} className={`metric-item ${metric?.key === m.key ? 'on' : ''}`} onClick={() => go(`run/${id}/${m.key}`)}>
                <span className={`rag-dot ${m.rag || 'grey'}`} title={m.rag} />
                <span className="nm" title={m.name}>{m.name}</span>
                {m.n_excluded > 0 && <span className="tag" title="Excluded points">−{m.n_excluded}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>{metric ? <MetricView key={metric.key} m={metric} b={b} onChange={setB} /> : <Summary b={b} />}</div>
      </div>
      {renaming && <RenameDialog b={b} onClose={() => setRenaming(false)} onDone={(nb) => { setB(nb); setRenaming(false) }} />}
    </div></div>
  )
}

function RenameDialog({ b, onClose, onDone }) {
  const [name, setName] = useState(b.name)
  const toast = useToast()
  return (
    <Modal title="Rename run" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!name.trim()} onClick={async () => {
        try { onDone(await api.patch(`/runs/${b.id}`, { name })) } catch (e) { toast(e.message, 'err') }
      }}>Save</button></>}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
    </Modal>
  )
}

function ExportMenu({ b }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>Export…</button>
      {open && <ExportDialog b={b} onClose={() => setOpen(false)} />}
    </>
  )
}

const FORMATS = [['pptx', 'PowerPoint deck', 'Section divider + one slide per step, per metric'],
  ['docx', 'Word report', 'Same sequence as a document'], ['xlsx', 'Excel workbook', 'Summary, box plot iterations, statistics, outliers']]

function ExportDialog({ b, onClose }) {
  const ok = b.results.metrics.filter((m) => !m.error)
  const [fmtSel, setFmt] = useState('pptx')
  const [sel, setSel] = useState(() => new Set(ok.map((m) => m.key)))
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const all = sel.size === ok.length
  const toggle = (k) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n) }
  const go = async () => {
    setBusy(true)
    try {
      const q = all ? '' : `?metrics=${encodeURIComponent([...sel].join(','))}`
      await api.download(`/runs/${b.id}/export/${fmtSel}${q}`, `PPB.${fmtSel}`)
      toast('Downloaded'); onClose()
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title="Export PPB" wide onClose={onClose} footer={<>
      <span className="muted" style={{ fontSize: 12.5 }}>{sel.size} of {ok.length} metrics{fmtSel === 'pptx' && sel.size > 0 && ` · about ${3 + Math.ceil(sel.size / 14) + sel.size * 7} slides`}</span>
      <span className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!sel.size || busy} onClick={go}>{busy ? 'Preparing…' : 'Download'}</button></>}>
      <div className="stack">
        <div className="micro">Format</div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {FORMATS.map(([f, l, d]) => (
            <button key={f} className="card" onClick={() => setFmt(f)} style={{ textAlign: 'left', padding: 14, cursor: 'pointer',
              borderColor: fmtSel === f ? 'var(--brand)' : undefined, background: fmtSel === f ? 'var(--brand-soft)' : undefined }}>
              <div style={{ fontWeight: 600, color: fmtSel === f ? 'var(--brand)' : 'var(--ink)' }}>{l}</div>
              <div className="faint" style={{ fontSize: 12 }}>{d}</div>
            </button>))}
        </div>
        <div className="row"><span className="micro">Metrics</span><span className="spacer" />
          <label className="check" style={{ fontSize: 13 }}><input type="checkbox" checked={all} onChange={() => setSel(all ? new Set() : new Set(ok.map((m) => m.key)))} />Select all</label></div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 300, overflow: 'auto' }}>
          {ok.map((m) => (
            <label key={m.key} className="metric-item" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={sel.has(m.key)} onChange={() => toggle(m.key)} style={{ accentColor: 'var(--brand)' }} />
              <span className={`rag-dot ${m.rag}`} /><span className="nm">{m.name}</span><span className="faint" style={{ fontSize: 12 }}>{m.unit}</span>
            </label>))}
        </div>
      </div>
    </Modal>
  )
}

function Summary({ b }) {
  const s = b.results.summary
  return (
    <>
      <div className="kpis">
        <Kpi label="Metrics" value={s.metrics} sub={`${s.green} green · ${s.amber} amber · ${s.red} red`} />
        <Kpi label="Stable" value={s.stable} unit={`/ ${s.metrics}`} sub="No run-rule violations" />
        <Kpi label="Normal" value={s.normal} unit={`/ ${s.metrics}`} sub="Others fitted or empirical" />
        <Kpi label="Outliers removed" value={s.excluded} sub={`${s.flagged} I-MR signal(s) flagged`} />
      </div>
      <div className="card pad-0">
        <div className="table-wrap"><table className="t compact">
          <thead><tr><th>Metric</th><th className="r">n</th><th className="r">Mean</th><th className="r">Median</th><th className="r">LCL</th><th className="r">CL</th><th className="r">UCL</th><th>Fit</th><th>Stable</th><th>Status</th></tr></thead>
          <tbody>{b.results.metrics.map((m) => m.error ? (
            <tr key={m.key}><td>{m.name}</td><td colSpan="8" className="muted">{m.error}</td><td><RagPill rag="red" /></td></tr>
          ) : (
            <tr key={m.key} className="click" onClick={() => go(`run/${b.id}/${m.key}`)}>
              <td style={{ fontWeight: 500 }}>{m.name}<div className="faint" style={{ fontSize: 11.5 }}>{m.unit}</div></td>
              <td className="r">{m.n_used}{m.n_excluded > 0 && <span className="faint">/{m.n_total}</span>}</td>
              <td className="r">{fmt(m.stats.mean)}</td><td className="r">{fmt(m.stats.median)}</td>
              <td className="r">{fmt(m.baseline.lcl)}</td><td className="r"><b>{fmt(m.baseline.cl)}</b></td><td className="r">{fmt(m.baseline.ucl)}</td>
              <td><span className="tag">{m.fit.best}</span></td>
              <td>{m.status.stable ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--red)' }} title={`${m.status.rule1} beyond limits, ${m.status.run_rules} run rules`}>✕</span>}</td>
              <td><RagPill rag={m.rag} /></td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
      <div className="banner grey" style={{ marginTop: 14 }}>
        <b>RAG</b> Green: stable, ≥ {b.settings.min_points} points, distribution identified. Amber: run-rule signals, fewer points, or no distribution fits. Red: points beyond 3σ still included, or fewer than 10 points.
      </div>
    </>
  )
}

const TABS = [['dot', '1 · Dot plot'], ['box', '2 · Box plot'], ['imr', '3 · I-MR chart'], ['stats', '4 · Basic statistics'],
  ['hist', '5 · Histogram'], ['out', '6 · Outlier list']]

function MetricView({ m, b, onChange }) {
  const [tab, setTab] = useState('dot')
  const [pick, setPick] = useState(null)
  if (m.error) return <div className="card"><Empty glyph="!" title="Could not baseline this metric">{m.error}</Empty></div>
  const bl = m.baseline, s = m.stats
  const idx = TABS.findIndex(([k]) => k === tab)
  const removed = m.points.map((p, i) => ({ ...p, i })).filter((p) => p.excluded)
    .sort((a, c) => (a.removed_by !== 'box') - (c.removed_by !== 'box') || (a.removed_in || 0) - (c.removed_in || 0))
  const signals = m.points.map((p, i) => ({ ...p, i })).filter((p) => p.rules?.length && !p.excluded)
  const kept = []
  const seen = new Set()
  for (const it of m.box_iterations) for (const k of it.kept) if (!seen.has(k.row)) { seen.add(k.row); kept.push(k) }
  const all = m.points.map((p) => p.value)
  const lo = Math.min(...all), hi = Math.max(...all), pad = (hi - lo) * 0.04 || 1
  const iByRow = Object.fromEntries(m.points.map((p, i) => [p.row, i]))

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div><h3 style={{ fontSize: 17 }}>{m.name}</h3>
            <p>{m.unit} · n = {m.n_used} of {m.n_total} · {m.n_box_removed} removed by box plot{m.n_manual_removed ? `, ${m.n_manual_removed} by you` : ''}</p></div>
          <span className="spacer" /><RagPill rag={m.rag} />
        </div>
        <div className="limits">
          <div className="limit"><div className="micro">LCL</div><div className="v">{fmt(bl.lcl)}</div></div>
          <div className="limit cl"><div className="micro" style={{ color: 'var(--brand)' }}>Centre line</div><div className="v">{fmt(bl.cl)}</div></div>
          <div className="limit"><div className="micro">UCL</div><div className="v">{fmt(bl.ucl)}</div></div>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Baseline limits: {bl.method}.</div>
        {m.warnings?.length > 0 && <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          {m.warnings.map((w, i) => <div key={i} className={`banner ${/3σ/.test(w) ? 'red' : 'amber'}`}>{w}</div>)}
        </div>}
      </div>

      <div className="card">
        <div className="tabs" style={{ overflowX: 'auto' }}>
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)} style={{ whiteSpace: 'nowrap' }}>{l}</button>)}
        </div>

        {tab === 'dot' && <>
          <DotPlot metric={m} onPick={setPick} />
          <p className="muted" style={{ fontSize: 13 }}>All {m.n_total} data points. Red points are removed by the box plot in step 2. Click a point to review it.</p>
        </>}

        {tab === 'box' && <div className="stack">
          {m.box_iterations.map((it) => (
            <div key={it.iteration} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
              <div className="row wrap" style={{ marginBottom: 2 }}>
                <b style={{ fontSize: 13.5 }}>Iteration {it.iteration}</b><span className="muted" style={{ fontSize: 13 }}>n = {it.n}</span>
                <span className="spacer" />
                {it.removed.length > 0 ? <Pill cls="red">{it.removed.length} outlier{it.removed.length > 1 ? 's' : ''} removed</Pill>
                  : it.kept.length > 0 ? <Pill cls="amber">Final — {it.kept.length} outlier{it.kept.length > 1 ? 's' : ''} kept</Pill>
                  : <Pill cls="green">No outliers — clean</Pill>}
                {it.removed.length > 0 && it.kept.length > 0 && <Pill cls="amber">{it.kept.length} kept</Pill>}
              </div>
              <BoxPlot it={it} domain={[lo - pad, hi + pad]} unit={m.unit} />
              {it.removed.length > 0 && <div className="faint" style={{ fontSize: 12 }}>Removed: {it.removed.map((r) => `${r.id} (${fmt(r.value)})`).join(', ')}</div>}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Points beyond 1.5×IQR (dashed red fences) are removed and the box plot is rebuilt until none remain, up to 10% of the data.</p>
        </div>}

        {tab === 'imr' && <>
          <ControlChart metric={m} onPick={setPick} />
          <div className="banner ai" style={{ marginTop: 12 }}><b>Read it</b> Built on the {m.n_used} points left after outlier removal. {m.status.stable
            ? 'No stability signals: the process is predictable.'
            : `${signals.length} point(s) give stability signals. They are flagged, not removed; click one to investigate or remove it with a reason.`}
            {m.chart.scale === 'log' && ' Charted on the log scale because the data is lognormal.'}</div>
        </>}

        {tab === 'stats' && <div className="grid-2e">
          <table className="t compact"><tbody>
            {[['Data points (n)', `${m.n_used} used of ${m.n_total}`], ['Mean', fmt(s.mean)], ['Median', fmt(s.median)], ['Standard deviation', fmt(s.sd)],
              ['Minimum', fmt(s.min)], ['Maximum', fmt(s.max)], ['Q1 (25th percentile)', fmt(s.p25)], ['Q3 (75th percentile)', fmt(s.p75)]].map(([k, v]) =>
              <tr key={k}><td className="muted">{k}</td><td className="r"><b>{v}</b></td></tr>)}
          </tbody></table>
          <table className="t compact"><tbody>
            {[['95% CI of mean', s.mean_ci ? `${fmt(s.mean_ci[0])} – ${fmt(s.mean_ci[1])}` : '—'],
              ['Normality (Anderson-Darling)', s.normality_p == null ? '—' : `p ${s.normality_p < 0.005 ? '< 0.005' : s.normality_p.toFixed(3)} · ${s.normality_p >= 0.05 ? 'normal' : 'not normal'}`],
              ['Best-fit distribution', m.fit.best], ['Baseline LCL', fmt(bl.lcl)], ['Baseline CL', fmt(bl.cl)], ['Baseline UCL', fmt(bl.ucl)],
              ['Stable', m.status.stable ? 'Yes' : 'No, signals present']].map(([k, v]) =>
              <tr key={k}><td className="muted">{k}</td><td className="r"><b>{v}</b></td></tr>)}
          </tbody></table>
        </div>}

        {tab === 'hist' && <div className="grid-2e">
          <Histogram metric={m} />
          <div>
            <table className="t compact">
              <thead><tr><th>Distribution</th><th className="r">AD</th><th className="r">p-value</th></tr></thead>
              <tbody>{m.fit.fits.map((f) => (
                <tr key={f.name} className={f.name === m.fit.best ? 'sel' : ''}>
                  <td style={{ fontWeight: f.name === m.fit.best ? 600 : 400 }}>{f.name}{f.name === m.fit.best && ' ✓'}{f.note && <div className="faint" style={{ fontSize: 11.5 }}>{f.note}</div>}</td>
                  <td className="r">{f.ad === null ? '—' : f.ad.toFixed(3)}</td><td className="r">{f.p_label}</td></tr>
              ))}</tbody>
            </table>
            <p className="muted" style={{ fontSize: 12.5 }}>Anderson-Darling goodness of fit on the cleaned data. p above 0.05 means a plausible fit.</p>
          </div>
        </div>}

        {tab === 'out' && <div className="stack">
          {removed.length === 0 ? <Empty glyph="✓" title="No points removed" /> : (
            <div className="table-wrap"><table className="t compact">
              <thead><tr><th>ID</th><th className="r">Value</th><th>Step</th><th>Reason</th><th></th></tr></thead>
              <tbody>{removed.map((p) => (
                <tr key={p.row}><td className="mono">{p.id}</td><td className="r">{fmt(p.value)}</td>
                  <td>{p.removed_by === 'box' ? `Box plot, iteration ${p.removed_in}` : 'Removed by user'}</td>
                  <td style={{ fontSize: 12.5, maxWidth: 340 }}>{p.reason}</td>
                  <td><button className="btn-link" onClick={() => setPick(p.i)}>{p.removed_by === 'box' ? 'Put back…' : 'Undo'}</button></td></tr>
              ))}</tbody>
            </table></div>
          )}
          {kept.length > 0 && <><div className="micro">Outliers kept</div>
            <table className="t compact"><tbody>{kept.map((k) => (
              <tr key={k.row}><td className="mono">{k.id}</td><td className="r">{fmt(k.value)}</td><td className="muted">{k.why}</td>
                <td><button className="btn-link" onClick={() => setPick(iByRow[k.row])}>Review</button></td></tr>))}</tbody></table></>}
          {signals.length > 0 && <><div className="micro">I-MR signals (flagged, not removed)</div>
            <table className="t compact"><tbody>{signals.map((p) => (
              <tr key={p.row}><td className="mono">{p.id}</td><td className="r">{fmt(p.value)}</td>
                <td>{p.rules.map((r) => <span key={r} className="tag" style={{ marginRight: 4 }} title={RULES[r]}>Test {r}</span>)}</td>
                <td><button className="btn-link" onClick={() => setPick(p.i)}>Remove…</button></td></tr>))}</tbody></table></>}
        </div>}

        <div className="row" style={{ marginTop: 16, borderTop: '1px solid var(--line-soft)', paddingTop: 12 }}>
          {idx > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setTab(TABS[idx - 1][0])}>← {TABS[idx - 1][1].slice(4)}</button>}
          <span className="spacer" />
          {idx < TABS.length - 1 && <button className="btn btn-ghost btn-sm" onClick={() => setTab(TABS[idx + 1][0])}>{TABS[idx + 1][1].slice(4)} →</button>}
        </div>
      </div>
      {pick !== null && <PointDialog m={m} b={b} i={pick} onClose={() => setPick(null)} onChange={(nb) => { onChange(nb); setPick(null) }} />}
    </div>
  )
}

const CAUSES = ['Data entry error, corrected value not available', 'Different process or lifecycle (not representative)',
  'Scope change mid-flight not reflected in size', 'One-off event (outage, attrition, client hold)', 'Pilot or new technology, not yet standard']
const KEEP_CAUSES = ['Valid data point, verified with the project team', 'Genuine process behaviour, should be in the baseline']

function PointDialog({ m, b, i, onClose, onChange }) {
  const pt = m.points[i]
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const mode = pt.removed_by === 'box' ? 'keep' : pt.removed_by === 'manual' || pt.kept_reason ? 'reset' : 'exclude'
  const send = async (action) => {
    setBusy(true)
    try {
      onChange(await api.patch(`/runs/${b.id}/overrides`, { metric: m.key, row: pt.row, action, reason }))
      toast({ keep: 'Point put back, baseline recalculated', exclude: 'Point removed, baseline recalculated', reset: 'Change undone, baseline recalculated' }[action])
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const cta = { keep: 'Put back with this reason', exclude: 'Remove with this reason', reset: pt.kept_reason ? 'Undo: let the box plot decide' : 'Undo removal' }[mode]
  return (
    <Modal title={`${pt.id} · ${fmt(pt.value)} ${m.unit || ''}`} onClose={onClose} footer={<>
      <span className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Close</button>
      <button className="btn btn-primary" disabled={busy || (mode !== 'reset' && reason.trim().length < 10)} onClick={() => send(mode)}>{cta}</button></>}>
      <div className="stack">
        {pt.removed_by === 'box' && <div className="banner red"><b>Removed</b> Box plot outlier in iteration {pt.removed_in} (beyond the 1.5×IQR fence).</div>}
        {pt.removed_by === 'manual' && <div className="banner grey"><b>Removed by user</b> {pt.reason}</div>}
        {pt.kept_reason && <div className="banner amber"><b>Kept by user</b> {pt.kept_reason}</div>}
        {(pt.rules || []).map((r) => <div key={r} className="banner red"><b>I-MR test {r}</b> {RULES[r]}</div>)}
        {mode === 'exclude' && !(pt.rules || []).length && <div className="banner grey">No statistical signal on this point.</div>}
        {mode !== 'reset' && <>
          <div className="field"><label>{mode === 'keep' ? 'Why should this point stay in the baseline?' : 'Why is this point not representative?'}</label>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            <span className="hint">Recorded with your name and date, and shown in the outlier list of the reports.</span></div>
          <div className="row wrap">{(mode === 'keep' ? KEEP_CAUSES : CAUSES).map((c) =>
            <button key={c} className="tag" style={{ border: 0, cursor: 'pointer' }} onClick={() => setReason(c)}>{c}</button>)}</div>
        </>}
      </div>
    </Modal>
  )
}
