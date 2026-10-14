import React, { useState } from 'react'
import { api, token } from '../api.js'
import { DEMO } from '../helpers.js'

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e?.preventDefault()
    setBusy(true); setError(null)
    try {
      const r = await api.login(username.trim(), password)
      token.set(r.access_token)
      onLogin(r.user)
    } catch (err) {
      setError(err.status === 429 ? err.message : 'Invalid username or password. Try a demo account on the right.')
    } finally { setBusy(false) }
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <form className="form" onSubmit={submit}>
          <div className="brand" style={{ cursor: 'default' }}>
            <div className="brand-mark">GT</div>
            <div>Grant Thornton<small>Process Performance Baseline</small></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <h1 style={{ fontSize: 22 }}>Sign in</h1>
            <p className="muted" style={{ margin: '4px 0 0', fontSize: 13.5 }}>Single sign-on for GT consultants and client organisations.</p>
          </div>
          {error && <div className="banner red" role="alert">{error}</div>}
          <div className="field">
            <label htmlFor="u">Username</label>
            <input id="u" className="input" placeholder="e.g. gt.admin" value={username} autoComplete="username"
              onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="p">Password</label>
            <input id="p" className="input" type="password" value={password} autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '11px 15px' }} disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
          <p className="faint" style={{ fontSize: 12, margin: 0 }}>Client accounts only ever see their own organisation's engagement.</p>
          <ul className="login-hero" style={{ paddingLeft: 18, margin: 0 }}>
            <li>Baseline productivity, quality and custom metrics from your project data</li>
            <li>Stability, distribution fit and justified outlier review in one place</li>
            <li>Process performance models, version comparison and approval trail</li>
          </ul>
        </form>
        <div className="demo">
          <div className="micro" style={{ marginBottom: 10 }}>Demo accounts — click to fill</div>
          {DEMO.map((d) => (
            <button key={d.username} className="demo-row" type="button"
              onClick={() => { setUsername(d.username); setPassword(d.password); setError(null) }}>
              <b>{d.username}</b>
              <span>{d.role} · {d.name} — pwd: {d.password}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
