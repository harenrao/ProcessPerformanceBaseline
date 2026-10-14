import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { Modal, useToast } from '../components/ui.jsx'

const LIFECYCLES = ['Development', 'Enhancement', 'Maintenance', 'Agile', 'Testing', 'Support']
const UNITS = [['FP', 'Function points'], ['SP', 'Story points'], ['KLOC', 'KLOC'], ['UCP', 'Use-case points'], ['Req', 'Requirements']]

export default function NewProject({ onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [orgs, setOrgs] = useState([])
  const [f, setF] = useState({ name: '', client: '', lifecycle: 'Development', size_unit: 'FP', period: '', description: '' })
  const [source, setSource] = useState('upload')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  const fileRef = useRef()
  useEffect(() => { api.get('/orgs').then((o) => setOrgs(o.filter((x) => x.name !== 'Grant Thornton'))).catch(() => {}) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const create = async () => {
    setBusy(true)
    try {
      const p = await api.post('/projects', { ...f, use_sample: source === 'sample' })
      if (source === 'upload' && file) await api.upload(`/projects/${p.id}/dataset`, file)
      toast('Project created')
      onCreated(p)
    } catch (e) { toast(e.message, 'err') } finally { setBusy(false) }
  }

  const steps = (
    <div className="steps">
      {[1, 2, 3].map((n) => <div key={n} className={`step ${n === step ? 'on' : n < step ? 'done' : ''}`}>{n < step ? '✓' : n}</div>)}
    </div>
  )

  return (
    <Modal title="New baseline project" onClose={onClose} extra={steps} footer={<>
      {step > 1 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>← Back</button>}
      <span className="spacer" />
      {step < 3 && <button className="btn btn-primary" disabled={step === 1 && (!f.name || !f.client)} onClick={() => setStep(step + 1)}>Continue →</button>}
      {step === 3 && <button className="btn btn-primary" disabled={busy} onClick={create}>{busy ? 'Creating…' : 'Create project →'}</button>}
    </>}>
      {step === 1 && (
        <div className="stack">
          <div className="micro">Step 1 of 3 · Engagement</div>
          <div className="field"><label>Project name</label><input className="input" value={f.name} onChange={set('name')} placeholder="e.g. Core Banking AD — PPB FY26" autoFocus /></div>
          <div className="field">
            <label>Client organisation</label>
            <input className="input" list="orgs" value={f.client} onChange={set('client')} placeholder="Choose or type a new client" />
            <datalist id="orgs">{orgs.map((o) => <option key={o.id} value={o.name} />)}</datalist>
            <span className="hint">Client users of this organisation will see this project read-only.</span>
          </div>
          <div className="form-grid">
            <div className="field"><label>Lifecycle</label>
              <select className="input" value={f.lifecycle} onChange={set('lifecycle')}>{LIFECYCLES.map((l) => <option key={l}>{l}</option>)}</select></div>
            <div className="field"><label>Size unit</label>
              <select className="input" value={f.size_unit} onChange={set('size_unit')}>{UNITS.map(([v, l]) => <option key={v} value={v}>{l} ({v})</option>)}</select></div>
          </div>
          <div className="field"><label>Baseline period</label><input className="input" value={f.period} onChange={set('period')} placeholder="e.g. Apr 2025 – Mar 2026" /></div>
          <div className="field"><label>Description <span className="faint">(optional)</span></label><textarea className="input" value={f.description} onChange={set('description')} /></div>
        </div>
      )}
      {step === 2 && (
        <div className="stack">
          <div className="micro">Step 2 of 3 · Data</div>
          <div className="seg" style={{ alignSelf: 'flex-start' }}>
            {[['upload', 'Upload a file'], ['sample', 'Use sample data'], ['later', 'Add data later']].map(([v, l]) =>
              <button key={v} className={source === v ? 'on' : ''} onClick={() => setSource(v)}>{l}</button>)}
          </div>
          {source === 'upload' && (
            <div className="dropzone" onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('over') }}
              onDragLeave={(e) => e.currentTarget.classList.remove('over')}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('over'); setFile(e.dataTransfer.files[0]) }}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => setFile(e.target.files[0])} />
              <div className="big">↑</div>
              {file ? <><b style={{ color: 'var(--ink)' }}>{file.name}</b><div>{(file.size / 1024).toFixed(0)} KB · click to change</div></>
                : <><b>Drop an Excel or CSV file</b><div>One row per project or work item; size, effort and defect columns</div></>}
            </div>
          )}
          {source === 'sample' && <div className="banner brand"><b>Sample</b> 43 change requests with size (FP), phase-wise effort (MD) and phase-wise defects.</div>}
          {source === 'later' && <div className="banner grey">You can upload data from the project's Data tab at any time.</div>}
          <div className="banner ai"><b>Tip</b> Columns are recognised automatically (size, effort, defects, IDs, dates). Include a completion date so control charts are in true time order.</div>
        </div>
      )}
      {step === 3 && (
        <div className="stack">
          <div className="micro">Step 3 of 3 · Review</div>
          <table className="t compact"><tbody>
            <tr><td className="muted">Project</td><td><b>{f.name}</b></td></tr>
            <tr><td className="muted">Client</td><td>{f.client}</td></tr>
            <tr><td className="muted">Lifecycle · unit</td><td>{f.lifecycle} · {f.size_unit}</td></tr>
            <tr><td className="muted">Period</td><td>{f.period || '—'}</td></tr>
            <tr><td className="muted">Data</td><td>{source === 'upload' ? (file?.name || 'No file chosen') : source === 'sample' ? 'Sample dataset' : 'Add later'}</td></tr>
          </tbody></table>
          <div className="banner grey">Next you'll confirm the column mapping and the metrics to baseline.</div>
        </div>
      )}
    </Modal>
  )
}
