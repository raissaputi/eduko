import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import ChatPanel from "../components/Chat/ChatPanel.jsx";

export default function TaskScreen() {
  const [chatPct, setChatPct] = useState(28);
  const dragR = useRef({ on: false, startX: 0, startPct: 28 });
  const [innerPct, setInnerPct] = useState(55);
  const dragInner = useRef({ on: false, startX: 0, startPct: 55 });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const problem = { id: "fe1_simplecard", title: "FE #1: Simple card" };
  const sessionId = sessionStorage.getItem("session_id") || "anon";
  const threadId = `${sessionId}:fe:${problem.id}`;

  const [htmlCode, setHtmlCode] = useState(`<!-- FE #1: Simple card -->
<div style="display:grid;place-items:center;height:100vh;font-family:Inter,Arial">
  <div style="border:1px solid #ddd;border-radius:12px;padding:24px;max-width:320px;box-shadow:0 8px 30px rgba(0,0,0,.08)">
    <h2 style="margin:0 0 8px 0">Hello 👋</h2>
    <p style="margin:0;color:#555">Edit the HTML on the left, then click Run ▶ to refresh the preview.</p>
  </div>
</div>`);

  const iframeRef = useRef(null);

  // --- Manual Run only (no auto preview)
  const runPreview = () => {
    if (iframeRef.current) iframeRef.current.srcdoc = htmlCode;
    console.log("[LOG] run_click", { len: htmlCode.length });
  };

  // --- Resizer for inner divider (HTML | Preview)
  useEffect(() => {
    const onMove = (e) => {
      if (!dragInner.current.on) return;
      const dx = e.clientX - dragInner.current.startX;
      const next = dragInner.current.startPct + (dx / window.innerWidth) * 100;
      setInnerPct(Math.min(75, Math.max(25, next)));
    };
    const onUp = () => { dragInner.current.on = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);
  const startDragInner = (e) => {
    dragInner.current = { on: true, startX: e.clientX, startPct: innerPct };
    document.body.style.cursor = "col-resize";
  };

  // --- Resizer for outer divider (Workbench | Chat)
  useEffect(() => {
    const onMove = (e) => {
      if (!dragR.current.on) return;
      const dx = dragR.current.startX - e.clientX;
      const next = dragR.current.startPct + (dx / window.innerWidth) * 100;
      setChatPct(Math.min(45, Math.max(22, next)));
    };
    const onUp = () => {
      dragR.current.on = false;
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

  return (
    <section className="vstack">
      {/* Header */}
      <div className="hstack" style={{ padding: "8px 2px" }}>
        <div className="title">Task – FE</div>
        <span className="badge">{problem.title}</span>
        <div className="spacer" />
        <div className="timer">00:06:26</div>
      </div>

      {/* Main Grid */}
      <div
        className="tri-grid"
        style={{ gridTemplateColumns: `minmax(540px, 1fr) 8px minmax(320px, ${chatPct}%)` }}
      >
        {/* LEFT: Workbench */}
        <div style={{ minHeight: 0, height: "100%" }}>
          <div className="wb-grid" style={{ gridTemplateColumns: `${innerPct}% 8px ${100 - innerPct}%` }}>
            {/* HTML editor */}
            <div className="wb-pane">
              <div className="wb-head" style={{ justifyContent: "space-between" }}>
                <div className="wb-title">HTML</div>
                <button className="btn" onClick={runPreview}>Run ▶</button>
              </div>
              <div className="wb-body">
                <Editor
                  height="100%"
                  defaultLanguage="html"
                  theme="vs-dark"
                  value={htmlCode}
                  onChange={(v) => setHtmlCode(v ?? "")}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                  }}
                />
              </div>
            </div>

            {/* Divider */}
            <div className="wb-divider" onMouseDown={startDragInner}>
              <span className="grabber" />
            </div>

            {/* Preview */}
            <div className="wb-pane">
              <div className="wb-head" style={{ justifyContent: "space-between" }}>
                <div className="wb-title">Preview</div>
                <button className="btn" onClick={() => setIsFullscreen(true)}>Fullscreen ⤢</button>
              </div>
              <div className="wb-body" style={{ overflow: "hidden" }}>
                <iframe
                  ref={iframeRef}
                  title="preview"
                  sandbox="allow-scripts"
                  style={{
                    width: "100%",
                    height: "100%",
                    border: 0,
                    background: "#fff",
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT Divider */}
        <div className="outer-divider" onMouseDown={startDragRight} aria-label="Resize chat">
          <span className="handle" />
        </div>

        {/* Chat panel */}
        <aside className="pane chat-pane" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="pane-head"><h3>Assistant</h3></div>
          <div className="pane-body" style={{ minHeight: 0 }}>
            <ChatPanel key={problem.id} problem={problem} threadId={threadId} />
          </div>
        </aside>
      </div>

      {/* Fullscreen Overlay for Preview */}
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
            <button className="btn" onClick={() => setIsFullscreen(false)}>Close ✕</button>
          </div>
          <iframe
            title="preview-full"
            sandbox="allow-scripts"
            srcDoc={htmlCode}
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
    </section>
  );
}
