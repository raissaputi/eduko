import { useEffect, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { logEvent } from '../../lib/logger'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function OutputView({ out }) {
  const { stdout, stderr, plot } = out || {}
  const hasAnything = (stdout && stdout.trim()) || (stderr && stderr.trim()) || plot
  if (!hasAnything) {
    return <div className="empty-state">No output</div>
  }
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {plot && (
        <img src={`data:image/png;base64,${plot}`} alt="Plot" style={{ maxWidth:'100%', height:'auto' }} />
      )}
      {stdout && stdout.trim() && (
        <pre style={{ whiteSpace:'pre-wrap', margin:0 }}>{stdout}</pre>
      )}
      {stderr && stderr.trim() && (
        <pre style={{ whiteSpace:'pre-wrap', color:'#f77', margin:0 }}>{stderr}</pre>
      )}
    </div>
  )
}

export default function DVNotebook({ sessionId, problem, isSubmitted }) {
  const [cells, setCells] = useState([
    { source: 'df.head()' , output: null, height: 40 },
  ])
  const bodyRef = useRef(null)
  const endRef = useRef(null)
  const editorRefs = useRef([])
  
  const addCell = () => {
    setCells(cs => [...cs, { source:'', output:null, height: 40 }])
    // Scroll to bottom after adding
    setTimeout(()=>{
      endRef.current?.scrollIntoView({ behavior:'smooth', block:'end' })
    }, 0)
  }
  const delCell = (idx) => setCells(cs => cs.filter((_,i)=>i!==idx))
  const updCell = (idx, src) => setCells(cs => cs.map((c,i)=> i===idx? {...c, source: src }: c))

  const runAll = async () => {
    const payload = {
      session_id: sessionStorage.getItem('session_id') || 'anon',
      problem_id: problem?.id ?? 'dv',
      cells: cells.map(c => ({ source: c.source }))
    }
    try {
      logEvent('run_click', { problem_id: payload.problem_id, via: 'dvnb_all', cells: payload.cells.length })
      const res = await fetch(`${API}/api/submissions/run/dvnb`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Run failed')
      const outs = data?.cells || []
      setCells(cs => cs.map((c,i) => ({ ...c, output: outs[i] || null })))
    } catch (e) {
      alert('Failed to run notebook')
      console.error(e)
    }
  }

  const runOne = async (idx) => {
    // Run up to this index to respect state/variables
    const upto = cells.slice(0, idx+1)
    const payload = {
      session_id: sessionStorage.getItem('session_id') || 'anon',
      problem_id: problem?.id ?? 'dv',
      cells: upto.map(c => ({ source: c.source }))
    }
    try {
      logEvent('run_click', { problem_id: payload.problem_id, via: 'dvnb_cell', index: idx })
      const res = await fetch(`${API}/api/submissions/run/dvnb`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Run failed')
      const out = (data?.cells || [])[idx]
      setCells(cs => cs.map((c,i) => i===idx ? { ...c, output: out || null } : c))
    } catch (e) {
      alert('Failed to run cell')
      console.error(e)
    }
  }

  return (
    <div
      className="wb-pane"
      style={{ 
        flex: 1, 
        minHeight: 0, 
        display: 'flex', 
        flexDirection: 'column',
        overflow: 'hidden' // Important: container should not scroll
      }}
    >
      {/* Sticky header with controls */}
      <div 
        className="wb-head" 
        style={{ 
          display:'flex', 
          gap:8, 
          alignItems:'center',
          flexShrink: 0 // Prevent header from shrinking
        }}
      >
        <div className="wb-title">Notebook</div>
        <button className="btn" onClick={runAll} disabled={isSubmitted}>Run All ▶</button>
      </div>

      {/* Scrollable notebook content */}
      <div 
        ref={bodyRef} 
        className="wb-body nb-body" 
        style={{
          flex: '1 1 0', // Key: allow shrinking to 0
          minHeight: 0, // Key: allow flex child to shrink below content size
          overflowY: 'auto', // Enable vertical scrolling
          overflowX: 'hidden',
          padding: '8px 12px 20px 16px'
        }}
      >
        {/* Content wrapper - normal block flow */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {cells.map((cell, idx) => (
            <div key={idx} className="nb-cell">
              <div className="nb-cell-head">
                <div className="nb-head-left">
                  <button className="btn icon" onClick={()=>runOne(idx)} disabled={isSubmitted} title="Run cell">▶</button>
                  <div className="nb-title">In [{idx+1}]</div>
                </div>
                <div className="nb-head-right">
                  <button className="btn icon" onClick={()=>delCell(idx)} disabled={isSubmitted || cells.length<=1} title="Delete cell">🗑</button>
                </div>
              </div>
              <div className="nb-editor" style={{ height: cell.height }}>
                <Editor
                  height={cell.height}
                  defaultLanguage="python"
                  theme="vs-dark"
                  value={cell.source}
                  onChange={(v)=>updCell(idx, v)}
                  onMount={(editor) => {
                    editorRefs.current[idx] = editor
                    // Measure and set height initially and on changes
                    const computeHeight = () => {
                      try {
                        const model = editor.getModel()
                        const lineCount = model ? model.getLineCount() : 1
                        // Monaco content height gives a good fit. Fallback to lines*lineHeight.
                        const contentH = editor.getContentHeight ? editor.getContentHeight() : (lineCount * 20)
                        const minLineH = 20 // approximate single-line height
                        const desired = Math.max(contentH + 12, minLineH + 12) // ensure at least 1 line
                        // clamp to avoid overly tall cells; allow generous space
                        const clamped = Math.min(Math.max(desired, 32), 520)
                        setCells(cs => cs.map((c,i)=> i===idx? { ...c, height: clamped } : c))
                      } catch (_e) {}
                    }
                    // Initial compute
                    setTimeout(computeHeight, 0)
                    // Recompute on content size change
                    editor.onDidContentSizeChange(computeHeight)
                    editor.onDidPaste(computeHeight)
                    editor.onDidPaste((e) => {
                      const text = editor.getModel().getValueInRange(e);
                      logEvent('code_paste', { len: text.length, kind: 'dvnb' })
                    });
                  }}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    readOnly: isSubmitted,
                    automaticLayout: true,
                  }}
                />
              </div>
              <div className="nb-output">
                <OutputView out={cell.output} />
              </div>
            </div>
          ))}
          
          {/* Add cell control at bottom */}
          <div className="nb-add-row">
            <button className="pill-add" onClick={addCell} disabled={isSubmitted}>
              <span className="plus">+</span>
              <span>Code</span>
            </button>
          </div>
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}