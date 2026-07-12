/**
 * api.js — Thin fetch wrapper.
 * Automatically attaches the JWT Bearer token and redirects to /login on 401.
 */

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token')

  const headers = {
    ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  }

  const res = await fetch(path, { ...options, headers })

  if (res.status === 401) {
    localStorage.clear()
    window.location.href = '/login'
    return null
  }

  return res
}

export const api = {
  get:    (path)         => apiFetch(path, { method: 'GET' }),
  post:   (path, data)   => apiFetch(path, { method: 'POST',   body: JSON.stringify(data) }),
  patch:  (path, data)   => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(data) }),
  delete: (path)         => apiFetch(path, { method: 'DELETE' }),
  upload: (path, form)   => apiFetch(path, { method: 'POST',   body: form }),  // FormData
}

/** Decode the JWT payload without a library. */
export function parseToken(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}
