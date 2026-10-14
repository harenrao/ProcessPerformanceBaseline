import React, { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api.js'
import { Empty, Loading, PageHead, Pill, Seg, useToast } from '../components/ui.jsx'
import { datetime } from '../helpers.js'

const ROLES = [['ignore', 'Not used'], ['id', 'Identifier'], ['size', 'Size'], ['date', 'Completion date'], ['effort', 'Effort'], ['defect', 'Defects'], ['group', 'Grouping']]
const ROLE_CLS = { id: 'grey', size: 'brand', date: 'grey', effort: 'blue', defect: 'amber', group: 'green' }

const roleOf = (m, c) => (m.id === c ? 'id' : m.size === c ? 'size' : m.date === c ? 'date'
  : m.effort?.includes(c) ? 'effort' : m.defect?.includes(c) ? 'defect' : m.group?.includes(c) ? 'group' : 'ignore')

export default function Data({ p, gt, reload, crumbs }) {
  const [ds, setDs] = useState(undefined)
  const [view, setView] = useState('mapping')
  const [mapping, setMapping] = useState(null)
  const [regen, setRegen] = useState(false)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const fileRef = useRef()

  const load = () => api.get(`/projects/${p.id}/dataset`).then((d) => { setDs(d); setMapping(d?.mapping || null) })
  useEffect(() => { load() }, [p.id])

  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try { await api.upload(`/projects/${p.id}/dataset`, file); toast(`${file.name} uploaded`); await load(); reload() }
    catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }
  const sample = async () => {
    setBusy(true)
    try { await api.post(`/projects/${p.id}/dataset/sample`); toast('Sample data loaded'); await load(); reload() }
    catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const setRole = (c, role) => {
    const m = { ...mapping, effort: [...(mapping.effort || [])], defect: [...(mapping.defect || [])], group: [...(mapping.group || [])] }
    for (const k of ['id', 'size', 'date']) if (m[k] === c) m[k] = null
    for (const k of ['effort', 'defect', 'group']) m[k] = m[k].filter((x) => x !== c)
    if (['id', 'size', 'date'].includes(role)) m[role] = c
    else if (role !== 'ignore') m[role].push(c)
    setMapping(m)
  }
  const dirty = ds && JSON.stringify(mapping) !== JSON.stringify(ds.mapping)
  const saveMapping = async () => {
    try {
      await api.put(`/projects/${p.id}/dataset/mapping`, { mapping, regenerate_metrics: regen })
      toast(regen ? 'Mapping saved and metrics regenerated' : 'Mapping saved'); await load(); reload()
    } catch (e) { toast(e.message, 'err') }
  }

  const samples = useMemo(() => {
    if (!ds) return {}
    const out = {}
    for (const c of ds.columns) out[c] = ds.rows.slice(0, 3).map((r) => r[c]).filter((v) => v !== null).map((v) => (typeof v === 'number' ? +v.toPrecision(6) : v)).join(', ')
    return out
  }, [ds])

  if (ds === undefined) return <Loading />

  const input = <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => upload(e.target.files[0])} />

  if (!ds) return (
    <>
      <PageHead crumbs={crumbs} title="Data" sub="One row per project or work item, in completion order." />
      <div className="card">
        {gt ? (
          <div className="stack">
            {input}
            <div className="dropzone" onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over') }}
              onDragLeave={(e) => e.currentTarget.classList.remove('over')}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); upload(e.dataTransfer.files[0]) }}>
              <div className="big">↑</div><b>{busy ? 'Uploading…' : 'Drop an Excel or CSV file, or click to browse'}</b>
              <div>Size, phase-wise effort and defect columns are recognised automatically. 16 MB max.</div>
            </div>
            <div className="row"><span className="muted">No data handy?</span><button className="btn-link" onClick={sample} disabled={busy}>Load the sample dataset</button></div>
          </div>
        ) : <Empty title="No data yet">GT has not uploaded data for this engagement.</Empty>}
      </div>
    </>
  )

  const q = ds.quality
  return (
    <>
      <PageHead crumbs={crumbs} title="Data" sub={<>{ds.filename} · {ds.n_rows} rows · {ds.columns.length} columns · uploaded {datetime(ds.uploaded_at)}</>}>
        {gt && <>{input}<button className="btn btn-ghost" disabled={busy} onClick={() => fileRef.current.click()}>{busy ? 'Uploading…' : 'Replace data'}</button></>}
      </PageHead>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 340px', marginBottom: 16 }}>
        <div className="card">
          <div className="card-head"><div><h3>Data quality</h3><p>Checked against the current mapping and enabled metrics</p></div><span className="spacer" />
            <Pill cls={q.score >= 85 ? 'green' : q.score >= 60 ? 'amber' : 'red'} dot>{q.score}/100</Pill></div>
          <div className="stack" style={{ gap: 8 }}>
            {q.issues.length === 0 && <div className="banner green"><b>Clean</b> No issues found.</div>}
            {q.issues.map((i, k) => <div key={k} className={`banner ${i.level}`}>{i.text}</div>)}
          </div>
        </div>
        <div className="card">
          <div className="micro" style={{ marginBottom: 10 }}>Column roles</div>
          {['size', 'effort', 'defect', 'group', 'id', 'date'].map((k) => {
            const v = ds.mapping[k]
            const n = Array.isArray(v) ? v.length : v ? 1 : 0
            return <div key={k} className="row" style={{ padding: '5px 0', fontSize: 13.5 }}>
              <Pill cls={ROLE_CLS[k]}>{ROLES.find((r) => r[0] === k)[1]}</Pill><span className="spacer" />
              <span className={n ? '' : 'faint'}>{Array.isArray(v) ? `${n} column${n === 1 ? '' : 's'}` : v || 'Not set'}</span>
            </div>
          })}
        </div>
      </div>

      <div className="card pad-0">
        <div className="row" style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Seg value={view} onChange={setView} options={[['mapping', 'Column mapping'], ['preview', 'Data preview'], ['profile', 'Column profile']]} />
          <span className="spacer" />
          {view === 'mapping' && gt && <>
            <label className="check" title="Replace the metric list with defaults built from this mapping"><input type="checkbox" checked={regen} onChange={(e) => setRegen(e.target.checked)} />Regenerate metrics</label>
            <button className="btn btn-primary btn-sm" disabled={!dirty && !regen} onClick={saveMapping}>Save mapping</button>
          </>}
        </div>
        {view === 'mapping' && (
          <div className="table-wrap" style={{ maxHeight: 560 }}><table className="t compact">
            <thead><tr><th>Column</th><th>Role</th><th>Sample values</th></tr></thead>
            <tbody>{ds.columns.map((c) => {
              const r = roleOf(mapping, c)
              return <tr key={c}>
                <td style={{ fontWeight: 500 }}>{c}</td>
                <td style={{ width: 200 }}>{gt
                  ? <select className="input sm" value={r} onChange={(e) => setRole(c, e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  : r !== 'ignore' ? <Pill cls={ROLE_CLS[r]}>{ROLES.find((x) => x[0] === r)[1]}</Pill> : <span className="faint">Not used</span>}</td>
                <td className="muted mono" style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{samples[c]}</td>
              </tr>
            })}</tbody>
          </table></div>
        )}
        {view === 'preview' && (
          <div className="table-wrap" style={{ maxHeight: 560 }}><table className="t compact">
            <thead><tr><th>#</th>{ds.columns.map((c) => <th key={c} className={roleOf(ds.mapping, c) === 'ignore' ? '' : 'r'} style={{ color: roleOf(ds.mapping, c) !== 'ignore' ? 'var(--brand)' : undefined }}>{c}</th>)}</tr></thead>
            <tbody>{ds.rows.slice(0, 200).map((r, i) => (
              <tr key={i}><td className="faint num">{i + 1}</td>{ds.columns.map((c) => <td key={c} className={typeof r[c] === 'number' ? 'r' : ''}>{typeof r[c] === 'number' ? +r[c].toPrecision(6) : r[c] ?? <span className="faint">—</span>}</td>)}</tr>
            ))}</tbody>
          </table></div>
        )}
        {view === 'profile' && (
          <div className="table-wrap"><table className="t compact">
            <thead><tr><th>Mapped column</th><th className="r">Missing</th><th className="r">Non-numeric</th><th className="r">Negative</th><th className="r">Zero</th></tr></thead>
            <tbody>{q.columns.map((c) => (
              <tr key={c.column}><td style={{ fontWeight: 500 }}>{c.column}</td>
                {['missing', 'non_numeric', 'negative', 'zero'].map((k) => <td key={k} className="r" style={{ color: c[k] && k !== 'zero' ? 'var(--red)' : undefined }}>{c[k]}</td>)}</tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}
