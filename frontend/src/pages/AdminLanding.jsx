import { useNavigate } from "react-router-dom";

export default function AdminLanding() {
  const nav = useNavigate();
  return (
    <div style={{maxWidth:720, margin:"48px auto", padding:"24px"}}>
      <h1>Experiment Console</h1>
      <p>Select the test type to launch for participants.</p>
      <div style={{display:"flex", gap:12, marginTop:16}}>
        <button onClick={()=>nav("/run/fe/name")}>Start FE Test</button>
        <button onClick={()=>nav("/run/dv/name")}>Start DV Test</button>
      </div>
    </div>
  );
}
