export default function FinishScreen() {
  const name = sessionStorage.getItem("name") || "Participant";
  const sid = sessionStorage.getItem("session_id") || "-";
  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">All set. Thank you!</div>
        <div className="subtle">{name}, your session ID:</div>
        <code style={{background:"#111", padding:"6px 8px", borderRadius:8, border:"1px solid var(--border)"}}>{sid}</code>
        <div className="subtle">You can now call the proctor.</div>
      </section>
    </div>
  );
}

