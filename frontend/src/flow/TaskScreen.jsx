import { useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import ChatPanel from "../components/Chat/ChatPanel.jsx"
// import { logEvent } from "../lib/logger.js";

export default function TaskScreen() {
  // Right pane width (% of viewport)
  const [chatPct, setChatPct] = useState(28);
  const dragR = useRef({ on: false, startX: 0, startPct: 28 });
  const [innerPct, setInnerPct] = useState(55);          // HTML width %
  const dragInner = useRef({ on: false, startX: 0, startPct: 55 });
  const problem = { id: "fe1_simplecard", title: "FE #1: Simple card" };
  const sessionId = sessionStorage.getItem("session_id") || "anon";
  const threadId = `${sessionId}:fe:${problem.id}`;


  useEffect(() => {
    const onMove = (e) => {
      if (!dragInner.current.on) return;
      const dx = e.clientX - dragInner.current.startX;
      const next = dragInner.current.startPct + (dx / window.innerWidth) * 100;
      setInnerPct(Math.min(75, Math.max(25, next)));     // clamp 25–75%
    };
    const onUp = () => { dragInner.current.on = false; document.body.style.cursor = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const startDragInner = (e) => {
    dragInner.current = { on: true, startX: e.clientX, startPct: innerPct };
    document.body.style.cursor = "col-resize";
  };

  // HTML code state
  const [htmlCode, setHtmlCode] = useState(`<!-- FE #1: Simple card -->
<div style="display:grid;place-items:center;height:100vh;font-family:Inter,Arial">
  <div style="border:1px solid #ddd;border-radius:12px;padding:24px;max-width:320px;box-shadow:0 8px 30px rgba(0,0,0,.08)">
    <h2 style="margin:0 0 8px 0">Hello 👋</h2>
    <p style="margin:0;color:#555">Edit the HTML on the left. This preview updates live.</p>
  </div>
</div>`);

  // Live preview ref
  const iframeRef = useRef(null);

  // Debounce utility
  const useDebounced = (value, ms = 150) => {
    const [v, setV] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setV(value), ms);
      return () => clearTimeout(t);
    }, [value, ms]);
    return v;
  };

  // Live update iframe on code change (debounced)
  const debouncedHtml = useDebounced(htmlCode, 150);
  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = debouncedHtml || "";
    }
  }, [debouncedHtml]);

  // Right divider drag
  useEffect(() => {
    const onMove = (e) => {
      if (!dragR.current.on) return;
      const dx = dragR.current.startX - e.clientX; // drag left => wider chat
      const next = dragR.current.startPct + (dx / window.innerWidth) * 100;
      setChatPct(Math.min(45, Math.max(22, next))); // clamp 22–45%
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
      {/* Header with nicer padding */}
      <div className="hstack" style={{ padding: "8px 2px" }}>
        <div className="title">Task – FE</div>
        <span className="badge">FE #1: Simple card</span>
        <div className="spacer" />
        <div className="timer">00:06:26</div>
      </div>

      {/* Trio grid: [Work area] | [divider] | [Chat] */}
      <div
        className="tri-grid"
        style={{
          gridTemplateColumns: `minmax(540px, 1fr) 8px minmax(320px, ${chatPct}%)`,
        }}
      >
        {/* LEFT: for now a vertical stack of two panes (HTML editor, Preview) */}
      <div style={{ minHeight: 0, height: "100%" }}>
        <div
          className="wb-grid"
          style={{ gridTemplateColumns: `${innerPct}% 8px ${100 - innerPct}%` }}
        >
          {/* HTML (Monaco) */}
          <div className="wb-pane">
            <div className="wb-head">
              <div className="wb-title">HTML</div>
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

          {/* inner divider */}
          <div className="wb-divider" onMouseDown={startDragInner}>
            <span className="grabber" />
          </div>

          {/* Preview (live iframe) */}
          <div className="wb-pane">
            <div className="wb-head">
              <div className="wb-title">Preview</div>
            </div>
            <div className="wb-body" style={{ overflow: "hidden" }}>
              <iframe
                ref={iframeRef}
                title="preview"
                sandbox="allow-scripts"
                style={{
                  width: "100%", height: "100%", border: 0, background: "#fff", display: "block"
                }}
              />
            </div>
          </div>
        </div>
      </div>


        {/* RIGHT divider */}
        <div className="outer-divider" onMouseDown={startDragRight} aria-label="Resize chat">
          <span className="handle" />
        </div>

        {/* RIGHT: Assistant (scrollable mock) */}
        <aside className="pane chat-pane" style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div className="pane-head"><h3>Assistant</h3></div>
          <div className="pane-body" style={{ minHeight: 0 }}>
            <ChatPanel key={problem.id} problem={problem} threadId={threadId} />
          </div>
        </aside>
      </div>
    </section>
  );
}
