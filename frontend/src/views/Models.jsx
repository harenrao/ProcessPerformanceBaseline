import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Scatter } from '../charts/charts.jsx'
import { Empty, Loading, PageHead, Pill, useToast } from '../components/ui.jsx'
import { date, fmt, fmtP } from '../helpers.js'

export default function Models({ p, gt, reload, crumbs }) {
  const [vars, setVars] = useState(null)
  const [y, setY] = useState('')
  const [xs, setXs] = useState([])
  const [bid, setBid] = useState('')
  const [m, setM] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()
  useEffect(() => { api.get(`/projects/${p.id}/variables`).then(setVars) }, [p.id])
  if (!vars) return <Loading />
  const options = [...vars.metrics.map((v) => ({ v: v.key, l: v.name, g: 'Metrics' })), ...vars.columns.map((c) => ({ v: c, l: c, g: 'Raw columns' }))]
  const label = (v) => options.find((o) => o.v === v)?.l || v

  const fit = async () => {
    setBusy(true)
    try { setM(await api.post(`/projects/${p.id}/model`, { y, xs, baseline_id: bid || null })) } catch (e) { setM(null); toast(e.message, 'err') } finally { setBusy(false) }
  }
  const save = async () => {
    const name = window.prompt('Name this model', `${label(y)} model`)
    if (!name) return
    try { await api.post(`/projects/${p.id}/models`, { y, xs, baseline_id: bid || null, name }); toast('Model saved'); reload() } catch (e) { toast(e.message, 'err') }
  }

  const Sel = ({ value, onChange, exclude = [] }) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {['Metrics', 'Raw columns'].map((g) => <optgroup key={g} label={g}>{options.filter((o) => o.g === g && !exclude.includes(o.v)).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</optgroup>)}
    </select>
  )

  return (
    <>
      <PageHead crumbs={crumbs} title="Process performance models" sub="Predict an outcome (e.g. UAT defect density) from controllable factors (e.g. review effort). Regression with prediction intervals." />
      <div className="grid-2" style={{ gridTemplateColumns: '340px 1fr', alignItems: 'start' }}>
        <div className="stack">
          <div className="card stack">
            <div className="field"><label>Outcome (Y)</label><Sel value={y} onChange={(v) => { setY(v); setXs(xs.filter((x) => x !== v)) }} /></div>
            <div className="field"><label>Predictors (X)</label>
              {xs.map((x, i) => (
                <div key={i} className="row"><div style={{ flex: 1 }}><Sel value={x} exclude={[y, ...xs.filter((_, j) => j !== i)]} onChange={(v) => setXs(xs.map((o, j) => (j === i ? v : o)).filter(Boolean))} /></div>
                  <button className="icon-btn" aria-label="Remove predictor" onClick={() => setXs(xs.filter((_, j) => j !== i))}>×</button></div>))}
              {xs.length < 5 && <Sel value="" exclude={[y, ...xs]} onChange={(v) => v && setXs([...xs, v])} />}
            </div>
            <div className="field"><label>Apply exclusions from</label>
              <select className="input" value={bid} onChange={(e) => setBid(e.target.value)}><option value="">None (all data)</option>
                {p.baselines.map((b) => <option key={b.id} value={b.id}>v{b.version} · {b.label}</option>)}</select></div>
            <button className="btn btn-primary" disabled={!y || !xs.length || busy} onClick={fit} style={{ justifyContent: 'center' }}>{busy ? 'Fitting…' : 'Fit model →'}</button>
          </div>
          <div className="card">
            <div className="card-head"><h3>Saved models</h3><span className="tag">{p.models.length}</span></div>
            {p.models.length === 0 ? <div className="faint" style={{ fontSize: 13 }}>None yet.</div> : p.models.map((s) => (
              <div key={s.id} className="row" style={{ padding: '8px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => { setY(s.y); setXs(s.xs); setBid(s.baseline_id || '') }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                  <div className="faint" style={{ fontSize: 12 }}>R² {fmt(s.r2)} · n {s.n} · {s.saved_by}, {date(s.saved_at)}</div>
                </div>
                <Pill cls={s.usable ? 'green' : 'amber'}>{s.usable ? 'Usable' : 'Weak'}</Pill>
                {gt && <button className="icon-btn" aria-label="Delete model" onClick={async () => { await api.del(`/projects/${p.id}/models/${s.id}`); reload() }}>×</button>}
              </div>))}
          </div>
        </div>
        <div>{!m ? <div className="card"><Empty glyph="⟋" title="Pick an outcome and predictors">A useful PPM is statistically significant (F-test p &lt; 0.05), explains most of the variation (R² ≥ 0.5), and uses factors the project can control.</Empty></div>
          : <ModelResult m={m} label={label} p={p} y={y} xs={xs} bid={bid} onSave={gt ? save : null} />}</div>
      </div>
    </>
  )
}

function ModelResult({ m, label, p, y, xs, bid, onSave }) {
  const [vals, setVals] = useState(xs.map((x) => +(((m.x_ranges[x][0] + m.x_ranges[x][1]) / 2).toPrecision(3))))
  const [pred, setPred] = useState(null)
  const toast = useToast()
  useEffect(() => { setPred(null) }, [m])
  const eq = m.coefficients.map((c, i) => (i === 0 ? fmt(c.coef) : `${c.coef >= 0 ? '+' : '−'} ${fmt(Math.abs(c.coef))}·${label(c.term)}`)).join(' ')
  const one = xs.length === 1
  const c0 = m.coefficients[0].coef, c1 = m.coefficients[1]?.coef
  const xr = m.x_ranges[xs[0]]
  return (
    <div className="stack">
      <div className="card">
        <div className="card-head"><div><h3>{label(y)}</h3><p>n = {m.n} · s = {fmt(m.s)}</p></div><span className="spacer" />
          <Pill cls={m.usable ? 'green' : 'amber'} dot>{m.usable ? 'Usable for prediction' : 'Not yet usable'}</Pill>
          {onSave && <button className="btn btn-ghost btn-sm" onClick={onSave}>Save model</button>}</div>
        <div className="mono" style={{ background: 'var(--bg-panel)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, overflowX: 'auto' }}>{label(y)} = {eq}</div>
        <div className="statgrid" style={{ marginTop: 12 }}>
          {[['R²', fmt(m.r2)], ['Adjusted R²', fmt(m.adj_r2)], ['F-test p', fmtP(m.f_p)], ['Residuals normal', m.residual_normality.p >= 0.05 ? `Yes (p ${fmtP(m.residual_normality.p)})` : `No (p ${fmtP(m.residual_normality.p)})`]].map(([k, v]) =>
            <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
        </div>
        {m.notes.length > 0 && <div className="stack" style={{ gap: 6, marginTop: 12 }}>{m.notes.map((n, i) => <div key={i} className="banner amber">{n}</div>)}</div>}
      </div>
      <div className="grid-2e">
        <div className="card"><div className="card-head"><h3>{one ? 'Fit' : 'Predicted vs actual'}</h3></div>
          {one ? <Scatter xs={m.x_values[xs[0]]} ys={m.observed} xLabel={label(xs[0])} yLabel={label(y)} line={[[xr[0], c0 + c1 * xr[0]], [xr[1], c0 + c1 * xr[1]]]} />
            : <Scatter xs={m.fitted} ys={m.observed} xLabel="Predicted" yLabel="Actual" line={[[Math.min(...m.fitted), Math.min(...m.fitted)], [Math.max(...m.fitted), Math.max(...m.fitted)]]} />}
        </div>
        <div className="card">
          <div className="card-head"><div><h3>What-if</h3><p>Plan a project: enter planned values</p></div></div>
          <div className="stack">
            {xs.map((x, i) => <div key={x} className="field"><label>{label(x)}</label>
              <input className="input" type="number" step="any" value={vals[i]} onChange={(e) => setVals(vals.map((v, j) => (j === i ? Number(e.target.value) : v)))} />
              <span className="hint">Observed range {fmt(m.x_ranges[x][0])} – {fmt(m.x_ranges[x][1])}</span></div>)}
            <button className="btn btn-primary" onClick={async () => {
              try { setPred(await api.post(`/projects/${p.id}/model/predict`, { y, xs, values: vals, baseline_id: bid || null })) } catch (e) { toast(e.message, 'err') }
            }}>Predict</button>
            {pred && <div className="limits" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="limit cl"><div className="micro" style={{ color: 'var(--brand)' }}>Predicted</div><div className="v">{fmt(pred.yhat)}</div></div>
              <div className="limit"><div className="micro">95% prediction interval</div><div className="v" style={{ fontSize: 16 }}>{fmt(pred.pi[0])} – {fmt(pred.pi[1])}</div></div>
            </div>}
            {pred?.extrapolating?.length > 0 && <div className="banner amber"><b>Extrapolating</b> {pred.extrapolating.map(label).join(', ')} outside the observed range.</div>}
          </div>
        </div>
      </div>
      <div className="card pad-0"><table className="t compact">
        <thead><tr><th>Term</th><th className="r">Coefficient</th><th className="r">SE</th><th className="r">t</th><th className="r">p</th><th className="r">VIF</th></tr></thead>
        <tbody>{m.coefficients.map((c) => (
          <tr key={c.term}><td style={{ fontWeight: 500 }}>{c.term === 'Intercept' ? 'Intercept' : label(c.term)}</td><td className="r">{fmt(c.coef)}</td><td className="r">{fmt(c.se)}</td>
            <td className="r">{fmt(c.t)}</td><td className="r" style={{ color: c.p < 0.05 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{fmtP(c.p)}</td><td className="r">{c.vif ? fmt(c.vif) : '—'}</td></tr>))}</tbody>
      </table></div>
    </div>
  )
}
