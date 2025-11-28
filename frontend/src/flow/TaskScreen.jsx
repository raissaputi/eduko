/* eslint-disable no-unused-vars */
// src/screens/TaskScreen.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ChatPanel from "../components/Chat/ChatPanel.jsx";
import FEWorkbench from "../components/workbench/FEWorkbench.jsx";
import { logEvent } from '../lib/logger.js'
import DVNotebook from '../components/workbench/DVNotebook';
import ScreenRecorder from '../lib/recorder.js';

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
  const [imageZoom, setImageZoom] = useState(false);

  const [codeById, setCodeById] = useState({});
  const [timeLeftById, setTimeLeftById] = useState({});
  const [submittedById, setSubmittedById] = useState({});
  const [dvOutputById, setDvOutputById] = useState({});
  const intervalRef = useRef(null);
  const iframeRef = useRef(null);
  
  // For DV notebook: ref to get cells for submission
  const notebookRef = useRef(null);

  const firstPreviewById = useRef({}); // to emit first_preview once per problem
  
  // Screen recording
  const recorderRef = useRef(null);
  const [recordingStatus, setRecordingStatus] = useState('idle'); // idle | starting | recording | stopping | error
  const recordingCounterRef = useRef(0); // Track how many recordings per problem

  // lightweight debounce for code_change
  const codeDebounceRef = useRef(null);
  const debounce = (fn, ms = 350) => (...args) => {
    clearTimeout(codeDebounceRef.current);
    codeDebounceRef.current = setTimeout(() => fn(...args), ms);
  };

  // Tab switch detection and warning
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        logEvent("tab_hidden", { 
          problem_id: active?.id,
          timestamp: Date.now() 
        });
      } else {
        logEvent("tab_visible", { 
          problem_id: active?.id,
          timestamp: Date.now() 
        });
      }
    };

    const handleBeforeUnload = (e) => {
      // Warn user before leaving/closing the page
      const message = "You have an ongoing task. Are you sure you want to leave?";
      e.preventDefault();
      e.returnValue = message; // Modern browsers
      return message; // Older browsers
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [active?.id]);

  // Code persistence helpers
  const getCodeStorageKey = (problemId) => {
    return `code_${sessionId}_${testType}_${problemId}`;
  };

  const saveCodeToStorage = (problemId, code) => {
    try {
      sessionStorage.setItem(getCodeStorageKey(problemId), code);
    } catch (e) {
      console.warn('Failed to save code:', e);
    }
  };

  const loadCodeFromStorage = (problemId) => {
    try {
      return sessionStorage.getItem(getCodeStorageKey(problemId)) || null;
    } catch (e) {
      console.warn('Failed to load code:', e);
      return null;
    }
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
        two.forEach(p => { 
          timers[p.id] = THIRTY_MIN_MS; 
          // Check for saved code first, fallback to starter_code
          const savedCode = loadCodeFromStorage(p.id);
          codes[p.id] = savedCode || p.starter_code || ""; 
        });
        setTimeLeftById(timers);
        setCodeById(codes);
      } catch (e) {
        console.warn("problem load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, [API, testType]);

  // Save code changes to sessionStorage
  useEffect(() => {
    Object.entries(codeById).forEach(([problemId, code]) => {
      if (code !== undefined && code !== null) {
        saveCodeToStorage(problemId, code);
      }
    });
  }, [codeById]);

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
      logEvent("code_change", { 
        problem_id: active.id, 
        len: (next || "").length,
        kind: testType
      });
    })();
  };

  // Helper to stop recording and upload
  const stopAndUploadRecording = async (problemId) => {
    if (!recorderRef.current) {
      console.warn('[Recording] No recorder ref, skipping upload');
      logEvent("recording_no_ref", { problem_id: problemId });
      return;
    }
    
    setRecordingStatus('stopping');
    logEvent("recording_stop", { problem_id: problemId });
    
    try {
      // Stop and upload final recording
      recordingCounterRef.current += 1;
      const { blob } = await recorderRef.current.stop();
      
      console.log('[Recording] Stopped, blob size:', blob ? blob.size : 'null');
      
      if (!blob) {
        console.warn('[Recording] No blob returned from recorder');
        logEvent("recording_no_blob", { problem_id: problemId });
        return;
      }
      
      if (blob.size === 0) {
        console.warn('[Recording] Blob is empty (0 bytes)');
        logEvent("recording_empty_blob", { problem_id: problemId });
        return;
      }
      
      // Upload final recording with proper naming
      const filename = `recording_${problemId}_part${recordingCounterRef.current}_${Date.now()}.webm`;
      const formData = new FormData();
      formData.append('recording', blob, filename);
      formData.append('problem_id', problemId);
      
      console.log('[Recording] Uploading:', filename, 'Size:', blob.size);
      
      const response = await fetch(`${API}/api/sessions/${sessionId}/recording`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
      }
      
      console.log('[Recording] Upload successful');
      logEvent("recording_uploaded", { 
        problem_id: problemId,
        size_bytes: blob.size,
        recording_number: recordingCounterRef.current,
        is_final: true
      });
      
      // Reset counter for next problem
      recordingCounterRef.current = 0;
    } catch (error) {
      console.error('[Recording] Upload error:', error);
      logEvent("recording_upload_error", { 
        problem_id: problemId,
        error: error.message 
      });
    } finally {
      setRecordingStatus('idle');
    }
  };

  const submit = async () => {
    if (!active) return;
    const pid = active.id;
    
    // Confirm before submitting
    const confirmed = window.confirm("Apakah Anda yakin ingin submit? Setelah submit, Anda tidak bisa mengubah jawaban lagi.");
    if (!confirmed) return;
    
    // For DV notebook mode, get cells from notebook component
    if (testType === 'dv' && notebookRef.current) {
      const cells = notebookRef.current.getCells()
      logEvent("submit_click", { problem_id: pid, cells: cells.length });
      try {
        const res = await fetch(`${API}/api/submissions/dvnb`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            session_id: sessionId, 
            problem_id: pid, 
            cells: cells.map(c => ({ source: c.source }))
          })
        });
        if (!res.ok) { alert("Submit failed. Try again."); return; }
      setSubmittedById(prev => ({ ...prev, [pid]: true }));
      logEvent("submit_final", { problem_id: pid, cells: cells.length });
        
        // Show success immediately
        alert("Submitted!");
        
        // Stop and upload recording in background (non-blocking)
        stopAndUploadRecording(pid).catch(err => console.warn('Recording upload failed:', err));
        
        // Trigger compile_human after submission
        fetch(`${API}/api/sessions/${sessionId}/compile`, {
          method: 'POST'
        }).catch(err => console.warn('Compile failed:', err));
      } catch (e) {
        console.warn("submit error", e);
        alert("Submit error.");
      }
      return;
    }
    
    // For FE and legacy DV
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
      
      // Show success immediately
      alert("Submitted!");
      
      // Stop and upload recording in background (non-blocking)
      stopAndUploadRecording(pid).catch(err => console.warn('Recording upload failed:', err));
      
      // Trigger compile_human after submission
      fetch(`${API}/api/sessions/${sessionId}/compile`, {
        method: 'POST'
      }).catch(err => console.warn('Compile failed:', err));
    } catch (e) {
      console.warn("submit error", e);
      alert("Submit error.");
    }
  };

  const markStepCompleted = (step) => {
    const sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) return;
    
    try {
      const stored = sessionStorage.getItem(`flow_state_${sessionId}`);
  const state = stored ? JSON.parse(stored) : { completedSteps: [], currentMaxStep: 'info' };
      
      if (!state.completedSteps.includes(step)) {
        state.completedSteps.push(step);
      }
      state.currentMaxStep = 'survey';
      
      sessionStorage.setItem(`flow_state_${sessionId}`, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to update flow state:', e);
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
      // mark task as completed before moving to survey
      markStepCompleted('task');
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

    // Start screen recording when task begins
    const startRecording = async () => {
      let attempts = 0;
      const maxAttempts = 10; // Prevent infinite loop
      
      while (attempts < maxAttempts) {
        attempts++;
        
        // Show instruction before triggering browser dialog
        const confirmed = window.confirm(
          "Pengaturan Rekaman Layar\n\n" +
          "Pada dialog berikutnya:\n" +
          "1. Klik tab 'Entire Screen' di bagian atas\n" +
          "2. Pilih layar penuh Anda dari preview\n" +
          "3. Klik tombol 'Share'\n\n" +
          "Rekaman ini membantu kami memahami proses penyelesaian masalah Anda.\n\n" +
          "Siap untuk melanjutkan?"
        );
        
        if (!confirmed) {
          // User clicked Cancel on instruction dialog - ask again
          const retry = window.confirm(
            "Rekaman layar diperlukan untuk berpartisipasi dalam penelitian ini.\n\n" +
            "Apakah Anda ingin mencoba lagi?"
          );
          if (!retry) {
            setRecordingStatus('error');
            logEvent("recording_declined", { problem_id: active.id, attempts });
            alert("Tidak dapat melanjutkan tanpa rekaman layar. Silakan refresh halaman untuk memulai ulang.");
            return;
          }
          continue; // Ask again
        }

        if (!recorderRef.current) {
          recorderRef.current = new ScreenRecorder();
        }
        
        setRecordingStatus('starting');
        
        // Handler when user stops recording via browser button
        const handleUserStopped = async (chunks) => {
          // Upload current recording before restarting
          recordingCounterRef.current += 1;
          
          if (chunks && chunks.length > 0) {
            const blob = new Blob(chunks, { type: 'video/webm' });
            
            // Upload this segment with proper naming
            const filename = `recording_${active.id}_part${recordingCounterRef.current}_${Date.now()}.webm`;
            const formData = new FormData();
            formData.append('recording', blob, filename);
            formData.append('problem_id', active.id);
            
            fetch(`${API}/api/sessions/${sessionId}/recording`, {
              method: 'POST',
              body: formData
            }).then(() => {
              logEvent("recording_segment_uploaded", { 
                problem_id: active.id,
                recording_number: recordingCounterRef.current,
                size_bytes: blob.size
              });
            }).catch(err => {
              console.warn('Upload failed:', err);
              logEvent("recording_segment_upload_failed", { 
                problem_id: active.id,
                recording_number: recordingCounterRef.current,
                error: err.message
              });
            });
          }
          
          setRecordingStatus('error');
          logEvent("recording_stopped_by_user", { 
            problem_id: active.id,
            recording_number: recordingCounterRef.current
          });
          
          // Immediately restart recording
          setTimeout(() => {
            alert(
              "Rekaman layar telah dihentikan.\n\n" +
              "Rekaman diperlukan selama sesi berlangsung.\n\n" +
              "Silakan mulai rekaman kembali."
            );
            startRecording(); // Restart the whole flow
          }, 100);
        };
        
        const result = await recorderRef.current.start(handleUserStopped);
        
        if (result.success) {
          setRecordingStatus('recording');
          logEvent("recording_start", { 
            problem_id: active.id,
            session_id: sessionId,
            attempts 
          });
          return; // Success - exit loop
        } else {
          // Failed (user cancelled browser dialog or error)
          setRecordingStatus('idle');
          logEvent("recording_failed_attempt", { 
            problem_id: active.id,
            error: result.error,
            attempts 
          });
          
          const retry = window.confirm(
            "Pengaturan rekaman layar gagal.\n\n" +
            "Ini mungkin terjadi jika Anda:\n" +
            "- Klik Cancel\n" +
            "- Memilih tab atau window alih-alih Entire Screen\n" +
            "- Menolak izin\n\n" +
            "Silakan coba lagi dan pastikan memilih 'Entire Screen'."
          );
          
          if (!retry) {
            setRecordingStatus('error');
            logEvent("recording_declined", { problem_id: active.id, attempts });
            alert("Tidak dapat melanjutkan tanpa rekaman layar. Silakan refresh halaman untuk memulai ulang.");
            return;
          }
          // Loop will continue to ask again
        }
      }
      
      // Max attempts reached
      setRecordingStatus('error');
      logEvent("recording_max_attempts", { problem_id: active.id });
      alert("Terlalu banyak percobaan gagal. Silakan refresh halaman dan coba lagi.");
    };

    startRecording();

    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeftById(prev => {
        const cur = prev[active.id] ?? THIRTY_MIN_MS;
        const next = Math.max(0, cur - 1000);
        return { ...prev, [active.id]: next };
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [active?.id, sessionId]);

  const lastTickRef = useRef({});
  useEffect(() => {
    if (!active) return;
    const left = timeLeftById[active.id];
    if (left === 0 && lastTickRef.current[active.id] !== 0) {
      lastTickRef.current[active.id] = 0;
      logEvent("auto_submit", { problem_id: active.id });
      
      // Show "Waktu habis!" popup
      alert("⏰ Waktu habis! Jawaban Anda akan dikirim otomatis.");
      
      (async () => {
        try {
          const pid = active.id;
          
          // For DV notebook mode, submit cells
          if (testType === 'dv' && notebookRef.current) {
            const cells = notebookRef.current.getCells();
            await fetch(`${API}/api/submissions/dvnb`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                session_id: sessionId, 
                problem_id: pid, 
                cells: cells.map(c => ({ source: c.source }))
              })
            });
            logEvent("submit_final", { problem_id: pid, cells: cells.length, auto: true });
          } else {
            // For FE, submit code
            const code = codeById[pid] || "";
            await fetch(`${API}/api/submissions/${testType}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ session_id: sessionId, problem_id: pid, code })
            });
            logEvent("submit_final", { problem_id: pid, size: code.length, auto: true });
          }
          
          // Stop and upload recording
          await stopAndUploadRecording(pid);
        } catch { /* noop */ }
        setSubmittedById(prev => ({ ...prev, [active.id]: true }));
        goNext();
      })();
    }
  }, [timeLeftById, active?.id, API, sessionId, testType, codeById, notebookRef]);

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
        <section className={`problem-bar ${testType==='fe' ? 'fe-sticky' : ''}`}>
          {testType === 'fe' ? (() => {
            const hasGif = !!active.media_url;
            return (
              <div className="problem-grid" style={{gridTemplateColumns: hasGif ? '280px 1fr' : '1fr'}}>
                {hasGif && (
                  <div className="problem-gif" onClick={() => setImageZoom(true)} style={{cursor: 'pointer'}}>
                    <img src={active.media_url} alt="Demo" />
                  </div>
                )}
                <div className="problem-meta" style={{display:'flex', flexDirection:'column', gap:8}}>
                  <div>
                    <div className="title" style={{marginBottom:4}}>{active.title}</div>
                    {active.statement && <div className="statement" style={{marginBottom:8}}>{active.statement}</div>}
                  </div>
                  <div style={{display:'flex', alignItems:'center', gap:10, marginTop:'auto'}}>
                    <div className="timer">⏱ {formatMMSS(leftMs)}</div>
                    {recordingStatus === 'recording' && <span style={{color:'#e74c3c', fontSize:12}}>🔴 Recording</span>}
                    {recordingStatus === 'error' && <span style={{color:'#95a5a6', fontSize:12, cursor:'help'}} title="Screen recording permission denied">⚠️ No recording</span>}
                    <button className="btn primary" onClick={submit} disabled={submitted}>{submitted ? 'Submitted':'Submit'}</button>
                    <button className="btn" onClick={goNext} disabled={!submitted && (timeLeftById[active.id] ?? THIRTY_MIN_MS) > 0}>{isLast ? 'Finish → Survey':'Next →'}</button>
                  </div>
                </div>
              </div>
            );
          })() : (
            <>
              {active.media_url ? (
                <div className="problem-grid" style={{gridTemplateColumns: '280px 1fr'}}>
                  <div className="problem-gif" onClick={() => setImageZoom(true)} style={{cursor: 'pointer'}}>
                    <img src={active.media_url} alt="Demo" />
                  </div>
                  <div className="problem-meta" style={{display:'flex', flexDirection:'column', gap:8}}>
                    <div>
                      <div className="title" style={{marginBottom:4}}>{active.title}</div>
                      {active.statement && <div className="statement" style={{marginBottom:8}}>{active.statement}</div>}
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:10, marginTop:'auto'}}>
                      <div className="timer">⏱ {formatMMSS(leftMs)}</div>
                      {recordingStatus === 'recording' && <span style={{color:'#e74c3c', fontSize:12}}>🔴 Recording</span>}
                      {recordingStatus === 'error' && <span style={{color:'#95a5a6', fontSize:12, cursor:'help'}} title="Screen recording permission denied">⚠️ No recording</span>}
                      <button className="btn primary" onClick={submit} disabled={submitted}>{submitted ? 'Submitted':'Submit'}</button>
                      <button className="btn" onClick={goNext} disabled={!submitted && (timeLeftById[active.id] ?? THIRTY_MIN_MS) > 0}>{isLast ? 'Finish → Survey':'Next →'}</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="left">
                    <div className="title">{active.title}</div>
                    {active.statement && <div className="statement">{active.statement}</div>}
                  </div>
                  <div className="right">
                    <div className="timer">⏱ {formatMMSS(leftMs)}</div>
                    {recordingStatus === 'recording' && <span style={{color:'#e74c3c', fontSize:12}}>🔴 Recording</span>}
                    {recordingStatus === 'error' && <span style={{color:'#95a5a6', fontSize:12, cursor:'help'}} title="Screen recording permission denied">⚠️ No recording</span>}
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
                </>
              )}
            </>
          )}
        </section>

        {/* Workbench */}
        <section className="wb-card">
          {testType === 'fe' ? (
            <FEWorkbench
              code={code}
              onEdit={onEdit}
              onRun={runPreview}
              isSubmitted={submitted}
              onFullscreen={() => setIsFullscreen(true)}
              innerPct={innerPct}
              onDragInner={startDragInner}
            />
            ) : (
              <DVNotebook
                ref={notebookRef}
                sessionId={sessionId}
                problem={active}
                isSubmitted={submitted}
              />
            )}
          </section>
        </div>

        {/* Middle vertical divider (resizable chat width) */}
        <div className="outer-divider" onMouseDown={startDragRight}>
          <span className="handle" />
        </div>

        {/* RIGHT column: Assistant (sticky & scrollable) */}
        <aside className="chat-col">
          <div className="pane-head">
            <h3>Assistant</h3>
          </div>
          <div className="pane-body">
            <ChatPanel problem={active} threadId={threadId} />
          </div>
        </aside>
      </div>

      {/* Fullscreen Preview overlay (unchanged) */}
      {isFullscreen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.8)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
              background: "#0f0f15",
              color: "#fff",
            }}
          >
            <strong>Preview — Fullscreen</strong>
            <button className="btn" onClick={() => setIsFullscreen(false)}>
              Close ✕
            </button>
          </div>
          <iframe
            title="preview-full"
            sandbox="allow-scripts"
            srcDoc={code}
            style={{
              flex: 1,
              width: "100%",
              height: "100%",
              border: 0,
              background: "#fff",
            }}
          />
        </div>
      )}

      {/* Image Zoom Modal */}
      {imageZoom && active?.media_url && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setImageZoom(false)}
        >
          <img
            src={active.media_url}
            alt="Demo (zoomed)"
            style={{
              maxWidth: "95%",
              maxHeight: "95%",
              objectFit: "contain",
              cursor: "zoom-out",
            }}
            onClick={(e) => {
              e.stopPropagation();
              setImageZoom(false);
            }}
          />
        </div>
      )}
    </section>
  );
}
