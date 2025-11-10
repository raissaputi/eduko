import { useRef } from 'react';
import Editor from "@monaco-editor/react";

export default function FEWorkbench({ 
  code, 
  onEdit, 
  onRun, 
  isSubmitted,
  onFullscreen,
  innerPct,
  onDragInner
}) {
  const iframeRef = useRef(null);

  const runPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = code;
    }
    onRun?.();
  };

  return (
    <div className="wb-grid" style={{ gridTemplateColumns: `${innerPct}% 8px ${100 - innerPct}%` }}>
      {/* HTML Editor */}
      <div className="wb-pane">
        <div className="wb-head">
          <div className="wb-title">HTML</div>
          <button className="btn" onClick={runPreview} disabled={isSubmitted}>Run ▶</button>
        </div>
        <div className="wb-body">
          <Editor
            height="100%"
            defaultLanguage="html"
            theme="vs-dark"
            value={code}
            onChange={onEdit}
            onMount={(editor) => {
              editor.onDidPaste((e) => {
                const text = editor.getModel().getValueInRange(e);
                logEvent("code_paste", { 
                  len: text.length,
                  kind: 'fe'
                });
              });
            }}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: "on",
              readOnly: isSubmitted,
            }}
          />
        </div>
      </div>

      {/* Divider */}
      <div className="wb-divider" onMouseDown={onDragInner}>
        <span className="grabber" />
      </div>

      {/* Preview */}
      <div className="wb-pane">
        <div className="wb-head">
          <div className="wb-title">Preview</div>
          <button className="btn" onClick={onFullscreen}>Fullscreen ⤢</button>
        </div>
        <div className="wb-body">
          <iframe ref={iframeRef} title="preview" sandbox="allow-scripts" />
        </div>
      </div>
    </div>
  );
}