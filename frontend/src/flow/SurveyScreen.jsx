import { useNavigate } from "react-router-dom";

function markStepCompleted(step) {
  const sessionId = sessionStorage.getItem('session_id');
  if (!sessionId) return;
  
  try {
    const stored = sessionStorage.getItem(`flow_state_${sessionId}`);
  const state = stored ? JSON.parse(stored) : { completedSteps: [], currentMaxStep: 'info' };
    
    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }
    state.currentMaxStep = 'finish';
    
    sessionStorage.setItem(`flow_state_${sessionId}`, JSON.stringify(state));
  } catch (e) {
    console.warn('Failed to update flow state:', e);
  }
}

export default function SurveyScreen() {
  const nav = useNavigate();
  
  const handleFinish = () => {
    markStepCompleted('survey');
    nav("../finish");
  };
  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">Survey / Reflection</div>
        <textarea className="textarea" placeholder="How did you use (or avoid) the assistant? What helped/hurt?" />
        <div className="toolbar">
          <div className="spacer" />
          <button className="btn primary" onClick={handleFinish}>Finish</button>
        </div>
      </section>
    </div>
  );
}

