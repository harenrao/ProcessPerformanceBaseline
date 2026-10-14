import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { ControlChart, Histogram } from '../charts/charts.jsx'
import { Empty, Kpi, Loading, Modal, PageHead, Pill, RagPill, Seg, StatusPill, useToast } from '../components/ui.jsx'
import { canApprove, date, fmt, pct, RULES } from '../helpers.js'
import { SettingsForm } from './Baselines.jsx'

export default function BaselineDetail({ p, user, gt, reload, bid, metricKey, crumbs }) {
  const [b, setB] = useState(null)
  const [dialog, setDialog] = useState(null)
  const toast = useToast()
  useEffect(() => { api.get(`/baselines/${bid}`).then(setB).catch((e) => toast(e.message, 'err')) }, [bid])
  if (!b) return <Loading />

  const editable = gt && b.status === 'draft'
  const res = b.results
  const metric = metricKey && res.metrics.find((m) => m.key === metricKey)
  const update = (nb) => { setB(nb); reload() }
  const act = async (path, body, msg) => {
    try { update(await api.post(`/baselines/${bid}/${path}`, body)); toast(msg); setDialog(null) } catch (e) { toast(e.message, 'err') }
  }

  const head = (
    <PageHead crumbs={<>{crumbs} / <a href={`#/p/${p.id}/baselines`}>Baselines</a> / v{b.version}</>}
      title={<span className="row" style={{ gap: 12 }}>{b.label}<StatusPill status={b.status} /></span>}
      sub={<>v{b.version} · prepared by {b.created_by_name} {date(b.created_at)}{b.approved_by_name && ` · approved by ${b.approved_by_name} ${date(b.approved_at)}`}</>}>
      <ExportMenu b={b} />
      {editable && <button className="btn btn-ghost" onClick={() => setDialog('settings')}>Settings</button>}
      {editable && <button className="btn btn-primary" onClick={() => setDialog('submit')}>Submit for approval →</button>}
      {gt && b.status === 'submitted' && canApprove(user) && b.submitted_by !== user.id &&
        <button className="btn btn-primary" onClick={() => setDialog('approve')}>Review & approve</button>}
      {gt && (b.status === 'submitted' || (b.status === 'approved' && canApprove(user))) &&
        <button className="btn btn-ghost" onClick={() => setDialog('return')}>Return to draft</button>}
    </PageHead>
  )

  return (
    <>
      {head}
      <Workflow b={b} />
      {b.review_note && <div className="banner grey" style={{ marginBottom: 14 }}><b>Review note</b> {b.review_note}</div>}
      {b.status === 'submitted' && b.submitted_by === user.id && canApprove(user) &&
        <div className="banner amber" style={{ marginBottom: 14 }}><b>Segregation of duties</b> You submitted this version, so another director or admin must approve it.</div>}

      <div className="grid-2" style={{ gridTemplateColumns: '290px 1fr', alignItems: 'start' }}>
        <div className="card pad-0">
          <div className={`metric-item ${!metric ? 'on' : ''}`} onClick={() => go(`p/${p.id}/baselines/${bid}`)} style={{ fontWeight: 600 }}>
            <span className="glyph">▤</span><span className="nm">Summary of all metrics</span></div>
          <div className="metric-list">
            {res.metrics.map((m) => (
              <div key={m.key} className={`metric-item ${metric?.key === m.key ? 'on' : ''}`} onClick={() => go(`p/${p.id}/baselines/${bid}/${m.key}`)}>
                <span className={`rag-dot ${m.rag || 'grey'}`} title={m.rag} />
                <span className="nm" title={m.name}>{m.name}</span>
                {m.n_excluded > 0 && <span className="tag" title="Excluded points">−{m.n_excluded}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>{metric ? <MetricView key={metric.key} m={metric} b={b} editable={editable} onChange={update} />
          : <Summary b={b} p={p} />}</div>
      </div>

      {dialog === 'submit' && <ReviewDialog title="Submit for approval" cta="Submit" placeholder="What should the approver look at? (optional)"
        warn={res.summary.red > 0 && `${res.summary.red} metric(s) are red. Make sure flagged points have been reviewed.`}
        onClose={() => setDialog(null)} onOk={(note) => act('submit', { note }, 'Submitted for approval')} />}
      {dialog === 'approve' && <ReviewDialog title={`Approve ${b.label}`} cta="Approve baseline" placeholder="Approval note (optional)"
        warn={'Approving locks this version and supersedes any baseline currently in force.'}
        onClose={() => setDialog(null)} onOk={(note) => act('approve', { note }, 'Baseline approved')} />}
      {dialog === 'return' && <ReviewDialog title="Return to draft" cta="Return to draft" placeholder="What needs to change?" required
        onClose={() => setDialog(null)} onOk={(note) => act('return', { note }, 'Returned to draft')} />}
      {dialog === 'settings' && <SettingsDialog b={b} onClose={() => setDialog(null)}
        onSaved={(nb) => { update(nb); setDialog(null); toast('Recomputed with new settings') }} />}
    </>
  )
}

function Workflow({ b }) {
  const order = ['draft', 'submitted', 'approved']
  const idx = b.status === 'superseded' ? 3 : order.indexOf(b.status)
  const labels = ['Draft', 'In review', 'Approved']
  return (
    <div className="card" style={{ padding: '12px 18px', marginBottom: 16 }}>
      <div className="workflow row wrap">
        {labels.map((l, i) => (
          <React.Fragment key={l}>
            {i > 0 && <span className="wf-line" />}
            <span className={`wf-step ${i < idx || (b.status === 'approved' && i === 2) ? 'done' : i === idx ? 'on' : ''}`}>
              <span className={`step ${i < idx || (b.status === 'approved' && i === 2) ? 'done' : i === idx ? 'on' : ''}`}>{i < idx || (b.status === 'approved' && i === 2) ? '✓' : i + 1}</span>{l}
            </span>
          </React.Fragment>
        ))}
        <span className="spacer" />
        {b.status === 'superseded' && <Pill cls="grey">Superseded by a newer approved version</Pill>}
        {b.status === 'draft' && <span className="muted" style={{ fontSize: 12.5 }}>Review flagged points, record assignable causes, then submit.</span>}
        {b.status === 'submitted' && <span className="muted" style={{ fontSize: 12.5 }}>Locked while in review.</span>}
        {b.status === 'approved' && <span className="muted" style={{ fontSize: 12.5 }}>In force for QPM. Locked.</span>}
      </div>
    </div>
  )
}

function ExportMenu({ b }) {
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const dl = async (f) => { setOpen(false); toast(`Preparing ${f.toUpperCase()}…`); try { await api.download(`/baselines/${b.id}/export/${f}`, `baseline.${f}`) } catch (e) { toast(e.message, 'err') } }
  return (
    <div style={{ position: 'relative' }}>
      <button className="btn btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open}>Export ▾</button>
      {open && <div className="card" style={{ position: 'absolute', right: 0, top: 42, padding: 6, zIndex: 10, width: 230, boxShadow: 'var(--shadow)' }}>
        {[['docx', 'Word report', 'Narrative, charts, approval block'], ['pptx', 'PowerPoint deck', 'Summary + one slide per metric'], ['xlsx', 'Excel workbook', 'Limits, data points, fits']].map(([f, l, s]) => (
          <button key={f} className="nav-item" style={{ display: 'block' }} onClick={() => dl(f)}><div style={{ color: 'var(--ink)', fontWeight: 600 }}>{l}</div><div className="faint" style={{ fontSize: 12 }}>{s}</div></button>
        ))}
      </div>}
    </div>
  )
}

function Summary({ b, p }) {
  const s = b.results.summary
  return (
    <>
      <div className="kpis">
        <Kpi label="Metrics" value={s.metrics} sub={`${s.green} green · ${s.amber} amber · ${s.red} red`} />
        <Kpi label="Stable" value={s.stable} unit={`/ ${s.metrics}`} sub="No run-rule violations" />
        <Kpi label="Normal" value={s.normal} unit={`/ ${s.metrics}`} sub="Others fitted or empirical" />
        <Kpi label="Points excluded" value={s.excluded} sub={`${s.flagged} flagged for review`} />
      </div>
      <div className="card pad-0">
        <div className="table-wrap"><table className="t compact">
          <thead><tr><th>Metric</th><th className="r">n</th><th className="r">Mean</th><th className="r">Median</th><th className="r">LCL</th><th className="r">CL</th><th className="r">UCL</th><th>Fit</th><th>Stable</th><th>Status</th></tr></thead>
          <tbody>{b.results.metrics.map((m) => m.error ? (
            <tr key={m.key}><td>{m.name}</td><td colSpan="8" className="muted">{m.error}</td><td><RagPill rag="red" /></td></tr>
          ) : (
            <tr key={m.key} className="click" onClick={() => go(`p/${p.id}/baselines/${b.id}/${m.key}`)}>
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

function MetricView({ m, b, editable, onChange }) {
  const [tab, setTab] = useState('chart')
  const [pick, setPick] = useState(null)
  if (m.error) return <div className="card"><Empty glyph="!" title="Could not baseline this metric">{m.error}</Empty></div>
  const bl = m.baseline, s = m.stats
  const review = m.points.map((pt, i) => ({ ...pt, i })).filter((pt) => pt.excluded || pt.flags.length || pt.rules?.length)

  return (
    <div className="stack">
      <div className="card">
        <div className="card-head">
          <div><h3 style={{ fontSize: 17 }}>{m.name}</h3><p>{m.unit} · {m.direction === 'higher' ? 'higher is better' : 'lower is better'} · n = {m.n_used}{m.n_excluded ? ` of ${m.n_total}` : ''}</p></div>
          <span className="spacer" /><RagPill rag={m.rag} />
        </div>
        <div className="limits">
          <div className="limit"><div className="micro">LCL</div><div className="v">{fmt(bl.lcl)}</div></div>
          <div className="limit cl"><div className="micro" style={{ color: 'var(--brand)' }}>Centre line</div><div className="v">{fmt(bl.cl)}</div></div>
          <div className="limit"><div className="micro">UCL</div><div className="v">{fmt(bl.ucl)}</div></div>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>Baseline limits: {bl.method}.{!bl.method.startsWith('I-MR') && <> Stability is judged separately on the I-MR chart (control limits {fmt(m.chart.lcl)} – {fmt(m.chart.ucl)}).</>}</div>
        {m.warnings?.length > 0 && <div className="stack" style={{ gap: 6, marginTop: 12 }}>
          {m.warnings.map((w, i) => <div key={i} className={`banner ${/beyond the 3σ/.test(w) ? 'red' : 'amber'}`}>{w}</div>)}
        </div>}
      </div>

      <div className="card">
        <div className="tabs">
          {[['chart', 'Control chart'], ['dist', 'Distribution'], ['stats', 'Statistics'], ['review', `Point review (${review.length})`]].map(([k, l]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        {tab === 'chart' && <>
          <ControlChart metric={m} onPick={(i) => setPick(i)} selected={pick} />
          <div className="banner ai" style={{ marginTop: 12 }}><b>Read it</b> {m.status.stable
            ? 'No stability signals: the process is predictable and the limits describe it.'
            : `${m.status.rule1} point(s) beyond the limits and ${m.status.run_rules} run-rule signal(s). Click a red point to record an assignable cause, or keep it if the cause is common.`}
            {m.chart.scale === 'log' && ' Charted on the log scale because the data is lognormal.'}</div>
        </>}
        {tab === 'dist' && <div className="grid-2e">
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
            <p className="muted" style={{ fontSize: 12.5 }}>Anderson-Darling. A p-value above 0.05 means the distribution is a plausible fit. {m.fit.best === 'Nonparametric' && 'Nothing fits, which usually means mixed processes: try Stratification.'}</p>
          </div>
        </div>}
        {tab === 'stats' && <div className="stack">
          <div className="statgrid">
            {[['Mean', s.mean], ['Median', s.median], ['Std dev', s.sd], ['CV', s.cv], ['Min', s.min], ['P10', s.p10], ['P90', s.p90], ['Max', s.max]].map(([k, v]) =>
              <div key={k}><div className="k">{k}</div><div className="v">{fmt(v)}</div></div>)}
          </div>
          <div className="statgrid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
            <div><div className="k">95% CI mean</div><div className="v">{s.mean_ci ? `${fmt(s.mean_ci[0])} – ${fmt(s.mean_ci[1])}` : '—'}</div></div>
            <div><div className="k">95% CI median</div><div className="v">{s.median_ci ? `${fmt(s.median_ci[0])} – ${fmt(s.median_ci[1])}` : '—'}</div></div>
            <div><div className="k">σ within (MR̄/d₂)</div><div className="v">{fmt(m.chart.sigma_within)}{m.chart.scale === 'log' && <span className="faint" style={{ fontSize: 11 }}> log</span>}</div></div>
          </div>
          {m.capability ? (
            <div className="statgrid">
              {[['Cpk', m.capability.cpk], ['Ppk', m.capability.ppk], ['Within spec (observed)', pct(m.capability.pct_within_observed)], ['Within spec (fitted)', pct(m.capability.pct_within_expected)]].map(([k, v]) =>
                <div key={k}><div className="k">{k}</div><div className="v">{typeof v === 'number' ? fmt(v) : v}</div></div>)}
            </div>
          ) : <div className="banner grey">Set spec limits on the Metrics page to see capability (Cpk, Ppk, % within spec).</div>}
          {m.goal !== null && m.goal !== undefined && <div className={`banner ${m.goal_met ? 'green' : 'amber'}`}><b>Goal {fmt(m.goal)}</b> The baseline mean {fmt(s.mean)} {m.goal_met ? 'meets' : 'does not meet'} the goal.</div>}
        </div>}
        {tab === 'review' && (review.length === 0 ? <Empty glyph="✓" title="Nothing to review">No points were flagged or excluded.</Empty> : (
          <div className="table-wrap"><table className="t compact">
            <thead><tr><th>Obs</th><th>ID</th><th className="r">Value</th><th>Signals</th><th>Status</th><th></th></tr></thead>
            <tbody>{review.map((pt) => (
              <tr key={pt.row} className={pt.excluded ? 'dim' : ''}>
                <td className="num">{pt.i + 1}</td><td className="mono">{pt.id}</td><td className="r">{fmt(pt.value)}</td>
                <td>{[...(pt.flags || []), ...(pt.rules || []).map((r) => `Test ${r}`)].map((f) => <span key={f} className="tag" style={{ marginRight: 4 }}>{f}</span>)}</td>
                <td style={{ maxWidth: 320 }}>{pt.excluded ? <span style={{ fontSize: 12.5 }}>{pt.reason}</span> : <Pill cls="blue">Included</Pill>}</td>
                <td>{editable && <button className="btn-link" onClick={() => setPick(pt.i)}>{pt.excluded ? 'Re-include' : 'Exclude…'}</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ))}
      </div>
      {pick !== null && <PointDialog m={m} b={b} i={pick} editable={editable} onClose={() => setPick(null)} onChange={(nb) => { onChange(nb); setPick(null) }} />}
    </div>
  )
}

const CAUSES = ['Data entry error, corrected value not available', 'Different process or lifecycle (not representative)',
  'Scope change mid-flight not reflected in size', 'One-off event (outage, attrition, client hold)', 'Pilot or new technology, not yet standard']

function PointDialog({ m, b, i, editable, onClose, onChange }) {
  const pt = m.points[i]
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const save = async (r) => {
    setBusy(true)
    try { onChange(await api.patch(`/baselines/${b.id}/exclusions`, { metric: m.key, row: pt.row, reason: r })); toast(r ? 'Point excluded, baseline recomputed' : 'Point re-included') }
    catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title={`${pt.id} · observation ${i + 1}`} onClose={onClose} footer={editable ? (pt.excluded
      ? <><span className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={() => save(null)}>Re-include point</button></>
      : <><span className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Keep point</button><button className="btn btn-primary" disabled={busy || reason.trim().length < 10} onClick={() => save(reason)}>Exclude with this cause</button></>)
      : <button className="btn btn-ghost" onClick={onClose}>Close</button>}>
      <div className="stack">
        <div className="statgrid" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          <div><div className="k">Value</div><div className="v">{fmt(pt.value)}</div></div>
          <div><div className="k">Centre line</div><div className="v">{fmt(m.baseline.cl)}</div></div>
          <div><div className="k">Control limits</div><div className="v">{fmt(m.chart.lcl)} – {fmt(m.chart.ucl)}</div></div>
        </div>
        {(pt.rules?.length > 0 || pt.flags?.length > 0) ? <div className="stack" style={{ gap: 6 }}>
          {(pt.rules || []).map((r) => <div key={r} className="banner red"><b>Test {r}</b> {RULES[r]}</div>)}
          {(pt.flags || []).map((f) => <div key={f} className="banner amber"><b>{f}</b> flagged by outlier screening</div>)}
        </div> : <div className="banner grey">No statistical signal on this point.</div>}
        {pt.excluded && <div className="banner grey"><b>Excluded</b> {pt.reason}</div>}
        {!pt.excluded && editable && <>
          <div className="field"><label>Assignable cause</label>
            <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this point not representative of the process?" autoFocus />
            <span className="hint">Recorded with your name and date, shown in reports and the audit trail. A statistical flag alone is not a cause.</span></div>
          <div className="row wrap">{CAUSES.map((c) => <button key={c} className="tag" style={{ border: 0, cursor: 'pointer' }} onClick={() => setReason(c)}>{c}</button>)}</div>
        </>}
      </div>
    </Modal>
  )
}

function ReviewDialog({ title, cta, placeholder, warn, required, onClose, onOk }) {
  const [note, setNote] = useState('')
  return (
    <Modal title={title} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={required && !note.trim()} onClick={() => onOk(note || null)}>{cta}</button></>}>
      <div className="stack">
        {warn && <div className="banner amber">{warn}</div>}
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} autoFocus />
      </div>
    </Modal>
  )
}

function SettingsDialog({ b, onClose, onSaved }) {
  const [s, setS] = useState(b.settings)
  const [label, setLabel] = useState(b.label)
  const [busy, setBusy] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const toast = useToast()
  const save = async () => {
    setBusy(true)
    try { onSaved(await api.patch(`/baselines/${b.id}/settings`, { settings: s, label })) } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title="Baseline settings" wide onClose={onClose} footer={<>
      <button className="btn btn-ghost" disabled={refreshing} onClick={async () => {
        setRefreshing(true)
        try { onSaved(await api.post(`/baselines/${b.id}/refresh-metrics`)) } catch (e) { toast(e.message, 'err') } finally { setRefreshing(false) }
      }}>Pull latest metric definitions</button>
      <span className="spacer" /><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Recomputing…' : 'Save & recompute'}</button></>}>
      <div className="stack">
        <div className="field"><label>Label</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <SettingsForm s={s} set={(k, v) => setS({ ...s, [k]: v })} />
      </div>
    </Modal>
  )
}

