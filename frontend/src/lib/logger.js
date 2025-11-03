const API = import.meta.env.VITE_API_BASE || ''
let buf = []
let timer = null

export function logEvent(type, payload = {}) {
  const session_id = sessionStorage.getItem('session_id') || 'anon'
  const test_type = sessionStorage.getItem('testType') || 'fe'
  buf.push({
    event_type: type,
    payload,
    client_ts: Date.now(),
    session_id,
    test_type
  })
  if (!timer) timer = setTimeout(flush, 800)
}

async function flush() {
  const out = buf
  buf = []
  timer = null
  const body = JSON.stringify({ 
    session_id: sessionStorage.getItem('session_id') || 'anon',
    events: out 
  })

  if (navigator.sendBeacon) {
    const ok = navigator.sendBeacon(`${API}/api/events/bulk`, new Blob([body], { type: 'application/json' }))
    if (ok) return
  }
  await fetch(`${API}/api/events/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
}

// eslint-disable-next-line no-empty
window.addEventListener('beforeunload', () => { try { flush() } catch {} })
