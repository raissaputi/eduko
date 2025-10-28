/* eslint-disable no-unused-vars */
// src/screens/TaskScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import ChatPanel from "../components/Chat/ChatPanel.jsx";
import { logEvent } from '../lib/logger.js'

const THIRTY_MIN_MS = 30 * 60 * 1000;

export default function TaskScreen({ testType = "fe" }) {
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || "";
  const sessionId = sessionStorage.getItem("session_id") || "anon";

  const [problems, setProblems] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const active = problems[activeIdx] || null;

  const [chatPct, setChatPct] = useState(28);
  const dragR = useRef({ on: false, startX: 0, startPct: 28 });
  const [innerPct, setInnerPct] = useState(55);
  const dragInner = useRef({ on: false, startX: 0, startPct: 55 });

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [codeById, setCodeById] = useState({});
  const [timeLeftById, setTimeLeftById] = useState({});
  const [submittedById, setSubmittedById] = useState({});
  const intervalRef = useRef(null);
  const iframeRef = useRef(null);

  const firstPreviewById = useRef({}); // to emit first_preview once per problem

  // lightweight debounce for code_change
  const codeDebounceRef = useRef(null);
  const debounce = (fn, ms = 350) => (...args) => {
    clearTimeout(codeDebounceRef.current);
    codeDebounceRef.current = setTimeout(() => fn(...args), ms);
  };


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/problems/${testType}`);
        const list = await r.json();
        const two = (list || []).slice(0, 2);
        if (cancelled) return;
        setProblems(two);
        setActiveIdx(0);
        const timers = {}; const codes = {};
        two.forEach(p => { timers[p.id] = THIRTY_MIN_MS; codes[p.id] = ""; });
        setTimeLeftById(timers);
        setCodeById(codes);
      } catch (e) {
        console.warn("problem load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [API, testType]);

  const threadId = useMemo(
    () => (active ? `${sessionId}:${testType}:${active.id}` : null),
    [sessionId, testType, active?.id]
  );

  // ---------- manual run only + snapshot logging (FE only) ----------
  const runPreview = async () => {
    if (!active) return;
    const pid = active.id;
    const code = codeById[pid] || "";
    logEvent("run_click", { problem_id: pid });

    // Only FE has preview snapshots
    if (testType === "fe") {
      try {
        await fetch(`${API}/api/submissions/snapshots/fe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId, problem_id: pid, code })
        });
      } catch { /* empty */ }
    }
    if (iframeRef.current) iframeRef.current.srcdoc = code;
    logEvent("preview_refresh", { problem_id: pid });
    if (!firstPreviewById.current[pid]) {
      firstPreviewById.current[pid] = true;
      logEvent("first_preview", { problem_id: pid });
    }
  };

  const onEdit = (v) => {
    if (!active) return;
    const next = v ?? "";
    setCodeById(prev => ({ ...prev, [active.id]: next }));
    // debounced code_change log (length only to keep it light)
    debounce(() => {
      logEvent("code_change", { problem_id: active.id, len: (next || "").length });
    })();
  };

  const submit = async () => {
    if (!active) return;
    const pid = active.id;
    const code = codeById[pid] || "";
    logEvent("submit_click", { problem_id: pid, size: code.length });
    try {
      const res = await fetch(`${API}/api/submissions/${testType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, problem_id: pid, code })
      });
      if (!res.ok) { alert("Submit failed. Try again."); return; }
      setSubmittedById(prev => ({ ...prev, [pid]: true }));
      logEvent("submit_final", { problem_id: pid, size: code.length });
      alert("Submitted!");
    } catch (e) {
      console.warn("submit error", e);
      alert("Submit error.");
    }
  };

  const goNext = () => {
    if (activeIdx < problems.length - 1) {
    // task_leave for current problem
    if (active) logEvent("task_leave", { problem_id: active.id });
      setActiveIdx(i => i + 1);
    } else {
    if (active) logEvent("task_leave", { problem_id: active.id });
    logEvent("task_finish", { count: problems.length });
      // all done → survey
      nav("../survey");
    }
  };

  // defensive: leave event if user closes page mid-question
  useEffect(() => {
    const handler = () => {
      if (active) logEvent("task_leave", { problem_id: active.id, reason: "unload" });
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active?.id]);

  useEffect(() => {
    if (!active) return;
    // task_enter when a question becomes active
    logEvent("task_enter", { problem_id: active.id });

    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeftById(prev => {
        const cur = prev[active.id] ?? THIRTY_MIN_MS;
        const next = Math.max(0, cur - 1000);
        return { ...prev, [active.id]: next };
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active?.id]);

  const lastTickRef = useRef({});
  useEffect(() => {
    if (!active) return;
    const left = timeLeftById[active.id];
    if (left === 0 && lastTickRef.current[active.id] !== 0) {
      lastTickRef.current[active.id] = 0;
      logEvent("auto_submit", { problem_id: active.id });
      (async () => {
        try {
          const pid = active.id;
          const code = codeById[pid] || "";
          await fetch(`${API}/api/submissions/${testType}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: sessionId, problem_id: pid, code })
          });
          logEvent("submit_final", { problem_id: pid, size: code.length, auto: true });
        } catch { /* noop */ }
        setSubmittedById(prev => ({ ...prev, [active.id]: true }));
        goNext();
      })();
    }
  }, [timeLeftById, active?.id, API, sessionId, testType, codeById]);

  const leftMs = active ? (timeLeftById[active.id] ?? THIRTY_MIN_MS) : THIRTY_MIN_MS;
  const formatMMSS = (ms) => {
    const s = Math.floor(ms / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  useEffect(() => {
    const onMove = (e) => {
      if (dragR.current.on) {
        const dx = dragR.current.startX - e.clientX;
        const next = dragR.current.startPct + (dx / window.innerWidth) * 100;
        setChatPct(Math.min(45, Math.max(22, next)));
      }
      if (dragInner.current.on) {
        const dx = e.clientX - dragInner.current.startX;
        const next = dragInner.current.startPct + (dx / window.innerWidth) * 100;
        setInnerPct(Math.min(75, Math.max(25, next)));
      }
    };
    const onUp = () => {
      dragR.current.on = false;
      dragInner.current.on = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  const startDragRight = (e) => {
    dragR.current = { on: true, startX: e.clientX, startPct: chatPct };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const startDragInner = (e) => {
    dragInner.current = { on: true, startX: e.clientX, startPct: innerPct };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  if (!active) {
    return (
      <section className="vstack">
        <div className="pane" style={{ padding: 16 }}>Loading problems…</div>
      </section>
    );
  }

  const code = codeById[active.id] || "";
  const submitted = !!submittedById[active.id];
  const isLast = activeIdx === problems.length - 1;

  return (
  <section className="task-page">
    {/* Header */}
    <header className="task-head">
      <div className="left">
        <div className="title">Task – {testType.toUpperCase()}</div>
        <span className="badge">{activeIdx + 1} / {problems.length || 2}</span>
      </div>
    </header>

    {/* Two-column content area */}
    <div
      className="task-wrap"
      style={{ gridTemplateColumns: `1fr 8px minmax(320px, ${chatPct}%)` }}
    >
      {/* LEFT column */}
      <div className="left-col">
        {/* Problem statement + controls */}
        <section className="problem-bar">
          <div className="left">
            <div className="title">{active.title}</div>
            {active.statement && <div className="statement">{active.statement}</div>}
          </div>
          <div className="right">
            <div className="timer">⏱ {formatMMSS(leftMs)}</div>
            <button className="btn primary" onClick={submit} disabled={submitted}>
              {submitted ? "Submitted" : "Submit"}
            </button>
            <button
              className="btn"
              onClick={goNext}
              disabled={!submitted && (timeLeftById[active.id] ?? THIRTY_MIN_MS) > 0}
            >
              {isLast ? "Finish → Survey" : "Next →"}
            </button>
          </div>
        </section>

        {/* Workbench (HTML | divider | Preview) */}
        <section className="wb-card">
          <div className="wb-grid" style={{ gridTemplateColumns: `${innerPct}% 8px ${100 - innerPct}%` }}>
            {/* HTML */}
            <div className="wb-pane">
              <div className="wb-head">
                <div className="wb-title">HTML</div>
                <button className="btn" onClick={runPreview} disabled={submitted}>Run ▶</button>
              </div>
              <div className="wb-body">
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  theme="vs-dark"
                  value={code}
                  onChange={onEdit}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    readOnly: submitted,
                  }}
                />
              </div>
            </div>

            {/* inner divider */}
            <div className="wb-divider" onMouseDown={startDragInner}>
              <span className="grabber" />
            </div>

            {/* Preview */}
            <div className="wb-pane">
              <div className="wb-head">
                <div className="wb-title">Preview</div>
                <button className="btn" onClick={() => setIsFullscreen(true)}>Fullscreen ⤢</button>
              </div>
              <div className="wb-body">
                <iframe ref={iframeRef} title="preview" sandbox="allow-scripts" />
              </div>
            </div>
          </div>
        </section>
        
      </div>

      {/* Middle vertical divider (resizable chat width) */}
      <div className="outer-divider" onMouseDown={startDragRight}>
        <span className="handle" />
      </div>

      {/* RIGHT column: Assistant (sticky & scrollable) */}
      <aside className="chat-col">
        <div className="pane-head"><h3>Assistant</h3></div>
        <div className="pane-body">
          <ChatPanel key={active.id} problem={active} threadId={threadId} />
        </div>
      </aside>
    </div>

    {/* Fullscreen Preview overlay (unchanged) */}
    {isFullscreen && (
      <div style={{
        position:"fixed", inset:0, background:"rgba(0,0,0,.8)",
        zIndex:9999, display:"flex", flexDirection:"column"
      }}>
        <div style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"10px 14px", borderBottom:"1px solid var(--border)", background:"#0f0f15", color:"#fff"
        }}>
          <strong>Preview — Fullscreen</strong>
          <button className="btn" onClick={() => setIsFullscreen(false)}>Close ✕</button>
        </div>
        <iframe title="preview-full" sandbox="allow-scripts" srcDoc={code}
                style={{ flex:1, width:"100%", height:"100%", border:0, background:"#fff" }} />
      </div>
    )}
  </section>
);
}
