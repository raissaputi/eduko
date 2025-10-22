import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import FEWorkbench from "../fe/FEWorkbench.jsx";
import ChatPanel from "../components/Chat/ChatPanel.jsx";
import { logEvent } from "../lib/logger.js";

export default function TaskScreen({ testType }) {
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || "";
  const sessionId = sessionStorage.getItem("session_id") || "anon";

  const [problems, setProblems] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [codeById, setCodeById] = useState({});
  const [elapsedById, setElapsedById] = useState({});
  const runningRef = useRef({});
  const tickRef = useRef(null);

  useEffect(() => {
    fetch(`${API}/api/problems/${testType}`)
      .then(r => r.json())
      .then(list => {
        const two = list.slice(0, 2);
        setProblems(two);
        if (two[0]) setActiveId(two[0].id);
      });
  }, [API, testType]);

  useEffect(() => {
    if (!activeId) return;
    logEvent("task_enter", { problem_id: activeId });

    const now = Date.now();
    if (!runningRef.current[activeId]?.startedAt) {
      runningRef.current[activeId] = { startedAt: now };
    } else {
      runningRef.current[activeId].startedAt = now;
    }

    clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      const run = runningRef.current[activeId];
      if (!run?.startedAt) return;
      setElapsedById(prev => ({ ...prev, [activeId]: (prev[activeId] || 0) + 1000 }));
    }, 1000);

    return () => {
      clearInterval(tickRef.current);
      const run = runningRef.current[activeId];
      if (run?.startedAt) {
        const delta = Date.now() - run.startedAt;
        setElapsedById(prev => ({ ...prev, [activeId]: (prev[activeId] || 0) + delta }));
        runningRef.current[activeId].startedAt = null;
      }
      logEvent("task_leave", { problem_id: activeId });
    };
  }, [activeId]);

  const activeProblem = useMemo(
    () => problems.find(p => p.id === activeId) || null,
    [problems, activeId]
  );

  const setCodeFor = (pid, val) =>
    setCodeById(prev => ({ ...prev, [pid]: val }));

  const elapsedMs = elapsedById[activeId] || 0;
  const formatHMS = (ms) => {
    const s = Math.floor(ms / 1000);
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const submitFE = async ({ htmlDocument }) => {
    if (!activeProblem) return;
    const pid = activeProblem.id;
    logEvent("submit_click", { problem_id: pid, elapsed_ms: elapsedMs });
    const res = await fetch(`${API}/api/submissions/fe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, problem_id: pid, code: htmlDocument })
    });
    if (!res.ok) { alert("Submit failed. Try again."); return; }
    logEvent("submit_final", { problem_id: pid, elapsed_ms: elapsedMs });
    alert(`Submitted final for ${pid.toUpperCase()}!`);
  };

  const threadId = useMemo(
    () => (activeProblem ? `${sessionId}:${activeProblem.id}` : null),
    [sessionId, activeProblem?.id]
  );

  if (!problems.length) {
    return (
      <section className="card">
        <div className="title">Task – {testType.toUpperCase()}</div>
        <div className="subtle">Loading problems...</div>
      </section>
    );
  }

  return (
    <section className="vstack">
      <div className="hstack">
        <div className="title">Task – {testType.toUpperCase()}</div>
        {activeProblem && <span className="badge">{activeProblem.title}</span>}
        <div className="r timer">⏱ {formatHMS(elapsedMs)}</div>
      </div>

      {/* problem tabs */}
      <div className="tabs">
        {problems.map(p => (
          <button
            key={p.id}
            onClick={() => setActiveId(p.id)}
            className={`tab ${p.id === activeId ? "active" : ""}`}
            title={p.title}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* main grid */}
      {activeProblem && (
        <div className="grid-task">
          <FEWorkbench
            problem={activeProblem}
            value={codeById[activeProblem.id] || ""}
            onChange={(v) => setCodeFor(activeProblem.id, v)}
            onSubmit={submitFE}
            fullHeight
          />
          <div className="card" style={{padding:0, display:"flex", flexDirection:"column"}}>
            <div className="toolbar" style={{padding:"10px 12px", borderBottom:"1px solid var(--border)"}}>
              <strong>Assistant</strong>
              <div className="spacer" />
              <span className="badge">Live</span>
            </div>
            <div style={{flex:1, minHeight:0}}>
              <ChatPanel key={activeProblem.id} problem={activeProblem} threadId={threadId} />
            </div>
          </div>
        </div>
      )}

      <div className="hstack" style={{marginTop:10}}>
        <button className="btn ghost" onClick={()=>nav("../survey")}>Done → Survey</button>
      </div>
    </section>
  );
}
