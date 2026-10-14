import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Confirm, Empty, Loading, PageHead, RagBar, StatusPill, useToast } from '../components/ui.jsx'
import { date, isGT } from '../helpers.js'
import NewProject from './NewProject.jsx'

export default function Projects({ user }) {
  const [items, setItems] = useState(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [q, setQ] = useState('')
  const toast = useToast()
  const gt = isGT(user)

  const load = () => api.get('/projects').then(setItems).catch((e) => toast(e.message, 'err'))
  useEffect(() => { load() }, [])

  const shown = (items || []).filter((p) => `${p.name} ${p.client}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="content"><div className="content-inner">
      <PageHead title="Projects"
        sub={gt ? 'Select a baseline engagement, or set up a new one.' : "You see only your organisation's engagement."}>
        {items && items.length > 3 && <input className="input" style={{ width: 220 }} placeholder="Search projects" value={q} onChange={(e) => setQ(e.target.value)} />}
        {gt && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Create new project</button>}
      </PageHead>

      {!items ? <Loading /> : items.length === 0 && !gt ? (
        <div className="card"><Empty title="No engagements assigned to your account yet." /></div>
      ) : (
        <div className="grid">
          {shown.map((p) => <ProjectCard key={p.id} p={p} gt={gt} onDelete={() => setDeleting(p)} />)}
          {gt && (
            <div className="card dashed" role="button" tabIndex={0} onClick={() => setCreating(true)}
              onKeyDown={(e) => e.key === 'Enter' && setCreating(true)}>
              <div style={{ fontSize: 22, fontWeight: 300 }}>+</div>
              <div style={{ fontWeight: 600 }}>New baseline project</div>
              <div style={{ fontSize: 12.5 }}>Runs the setup wizard</div>
            </div>
          )}
        </div>
      )}

      {creating && <NewProject onClose={() => setCreating(false)} onCreated={(p) => { setCreating(false); go(`p/${p.id}/${p.n_rows ? 'data' : 'data'}`) }} />}
      {deleting && <Confirm title="Delete project?" danger confirmLabel="Delete project"
        body={`"${deleting.name}" and all its datasets, baselines and models will be permanently removed.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await api.del(`/projects/${deleting.id}`); setDeleting(null); toast('Project deleted'); load() }} />}
    </div></div>
  )
}

function ProjectCard({ p, gt, onDelete }) {
  const s = p.summary
  return (
    <div className="card click" role="button" tabIndex={0} onClick={() => go(`p/${p.id}/overview`)}
      onKeyDown={(e) => e.key === 'Enter' && go(`p/${p.id}/overview`)}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: 15.5 }}>{p.name}</h3>
          <div className="muted" style={{ fontSize: 13 }}>{p.client}</div>
        </div>
        {p.latest ? <StatusPill status={p.approved_version ? 'approved' : p.latest.status} /> : <span className="pill grey">Not baselined</span>}
        {gt && <button className="icon-btn" aria-label={`Delete ${p.name}`} onClick={(e) => { e.stopPropagation(); onDelete() }}>×</button>}
      </div>
      <div style={{ margin: '16px 0 8px' }} className="row">
        <span className="micro">Metric health</span><span className="spacer" />
        {s ? <span style={{ fontSize: 12.5 }} className="muted num">{s.green} green · {s.amber} amber · {s.red} red</span>
          : <span style={{ fontSize: 12.5 }} className="faint">No baseline yet</span>}
      </div>
      <RagBar s={s} />
      <div className="row wrap" style={{ marginTop: 14 }}>
        {p.lifecycle && <span className="tag">{p.lifecycle}</span>}
        <span className="tag">{p.n_rows} data points</span>
        <span className="tag">{p.n_metrics} metrics</span>
        {p.versions > 0 && <span className="tag">v{p.latest.version}{p.approved_version ? ` · v${p.approved_version} in force` : ''}</span>}
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>
        {p.period ? `${p.period} · ` : ''}{p.latest ? `updated ${date(p.latest.updated_at)}` : `created ${date(p.created_at)}`}
      </div>
    </div>
  )
}
