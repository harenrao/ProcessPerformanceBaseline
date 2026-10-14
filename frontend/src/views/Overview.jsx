import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Empty, Kpi, PageHead, RagBar, RagPill, StatusPill } from '../components/ui.jsx'
import { date, datetime, fmt } from '../helpers.js'

export default function Overview({ p, gt, crumbs }) {
  const focusMeta = p.baselines.find((b) => b.status === 'approved') || p.baselines[0]
  const [b, setB] = useState(null)
  const [audit, setAudit] = useState([])
  useEffect(() => {
    if (focusMeta) api.get(`/baselines/${focusMeta.id}`).then(setB)
    api.get(`/projects/${p.id}/audit`).then((a) => setAudit(a.slice(0, 7)))
  }, [p.id, focusMeta?.id])

  const s = focusMeta?.summary
  const q = p.dataset?.quality
  const steps = [
    ['Upload project data', !!p.dataset, 'data'],
    ['Check column mapping & data quality', !!p.dataset && (q?.score ?? 0) >= 70, 'data'],
    ['Confirm metrics to baseline', p.metrics.some((m) => m.enabled !== false), 'metrics'],
    ['Run a baseline and review flagged points', p.baselines.length > 0, 'baselines'],
    ['Submit for approval', p.baselines.some((x) => x.status !== 'draft'), 'baselines'],
    ['Baseline approved and in force', p.baselines.some((x) => x.status === 'approved'), 'baselines'],
  ]
  const done = steps.filter((x) => x[1]).length

  return (
    <>
      <PageHead crumbs={crumbs} title="Overview" sub={p.description || `${p.lifecycle || ''} baseline for ${p.client}`}>
        {gt && p.dataset && <button className="btn btn-primary" onClick={() => go(`p/${p.id}/baselines`)}>Run baseline →</button>}
      </PageHead>

      <div className="kpis">
        <Kpi label="Data points" value={p.n_rows} sub={p.dataset ? p.dataset.filename : 'No data yet'} />
        <Kpi label="Metrics" value={p.n_metrics} sub={`${p.metrics.length - p.n_metrics} disabled`} />
        <Kpi label="Baseline in force" value={p.approved_version ? `v${p.approved_version}` : '—'}
          sub={p.approved_version ? `approved ${date(p.baselines.find((x) => x.status === 'approved')?.approved_at)}` : 'Nothing approved yet'} />
        <Kpi label="Data quality" value={q ? q.score : '—'} unit={q ? '/100' : ''} sub={q ? `${q.issues.length} note${q.issues.length === 1 ? '' : 's'}` : 'Upload data to check'} />
      </div>

      <div className="grid-2">
        <div className="card pad-0">
          <div className="card-head" style={{ padding: '18px 20px 0' }}>
            <div>
              <h3>{focusMeta ? `${focusMeta.label}` : 'Baseline'}</h3>
              <p>{focusMeta ? <>v{focusMeta.version} · {s?.metrics} metrics · {s?.excluded} justified exclusions</> : 'Run a baseline to see limits here.'}</p>
            </div>
            <span className="spacer" />
            {focusMeta && <StatusPill status={focusMeta.status} />}
          </div>
          {s && <div style={{ padding: '0 20px 12px' }}><RagBar s={s} /></div>}
          {!b ? <Empty glyph="▲" title="No baseline yet">{gt ? 'Upload data, confirm metrics, then run a baseline.' : 'GT will publish the baseline here.'}</Empty> : (
            <div className="table-wrap" style={{ maxHeight: 460 }}>
              <table className="t compact">
                <thead><tr><th>Metric</th><th className="r">LCL</th><th className="r">CL</th><th className="r">UCL</th><th>Unit</th><th>Status</th></tr></thead>
                <tbody>
                  {b.results.metrics.map((m) => (
                    <tr key={m.key} className="click" onClick={() => go(`p/${p.id}/baselines/${b.id}/${m.key}`)}>
                      <td style={{ fontWeight: 500 }}>{m.name}</td>
                      <td className="r">{fmt(m.baseline?.lcl)}</td><td className="r"><b>{fmt(m.baseline?.cl)}</b></td><td className="r">{fmt(m.baseline?.ucl)}</td>
                      <td className="faint" style={{ fontSize: 12 }}>{m.unit}</td><td><RagPill rag={m.rag} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card">
            <div className="card-head"><div><h3>Path to an approved baseline</h3><p>{done} of {steps.length} complete</p></div></div>
            <div className="progress" style={{ marginBottom: 14 }}><span style={{ width: `${(done / steps.length) * 100}%` }} /></div>
            {steps.map(([label, ok, t], i) => (
              <div key={i} className="row" style={{ padding: '6px 0', fontSize: 13.5, cursor: 'pointer' }} onClick={() => go(`p/${p.id}/${t}`)}>
                <span className={`step ${ok ? 'done' : ''}`} style={{ width: 22, height: 22, fontSize: 11 }}>{ok ? '✓' : i + 1}</span>
                <span className={ok ? 'muted' : ''}>{label}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><h3>Recent activity</h3><span className="spacer" /><button className="btn-link" onClick={() => go(`p/${p.id}/audit`)}>All →</button></div>
            {audit.length === 0 ? <div className="faint">Nothing yet.</div> : (
              <div className="timeline">
                {audit.map((a) => (
                  <div key={a.id} className="tl-item">
                    <div style={{ fontSize: 13 }}><b style={{ fontWeight: 600 }}>{a.action}</b>{a.detail && <span className="muted"> · {a.detail}</span>}</div>
                    <div className="faint" style={{ fontSize: 12 }}>{a.user_name} · {datetime(a.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
