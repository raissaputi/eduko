import { useNavigate } from "react-router-dom";

export default function SurveyScreen() {
  const nav = useNavigate();
  return (
    <section className="card vstack">
      <div className="title">Survey / Reflection</div>
      <textarea className="textarea" placeholder="How did you use (or avoid) the assistant? What helped/hurt?" />
      <div className="toolbar">
        <div className="spacer" />
        <button className="btn primary" onClick={()=>nav("../finish")}>Finish</button>
      </div>
    </section>
  );
}
