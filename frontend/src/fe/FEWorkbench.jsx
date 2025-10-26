// src/fe/FEWorkbench.jsx
import { useRef, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { logEvent } from '../lib/logger.js'

function debounce(fn, ms = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export default function FEWorkbench({ problem, value, onChange, onSubmit, fullHeight }) {
  const iframeRef = useRef(null)

  // layout + state
  const [fs, setFs] = useState(false)             // fullscreen for Preview
  const [code, setCode] = useState(value || '')   // local mirror
  const [firstPreview, setFirstPreview] = useState(false)
  const [firstSubmit, setFirstSubmit] = useState(false)
  const [colPct, setColPct] = useState(50)        // inner split: HTML|Preview (% left)
  const dragRef = useRef({ dragging: false, startX: 0, startPct: 50 })

  const API = import.meta.env.VITE_API_BASE || ''
  const sessionId = sessionStorage.getItem('session_id') || 'anon'

  // log when task opens (problem changes)
  useEffect(() => { logEvent('task_open', { problem_id: problem?.id }) }, [problem?.id])

  // keep local code mirror in sync with parent value
  useEffect(() => { setCode(value || '') }, [value])

  // debounced code_change logger
  const debouncedCodeLog = debounce(v => {
    logEvent('code_change', { problem_id: problem?.id, len: v?.length || 0 })
  }, 300)

  // unified onChange that updates parent + logs
  const handleEditorChange = v => {
    const next = v ?? ''
    setCode(next)
    onChange?.(next)
    debouncedCodeLog(next)
  }

  // run/preview + snapshot
  const run = async () => {
    logEvent('run_click', { problem_id: problem?.id })
    if (iframeRef.current) {
      iframeRef.current.srcdoc = code || ''
      logEvent('preview_refresh', { problem_id: problem?.id })
    }

    try {
      const resp = await fetch(`${API}/api/snapshots/fe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          problem_id: problem?.id,
          code
        })
      })
      if (resp.ok) {
        const { filename } = await resp.json()
        logEvent('snapshot_saved', { problem_id: problem?.id, filename })
      } else {
        console.warn('snapshot failed', resp.status)
      }
    } catch (e) {
      console.warn('snapshot error', e)
    }

    if (!firstPreview) {
      setFirstPreview(true)
      logEvent('first_preview', { problem_id: problem?.id })
    }
  }

  // submit (prefer parent handler if provided)
  const doSubmit = async () => {
    logEvent('submit_click', { problem_id: problem?.id })
    if (onSubmit) {
      await onSubmit({ htmlDocument: code })
    } else {
      // fallback internal submit
      try {
        await fetch(`${API}/api/submissions/fe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            problem_id: problem?.id,
            code
          })
        })
        logEvent('submit_sent', { problem_id: problem?.id, via: 'api' })
      } catch (e) {
        console.warn('submit error', e)
      }
    }
    if (!firstSubmit) {
      setFirstSubmit(true)
      logEvent('first_submit', { problem_id: problem?.id })
    }
  }

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && e.key === 'Enter') { e.preventDefault(); run() }
      if (mod && (e.key === 's' || e.key === 'S')) { e.preventDefault(); doSubmit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, problem?.id])

  // drag to resize inner split (HTML | Preview)
  useEffect(() => {
    const onMove = e => {
      if (!dragRef.current.dragging) return
      const dx = e.clientX - dragRef.current.startX
      const next = Math.min(75, Math.max(25, dragRef.current.startPct + (dx / window.innerWidth) * 100))
      setColPct(next)
    }
    const onUp = () => { dragRef.current.dragging = false; document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])
  const startDrag = e => {
    dragRef.current = { dragging: true, startX: e.clientX, startPct: colPct }
    document.body.style.cursor = 'col-resize'
  }

  return (
    <>
      {/* Workbench: HTML | divider | Preview */}
      <div
        className="wb-grid"
        style={{
          height: fullHeight ? '100%' : 'auto',
          display: 'grid',
          gridTemplateColumns: `${colPct}% 8px ${100 - colPct}%`,
          gap: 0,
          minHeight: 0
        }}
      >
        {/* HTML editor */}
        <div className="wb-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #2d2f36', borderRadius: 8, overflow: 'hidden' }}>
          <div className="wb-head" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #2d2f36', background: '#0f1115' }}>
            <div className="wb-title" style={{ fontWeight: 600, fontSize: 13 }}>HTML</div>
            <div style={{ flex: 1 }} />
            <div className="wb-actions" style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title="Run (Ctrl/Cmd+Enter)">Run ▶</button>
              <button onClick={doSubmit} title="Submit (Ctrl/Cmd+S)">Submit ⬆</button>
            </div>
          </div>
          <div className="wb-body" style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              defaultLanguage="html"
              theme="vs-dark"
              value={code}
              onChange={v => handleEditorChange(v)}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on'
              }}
            />
          </div>
        </div>

        {/* inner divider */}
        <div className="wb-divider" onMouseDown={startDrag} style={{ position: 'relative', cursor: 'col-resize', background: 'transparent' }}>
          <span className="grabber" style={{ position: 'absolute', left: '50%', top: 0, transform: 'translateX(-50%)', width: 2, height: '100%', background: 'rgba(255,255,255,0.12)' }} />
        </div>

        {/* Preview */}
        <div className="wb-pane" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, border: '1px solid #2d2f36', borderRadius: 8, overflow: 'hidden' }}>
          <div className="wb-head" style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #2d2f36', background: '#0f1115' }}>
            <div className="wb-title" style={{ fontWeight: 600, fontSize: 13 }}>Preview</div>
            <div style={{ flex: 1 }} />
            <div className="wb-actions" style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title="Refresh preview">Refresh</button>
              <button onClick={() => setFs(true)} title="Fullscreen">Fullscreen ⤢</button>
            </div>
          </div>
          <div className="wb-body" style={{ flex: 1, minHeight: 0 }}>
            <iframe
              ref={iframeRef}
              title="preview"
              sandbox="allow-scripts"
              style={{ width: '100%', height: '100%', border: 0, background: 'white', display: 'block' }}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay for Preview */}
      {fs && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.75)',
            zIndex: 50000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #2d2f36', background: '#0f1115' }}>
            <strong>Preview — Fullscreen</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title="Refresh">Refresh</button>
              <button onClick={() => setFs(false)} title="Close fullscreen">Close ✕</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <iframe
              title="preview-fullscreen"
              sandbox="allow-scripts"
              srcDoc={code || ''}
              style={{ width: '100%', height: '100%', border: 0, background: 'white', display: 'block', borderRadius: 8 }}
            />
          </div>
        </div>
      )}
    </>
  )
}
