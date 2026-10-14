import React, { useEffect, useRef, useState } from 'react'
import { fmt, RULES } from '../helpers.js'

/* Hand-rolled SVG charts: thin marks, hairline grid, hover tooltips, text in ink tokens. */

function useWidth(fallback = 720) {
  const ref = useRef(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

function ticks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo]
  const span = hi - lo
  const step0 = span / n
  const mag = 10 ** Math.floor(Math.log10(step0))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag
  const out = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toPrecision(12))
  return out
}

function logTicks(lo, hi) {
  const out = []
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= lo && v <= hi) out.push(v) }
  }
  return out.length >= 2 ? out : [lo, hi]
}

function scale(d0, d1, r0, r1, log) {
  if (log) {
    const a = Math.log(d0), b = Math.log(d1)
    return (v) => r0 + ((Math.log(Math.max(v, d0 * 1e-6)) - a) / (b - a || 1)) * (r1 - r0)
  }
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0)
}

const Tip = ({ tip }) => tip && (
  <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>
)

/* ---------------------------------------------------------- I-MR chart -- */
export function ControlChart({ metric, onPick, selected }) {
  const [ref, W] = useWidth()
  const [tip, setTip] = useState(null)
  const { points, chart } = metric
  const log = chart.scale === 'log'
  const H1 = 250, H2 = 110, gap = 26, m = { l: 56, r: 92, t: 12, b: 26 }
  const H = m.t + H1 + gap + H2 + m.b
  const inc = new Set(chart.seq)

  const vals = points.map((p) => p.value)
  const posVals = log ? vals.filter((v) => v > 0) : vals
  let lo = Math.min(...posVals, chart.lcl ?? Infinity), hi = Math.max(...posVals, chart.ucl ?? -Infinity)
  if (log) { lo = Math.max(lo, Math.min(...posVals) / 1.5); lo *= 0.85; hi *= 1.15 }
  else { const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad; if (Math.min(...vals) >= 0) lo = Math.max(lo, 0) }
  const x = scale(0, Math.max(points.length - 1, 1), m.l, W - m.r)
  const y = scale(lo, hi, m.t + H1, m.t, log)

  const mrVals = chart.mr.filter((v) => v !== null)
  const mrHi = Math.max(...mrVals, chart.scale === 'linear' ? chart.mr_ucl : 0) * 1.1 || 1
  const y2top = m.t + H1 + gap
  const y2 = scale(0, mrHi, y2top + H2, y2top)
  const yt = log ? logTicks(lo, hi) : ticks(lo, hi)

  const incLine = chart.seq.map((i) => `${x(i)},${y(points[i].value)}`).join(' ')
  const mrLine = chart.seq.map((i, k) => (chart.mr[k] === null ? null : `${x(i)},${y2(chart.mr[k])}`)).filter(Boolean).join(' ')

  const limits = [
    ['UCL', chart.ucl, 'var(--muted)', '5 4'],
    ['CL', chart.cl, 'var(--ink)', null],
    ['LCL', chart.lcl, 'var(--muted)', '5 4'],
  ]

  const show = (i, e) => {
    const p = points[i]
    const r = e.currentTarget.ownerSVGElement.getBoundingClientRect()
    const box = ref.current.getBoundingClientRect()
    setTip({
      x: (x(i) / W) * r.width + (r.left - box.left), y: (y(p.value) / H) * r.height + (r.top - box.top),
      content: (<>
        <b>{p.id}</b> · obs {i + 1}<br />{fmt(p.value)} {metric.unit}
        {p.excluded && <><br />Excluded</>}
        {p.rules?.length > 0 && <><br />{p.rules.map((r) => `Test ${r}: ${RULES[r]}`).join('; ')}</>}
        {p.flags?.length > 0 && <><br />Flagged: {p.flags.join(', ')}</>}
      </>),
    })
  }

  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Individuals and moving range chart for ${metric.name}`}>
        <g className="grid">{yt.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {yt.map((t) => <text key={t} x={m.l - 8} y={y(t) + 3.5} textAnchor="end">{fmt(t)}</text>)}
        </g>
        {limits.map(([l, v, c, d]) => v !== null && v !== undefined && v >= lo && v <= hi && (
          <g key={l}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={c} strokeWidth="1" strokeDasharray={d || undefined} />
            <text className="lbl" x={W - m.r + 8} y={y(v) + 3.5}>{l} {fmt(v)}</text>
          </g>
        ))}
        <polyline points={incLine} fill="none" stroke="var(--series)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
        {points.map((p, i) => {
          const viol = p.rules?.length > 0
          const ex = !inc.has(i)
          return (
            <g key={i} style={{ cursor: onPick ? 'pointer' : 'default' }}
              onMouseEnter={(e) => show(i, e)} onMouseLeave={() => setTip(null)} onClick={() => onPick?.(i)}>
              <circle cx={x(i)} cy={y(p.value)} r="10" fill="transparent" />
              {selected === i && <circle cx={x(i)} cy={y(p.value)} r="9" fill="none" stroke="var(--brand-accent)" strokeWidth="2" />}
              <circle cx={x(i)} cy={y(p.value)} r={viol ? 5.5 : 4}
                fill={ex ? 'var(--bg)' : viol ? 'var(--red)' : 'var(--series)'}
                stroke={ex ? 'var(--grey)' : 'var(--bg)'} strokeWidth={ex ? 1.5 : 2} />
            </g>
          )
        })}

        <text className="micro" x={m.l} y={y2top - 8} style={{ fontSize: 10 }}>MOVING RANGE{log ? ' (LOG SCALE)' : ''}</text>
        <g className="grid">{ticks(0, mrHi, 3).map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y2(t)} y2={y2(t)} />)}</g>
        <g className="axis">{ticks(0, mrHi, 3).map((t) => <text key={t} x={m.l - 8} y={y2(t) + 3.5} textAnchor="end">{fmt(t)}</text>)}</g>
        {[['UCL', chart.mr_ucl, '5 4'], ['MR̄', chart.mr_bar, null]].map(([l, v, d]) => (
          <g key={l}>
            <line x1={m.l} x2={W - m.r} y1={y2(v)} y2={y2(v)} stroke={d ? 'var(--muted)' : 'var(--ink)'} strokeDasharray={d || undefined} />
            <text className="lbl" x={W - m.r + 8} y={y2(v) + 3.5}>{l} {fmt(v)}</text>
          </g>
        ))}
        <polyline points={mrLine} fill="none" stroke="var(--series)" strokeWidth="1.5" opacity=".7" />
        {chart.seq.map((i, k) => chart.mr[k] !== null && (
          <circle key={i} cx={x(i)} cy={y2(chart.mr[k])} r="3" fill="var(--series)" stroke="var(--bg)" strokeWidth="1.5" />
        ))}
        <text className="axis" x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" style={{ fontSize: 10.5, fill: 'var(--muted)' }}>Observation, in time order</text>
      </svg>
      <Tip tip={tip} />
      <div className="legend">
        <span><i style={{ background: 'var(--series)' }} />Included</span>
        <span><i style={{ background: 'var(--red)' }} />Breaks a run rule</span>
        <span><i style={{ background: 'var(--bg)', border: '1.5px solid var(--grey)' }} />Excluded</span>
        <span><i className="dash" />Control limits</span>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- histogram -- */
export function Histogram({ metric }) {
  const [ref, W] = useWidth(420)
  const [tip, setTip] = useState(null)
  const { histogram: h, baseline: b } = metric
  const H = 230, m = { l: 36, r: 14, t: 26, b: 30 }
  if (!h.bins.length) return null
  const xsAll = [h.bins[0].x0, h.bins.at(-1).x1, ...h.curve.map((p) => p[0])]
  const marks = [['LCL', b.lcl], ['CL', b.cl], ['UCL', b.ucl], ['LSL', metric.lsl], ['USL', metric.usl], ['Goal', metric.goal]]
    .filter(([, v]) => v !== null && v !== undefined)
  const lo = Math.min(...xsAll, ...marks.map((k) => k[1])), hi = Math.max(...xsAll, ...marks.map((k) => k[1]))
  const x = scale(lo, hi, m.l, W - m.r)
  const cmax = Math.max(...h.bins.map((d) => d.count), ...h.curve.map((p) => p[1])) * 1.08
  const y = scale(0, cmax, H - m.b, m.t)
  const yt = ticks(0, cmax, 4)
  const curve = h.curve.map((p) => `${x(p[0])},${y(p[1])}`).join(' ')
  return (
    <div className="chart" ref={ref}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histogram of ${metric.name}`}>
        <g className="grid">{yt.map((t) => <line key={t} x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} />)}</g>
        <g className="axis">
          {yt.map((t) => <text key={t} x={m.l - 6} y={y(t) + 3.5} textAnchor="end">{t}</text>)}
          {ticks(lo, hi, 5).map((t) => <text key={t} x={x(t)} y={H - m.b + 15} textAnchor="middle">{fmt(t)}</text>)}
        </g>
        {h.bins.map((d, i) => {
          const bx = x(d.x0) + 1, bw = Math.max(x(d.x1) - x(d.x0) - 2, 1)
          return (
            <g key={i} onMouseEnter={(e) => {
              const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(), box = ref.current.getBoundingClientRect()
              setTip({ x: ((bx + bw / 2) / W) * r.width + r.left - box.left, y: (y(d.count) / H) * r.height + r.top - box.top,
                content: <><b>{d.count}</b> point{d.count === 1 ? '' : 's'}<br />{fmt(d.x0)} – {fmt(d.x1)}</> })
            }} onMouseLeave={() => setTip(null)}>
              <rect x={bx} y={m.t} width={bw} height={H - m.b - m.t} fill="transparent" />
              <path d={`M${bx},${y(0)} V${y(d.count) + 3} q0,-3 3,-3 H${bx + bw - 3} q3,0 3,3 V${y(0)} Z`} fill="var(--series)" opacity=".8" />
            </g>
          )
        })}
        {curve && <polyline points={curve} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />}
        {marks.map(([l, v], i) => (
          <g key={l}>
            <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={['LSL', 'USL', 'Goal'].includes(l) ? 'var(--brand-accent)' : 'var(--muted)'}
              strokeDasharray={l === 'CL' ? undefined : '4 3'} />
            <text className="lbl" x={x(v)} y={m.t - 6 - (i % 2) * 0} textAnchor="middle">{l}</text>
          </g>
        ))}
      </svg>
      <Tip tip={tip} />
      <div className="legend">
        <span><i style={{ background: 'var(--series)', borderRadius: 2 }} />Included points</span>
        {h.curve.length > 0 && <span><i className="line" style={{ background: 'var(--ink)' }} />{metric.fit.best} fit</span>}
        <span><i className="dash" />Baseline limits</span>
        {marks.some(([l]) => ['LSL', 'USL', 'Goal'].includes(l)) && <span><i className="dash" style={{ borderTopColor: 'var(--brand-accent)' }} />Spec / goal</span>}
      </div>
    </div>
  )
}
