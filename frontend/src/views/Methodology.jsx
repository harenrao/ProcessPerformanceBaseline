import React from 'react'
import { PageHead } from '../components/ui.jsx'
import { RULES } from '../helpers.js'

const STEPS = [
  ['1', 'Ingest & validate', 'Headers are normalised (stray spaces no longer hide columns), roles are inferred, and every mapped column is profiled for missing, non-numeric, negative and zero values. Rows with no size are excluded from ratio metrics only.'],
  ['2', 'Derive metrics', 'Each metric is Σ numerator ÷ Σ denominator × multiplier. Defaults: phase effort per size unit, total delivery rate, phase defect density, total defect density and defect removal efficiency. Zero defects are real data and are kept; zero effort can be marked "not applicable".'],
  ['3', 'Screen, don\'t delete', 'IQR, Grubbs or I-MR 3σ screening flags candidate outliers. Nothing is removed until an analyst records an assignable cause, which is stamped with their name and date and appears in reports and the audit trail.'],
  ['4', 'Check stability', 'An I-MR chart in time order with the selected Western Electric / Nelson tests. Lognormal metrics are charted on the log scale so skew is not mistaken for instability.'],
  ['5', 'Identify the distribution', 'Anderson-Darling against Normal, Lognormal, Exponential, Weibull and Gamma. p-values use Minitab\'s formula (Normal, Lognormal) or Stephens\' tables (Exponential, Weibull).'],
  ['6', 'Set limits', 'Normal → I-MR natural process limits. Other fits → the fitted 0.135 / 50 / 99.865 percentiles (the 3σ-equivalent). Nothing fits → empirical percentiles, with a prompt to stratify.'],
  ['7', 'Judge & govern', 'Each metric gets a RAG. Versions move Draft → In review → Approved; the approver must be a different person from the submitter; approving supersedes the previous baseline.'],
]

export default function Methodology() {
  return (
    <div className="content"><div className="content-inner" style={{ maxWidth: 900 }}>
      <PageHead crumbs={<a href="#/projects">Projects</a>} title="Methodology" sub="How a baseline is computed. Written for appraisers and process owners." />
      <div className="card stack">
        {STEPS.map(([n, t, d]) => (
          <div key={n} className="row" style={{ alignItems: 'flex-start', gap: 14 }}>
            <span className="step on" style={{ flex: 'none' }}>{n}</span>
            <div><div style={{ fontWeight: 600 }}>{t}</div><div className="muted" style={{ fontSize: 13.5 }}>{d}</div></div>
          </div>
        ))}
      </div>
      <div className="grid-2e" style={{ marginTop: 16 }}>
        <div className="card"><div className="card-head"><h3>Stability tests</h3></div>
          {Object.entries(RULES).map(([k, v]) => <div key={k} style={{ fontSize: 13.5, padding: '4px 0' }}><b>Test {k}</b> <span className="muted">{v}</span></div>)}</div>
        <div className="card"><div className="card-head"><h3>CMMI practice mapping</h3></div>
          {[['OPP / MPM', 'Baselines, limits, distribution and stability per metric'], ['QPM', 'Approved limits in force; capability vs QPPO goals'], ['PPMs', 'Regression models with prediction intervals and what-if'], ['CAR', 'Assignable causes recorded on excluded points'], ['Evidence', 'Versioned baselines, approvals, audit trail, Word/PPT/Excel exports']].map(([a, b]) =>
            <div key={a} style={{ fontSize: 13.5, padding: '4px 0' }}><b>{a}</b> <span className="muted">{b}</span></div>)}
        </div>
      </div>
    </div></div>
  )
}
