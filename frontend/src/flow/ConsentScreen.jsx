import { useState } from "react";
import { useNavigate } from "react-router-dom";

function markStepCompleted(step) {
  const sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) return;
  
  try {
    const stored = sessionStorage.getItem(`flow_state_${sessionId}`);
    const state = stored ? JSON.parse(stored) : { completedSteps: [], currentMaxStep: 'name' };
    
    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }
    state.currentMaxStep = step === 'consent' ? 'task' : 
                          step === 'task' ? 'survey' : 
                          step === 'survey' ? 'finish' : state.currentMaxStep;
    
    sessionStorage.setItem(`flow_state_${sessionId}`, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to update flow state:', e);
  }
}

export default function ConsentScreen() {
  const [ok, setOk] = useState(false);
  const nav = useNavigate();
  
  const handleContinue = () => {
    markStepCompleted('consent');
    nav("../task");
  };
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
          <button className="btn primary" disabled={!ok} onClick={handleContinue}>I Understand →</button>
        </div>
      </section>
    </div>
  );
}
