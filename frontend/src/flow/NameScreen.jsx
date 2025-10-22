import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function NameScreen({ testType }) {
  const [name, setName] = useState("");
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || "";

  async function start() {
    if (!name.trim()) return;
    const res = await fetch(`${API}/api/session/start`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ name, test: testType })
    });
    if (!res.ok) { alert("Could not start session."); return; }
    const data = await res.json();
    sessionStorage.setItem("session_id", data.session_id);
    sessionStorage.setItem("name", name);
    sessionStorage.setItem("testType", testType);
    nav("../consent");
  }

  return (
    <section className="card vstack">
      <div className="title">{testType.toUpperCase()} – Participant Info</div>
      <div className="subtle">Enter your name to begin.</div>
      <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Full name" />
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn primary" onClick={start} disabled={!name.trim()}>Continue</button>
      </div>
    </section>
  );
}
