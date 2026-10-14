import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { BoxPlots } from '../charts/charts.jsx'
import { Empty, Loading, PageHead, useToast } from '../components/ui.jsx'
import { fmt, fmtP } from '../helpers.js'

export default function Stratify({ p, crumbs }) {
  const [vars, setVars] = useState(null)
  const [metric, setMetric] = useState('')
  const [group, setGroup] = useState('')
  const [bid, setBid] = useState(p.baselines[0]?.id || '')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { api.get(`/projects/${p.id}/variables`).then((v) => { setVars(v); setMetric(v.metrics.find((m) => m.key === 'eff_total')?.key || v.metrics[0]?.key || ''); setGroup(v.groups[0] || '') }) }, [p.id])
  useEffect(() => {
    if (!metric || !group) return
    setBusy(true)
    api.post(`/projects/${p.id}/stratify`, { metric, group, baseline_id: bid || null }).then(setRes).catch((e) => { setRes(null); toast(e.message, 'err') }).finally(() => setBusy(false))
  }, [metric, group, bid])

  if (!vars) return <Loading />
  const unit = vars.metrics.find((m) => m.key === metric)?.unit
  return (
    <>
      <PageHead crumbs={crumbs} title="Stratification" sub="Should one baseline cover everything, or do sub-groups behave differently enough to need their own?" />
      {vars.groups.length === 0 ? <div className="card"><Empty glyph="▦" title="No grouping columns">Mark a column as Grouping on the Data page (technology, application, team…), or map an ID column to group by ID prefix.</Empty></div> : <>
        <div className="card row wrap" style={{ marginBottom: 16, gap: 14 }}>
          <div className="field" style={{ flex: 2, minWidth: 220 }}><label>Metric</label>
            <select className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>{vars.metrics.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select></div>
          <div className="field" style={{ flex: 1, minWidth: 160 }}><label>Group by</label>
            <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>{vars.groups.map((g) => <option key={g}>{g}</option>)}</select></div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}><label>Apply exclusions from</label>
            <select className="input" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">None (all data)</option>
              {p.baselines.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.label}</option>)}</select></div>
        </div>
        {busy && !res ? <Loading /> : res && <>
          {res.recommendation && <div className={`banner ${res.differ ? 'amber' : 'green'}`} style={{ marginBottom: 16 }}><b>{res.differ ? 'Stratify' : 'Pool'}</b> {res.recommendation}</div>}
          {res.note && <div className="banner grey" style={{ marginBottom: 16 }}>{res.note}</div>}
          <div className="grid-2">
            <div className="card"><div className="card-head"><h3>Distribution by {group}</h3></div>
              <BoxPlots groups={res.groups} points={res.points} unit={unit} />
            </div>
            <div className="stack">
              {res.tests && <div className="card">
                <div className="card-head"><h3>Tests</h3></div>
                <table className="t compact"><tbody>
                  {[['Kruskal-Wallis (medians)', res.tests.kruskal.p], ['One-way ANOVA (means)', res.tests.anova.p], ["Levene (variances)", res.tests.levene.p]].map(([l, pv]) => (
                    <tr key={l}><td>{l}</td><td className="r"><b style={{ color: pv < 0.05 ? 'var(--red)' : 'var(--green)' }}>p = {fmtP(pv)}</b></td></tr>))}
                </tbody></table>
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>p &lt; 0.05 means the groups differ. Kruskal-Wallis is the primary test because process data is usually skewed.</p>
              </div>}
              <div className="card pad-0"><table className="t compact">
                <thead><tr><th>Group</th><th className="r">n</th><th className="r">Median</th><th className="r">Mean</th><th className="r">Std dev</th></tr></thead>
                <tbody>{Object.entries(res.groups).map(([g, s]) => (
                  <tr key={g}><td style={{ fontWeight: 500 }}>{g}</td>
                    <td className="r">{s.n}</td><td className="r">{fmt(s.median)}</td><td className="r">{fmt(s.mean)}</td><td className="r">{fmt(s.sd)}</td></tr>))}</tbody>
              </table></div>
            </div>
          </div>
        </>}
      </>}
    </>
  )
}
