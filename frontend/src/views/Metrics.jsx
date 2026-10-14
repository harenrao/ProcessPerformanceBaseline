import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Empty, Modal, PageHead, Pill, useToast } from '../components/ui.jsx'

const blank = { key: '', name: '', family: 'Custom', numerator: [], denominator: [], multiplier: 1, unit: '', direction: 'lower',
  zero_as_missing: false, enabled: true, lsl: null, usl: null, goal: null }

export default function Metrics({ p, gt, reload, crumbs }) {
  const [list, setList] = useState(p.metrics)
  const [edit, setEdit] = useState(null)
  const [cols, setCols] = useState([])
  const toast = useToast()
  useEffect(() => { setList(p.metrics) }, [p.metrics])
  useEffect(() => { api.get(`/projects/${p.id}/variables`).then((v) => setCols(v.columns)) }, [p.id])
  const dirty = JSON.stringify(list) !== JSON.stringify(p.metrics)

  const save = async (next = list) => {
    try { await api.put(`/projects/${p.id}/metrics`, { metrics: next }); toast('Metrics saved'); reload() }
    catch (e) { toast(e.message, 'err') }
  }
  const toggle = (k) => setList(list.map((m) => (m.key === k ? { ...m, enabled: m.enabled === false } : m)))
  const families = [...new Set(list.map((m) => m.family || 'Custom'))]

  return (
    <>
      <PageHead crumbs={crumbs} title="Metrics" sub="What gets baselined. Defaults come from the column mapping; add ratios of your own.">
        {gt && <>
          <button className="btn btn-ghost" onClick={() => setEdit({ ...blank })} disabled={!cols.length}>+ Custom metric</button>
          <button className="btn btn-primary" disabled={!dirty} onClick={() => save()}>Save changes</button>
        </>}
      </PageHead>
      {dirty && <div className="banner amber" style={{ marginBottom: 14 }}><b>Unsaved</b> Changes apply to the next baseline run, or refresh an existing draft from its page.</div>}
      {list.length === 0 ? <div className="card"><Empty glyph="ƒ" title="No metrics yet">Upload data first; metrics are proposed from the mapped columns.</Empty></div> :
        families.map((f) => (
          <div key={f} className="card pad-0" style={{ marginBottom: 16 }}>
            <div className="card-head" style={{ padding: '16px 18px 4px' }}><h3>{f}</h3><span className="tag">{list.filter((m) => (m.family || 'Custom') === f).length}</span></div>
            <div className="table-wrap"><table className="t compact">
              <thead><tr><th style={{ width: 40 }}></th><th>Metric</th><th>Formula</th><th>Unit</th><th>Better</th><th className="r">LSL</th><th className="r">USL</th><th className="r">Goal</th><th></th></tr></thead>
              <tbody>{list.filter((m) => (m.family || 'Custom') === f).map((m) => (
                <tr key={m.key} className={m.enabled === false ? 'dim' : ''}>
                  <td><input type="checkbox" aria-label={`Include ${m.name}`} checked={m.enabled !== false} disabled={!gt} onChange={() => toggle(m.key)} style={{ accentColor: 'var(--brand)' }} /></td>
                  <td style={{ fontWeight: 500 }}>{m.name}{m.zero_as_missing && <span className="faint" style={{ fontSize: 11.5 }}> · zeros = n/a</span>}</td>
                  <td className="muted" style={{ fontSize: 12.5, maxWidth: 340 }}>{formula(m)}</td>
                  <td className="faint" style={{ fontSize: 12.5 }}>{m.unit}</td>
                  <td><Pill cls="grey">{m.direction === 'higher' ? '↑ Higher' : '↓ Lower'}</Pill></td>
                  <td className="r">{m.lsl ?? '—'}</td><td className="r">{m.usl ?? '—'}</td><td className="r">{m.goal ?? '—'}</td>
                  <td>{gt && <button className="btn-link" onClick={() => setEdit({ ...m })}>Edit</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </div>
        ))}
      {edit && <MetricEditor m={edit} cols={cols} isNew={!list.some((x) => x.key === edit.key)} onClose={() => setEdit(null)}
        onDelete={() => { const n = list.filter((x) => x.key !== edit.key); setList(n); setEdit(null) }}
        onSave={(m) => {
          const exists = list.some((x) => x.key === m.key)
          setList(exists ? list.map((x) => (x.key === m.key ? m : x)) : [...list, m]); setEdit(null)
        }} />}
    </>
  )
}

const formula = (m) => {
  const j = (a) => (a.length > 2 ? `Σ ${a.length} columns` : a.join(' + '))
  return `${j(m.numerator)}${m.denominator?.length ? ` ÷ ${j(m.denominator)}` : ''}${m.multiplier && m.multiplier !== 1 ? ` × ${m.multiplier}` : ''}`
}

function MetricEditor({ m: init, cols, isNew, onClose, onSave, onDelete }) {
  const [m, setM] = useState(init)
  const set = (k, v) => setM({ ...m, [k]: v })
  const toggleCol = (k, c) => set(k, m[k].includes(c) ? m[k].filter((x) => x !== c) : [...m[k], c])
  const ok = m.name.trim() && m.numerator.length
  const ColPick = ({ k }) => (
    <div style={{ border: '1px solid var(--line)', borderRadius: 8, maxHeight: 150, overflow: 'auto', padding: '6px 10px' }}>
      {cols.map((c) => <label key={c} className="check" style={{ display: 'flex', padding: '3px 0', fontSize: 13 }}>
        <input type="checkbox" checked={m[k].includes(c)} onChange={() => toggleCol(k, c)} />{c}</label>)}
    </div>
  )
  return (
    <Modal title={isNew ? 'New custom metric' : 'Edit metric'} onClose={onClose} wide footer={<>
      {!isNew && <button className="btn btn-danger" onClick={onDelete}>Remove metric</button>}
      <span className="spacer" />
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!ok} onClick={() => onSave({ ...m, key: m.key || 'cus_' + m.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) })}>Apply</button>
    </>}>
      <div className="stack">
        <div className="form-grid">
          <div className="field"><label>Name</label><input className="input" value={m.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Review effectiveness" /></div>
          <div className="field"><label>Unit</label><input className="input" value={m.unit} onChange={(e) => set('unit', e.target.value)} placeholder="e.g. %" /></div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Numerator <span className="faint">(summed)</span></label><ColPick k="numerator" /></div>
          <div className="field"><label>Denominator <span className="faint">(summed; none = 1)</span></label><ColPick k="denominator" /></div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Multiplier</label><input className="input" type="number" value={m.multiplier} onChange={(e) => set('multiplier', Number(e.target.value) || 1)} /></div>
          <div className="field"><label>Better when</label>
            <select className="input" value={m.direction} onChange={(e) => set('direction', e.target.value)}><option value="lower">Lower</option><option value="higher">Higher</option></select></div>
        </div>
        <label className="check"><input type="checkbox" checked={m.zero_as_missing} onChange={(e) => set('zero_as_missing', e.target.checked)} />
          Treat zero as "not applicable" (e.g. a phase that was skipped). Leave off for defect counts, where zero is real data.</label>
        <div className="micro" style={{ marginTop: 6 }}>Organisational targets (optional)</div>
        <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[['lsl', 'Lower spec limit'], ['usl', 'Upper spec limit'], ['goal', 'Goal / QPPO']].map(([k, l]) => (
            <div key={k} className="field"><label>{l}</label><input className="input" type="number" step="any" value={m[k] ?? ''} onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))} /></div>
          ))}
        </div>
        <div className="banner ai"><b>Why</b> Spec limits drive capability (Cpk/Ppk and % within spec); the goal is compared with the baseline mean so you can see whether the QPPO is achievable.</div>
      </div>
    </Modal>
  )
}
