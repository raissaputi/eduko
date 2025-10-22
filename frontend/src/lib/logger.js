const API = import.meta.env.VITE_API_BASE || ''
let buf = []
let timer = null

export function logEvent(type, payload = {}) {
  const session_id = sessionStorage.getItem('session_id') || 'anon'
  buf.push({
    event_type: type,
    payload,
    client_ts: Date.now(),
    session_id
  })
  if (!timer) timer = setTimeout(flush, 800)
}

async function flush() {
  const out = buf
  buf = []
  timer = null
  const body = JSON.stringify({ events: out })

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(`${API}/api/events/batch`, new Blob([body], { type: 'application/json' }))
    if (ok) return
  }
  await fetch(`${API}/api/events/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

// eslint-disable-next-line no-empty
window.addEventListener('beforeunload', () => { try { flush() } catch {} })
