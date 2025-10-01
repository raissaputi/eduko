import { useRef, useEffect, useState } from "react";
import Editor from "@monaco-editor/react";

export default function FEWorkbench({ problem, value, onChange, onSubmit }) {
  const iframeRef = useRef(null);
  const [fs, setFs] = useState(false); // fullscreen for Preview

  const run = () => {
    if (!iframeRef.current) return;
    iframeRef.current.srcdoc = value || "";
  };

  // live render; remove if you prefer manual Run
  useEffect(() => { run(); }, [value]);

  const handleSubmit = async () => {
    if (onSubmit) await onSubmit({ htmlDocument: value || "" });
  };

  return (
    <>
      {/* Normal layout */}
      <div
        style={{
          height: "100%",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          minHeight: 0,
        }}
      >
        {/* Editor */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #2d2f36",
            borderRadius: 8,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #2d2f36",
              background: "#0f1115",
            }}
          >
            <strong>{problem?.title || "Editor"}</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run} title="Run in preview">Run ▶</button>
              <button onClick={handleSubmit} title="Submit to backend">Submit ⬆</button>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0 }}>
            <Editor
              height="100%"
              defaultLanguage="html"
              theme="vs-dark"
              value={value}
              onChange={(v) => onChange?.(v ?? "")}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          </div>
        </div>

        {/* Preview */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            border: "1px solid #2d2f36",
            borderRadius: 8,
            overflow: "hidden",
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              borderBottom: "1px solid #2d2f36",
              background: "#0f1115",
            }}
          >
            <strong>Preview</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run} title="Refresh preview">Refresh</button>
              <button onClick={() => setFs(true)} title="Open fullscreen">Fullscreen ⤢</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <iframe
              ref={iframeRef}
              title="preview"
              sandbox="allow-scripts"
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                background: "white",
                display: "block",
              }}
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
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.75)",
            zIndex: 50_000,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px 12px",
              borderBottom: "1px solid #2d2f36",
              background: "#0f1115",
            }}
          >
            <strong>Preview — Fullscreen</strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={run} title="Refresh">Refresh</button>
              <button onClick={() => setFs(false)} title="Close fullscreen">Close ✕</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
            <iframe
              title="preview-fullscreen"
              sandbox="allow-scripts"
              srcDoc={value || ""}
              style={{
                width: "100%",
                height: "100%",
                border: 0,
                background: "white",
                display: "block",
                borderRadius: 8,
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
