// src/fe/FEWorkbench.jsx
import { useRef, useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { logEvent } from '../lib/logger'

function debounce(fn, ms = 300) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}

export default function FEWorkbench({ problem, value, onChange, onSubmit }) {
  const iframeRef = useRef(null)
  const [fs, setFs] = useState(false)            // fullscreen for Preview
  const [code, setCode] = useState(value || '')  // local mirror in case parent is slow

  // log when task opens (problem changes)
  useEffect(() => {
    logEvent('task_open', { problem_id: problem?.id })
  }, [problem?.id])

  // keep local code mirror in sync with parent value
  useEffect(() => {
    setCode(value || '')
  }, [value])

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

  const run = () => {
    logEvent('run_click', { problem_id: problem?.id })
    if (!iframeRef.current) return
    // prefer latest local code (handles Monaco onChange timings)
    iframeRef.current.srcdoc = code || ''
    logEvent('preview_refresh', { problem_id: problem?.id })
  }

  // live render (optional). if you prefer manual Run only, comment this out
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = code || ''
    }
  }, [code])

  const handleSubmit = async () => {
    logEvent('submit_click', { problem_id: problem?.id })
    if (onSubmit) {
      await onSubmit({ htmlDocument: code || '' })
      logEvent('submit_sent', { problem_id: problem?.id, via: 'prop' })
      return
    }
    // fallback example: POST directly to backend
    await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/submissions/fe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionStorage.getItem('session_id'),
        problem_id: problem?.id,
        code
      })
    })
    logEvent('submit_sent', { problem_id: problem?.id, via: 'api' })
  }

  return (
    <>
      {/* Normal layout */}
      <div
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          minHeight: 0
        }}
      >
        {/* Editor */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #2d2f36',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 0
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #2d2f36',
              background: '#0f1115'
            }}
          >
            <strong>{problem?.title || 'Editor'}</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title='Run in preview'>Run ▶</button>
              <button onClick={handleSubmit} title='Submit to backend'>Submit ⬆</button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height='100%'
              defaultLanguage='html'
              theme='vs-dark'
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

        {/* Preview */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #2d2f36',
            borderRadius: 8,
            overflow: 'hidden',
            minHeight: 0
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid #2d2f36',
              background: '#0f1115'
            }}
          >
            <strong>Preview</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title='Refresh preview'>Refresh</button>
              <button onClick={() => setFs(true)} title='Open fullscreen'>Fullscreen ⤢</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <iframe
              ref={iframeRef}
              title='preview'
              // keep sandboxed (scripts only)
              sandbox='allow-scripts'
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                background: 'white',
                display: 'block'
              }}
            />
          </div>
        </div>
      </div>

      {/* Fullscreen overlay for Preview */}
      {fs && (
        <div
          role='dialog'
          aria-modal='true'
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,.75)',
            zIndex: 50000,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              borderBottom: '1px solid #2d2f36',
              background: '#0f1115'
            }}
          >
            <strong>Preview — Fullscreen</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={run} title='Refresh'>Refresh</button>
              <button onClick={() => setFs(false)} title='Close fullscreen'>Close ✕</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <iframe
              title='preview-fullscreen'
              sandbox='allow-scripts'
              srcDoc={code || ''}
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                background: 'white',
                display: 'block',
                borderRadius: 8
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
