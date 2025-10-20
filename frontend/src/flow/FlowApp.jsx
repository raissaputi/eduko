// src/flow/FlowApp.jsx
import { useMemo, useState, useEffect } from "react"
import { logEvent } from '../lib/logger'

// OPTIONAL: if your paths differ, comment these two and keep the placeholders in <TaskScreen/>
import FEWorkbench from "../fe/FEWorkbench"
import ChatPanel from "../components/Chat/ChatPanel"    

const STEPS = [
  "Gate",
  "Consent",
  "PreTest",
  "Task",
  "PostTest",
  "Survey",
  "Finish",
]

async function startSession(name, test) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE || ''}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, test })
  })
  const { session_id } = await res.json()
  sessionStorage.setItem('session_id', session_id)
  return session_id
}

export default function FlowApp() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState("")
  const [testType, setTestType] = useState("fe") // "fe" | "dv"
  const [sessionId] = useState(() => crypto.randomUUID())

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  useEffect(() => {
    logEvent('screen_view', { step, screen: STEPS[step] })
  }, [step])
  
  useEffect(() => {
    let last = 0
    const mm = e => {
      const now = performance.now()
      if (now - last > 120) {
        last = now
        logEvent('mouse_move', { x: e.clientX, y: e.clientY })
      }
    }
    const clk = e => logEvent('mouse_click', { x: e.clientX, y: e.clientY })

    window.addEventListener('mousemove', mm)
    window.addEventListener('click', clk)
    return () => {
      window.removeEventListener('mousemove', mm)
      window.removeEventListener('click', clk)
    }
  }, [])

  return (
    <div style={{minHeight:"100vh", background:"#0b0d12", color:"#e8eaf0", display:"grid", gridTemplateRows:"auto 1fr"}}>
      {/* Header */}
      <header style={{borderBottom:"1px solid #21242c", padding:"12px 16px", display:"flex", gap:12, alignItems:"center"}}>
        <strong>LLM Study Flow</strong>
        <span style={{opacity:.7}}>• step {step + 1} / {STEPS.length} — {STEPS[step]}</span>
        <span style={{marginLeft:"auto", opacity:.7}}>
          Session: <code>{sessionId.slice(0,8)}</code> {name && <>• {name} ({testType.toUpperCase()})</>}
        </span>
      </header>

      {/* Body */}
      <main style={{padding:16}}>
        {step === 0 && (
          <GateScreen
            name={name}
            setName={setName}
            testType={testType}
            setTestType={setTestType}
            onNext={next}
          />
        )}
        {step === 1 && <ConsentScreen onNext={next} onBack={back} />}
        {step === 2 && <PrePostScreen label="Pre-test" onNext={next} onBack={back} />}
        {step === 3 && (
          <TaskScreen
            testType={testType}
            sessionId={sessionId}
            onNext={next}
            onBack={back}
          />
        )}
        {step === 4 && <PrePostScreen label="Post-test" onNext={next} onBack={back} />}
        {step === 5 && <SurveyScreen onNext={next} onBack={back} />}
        {step === 6 && <FinishScreen onBack={back} />}
      </main>
    </div>
  )
}

function GateScreen({ name, setName, testType, setTestType, onNext }) {
  const canNext = name.trim().length >= 2

  const onStart = async () => {
    const sid = await startSession(name, testType)
    logEvent('session_start', { name, test: testType, session_id: sid })
    onNext()
  }

  return (
    <Card title="Gate • Choose test & identify participant">
      <div style={{display:"grid", gap:12, maxWidth:520}}>
        <label style={{display:"grid", gap:6}}>
          <span>Participant name</span>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g., Dani Putra"
            style={inputStyle}
          />
        </label>
        <label style={{display:"grid", gap:6}}>
          <span>Test type</span>
          <select value={testType} onChange={e => setTestType(e.target.value)} style={inputStyle}>
            <option value="fe">Front-End (HTML/CSS/JS)</option>
            <option value="dv">Data Visualization (matplotlib)</option>
          </select>
        </label>
        <div style={{display:"flex", gap:8}}>
          <button style={btnPrimary(canNext)} disabled={!canNext} onClick={onStart}>
            Start
          </button>
        </div>
      </div>
    </Card>
  )
}

function ConsentScreen({ onNext, onBack }) {
  const [ok, setOk] = useState(false)
  return (
    <Card title="Consent & Instructions">
      <p style={{opacity:.9, lineHeight:1.5}}>
        This study collects prompts, code attempts, timing, mouse activity, and optional screen recording.
        Your data will be used for research on how students interact with LLMs during programming tasks.
      </p>
      <label style={{display:"flex", gap:8, alignItems:"center", margin:"12px 0"}}>
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
        <span>I understand and consent to participate.</span>
      </label>
      <div style={{display:"flex", gap:8}}>
        <button style={btnSecondary} onClick={onBack}>Back</button>
        <button style={btnPrimary(ok)} disabled={!ok} onClick={() => { logEvent('consent_next'); onNext() }}>Continue</button>
      </div>
    </Card>
  )
}

function PrePostScreen({ label, onNext, onBack }) {
  return (
    <Card title={label}>
      <div style={{display:"grid", gap:10, maxWidth:720}}>
        <textarea placeholder="Short answers here…" rows={6} style={inputStyle} />
        <div style={{display:"flex", gap:8}}>
          <button style={btnSecondary} onClick={onBack}>Back</button>
          <button style={btnPrimary(true)} onClick={onNext}>Submit</button>
        </div>
      </div>
    </Card>
  )
}

function TaskScreen({ testType, sessionId, onNext, onBack }) {
  // Minimal placeholder problem + editor state
  const problem = useMemo(() => ({
    id: testType === "fe" ? "fe-hello" : "dv-hello",
    title: testType === "fe" ? "Build a simple card" : "Plot a sine curve",
    starter_html:
      "<!doctype html><html><body><h1>Hello 👋</h1><p>Edit me.</p><style>body{font-family:system-ui;padding:16px}</style></body></html>",
  }), [testType])

  const [doc, setDoc] = useState(problem.starter_html)

  return (
    <Card title={`Task • ${testType.toUpperCase()}`}>
      <div style={{display:"grid", gridTemplateColumns:"2fr 1fr", gap:12, minHeight:420}}>
        {/* Workbench area */}
        <div style={{minWidth:0}}>
          {/* If FEWorkbench is available, render it. Else show a placeholder. */}
          {FEWorkbench ? (
            <FEWorkbench
              problem={problem}
              value={doc}
              onChange={v => setDoc(v)}
              onSubmit={() => alert("Submit clicked (placeholder)")}
            />
          ) : (
            <div style={placeholderBox}>FE Workbench goes here</div>
          )}
        </div>

        {/* Chat side panel */}
        <aside style={{border:"1px solid #21242c", borderRadius:12, padding:12, minWidth:0, background:"#0f1115"}}>
          {ChatPanel ? (
            <ChatPanel problem={problem} sessionId={sessionId} />
          ) : (
            <div style={placeholderBox}>Chat panel goes here</div>
          )}
        </aside>
      </div>

      <div style={{display:"flex", gap:8, marginTop:12}}>
        <button style={btnSecondary} onClick={onBack}>Back</button>
        <button style={btnPrimary(true)} onClick={onNext}>Finish Task</button>
      </div>
    </Card>
  )
}

function SurveyScreen({ onNext, onBack }) {
  return (
    <Card title="Survey / Reflection">
      <div style={{display:"grid", gap:10, maxWidth:720}}>
        <textarea placeholder="Tell us about your strategy, how you used (or avoided) the chatbot, etc." rows={6} style={inputStyle} />
        <div style={{display:"flex", gap:8}}>
          <button style={btnSecondary} onClick={onBack}>Back</button>
          <button style={btnPrimary(true)} onClick={onNext}>Submit</button>
        </div>
      </div>
    </Card>
  )
}

function FinishScreen({ onBack }) {
  return (
    <Card title="All set 🎉">
      <p style={{opacity:.9}}>Thanks! You can now call the next participant.</p>
      <button style={btnSecondary} onClick={onBack}>Go back</button>
    </Card>
  )
}

/* ---- tiny UI helpers ---- */
function Card({ title, children }) {
  return (
    <div style={{maxWidth:1200, margin:"0 auto"}}>
      <h2 style={{margin:"8px 0 16px"}}>{title}</h2>
      <div style={{border:"1px solid #21242c", borderRadius:16, padding:16, background:"#0d1017"}}>
        {children}
      </div>
    </div>
  )
}
const inputStyle = {
  background:"#0f1115", color:"#e8eaf0", border:"1px solid #21242c",
  borderRadius:10, padding:"10px 12px", outline:"none"
}
const btnPrimary = (enabled) => ({
  background: enabled ? "#3b82f6" : "#2a2f3a",
  color:"#fff", border:"none", borderRadius:10, padding:"10px 14px", cursor: enabled ? "pointer" : "not-allowed"
})
const btnSecondary = {
  background:"#1a1f28", color:"#e8eaf0", border:"1px solid #2a2f3a", borderRadius:10, padding:"10px 14px", cursor:"pointer"
}
const placeholderBox = {
  border:"1px dashed #2a2f3a", borderRadius:12, minHeight:360, display:"grid", placeItems:"center", opacity:.8
}
