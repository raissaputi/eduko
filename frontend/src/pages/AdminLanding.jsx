import { useNavigate } from "react-router-dom";

export default function AdminLanding() {
  const nav = useNavigate();
  return (
    <div className="page">
      <section className="card vstack">
        <h1 className="title">Experiment Console</h1>
        <p className="subtle">Select the test type to launch for participants.</p>
        <div className="toolbar">
          <div className="spacer" />
          <button className="btn primary" onClick={()=>nav("/run/fe/name")}>Start FE Test</button>
          <button className="btn" onClick={()=>nav("/run/dv/name")}>Start DV Test</button>
        </div>
      </section>
    </div>
  );
}
