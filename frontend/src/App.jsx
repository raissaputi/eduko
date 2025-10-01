import { useEffect, useState } from "react";
import FEWorkbench from "./fe/FEWorkbench"; // adjust if path differs

const API = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export default function App() {
  const params = new URLSearchParams(location.search);
  const test = (params.get("test") || "fe").toLowerCase(); // "fe" | "dv"
  const problemsUrl =
    test === "dv" ? `${API}/api/problems/dv` : `${API}/api/problems/fe`;

  const [problems, setProblems] = useState([]);
  const [active, setActive] = useState(0);
  const [doc, setDoc] = useState("");

  const key = (id) => `fe_draft_${id}`;

  useEffect(() => {
    fetch(problemsUrl)
      .then((r) => r.json())
      .then((data) => {
        setProblems(Array.isArray(data) ? data : []);
        setActive(0);
      })
      .catch(() => setProblems([]));
  }, [problemsUrl]);

  useEffect(() => {
    if (!problems.length) return;
    const p = problems[active];
    const saved = localStorage.getItem(key(p.id));
    setDoc(saved ?? p.starter_html ?? "<!doctype html><html><body><h1>Blank</h1></body></html>");
  }, [active, problems]);

  useEffect(() => {
    if (!problems.length) return;
    const p = problems[active];
    const id = setTimeout(() => localStorage.setItem(key(p.id), doc), 250);
    return () => clearTimeout(id);
  }, [doc, active, problems]);

  const handleSubmit = async ({ htmlDocument }) => {
    // hook up later:
    // await fetch(`${API}/api/submissions/fe/run`, {...});
    console.log("submit", problems[active]?.id, htmlDocument.length);
  };

  if (!problems.length) return <div style={{ padding: 16 }}>Loading {test.toUpperCase()} tasks…</div>;
  const prb = problems[active];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 320px",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* CENTER: tabs + statement + workbench */}
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        {/* Tabs (replaces left sidebar) */}
        <div
          style={{
            display: "flex",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid #2d2f36",
            background: "#0f1115",
          }}
        >
          {problems.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setActive(i)}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #2d2f36",
                background: i === active ? "rgba(255,255,255,.08)" : "transparent",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              {p.title}
            </button>
          ))}
        </div>

        {/* Statement */}
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #2d2f36",
            background: "#0f1115",
          }}
        >
          <h2 style={{ margin: "4px 0 6px" }}>{prb.title}</h2>
          <p style={{ margin: 0, opacity: 0.9 }}>{prb.statement}</p>
        </div>

        {/* Workbench (fills remaining space) */}
        <div style={{ flex: 1, minHeight: 0, padding: 12 }}>
          <div style={{ height: "100%", minHeight: 0 }}>
            <FEWorkbench
              problem={prb}
              value={doc}
              onChange={setDoc}
              onSubmit={({ htmlDocument }) => handleSubmit({ htmlDocument })}
            />
          </div>
        </div>
      </main>

      {/* RIGHT: chat (kept narrow) */}
      <aside
        style={{
          borderLeft: "1px solid #2d2f36",
          padding: 12,
          overflow: "auto",
          minWidth: 0,
          background: "#0f1115",
        }}
      >
        <h3 style={{ marginTop: 0 }}>Chat (coming next)</h3>
        <p>
          This will integrate with <code>/api/chat</code> later.
        </p>
      </aside>
    </div>
  );
}
