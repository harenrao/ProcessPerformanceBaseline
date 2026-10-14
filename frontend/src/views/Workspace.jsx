import React, { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import { go } from '../App.jsx'
import { Loading, useToast } from '../components/ui.jsx'
import { isGT } from '../helpers.js'
import Overview from './Overview.jsx'
import Data from './Data.jsx'
import Metrics from './Metrics.jsx'
import Baselines from './Baselines.jsx'
import BaselineDetail from './BaselineDetail.jsx'
import Stratify from './Stratify.jsx'
import Models from './Models.jsx'
import Compare from './Compare.jsx'
import Audit from './Audit.jsx'

const NAV = [
  ['Baseline', [['overview', '◎', 'Overview'], ['data', '▤', 'Data'], ['metrics', 'ƒ', 'Metrics'], ['baselines', '▲', 'Baselines']]],
  ['Analyse', [['stratify', '▦', 'Stratification'], ['models', '⟋', 'Models (PPM)'], ['compare', '⇄', 'Compare versions']]],
  ['Govern', [['audit', '☰', 'Audit trail']]],
]

export default function Workspace({ id, rest, user }) {
  const [p, setP] = useState(null)
  const toast = useToast()
  const tab = rest[0] || 'overview'
  const reload = useCallback(() => api.get(`/projects/${id}`).then(setP).catch((e) => { toast(e.message, 'err'); go('projects') }), [id])
  useEffect(() => { reload() }, [reload])
  if (!p) return <Loading />

  const counts = { metrics: p.metrics.filter((m) => m.enabled !== false).length, baselines: p.baselines.length, models: p.models.length }
  const ctx = { p, user, gt: isGT(user), reload }
  const crumbs = <><a href="#/projects">Projects</a> / {p.name}</>

  let body
  if (tab === 'baselines' && rest[1]) body = <BaselineDetail {...ctx} bid={Number(rest[1])} metricKey={rest[2]} crumbs={crumbs} />
  else body = {
    overview: <Overview {...ctx} crumbs={crumbs} />, data: <Data {...ctx} crumbs={crumbs} />,
    metrics: <Metrics {...ctx} crumbs={crumbs} />, baselines: <Baselines {...ctx} crumbs={crumbs} />,
    stratify: <Stratify {...ctx} crumbs={crumbs} />, models: <Models {...ctx} crumbs={crumbs} />,
    compare: <Compare {...ctx} crumbs={crumbs} />, audit: <Audit {...ctx} crumbs={crumbs} />,
  }[tab] || <Overview {...ctx} crumbs={crumbs} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div style={{ padding: '2px 10px 6px' }}>
          <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{p.name}</div>
          <div className="faint" style={{ fontSize: 12.5 }}>{p.client}</div>
        </div>
        {NAV.map(([g, items]) => (
          <div key={g}>
            <div className="group micro">{g}</div>
            {items.map(([k, glyph, label]) => (
              <button key={k} className={`nav-item ${tab === k ? 'active' : ''}`} onClick={() => go(`p/${id}/${k}`)}>
                <span className="glyph">{glyph}</span>{label}
                {counts[k] !== undefined && <span className="badge">{counts[k]}</span>}
              </button>
            ))}
          </div>
        ))}
      </aside>
      <main className="content">
        <div className="content-inner">
          <div className="mobile-tabs">
            {NAV.flatMap(([, i]) => i).map(([k, , l]) => <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => go(`p/${id}/${k}`)}>{l}</button>)}
          </div>
          {body}
        </div>
      </main>
    </div>
  )
}
