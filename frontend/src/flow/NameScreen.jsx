import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { logEvent } from '../lib/logger.js'

export default function NameScreen({ testType }) {
  const [name, setName] = useState("");
  const [consent, setConsent] = useState(false); // single positive consent
  const [showModal, setShowModal] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || "";

  function handleNext() {
    if (!name.trim() || !consent) return;
    setShowModal(true);
  }

  async function startTask() {
    if (!understood) {
      alert("Harap centang kotak konfirmasi bahwa Anda telah membaca dan memahami aturan.");
      return;
    }

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
          <button className="btn primary" onClick={handleNext} disabled={!name.trim() || !consent}>Selanjutnya</button>
        </div>
      </section>

      {/* Instructions Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 15, 16, 0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#151518',
            border: '1px solid #31313a',
            borderRadius: '12px',
            padding: '32px',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 6px 18px rgba(0,0,0,0.25)'
          }}>
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '24px', color: '#e7e7ea', marginBottom: '8px' }}>
                ⚠️ Aturan Penting
              </h2>
              <p style={{ color: '#b8b8c5', fontSize: '14px' }}>
                Harap baca dengan teliti sebelum memulai
              </p>
            </div>

            <div style={{ 
              background: '#1b1b21', 
              borderRadius: '10px', 
              padding: '20px',
              marginBottom: '20px',
              border: '1px solid #31313a'
            }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>🚫</span>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#e7e7ea', fontSize: '15px', fontWeight: '600' }}>
                      Jangan Buka Tab Lain
                    </h3>
                    <p style={{ margin: 0, color: '#b8b8c5', fontSize: '13px', lineHeight: '1.5' }}>
                      Tetap berada di halaman ini selama mengerjakan tugas. 
                      Membuka tab atau aplikasi lain dapat mengganggu rekaman dan proses pengerjaan.
                    </p>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>🤖</span>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#e7e7ea', fontSize: '15px', fontWeight: '600' }}>
                      LLM Mendukung Gambar
                    </h3>
                    <p style={{ margin: 0, color: '#b8b8c5', fontSize: '13px', lineHeight: '1.5' }}>
                      LLM kami dapat memahami gambar. Anda bisa <strong>copy-paste gambar</strong> langsung 
                      ke chat untuk meminta bantuan terkait visual atau screenshot.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '22px', flexShrink: 0 }}>🎥</span>
                  <div>
                    <h3 style={{ margin: '0 0 4px 0', color: '#e7e7ea', fontSize: '15px', fontWeight: '600' }}>
                      Rekaman Layar Akan Berjalan
                    </h3>
                    <p style={{ margin: 0, color: '#b8b8c5', fontSize: '13px', lineHeight: '1.5' }}>
                      Layar Anda akan direkam selama sesi berlangsung untuk keperluan penelitian. 
                      <strong> Jangan menghentikan rekaman.</strong> Jika rekaman dihentikan, 
                      sistem akan meminta Anda untuk memulai ulang.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px',
              background: '#1b1b21',
              borderRadius: '10px',
              cursor: 'pointer',
              marginBottom: '20px',
              border: understood ? '2px solid #1e90ff' : '1px solid #31313a',
              transition: 'all 0.2s'
            }}>
              <input 
                type="checkbox" 
                checked={understood}
                onChange={(e) => setUnderstood(e.target.checked)}
                style={{ 
                  width: '18px', 
                  height: '18px', 
                  cursor: 'pointer',
                  accentColor: '#1e90ff'
                }}
              />
              <span style={{ color: '#e7e7ea', fontSize: '14px', fontWeight: '500' }}>
                Saya telah membaca dan memahami semua aturan di atas
              </span>
            </label>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={() => {
                  setShowModal(false);
                  setUnderstood(false);
                }}
                className="btn"
                style={{
                  flex: '0 0 auto',
                  padding: '10px 16px'
                }}
              >
                Kembali
              </button>
              <button 
                onClick={startTask}
                disabled={!understood}
                className="btn primary"
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  opacity: understood ? 1 : 0.6
                }}
              >
                Mulai Mengerjakan →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

