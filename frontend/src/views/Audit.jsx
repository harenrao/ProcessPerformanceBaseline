import React, { useEffect, useState } from 'react'
import { api } from '../api.js'
import { Empty, Loading, PageHead } from '../components/ui.jsx'
import { datetime } from '../helpers.js'

export default function Audit({ p, crumbs }) {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { api.get(`/projects/${p.id}/audit`).then(setRows) }, [p.id])
  const shown = (rows || []).filter((r) => `${r.action} ${r.detail} ${r.user_name}`.toLowerCase().includes(q.toLowerCase()))
  const csv = () => {
    const lines = [['When', 'User', 'Action', 'Detail'], ...shown.map((r) => [r.at, r.user_name, r.action, r.detail || ''])]
    const blob = new Blob([lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `audit_${p.id}.csv` })
    a.click()
  }
  return (
    <>
      <PageHead crumbs={crumbs} title="Audit trail" sub="Every upload, exclusion, run and approval, with who and when. Evidence for appraisal.">
        <input className="input" style={{ width: 220 }} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn btn-ghost" onClick={csv} disabled={!rows?.length}>Export CSV</button>
      </PageHead>
      <div className="card pad-0">
        {!rows ? <Loading /> : shown.length === 0 ? <Empty title="No activity" /> : (
          <div className="table-wrap"><table className="t">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th></tr></thead>
            <tbody>{shown.map((r) => (
              <tr key={r.id}><td className="muted num" style={{ whiteSpace: 'nowrap' }}>{datetime(r.at)}</td><td>{r.user_name}</td>
                <td style={{ fontWeight: 500 }}>{r.action}</td><td className="muted">{r.detail}</td></tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  )
}
