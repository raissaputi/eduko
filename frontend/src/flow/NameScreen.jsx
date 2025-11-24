import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logEvent } from '../lib/logger.js'

export default function NameScreen({ testType }) {
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false); // single positive consent
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || "";

  async function start() {
  if (!name.trim() || !consent) return;
    const res = await fetch(`${API}/api/sessions/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name, test: testType, consent: true })
    });
    if (!res.ok) { alert("Could not start session."); return; }
    const data = await res.json();
    sessionStorage.setItem("session_id", data.session_id);
    sessionStorage.setItem("name", name);
    sessionStorage.setItem("testType", testType);

    // Initialize flow state: we've completed name and consent, next is task
    const flowState = {
      completedSteps: ['info'],
      currentMaxStep: 'task'
    };
    sessionStorage.setItem(`flow_state_${data.session_id}`, JSON.stringify(flowState));

    // Telemetry: session start and consent
    try { logEvent('session_start', { name, test_type: testType, session_id: data.session_id }); } catch (e) {}
    try { logEvent('consent_given', { consent: true }); } catch (e) {}

    nav("../task");
  }

  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">Sebelum Memulai</div>

        <div className="subtle" style={{marginBottom:12}}>
          Terima kasih atas kesediaan Anda untuk berpartisipasi dalam penelitian ini.<br/>
          Sebelum memulai, mohon membaca informasi berikut dengan saksama:
        </div>

        <ul style={{marginLeft:18}}>
          <li>Anda akan mengerjakan dua soal pemrograman dengan topik <strong>Front-End (FE)</strong> atau <strong>Data Visualization (DV)</strong>.</li>
          <li>Kegiatan ini berdurasi sekitar <strong>1,5 jam</strong>, dengan waktu <strong>30 menit untuk setiap soal</strong>.</li>
          <li>Seluruh pengerjaan dilakukan melalui <strong>aplikasi yang telah terhubung dengan model bahasa (LLM)</strong>.</li>
          <li>Anda <strong>dipersilakan menggunakan LLM yang disediakan</strong> untuk membantu proses penyelesaian tugas.</li>
          <li><strong>Jangan membuka resource lain</strong> (web apapun, AI/LLM lain) selama sesi berlangsung. <strong>Hanya gunakan aplikasi dan LLM yang disediakan</strong>.</li>
          <li>Seluruh <strong>interaksi, prompt, dan kode</strong> yang Anda tulis akan <strong>tersimpan secara otomatis</strong> selama sesi berlangsung.</li>
          <li>Data yang dikumpulkan <strong>bersifat rahasia</strong> dan <strong>hanya akan digunakan untuk kepentingan penelitian akademik</strong>.</li>
        </ul>

        <hr style={{margin:"16px 0"}} />

        <div className="title" style={{fontSize:18}}>Persetujuan Partisipasi</div>
        <div className="subtle" style={{marginBottom:8}}>
          Dengan menekan tombol <strong>“Saya Bersedia”</strong>, saya menyatakan bahwa:
        </div>
        <ul style={{marginLeft:18}}>
          <li>Saya telah membaca dan memahami informasi mengenai penelitian ini.</li>
          <li>Saya bersedia berpartisipasi dan mengikuti kegiatan sesuai arahan.</li>
          <li>Saya memberikan izin agar data interaksi saya digunakan untuk tujuan penelitian, dengan jaminan kerahasiaan identitas dan privasi saya.</li>
        </ul>

        <label className="hstack" style={{marginTop:16}}>
          <input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} />
          <span style={{marginLeft:8}}>Saya Bersedia</span>
        </label>

        <label className="label" style={{marginTop:16}}>Nama Lengkap</label>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="Nama lengkap" />

        <div className="toolbar">
          <div className="spacer" />
          <button className="btn primary" onClick={start} disabled={!name.trim() || !consent}>Selanjutnya</button>
        </div>
      </section>
    </div>
  );
}

