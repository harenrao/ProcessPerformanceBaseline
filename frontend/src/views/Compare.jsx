import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Empty, Loading, PageHead, Pill } from '../components/ui.jsx'
import { fmt, fmtP } from '../helpers.js'

export default function Compare({ p, crumbs }) {
  const bs = p.baselines
  const [a, setA] = useState(bs[1]?.id || bs[0]?.id)
  const [b, setB] = useState(bs[0]?.id)
  const [res, setRes] = useState(null)
  useEffect(() => { if (a && b && a !== b) api.get(`/baselines/${a}/compare/${b}`).then(setRes); else setRes(null) }, [a, b])
  const verdict = (r) => {
    const t = r.tests
    if (t.note) return <Pill cls="grey">Too few points</Pill>
    if (!t.location_shift && !t.variance_shift) return <Pill cls="grey">No significant change</Pill>
    const d = r.b.median - r.a.median
    const better = r.direction === 'higher' ? d > 0 : d < 0
    if (t.location_shift) return <Pill cls={better ? 'green' : 'red'} dot>{better ? 'Improved' : 'Worsened'}</Pill>
    return <Pill cls="amber" dot>Variation changed</Pill>
  }
  return (
    <>
      <PageHead crumbs={crumbs} title="Compare versions" sub="Has performance shifted significantly between baselines? Use this to justify a re-baseline or to show the effect of an improvement." />
      {bs.length < 2 ? <div className="card"><Empty glyph="⇄" title="Need two baselines">Run another baseline (for example on refreshed data) to compare.</Empty></div> : <>
        <div className="card row wrap" style={{ gap: 14, marginBottom: 16 }}>
          {[['Earlier (A)', a, setA], ['Later (B)', b, setB]].map(([l, v, set]) => (
            <div key={l} className="field" style={{ flex: 1, minWidth: 220 }}><label>{l}</label>
              <select className="input" value={v} onChange={(e) => set(Number(e.target.value))}>{bs.map((x) => <option key={x.id} value={x.id}>v{x.version} · {x.label} ({x.status})</option>)}</select></div>))}
        </div>
        {a === b ? <div className="banner grey">Pick two different versions.</div> : !res ? <Loading /> : (
          <div className="card pad-0"><div className="table-wrap"><table className="t compact">
            <thead><tr><th>Metric</th><th className="r">Median A</th><th className="r">Median B</th><th className="r">Δ</th><th className="r">σ A</th><th className="r">σ B</th><th className="r">Mann-Whitney p</th><th className="r">Levene p</th><th>Verdict</th></tr></thead>
            <tbody>{res.rows.map((r) => {
              const d = r.a.median ? ((r.b.median - r.a.median) / Math.abs(r.a.median)) * 100 : null
              return <tr key={r.key}>
                <td style={{ fontWeight: 500 }}>{r.name}<div className="faint" style={{ fontSize: 11.5 }}>n {r.a.n} → {r.b.n}</div></td>
                <td className="r">{fmt(r.a.median)}</td><td className="r">{fmt(r.b.median)}</td>
                <td className="r">{d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`}</td>
                <td className="r">{fmt(r.a.sd)}</td><td className="r">{fmt(r.b.sd)}</td>
                <td className="r">{fmtP(r.tests.mann_whitney_p)}</td><td className="r">{fmtP(r.tests.levene_p)}</td>
                <td>{verdict(r)}</td>
              </tr>
            })}</tbody>
          </table></div></div>
        )}
        <div className="banner grey" style={{ marginTop: 14 }}><b>Note</b> Versions built on the same dataset share most points, so differences mainly reflect exclusions and settings. For a true performance shift, compare baselines on different periods' data.</div>
      </>}
    </>
  )
}
