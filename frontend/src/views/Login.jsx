import React, { useEffect, useState } from 'react'
import { api, token } from '../api.js'

export default function Login({ onLogin }) {
  const [mode, setMode] = useState(null) // 'signin' | 'register'
  const [f, setF] = useState({ name: '', username: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { api.get('/auth/status').then((s) => setMode(s.has_users ? 'signin' : 'register')).catch(() => setMode('signin')) }, [])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reg = mode === 'register'

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = reg ? await api.post('/auth/register', f) : await api.login(f.username.trim(), f.password)
      token.set(r.access_token)
      onLogin(r.user)
    } catch (err) {
      setError(reg ? err.message : err.status === 429 ? err.message : 'Invalid username or password.')
    } finally { setBusy(false) }
  }
  if (!mode) return null

  return (
    <div className="login-wrap">
      <div className="login" style={{ gridTemplateColumns: '1fr', width: 'min(440px, 100%)' }}>
        <form className="form" onSubmit={submit}>
          <div className="brand" style={{ cursor: 'default' }}>
            <div className="brand-mark">GT</div>
            <div>Grant Thornton<small>Process Performance Baseline</small></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <h1 style={{ fontSize: 22 }}>{reg ? 'Create your account' : 'Sign in'}</h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>
              {reg ? 'Your account and runs stay on this computer.' : 'Upload your project data and get a process performance baseline.'}</p>
          </div>
          {error && <div className="banner red" role="alert">{error}</div>}
          {reg && <div className="field"><label htmlFor="n">Full name</label>
            <input id="n" className="input" value={f.name} onChange={set('name')} autoFocus /></div>}
          <div className="field"><label htmlFor="u">Username</label>
            <input id="u" className="input" value={f.username} autoComplete="username" onChange={set('username')} autoFocus={!reg} /></div>
          <div className="field"><label htmlFor="p">Password</label>
            <input id="p" className="input" type="password" value={f.password} autoComplete={reg ? 'new-password' : 'current-password'} onChange={set('password')} />
            {reg && <span className="hint">At least 8 characters.</span>}</div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px 15px' }}
            disabled={busy || !f.username || !f.password || (reg && !f.name)}>
            {busy ? 'Please wait…' : reg ? 'Create account →' : 'Sign in →'}
          </button>
          <div className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            {reg ? <>Already have an account? <button type="button" className="btn-link" onClick={() => { setMode('signin'); setError(null) }}>Sign in</button></>
              : <>New on this computer? <button type="button" className="btn-link" onClick={() => { setMode('register'); setError(null) }}>Create an account</button></>}
          </div>
        </form>
      </div>
    </div>
  )
}
