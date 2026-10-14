import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Confirm, Empty, Loading, PageHead, Pill, RagBar, useToast } from '../components/ui.jsx'
import { datetime } from '../helpers.js'

const UNITS = [['FP', 'Function points'], ['SP', 'Story points'], ['KLOC', 'KLOC'], ['UCP', 'Use-case points']]

export default function Home({ user }) {
  const [runs, setRuns] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const toast = useToast()
  const load = () => api.get('/runs').then(setRuns).catch((e) => toast(e.message, 'err'))
  useEffect(() => { load() }, [])

  return (
    <div className="content"><div className="content-inner" style={{ maxWidth: 980 }}>
      <PageHead title={`Hello, ${user.name.split(' ')[0]}`} sub="Upload your project data to generate a process performance baseline (PPB)." />
      <NewRun onDone={(r) => go(`run/${r.id}`)} />

      <div className="card pad-0" style={{ marginTop: 20 }}>
        <div className="card-head" style={{ padding: '18px 20px 6px' }}>
          <div><h3>Past runs</h3><p>Open a run to review it again or download its reports.</p></div>
        </div>
        {!runs ? <Loading /> : runs.length === 0 ? <Empty glyph="▤" title="No runs yet">Your baselines will appear here.</Empty> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>Name</th><th>Source file</th><th style={{ width: 190 }}>Metric health</th><th>Run</th><th></th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.id} className="click" onClick={() => go(`run/${r.id}`)}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="muted">{r.filename}<div className="faint" style={{ fontSize: 12 }}>{r.summary.rows} rows · {r.summary.metrics} metrics</div></td>
                <td><RagBar s={r.summary} /><div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{r.summary.green} green · {r.summary.amber} amber · {r.summary.red} red</div></td>
                <td className="muted num" style={{ whiteSpace: 'nowrap' }}>{datetime(r.created_at)}</td>
                <td><button className="icon-btn" aria-label={`Delete ${r.name}`} onClick={(e) => { e.stopPropagation(); setDeleting(r) }}>×</button></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>

      {deleting && <Confirm title="Delete run?" danger confirmLabel="Delete" body={`"${deleting.name}" and its results will be removed from this computer.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await api.del(`/runs/${deleting.id}`); setDeleting(null); toast('Run deleted'); load() }} />}
    </div></div>
  )
}

function NewRun({ onDone }) {
  const [file, setFile] = useState(null)
  const [info, setInfo] = useState(null)
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('FP')
  const [size, setSize] = useState('')
  const [busy, setBusy] = useState(null)
  const toast = useToast()
  const ref = useRef()

  const pick = async (f) => {
    if (!f) return
    setFile(f); setInfo(null); setBusy('Checking file…')
    try {
      const i = await api.upload('/inspect', f)
      setInfo(i); setSize(i.mapping.size || ''); setName(f.name.replace(/\.\w+$/, ''))
    } catch (e) { toast(e.message, 'err'); setFile(null) } finally { setBusy(null) }
  }
  const run = async () => {
    setBusy('Generating baseline…')
    try {
      const form = new FormData()
      form.append('file', file); form.append('name', name); form.append('size_unit', unit)
      form.append('mapping', JSON.stringify({ size }))
      const r = await api.form('/runs', form)
      toast('Baseline generated'); onDone(r)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(null) }
  }
  const reset = () => { setFile(null); setInfo(null); if (ref.current) ref.current.value = '' }
  const m = info?.mapping
  const blocking = info?.quality.issues.filter((i) => i.level === 'red') || []

  return (
    <div className="card">
      <div className="card-head">
        <div><h3>New PPB</h3><p>Excel or CSV, one row per completed requirement or project, in completion order.</p></div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => api.download('/template', 'PPB_input_template.xlsx')}>↓ Input template</button>
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => pick(e.target.files[0])} />

      {!info ? (
        <div className="dropzone" onClick={() => !busy && ref.current.click()}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over') }}
          onDragLeave={(e) => e.currentTarget.classList.remove('over')}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); pick(e.dataTransfer.files[0]) }}>
          <div className="big">↑</div>
          <b>{busy || 'Drop your data file here, or click to browse'}</b>
          <div>Needs a size column plus phase-wise effort and/or defect columns. Use the template if you're unsure.</div>
        </div>
      ) : (
        <div className="stack">
          <div className="row wrap" style={{ gap: 8 }}>
            <Pill cls="brand">{info.filename}</Pill><span className="muted">{info.rows} rows · {info.columns.length} columns</span>
            <span className="spacer" /><button className="btn-link" onClick={reset}>Choose a different file</button>
          </div>
          <div className="statgrid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
            <div><div className="k">Size column</div><div className="v" style={{ fontSize: 13.5 }}>{m.size || <span style={{ color: 'var(--red)' }}>Not found</span>}</div></div>
            <div><div className="k">Effort columns</div><div className="v">{m.effort.length}</div></div>
            <div><div className="k">Defect columns</div><div className="v">{m.defect.length}</div></div>
            <div><div className="k">Data quality</div><div className="v">{info.quality.score}<span className="faint" style={{ fontSize: 12 }}>/100</span></div></div>
          </div>
          {info.quality.issues.map((i, k) => <div key={k} className={`banner ${i.level}`}>{i.text}</div>)}
          <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1.3fr' }}>
            <div className="field"><label>Name this run</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Development PPB FY26" /></div>
            <div className="field"><label>Size unit</label>
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Size column</label>
              <select className="input" value={size} onChange={(e) => setSize(e.target.value)}>
                <option value="">Choose…</option>{info.columns.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <details className="muted" style={{ fontSize: 13 }}>
            <summary style={{ cursor: 'pointer' }}>Columns used</summary>
            <div style={{ marginTop: 8 }}><b>Effort:</b> {m.effort.join(', ') || '—'}</div>
            <div><b>Defects:</b> {m.defect.join(', ') || '—'}</div>
            <div><b>ID:</b> {m.id || '—'}</div>
          </details>
          <div className="row">
            <span className="spacer" />
            <button className="btn btn-primary" disabled={!!busy || !size || (!m.effort.length && !m.defect.length)} onClick={run}>
              {busy || 'Generate PPB →'}</button>
          </div>
          {blocking.length > 0 && <div className="faint" style={{ fontSize: 12, textAlign: 'right' }}>You can still run it; red notes affect the affected metrics only.</div>}
        </div>
      )}
    </div>
  )
}
