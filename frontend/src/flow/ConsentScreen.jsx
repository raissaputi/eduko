import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ConsentScreen() {
  const [ok, setOk] = useState(false);
  const nav = useNavigate();
  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">Consent & Instructions</div>
        <div className="subtle">
          We will collect prompts, code snapshots on each run, final code, timings, mouse activity, and (optionally) screen recordings.
        </div>
        <label className="hstack">
          <input type="checkbox" checked={ok} onChange={e=>setOk(e.target.checked)} />
          <span>I consent.</span>
        </label>
        <div className="toolbar">
          <div className="spacer" />
          <button className="btn primary" disabled={!ok} onClick={()=>nav("../task")}>I Understand →</button>
        </div>
      </section>
    </div>
  );
}
