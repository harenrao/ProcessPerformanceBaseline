const KEY = 'gt_token'

export const token = {
  get: () => { try { return localStorage.getItem(KEY) } catch { return null } },
  set: (t) => { try { localStorage.setItem(KEY, t) } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(KEY) } catch { /* private mode */ } },
}

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

async function request(method, path, body, { form, raw } = {}) {
  const headers = {}
  const t = token.get()
  if (t) headers.Authorization = `Bearer ${t}`
  let payload
  if (form) payload = form
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
  const res = await fetch(`/api${path}`, { method, headers, body: payload })
  if (res.status === 401 && path !== '/auth/login') { token.clear(); onUnauthorized() }
  if (!res.ok) {
    let msg = res.statusText
    try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail) } catch { /* not json */ }
    throw new ApiError(res.status, msg)
  }
  if (raw) return res
  return res.status === 204 ? null : res.json()
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, file) => { const f = new FormData(); f.append('file', file); return request('POST', p, undefined, { form: f }) },
  login: (username, password) => {
    const f = new URLSearchParams({ username, password })
    return fetch('/api/auth/login', { method: 'POST', body: f }).then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, r.status === 429 ? 'Too many attempts. Try again in a few minutes.' : 'Invalid username or password.')
      return r.json()
    })
  },
  download: async (p, fallbackName) => {
    const res = await request('GET', p, undefined, { raw: true })
    const blob = await res.blob()
    const cd = res.headers.get('Content-Disposition') || ''
    const name = (cd.match(/filename="?([^"]+)"?/) || [])[1] || fallbackName
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: name })
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
