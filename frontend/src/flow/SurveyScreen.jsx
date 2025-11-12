import { useNavigate } from "react-router-dom";
import { useEffect, useState } from 'react'
import { logEvent } from '../lib/logger.js'

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

export default function SurveyScreen({ testType = 'fe' }) {
  const nav = useNavigate();
  const API = import.meta.env.VITE_API_BASE || ''

  // FE fields
  const [feQ1, setFeQ1] = useState('')
  const [feQ2, setFeQ2] = useState('')
  const [feQ3, setFeQ3] = useState('')
  const [feQ4, setFeQ4] = useState('')
  const [feQ5, setFeQ5] = useState('')
  const [feQ6, setFeQ6] = useState('')
  const [feQ7, setFeQ7] = useState('')
  const [feQ8, setFeQ8] = useState(3) // satisfaction 1-5
  const [feQ9, setFeQ9] = useState('')

  // DV fields
  const [dvQ1, setDvQ1] = useState('')
  const [dvQ2, setDvQ2] = useState('')
  const [dvQ3, setDvQ3] = useState('')
  const [dvQ4, setDvQ4] = useState('')
  const [dvQ5, setDvQ5] = useState('')
  const [dvQ6, setDvQ6] = useState('')
  const [dvQ7, setDvQ7] = useState('')
  const [dvQ8, setDvQ8] = useState('')
  const [dvQ9, setDvQ9] = useState(3) // helpfulness 1-5

  useEffect(() => {
    try { logEvent('survey_view', { test_type: testType }) } catch {}
  }, [testType])

  const submitSurvey = async () => {
    const session_id = sessionStorage.getItem('session_id')
    if (!session_id) return

    const answers = testType === 'fe' ? {
      test_type: 'fe',
      q1_main_work: feQ1,
      q2_challenges: feQ2,
      q3_llm_usage: feQ3,
      q4_after_llm_adjustment: feQ4,
      q5_ratio_self_vs_llm: feQ5,
      q6_understanding_change: feQ6,
      q7_without_llm_confidence: feQ7,
      q8_satisfaction_1_5: feQ8,
      q9_if_time_improve: feQ9,
    } : {
      test_type: 'dv',
      q1_viz_goal: dvQ1,
      q2_why_this_chart: dvQ2,
      q3_steps_sequence: dvQ3,
      q4_llm_usage: dvQ4,
      q5_ratio_self_vs_llm: dvQ5,
      q6_changes_after_llm: dvQ6,
      q7_effectiveness_opinion: dvQ7,
      q8_if_time_improve: dvQ8,
      q9_llm_helpfulness_1_5: dvQ9,
    }

    try {
      await fetch(`${API}/api/survey/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id, answers })
      })
    } catch (e) {
      console.warn('survey submit failed', e)
    }

    try { logEvent('survey_submit', { test_type: testType, answers }) } catch {}
  }

  const handleFinish = async () => {
    await submitSurvey()
    markStepCompleted('survey')
    nav('../finish')
  }

  return (
    <div className="page">
      <section className="card vstack">
        <div className="title">{testType === 'fe' ? 'Survei Refleksi Front-End' : 'Survei Refleksi Data Visualization'}</div>
        <div className="subtle">
          {testType === 'fe' ? (
            <>Jawablah secara singkat dan jujur berdasarkan pengalaman Anda saat mengerjakan tugas front-end. Tidak ada jawaban benar atau salah.</>
          ) : (
            <>Jawablah dengan singkat dan jujur berdasarkan pengalaman Anda saat membuat visualisasi data. (Tidak ada jawaban benar atau salah.)</>
          )}
        </div>

        {testType === 'fe' ? (
          <>
            <label className="label">1. Apa bagian utama yang Anda kerjakan pada tugas front-end ini?</label>
            <textarea className="textarea" value={feQ1} onChange={e=>setFeQ1(e.target.value)} placeholder="Contoh: styling halaman, menulis JavaScript, memperbaiki bug, mengatur layout, dsb." />

            <label className="label">2. Apa tantangan atau bagian tersulit yang Anda hadapi saat mengerjakan tugas ini?</label>
            <textarea className="textarea" value={feQ2} onChange={e=>setFeQ2(e.target.value)} />

            <label className="label">3. Bagaimana Anda menggunakan LLM selama proses pengerjaan?</label>
            <textarea className="textarea" value={feQ3} onChange={e=>setFeQ3(e.target.value)} placeholder="Misalnya: mencari solusi bug, meminta contoh kode, menulis ulang fungsi, menjelaskan error." />

            <label className="label">4. Setelah mendapatkan saran dari LLM, apakah Anda langsung menggunakan hasilnya, atau Anda ubah terlebih dahulu?</label>
            <textarea className="textarea" value={feQ4} onChange={e=>setFeQ4(e.target.value)} placeholder="Jelaskan cara Anda menyesuaikan hasil dari LLM dengan kode Anda sendiri." />

            <label className="label">5. Seberapa besar bagian dari kode akhir Anda yang berasal dari ide atau tulisan Anda sendiri dibandingkan hasil dari LLM?</label>
            <textarea className="textarea" value={feQ5} onChange={e=>setFeQ5(e.target.value)} placeholder="Perkirakan secara kasar, misalnya 60% saya, 40% LLM." />

            <label className="label">6. Apakah pemahaman Anda tentang HTML/CSS/JavaScript meningkat setelah menggunakan LLM?</label>
            <textarea className="textarea" value={feQ6} onChange={e=>setFeQ6(e.target.value)} placeholder="Ya / tidak / sedikit + alasan singkat." />

            <label className="label">7. Jika Anda mengulang tugas yang sama tanpa LLM, apakah Anda merasa bisa menyelesaikannya?</label>
            <textarea className="textarea" value={feQ7} onChange={e=>setFeQ7(e.target.value)} placeholder="Ya / mungkin / tidak yakin + alasan." />

            <label className="label">8. Seberapa puas Anda terhadap hasil akhir pekerjaan anda? (1–5)</label>
            <input type="range" min="1" max="5" value={feQ8} onChange={e=>setFeQ8(Number(e.target.value))} />
            <div className="subtle">Nilai: {feQ8}</div>

            <label className="label">9. Jika Anda memiliki waktu tambahan, apa hal yang ingin Anda perbaiki atau tingkatkan pada hasil front-end Anda?</label>
            <textarea className="textarea" value={feQ9} onChange={e=>setFeQ9(e.target.value)} />
          </>
        ) : (
          <>
            <label className="label">1. Apa tujuan utama dari visualisasi yang Anda buat?</label>
            <textarea className="textarea" value={dvQ1} onChange={e=>setDvQ1(e.target.value)} placeholder="Misalnya: menampilkan tren, membandingkan kelompok, menjawab pertanyaan tertentu." />

            <label className="label">2. Mengapa Anda memilih jenis chart/visualisasi tersebut?</label>
            <textarea className="textarea" value={dvQ2} onChange={e=>setDvQ2(e.target.value)} />

            <label className="label">3. Bagaimana urutan atau langkah Anda dalam membuat visualisasi ini?</label>
            <textarea className="textarea" value={dvQ3} onChange={e=>setDvQ3(e.target.value)} placeholder="Contoh: eksplorasi data → coba beberapa plot → konsultasi LLM → revisi hasil" />

            <label className="label">4. Bagaimana Anda menggunakan LLM selama proses pembuatan visualisasi?</label>
            <textarea className="textarea" value={dvQ4} onChange={e=>setDvQ4(e.target.value)} />

            <label className="label">5. Seberapa besar bagian visualisasi akhir yang merupakan hasil ide atau modifikasi Anda sendiri dibandingkan hasil dari LLM?</label>
            <textarea className="textarea" value={dvQ5} onChange={e=>setDvQ5(e.target.value)} placeholder="Contoh: 70% saya, 30% LLM." />

            <label className="label">6. Apakah Anda melakukan perubahan atau penyempurnaan setelah mendapatkan saran dari LLM?</label>
            <textarea className="textarea" value={dvQ6} onChange={e=>setDvQ6(e.target.value)} />

            <label className="label">7. Menurut Anda, seberapa efektif visualisasi yang Anda hasilkan dalam menyampaikan insight dari data?</label>
            <textarea className="textarea" value={dvQ7} onChange={e=>setDvQ7(e.target.value)} placeholder="Sangat efektif / cukup efektif / kurang efektif + alasan singkat." />

            <label className="label">8. Jika diberi waktu lagi untuk memperbaiki visualisasi ini, apa yang akan Anda ubah atau tingkatkan?</label>
            <textarea className="textarea" value={dvQ8} onChange={e=>setDvQ8(e.target.value)} />

            <label className="label">9. Seberapa membantu LLM dalam proses pembuatan visualisasi data Anda secara keseluruhan? (1–5)</label>
            <input type="range" min="1" max="5" value={dvQ9} onChange={e=>setDvQ9(Number(e.target.value))} />
            <div className="subtle">Nilai: {dvQ9}</div>
          </>
        )}

        <div className="toolbar">
          <div className="spacer" />
          <button className="btn primary" onClick={handleFinish}>Finish</button>
        </div>
      </section>
    </div>
  );
}

