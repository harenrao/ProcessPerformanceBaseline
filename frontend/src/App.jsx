import React, { useCallback, useEffect, useState } from 'react'
import { api, setUnauthorizedHandler, token } from './api.js'
import { ToastProvider } from './components/ui.jsx'
import { canManageUsers, initials } from './helpers.js'
import Login from './views/Login.jsx'
import Projects from './views/Projects.jsx'
import Workspace from './views/Workspace.jsx'
import Users from './views/Users.jsx'
import Methodology from './views/Methodology.jsx'

function useHash() {
  const [hash, setHash] = useState(window.location.hash || '#/projects')
  useEffect(() => {
    const h = () => setHash(window.location.hash || '#/projects')
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
    const m = window.location.hash.match(/token=([^&]+)/)
    if (m) { token.set(m[1]); window.history.replaceState(null, '', '#/projects') }
    if (!token.get()) { setBooting(false); return }
    api.get('/auth/me').then(setUser).catch(() => token.clear()).finally(() => setBooting(false))
  }, [])

  if (booting) return null
  if (!user) return <ToastProvider><Login onLogin={(u) => { setUser(u); go('projects') }} /></ToastProvider>

  const [top, id, ...rest] = route
  let page
  if (top === 'p' && id) page = <Workspace key={id} id={Number(id)} rest={rest} user={user} />
  else if (top === 'users' && canManageUsers(user)) page = <Users user={user} />
  else if (top === 'method') page = <Methodology />
  else page = <Projects user={user} />

  return (
    <ToastProvider>
      <header className="topbar">
        <div className="brand" onClick={() => go('projects')} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('projects')}>
          <div className="brand-mark">GT</div>
          <div>Grant Thornton<small>Process Performance Baseline</small></div>
        </div>
        <nav className="topnav">
          <a href="#/projects" className={top !== 'users' && top !== 'method' ? 'active' : ''}>Projects</a>
          <a href="#/method" className={top === 'method' ? 'active' : ''}>Methodology</a>
          {canManageUsers(user) && <a href="#/users" className={top === 'users' ? 'active' : ''}>Users</a>}
        </nav>
        <span className="spacer" />
        <div className="user-chip">
          <div style={{ textAlign: 'right', lineHeight: 1.25 }}>
            <div style={{ fontWeight: 600 }}>{user.name}</div>
            <div className="faint" style={{ fontSize: 12 }}>{user.role}</div>
          </div>
          <div className="avatar">{initials(user.name)}</div>
          <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
        </div>
      </header>
      {page}
    </ToastProvider>
  )
}
