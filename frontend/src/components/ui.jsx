import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { RAG_LABEL } from '../helpers.js'

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  const timer = useRef()
  const show = useCallback((msg, kind = 'ok') => {
    clearTimeout(timer.current)
    setT({ msg, kind })
    timer.current = setTimeout(() => setT(null), kind === 'err' ? 5000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast ${t.kind === 'err' ? 'err' : ''}`} role="status">{t.msg}</div>}
    </ToastCtx.Provider>
  )
}

export function Modal({ title, onClose, children, footer, wide, extra }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          {extra}
          {!extra && <span className="spacer" />}
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Confirm({ title, body, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}
        onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirmLabel}</button>
    </>}>
      <p className="muted" style={{ margin: 0 }}>{body}</p>
    </Modal>
  )
}

export const Pill = ({ cls = 'grey', dot, children, title }) => (
  <span className={`pill ${cls}`} title={title}>{dot && <span className="dot" />}{children}</span>
)
export const RagPill = ({ rag }) => <Pill cls={rag || 'grey'} dot>{RAG_LABEL[rag] || '—'}</Pill>

export function RagBar({ s }) {
  if (!s || !s.metrics) return <div className="ragbar" />
  const w = (n) => `${(n / s.metrics) * 100}%`
  return (
    <div className="ragbar" title={`${s.green} green · ${s.amber} amber · ${s.red} red`}>
      {s.green > 0 && <span className="g" style={{ width: w(s.green) }} />}
      {s.amber > 0 && <span className="a" style={{ width: w(s.amber) }} />}
      {s.red > 0 && <span className="r" style={{ width: w(s.red) }} />}
    </div>
  )
}

export const Kpi = ({ label, value, unit, sub }) => (
  <div className="kpi">
    <div className="micro">{label}</div>
    <div className="v">{value}{unit && <small>{unit}</small>}</div>
    {sub && <div className="s">{sub}</div>}
  </div>
)

export const Empty = ({ glyph = '∅', title, children }) => (
  <div className="empty"><div className="big">{glyph}</div><div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div><div style={{ marginTop: 4 }}>{children}</div></div>
)

export const Seg = ({ value, options, onChange }) => (
  <div className="seg" role="tablist">
    {options.map(([v, l]) => <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)} role="tab" aria-selected={value === v}>{l}</button>)}
  </div>
)

export const PageHead = ({ crumbs, title, sub, children }) => (
  <div className="page-head">
    <div>
      {crumbs && <div className="crumbs">{crumbs}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </div>
    <span className="spacer" />
    {children}
  </div>
)

export const Spinner = () => <span className="spinner" aria-label="Loading" />
export const Loading = () => <div className="empty"><Spinner /></div>
