import Editor from "@monaco-editor/react";

export default function DVWorkbench({ 
  code, 
  onEdit, 
  onRun, 
  isSubmitted,
  output,
  innerPct,
  onDragInner
}) {
  return (
    <div className="wb-grid" style={{ gridTemplateColumns: `${innerPct}% 8px ${100 - innerPct}%` }}>
      {/* Python Editor */}
      <div className="wb-pane">
        <div className="wb-head">
          <div className="wb-title">Python</div>
          <button className="btn" onClick={onRun} disabled={isSubmitted}>Run ▶</button>
        </div>
        <div className="wb-body">
          <Editor
            height="100%"
            defaultLanguage="python"
            theme="vs-dark"
            value={code}
            onChange={onEdit}
            onMount={(editor) => {
              editor.onDidPaste((e) => {
                const text = editor.getModel().getValueInRange(e);
                logEvent("code_paste", { 
                  len: text.length,
                  kind: 'dv'
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

      {/* Output */}
      <div className="wb-pane">
        <div className="wb-head">
          <div className="wb-title">Output</div>
        </div>
        <div className="wb-body">
          {output ? (
            <img 
              src={`data:image/png;base64,${output}`} 
              alt="Matplotlib output" 
              style={{ maxWidth: '100%', height: 'auto' }} 
            />
          ) : (
            <div className="empty-state">
              Run the code to see the visualization
            </div>
          )}
        </div>
      </div>
    </div>
  );
}