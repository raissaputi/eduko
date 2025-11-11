import { useNavigate } from "react-router-dom";

export default function AdminLanding() {
  const nav = useNavigate();
  return (
    <div className="page">
      <section className="card vstack" style={{alignItems:'center', textAlign:'center', gap:16}}>
        <h1 className="title" style={{fontSize:28}}>Ready to Begin?</h1>
        <p className="subtle" style={{maxWidth:620, fontSize:16}}>
          Pilih tipe tes yang sesuai untuk memulai sesi Anda.<br/>
          Pastikan Anda telah menyiapkan waktu dan lingkungan yang kondusif untuk mengerjakan tugas ini.
        </p>
        <div className="hstack" style={{gap:12}}>
          <button className="btn primary" onClick={()=>nav("/run/fe/info")}>Start Front-End Test</button>
          <button className="btn primary" onClick={()=>nav("/run/dv/info")}>Start Data Visualization Test</button>
        </div>
      </section>
    </div>
  );
}
