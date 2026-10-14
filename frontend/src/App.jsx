import React, { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, token } from './api.js'
import { ToastProvider } from './components/ui.jsx'
import { initials } from './helpers.js'
import Login from './views/Login.jsx'
import Home from './views/Home.jsx'
import Run from './views/Run.jsx'

function useHash() {
  const [hash, setHash] = useState(window.location.hash)
  useEffect(() => {
    const h = () => setHash(window.location.hash)
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

export const go = (path) => { window.location.hash = '#/' + path }

export default function App() {
  const [user, setUser] = useState(null)
  const [booting, setBooting] = useState(true)
  const route = useHash()

  const logout = useCallback(() => { token.clear(); setUser(null) }, [])
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)) }, [])
  useEffect(() => {
    if (!token.get()) { setBooting(false); return }
    api.get('/auth/me').then(setUser).catch(() => token.clear()).finally(() => setBooting(false))
  }, [])

  if (booting) return null
  if (!user) return <ToastProvider><Login onLogin={(u) => { setUser(u); go('') }} /></ToastProvider>

  const [top, id, metric] = route
  const page = top === 'run' && id ? <Run key={id} id={Number(id)} metricKey={metric} /> : <Home user={user} />

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="brand" onClick={() => go('')} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('')}>
          <div className="brand-mark">GT</div>
          <div>Grant Thornton<small>Process Performance Baseline</small></div>
        </div>
        <span className="spacer" />
        <div className="user-chip">
          <div style={{ textAlign: 'right', lineHeight: 1.25 }}><div style={{ fontWeight: 600 }}>{user.name}</div></div>
          <div className="avatar">{initials(user.name)}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>
      {page}
    </ToastProvider>
  )
}
