import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Empty, Modal, PageHead, RagBar, Seg, StatusPill, useToast } from '../components/ui.jsx'
import { date, RULES } from '../helpers.js'

export default function Baselines({ p, gt, reload, crumbs }) {
  const [running, setRunning] = useState(false)
  return (
    <>
      <PageHead crumbs={crumbs} title="Baselines" sub="Each run is a version. Drafts can be reviewed and edited; approved versions are locked and in force.">
        {gt && <button className="btn btn-primary" disabled={!p.dataset} onClick={() => setRunning(true)}>+ Run new baseline</button>}
      </PageHead>
      {!p.dataset && <div className="banner amber" style={{ marginBottom: 14 }}><b>No data</b> Upload project data before running a baseline.</div>}
      <div className="card pad-0">
        {p.baselines.length === 0 ? <Empty glyph="▲" title="No baselines yet">{gt ? 'Run the first baseline to see stability, distribution and limits for every metric.' : 'GT has not published a baseline yet.'}</Empty> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Version</th><th>Label</th><th>Status</th><th style={{ width: 200 }}>Metric health</th><th className="r">Excluded</th><th>Prepared</th><th>Approved</th></tr></thead>
            <tbody>{p.baselines.map((b) => (
              <tr key={b.id} className="click" onClick={() => go(`p/${p.id}/baselines/${b.id}`)}>
                <td><b>v{b.version}</b></td><td>{b.label}</td><td><StatusPill status={b.status} /></td>
                <td><RagBar s={b.summary} /><div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{b.summary?.green} green · {b.summary?.amber} amber · {b.summary?.red} red</div></td>
                <td className="r">{b.summary?.excluded}</td>
                <td className="muted">{b.created_by_name}<div className="faint" style={{ fontSize: 12 }}>{date(b.created_at)}</div></td>
                <td className="muted">{b.approved_by_name || '—'}{b.approved_at && <div className="faint" style={{ fontSize: 12 }}>{date(b.approved_at)}</div>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      {running && <RunBaseline p={p} onClose={() => setRunning(false)} onDone={(b) => { setRunning(false); reload(); go(`p/${p.id}/baselines/${b.id}`) }} />}
    </>
  )
}

export function SettingsForm({ s, set }) {
  const toggleRule = (r) => set('rules', s.rules.includes(r) ? s.rules.filter((x) => x !== r) : [...s.rules, r].sort())
  return (
    <div className="stack">
      <div className="field"><label>Outlier screening</label>
        <Seg value={s.outlier_method} onChange={(v) => set('outlier_method', v)}
          options={[['iqr', 'Box plot (IQR)'], ['grubbs', 'Grubbs'], ['imr', 'I-MR 3σ'], ['all', 'All three'], ['none', 'None']]} />
        <span className="hint">Screening only flags points. You exclude a point by recording its assignable cause.</span></div>
      <label className="check"><input type="checkbox" checked={s.auto_exclude} onChange={(e) => set('auto_exclude', e.target.checked)} />
        Auto-exclude flagged points (capped at {s.max_auto_exclude_pct}% of data; not recommended for appraisal evidence)</label>
      <div className="field"><label>Stability tests</label>
        <div className="stack" style={{ gap: 4 }}>{Object.entries(RULES).map(([r, l]) => (
          <label key={r} className="check" style={{ fontSize: 13 }}><input type="checkbox" checked={s.rules.includes(Number(r))} onChange={() => toggleRule(Number(r))} />Test {r}: {l}</label>
        ))}</div></div>
      <div className="form-grid">
        <div className="field"><label>Skewed data</label>
          <select className="input" value={s.transform} onChange={(e) => set('transform', e.target.value)}>
            <option value="auto">Chart lognormal metrics on the log scale</option><option value="none">Always chart raw values</option></select></div>
        <div className="field"><label>Minimum points for green</label>
          <input className="input" type="number" min="5" value={s.min_points} onChange={(e) => set('min_points', Number(e.target.value) || 20)} /></div>
      </div>
    </div>
  )
}

function RunBaseline({ p, onClose, onDone }) {
  const [s, setS] = useState(null)
  const [label, setLabel] = useState(`Baseline v${(p.baselines[0]?.version || 0) + 1}`)
  const [carry, setCarry] = useState(p.baselines.find((b) => b.dataset_id === p.dataset?.id)?.id || '')
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { api.get('/settings/defaults').then(setS) }, [])
  const sameData = p.baselines.filter((b) => b.dataset_id === p.dataset?.id)
  const run = async () => {
    setBusy(true)
    try { onDone(await api.post(`/projects/${p.id}/baselines`, { label, settings: s, carry_exclusions_from: carry || null })); toast('Baseline computed') }
    catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title="Run new baseline" onClose={onClose} wide footer={<>
      <span className="muted" style={{ fontSize: 12.5 }}>{p.n_metrics} metrics · {p.n_rows} data points</span><span className="spacer" />
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!s || busy} onClick={run}>{busy ? 'Computing…' : 'Run baseline →'}</button>
    </>}>
      {!s ? null : <div className="stack">
        <div className="form-grid">
          <div className="field"><label>Label</label><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
          <div className="field"><label>Carry exclusions from</label>
            <select className="input" value={carry} onChange={(e) => setCarry(e.target.value)} disabled={!sameData.length}>
              <option value="">None — start clean</option>
              {sameData.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.label} ({b.summary?.excluded} excluded)</option>)}
            </select>
            <span className="hint">Only versions on the current dataset can pass exclusions on.</span></div>
        </div>
        <SettingsForm s={s} set={(k, v) => setS({ ...s, [k]: v })} />
      </div>}
    </Modal>
  )
}
