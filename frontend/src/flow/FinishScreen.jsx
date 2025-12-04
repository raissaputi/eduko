export default function FinishScreen() {
  const name = sessionStorage.getItem("name") || "Participant";
  const sid = sessionStorage.getItem("session_id") || "-";
  const testType = sessionStorage.getItem("testType") || "fe";
  
  const formLinks = {
    fe: "https://docs.google.com/forms/d/e/1FAIpQLSd55yq0QyHagwOQo2Oy2Q17e-iHbWDJSrI8CS6l8FjcdIBFow/viewform",
    dv: "https://docs.google.com/forms/d/e/1FAIpQLSfV_bSHt5zgamLZhRqXpqFHOvd8dpAKgOjxq8fPXTWAODMoMw/viewform"
  };
  
  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">Selesai! Terima Kasih 🎉</div>
        <div className="subtle">{name}, ID sesi Anda:</div>
        <code style={{background:"#111", padding:"6px 8px", borderRadius:8, border:"1px solid var(--border)"}}>{sid}</code>
        <div className="subtle">Anda dapat memanggil pengawas sekarang.</div>
        
        <hr style={{margin:"20px 0", border:"none", borderTop:"1px solid var(--border)"}} />
        
        <div style={{
          background:"linear-gradient(135deg, rgba(30,144,255,0.1) 0%, rgba(138,43,226,0.1) 100%)",
          border:"1px solid rgba(30,144,255,0.3)",
          borderRadius:"10px",
          padding:"20px",
          textAlign:"center"
        }}>
          <div className="title" style={{fontSize:18, marginBottom:8}}>
            📋 Satu Langkah Lagi!
          </div>
          <div className="subtle" style={{marginBottom:16, fontSize:13}}>
            Bantu kami melengkapi penelitian dengan mengisi formulir singkat berikut
          </div>
          <a 
            href={formLinks[testType]} 
            target="_blank" 
            rel="noopener noreferrer"
            className="btn primary"
            style={{
              textAlign:"center", 
              textDecoration:"none",
              display:"inline-block",
              padding:"12px 24px",
              fontSize:"15px",
              fontWeight:"600"
            }}
          >
            Isi Formulir Sekarang →
          </a>
        </div>
      </section>
    </div>
  );
}

