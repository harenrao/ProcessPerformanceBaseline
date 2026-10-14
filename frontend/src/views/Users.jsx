import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Confirm, Loading, Modal, PageHead, Pill, useToast } from '../components/ui.jsx'

const ROLES = ['GT Admin', 'GT Director', 'GT Consultant', 'Client']

export default function Users({ user }) {
  const [rows, setRows] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const toast = useToast()
  const load = () => api.get('/users').then(setRows)
  useEffect(() => { load(); api.get('/orgs').then(setOrgs) }, [])
  return (
    <div className="content"><div className="content-inner">
      <PageHead crumbs={<a href="#/projects">Projects</a>} title="Users" sub="GT staff see every engagement. Client users see only their organisation's projects, read-only.">
        <button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add user</button>
      </PageHead>
      <div className="card pad-0">
        {!rows ? <Loading /> : <table className="t">
          <thead><tr><th>Name</th><th>Username</th><th>Role</th><th>Organisation</th><th></th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}><td style={{ fontWeight: 500 }}>{r.name}</td><td className="mono">{r.username}</td>
              <td><Pill cls={r.role === 'Client' ? 'grey' : 'brand'}>{r.role}</Pill></td><td className="muted">{r.org || 'Grant Thornton'}</td>
              <td>{r.id !== user.id && <button className="icon-btn" aria-label={`Remove ${r.name}`} onClick={() => setRemoving(r)}>×</button>}</td></tr>
          ))}</tbody>
        </table>}
      </div>
      {adding && <AddUser orgs={orgs} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast('User added'); load() }} />}
      {removing && <Confirm title="Remove user?" danger confirmLabel="Remove" body={`${removing.name} (${removing.username}) will no longer be able to sign in.`}
        onClose={() => setRemoving(null)} onConfirm={async () => { try { await api.del(`/users/${removing.id}`); toast('User removed'); load() } catch (e) { toast(e.message, 'err') } setRemoving(null) }} />}
    </div></div>
  )
}

function AddUser({ orgs, onClose, onDone }) {
  const [f, setF] = useState({ name: '', username: '', role: 'GT Consultant', password: '', email: '', org_id: '' })
  const toast = useToast()
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const ok = f.name && f.username && f.password.length >= 8 && (f.role !== 'Client' || f.org_id)
  return (
    <Modal title="Add user" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" disabled={!ok} onClick={async () => {
        try { await api.post('/users', { ...f, org_id: f.org_id ? Number(f.org_id) : null }); onDone() } catch (e) { toast(e.message, 'err') }
      }}>Add user</button></>}>
      <div className="stack">
        <div className="form-grid">
          <div className="field"><label>Full name</label><input className="input" value={f.name} onChange={set('name')} autoFocus /></div>
          <div className="field"><label>Username</label><input className="input" value={f.username} onChange={set('username')} placeholder="e.g. gt.firstname" /></div>
        </div>
        <div className="form-grid">
          <div className="field"><label>Role</label><select className="input" value={f.role} onChange={set('role')}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
          {f.role === 'Client' && <div className="field"><label>Organisation</label><select className="input" value={f.org_id} onChange={set('org_id')}><option value="">Choose…</option>
            {orgs.filter((o) => o.name !== 'Grant Thornton').map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>}
        </div>
        <div className="form-grid">
          <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={set('email')} /></div>
          <div className="field"><label>Temporary password</label><input className="input" type="password" value={f.password} onChange={set('password')} /><span className="hint">At least 8 characters.</span></div>
        </div>
      </div>
    </Modal>
  )
}
