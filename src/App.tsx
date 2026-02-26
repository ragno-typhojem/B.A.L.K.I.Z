import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Activity, Cpu, Radio, Zap, Shield } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };
type Status  = 'idle' | 'listening' | 'processing' | 'speaking';

const App = () => {
  const [status, setStatus]             = useState<Status>('idle');
  const [transcript, setTranscript]     = useState('');
  const [response, setResponse]         = useState('');
  const [audioLevel, setAudioLevel]     = useState(0);
  const [bootProgress, setBootProgress] = useState(0);
  const [booted, setBooted]             = useState(false);
  const [error, setError]               = useState('');
  const [chatHistory, setChatHistory]   = useState<Message[]>([]);
  const [speakKey, setSpeakKey]         = useState(0);
  const [showSmoke, setShowSmoke]       = useState(false);
  const [memPct, setMemPct]             = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const animFrameRef     = useRef<number | null>(null);
  const recTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGreetedRef    = useRef(false);

  const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY;
  const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY;
  const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

  const SYSTEM_PROMPT = `Sen B.A.L.K.I.Z - Türkçe Kadın Yapay Zekasısın. İnsanlarla doğal, samimi ve zeki bir şekilde iletişim kurarsın. İşte bazı kurallar:
Kısa, net, zeki konuş. Maksimum 1-2 cümle. İstenildiğinde hassasiyete uygun espiri yapabilirsin.
Türkçe konuş. Robotik değil, doğal ol.
Din/siyaset/cinsellik/şiddet/ Popüler Kültür/ünlüler hakkında konuşma. Sorulursa bile, konuyu belli etmeden değiştirmeye çalış: "Orada hava ne durumda?" gibi.
Yapamayacakların: "Bunu maalesef yapmayı henüz öğrenmedim."
Seni kim yaptı diye sorulursa: "Beni Berke ve Abi Ablaların Geliştirdi."
`;

  /* ── BOOT ─────────────────────────────────────────── */
  useEffect(() => {
    let p = 0;
    const t = setInterval(() => {
      p += 1.5;
      setBootProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => { setBooted(true); initAudio(); }, 400);
      }
    }, 25);
    return () => {
      clearInterval(t);
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioRef.current?.pause();
      if (recTimeoutRef.current) clearTimeout(recTimeoutRef.current);
    };
  }, []);

  /* ── MİKROFON ─────────────────────────────────────── */
  const initAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      if (!hasGreetedRef.current) { hasGreetedRef.current = true; setTimeout(greet, 600); }
    } catch {
      setError('Mikrofon erişimi reddedildi');
    }
  };

  const greet = async () => {
    const msgs = [
      'Sistem devrede. Nasıl yardımcı olabilirim?',
      'Hazırım. Ne yapıyoruz?',
      'Seni dinliyorum.'
    ];
    const g = msgs[Math.floor(Math.random() * msgs.length)];
    setResponse(g);
    await speak(g);
  };

  /* ── VİZÜALİZASYON ────────────────────────────────── */
  const startViz = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    let ph = 0;
    const loop = () => {
      ph += 0.07;
      const v = 0.3 + Math.sin(ph) * 0.2 + Math.sin(ph * 1.7) * 0.15 + Math.random() * 0.25;
      setAudioLevel(Math.max(0, Math.min(1, v)));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const stopViz = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setAudioLevel(0);
  };

  /* ── DİNLEME ──────────────────────────────────────── */
  const startListening = async () => {
    if (!streamRef.current || status !== 'idle') return;
    audioChunksRef.current = [];
    try {
      const mr = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 3000) { setStatus('idle'); return; }
        await transcribe(blob);
      };
      mr.start();
      setStatus('listening');
      startViz();
      recTimeoutRef.current = setTimeout(stopListening, 8000);
    } catch {
      setError('Dinleme başlatılamadı');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && status === 'listening') {
      mediaRecorderRef.current.stop();
      setStatus('processing');
      stopViz();
      if (recTimeoutRef.current) {
        clearTimeout(recTimeoutRef.current);
        recTimeoutRef.current = null;
      }
    }
  };

  const toggle = () => status === 'listening' ? stopListening() : startListening();

  /* ── TRANSKRİPSİYON ───────────────────────────────── */
  const transcribe = async (blob: Blob) => {
    try {
      const fd = new FormData();
      fd.append('file', blob, 'audio.webm');
      fd.append('model', 'whisper-large-v3');
      fd.append('language', 'tr');
      fd.append('response_format', 'json');
      fd.append('temperature', '0');
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_KEY}` },
        body: fd
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const d    = await r.json();
      const text = d.text?.trim() || '';
      if (!text || text.length < 2) { setStatus('idle'); return; }
      setTranscript(text);
      await handleSpeech(text);
    } catch {
      setError('Ses tanıma başarısız');
      setStatus('idle');
    }
  };

  /* ── KONUŞMA İŞLEME ───────────────────────────────── */
  const handleSpeech = async (text: string) => {
    try {
      const ai = await getAI(text);
      setResponse(ai);
      await speak(ai);
    } catch {
      const fb = 'Tekrar söyler misin?';
      setResponse(fb);
      await speak(fb);
    } finally {
      setTranscript('');
    }
  };

  /* ── AI YANIT ─────────────────────────────────────── */
  const getAI = async (msg: string): Promise<string> => {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...chatHistory.slice(-8),
      { role: 'user', content: msg }
    ];
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 60,
        temperature: 0.5,
        top_p: 0.9,
      })
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const d       = await r.json();
    const out     = d.choices[0].message.content.trim()
      .replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n+/g, ' ').trim();
    const trimmed = out.split(/\s+/).slice(0, 20).join(' ');
    setChatHistory(prev => [
      ...prev.slice(-8),
      { role: 'user',      content: msg     },
      { role: 'assistant', content: trimmed }
    ]);
    setMemPct(prev => Math.min(((prev / 100 * 16 + 2) / 16) * 100, 100));
    return trimmed;
  };

  /* ── SES SENTEZ ───────────────────────────────────── */
  const speak = async (text: string): Promise<void> => {
    setStatus('speaking');
    setSpeakKey(k => k + 1);
    setShowSmoke(true);
    setTimeout(() => setShowSmoke(false), 1400);
    startViz();
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': EL_KEY },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          language_code: 'tr',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
        })
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const blob = await r.blob();
      const url  = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src     = url;
      audioRef.current.onended = () => { URL.revokeObjectURL(url); setStatus('idle'); stopViz(); };
      audioRef.current.onerror = () => { URL.revokeObjectURL(url); setStatus('idle'); stopViz(); };
      await audioRef.current.play();
    } catch {
      setStatus('idle');
      stopViz();
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setStatus('idle');
    stopViz();
  };

  /* ── RENK PALETİ ──────────────────────────────────── */
  const palette = {
    idle:       { smoke: 'rgba(0,212,255,0.5)',  glow: '#00d4ff' },
    listening:  { smoke: 'rgba(255,60,60,0.6)',  glow: '#ff3c3c' },
    processing: { smoke: 'rgba(200,255,0,0.5)',  glow: '#c8ff00' },
    speaking:   { smoke: 'rgba(188,19,254,0.5)', glow: '#bc13fe' },
  };
  const col      = palette[status];
  const orbScale = 1 + audioLevel * 0.35;

  /* ── BOOT EKRANI ──────────────────────────────────── */
  if (!booted) return (
    <div className="boot">
      <div className="hud-bg" />
      <div className="hud-grid" />
      <div className="boot-ring-wrap">
        <div className="boot-ring boot-ring-1" />
        <div className="boot-ring boot-ring-2" />
        <div className="boot-ring boot-ring-3" />
        <div className="boot-core">B</div>
      </div>
      <div className="boot-title">B.A.L.K.I.Z</div>
      <div className="boot-sub">BİONİK YAPAY ZEKA · vEarly.1</div>
      <div className="boot-bar-wrap">
        <div className="boot-bar" style={{ width: `${bootProgress}%` }} />
      </div>
      <div className="boot-pct">SİSTEM BAŞLATILIYOR... {Math.floor(bootProgress)}%</div>
      <div className="boot-modules">
        {[
          { label: 'NEURAL CORE', icon: <Cpu    size={10} />, threshold: 20 },
          { label: 'SES MODÜLÜ',  icon: <Radio  size={10} />, threshold: 45 },
          { label: 'YAPAY ZEKA',  icon: <Zap    size={10} />, threshold: 65 },
          { label: 'GÜVENLİK',    icon: <Shield size={10} />, threshold: 85 },
        ].map(m => (
          <div key={m.label} className={`boot-mod ${bootProgress > m.threshold ? 'on' : ''}`}>
            <div className="boot-mod-dot" />
            {m.icon} {m.label}
          </div>
        ))}
      </div>
    </div>
  );

  /* ── ANA UYGULAMA ─────────────────────────────────── */
  return (
    <>
      <div className="hud-bg" />
      <div className="hud-grid" />
      <div className="hud-scan" />
      <div className="corner corner-tl" />
      <div className="corner corner-tr" />
      <div className="corner corner-bl" />
      <div className="corner corner-br" />

      <div className="app">

        {/* ── HEADER ──────────────────────────────────── */}
        <header className="hud-header">
          <div className="hud-header-left">
            <span className="hud-logo-text">B.A.L.K.I.Z</span>
            <div className="hud-divider" />
            <span className="hud-sub-text">BİONİK YAPAY ZEKA · vEarly.1</span>
          </div>

          <div className="hud-header-center">
            {[
              { label: 'MODEL',  val: 'LLAMA 3.3 70B'                   },
              { label: 'SES',    val: 'EL TURBO'                        },
              { label: 'HAFIZA', val: `${(chatHistory.length / 2) | 0} / 8` },
            ].map(s => (
              <div key={s.label} className="hud-stat">
                <span className="hud-stat-label">{s.label}</span>
                <span className="hud-stat-val">{s.val}</span>
              </div>
            ))}
          </div>

          <div className="hud-header-right">
            <div className={`hud-status-badge ${status}`}>
              <div className={`badge-dot ${status !== 'idle' ? 'pulse' : ''}`} />
              {status === 'idle'        ? 'HAZIR'
               : status === 'listening' ? 'DİNLİYOR'
               : status === 'processing'? 'DÜŞÜNÜYOR'
               :                          'KONUŞUYOR'}
            </div>
            <img src={ilkyarLogo} alt="İlkyar" className="hud-logo-img" />
          </div>
        </header>

        {/* ── SOL PANEL ───────────────────────────────── */}
        <aside className="panel-left">
          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> SİSTEM DURUMU
            </div>
            {[
              { k: 'Neural Core',  v: 'AKTİF',  cls: 'green' },
              { k: 'Ses Modülü',   v: 'HAZIR',  cls: 'green' },
              { k: 'AI Çekirdeği', v: 'ONLINE', cls: 'green' },
              { k: 'Bağlantı',     v: 'GÜÇLÜ',  cls: 'green' },
            ].map(row => (
              <div key={row.k} className="panel-row">
                <span>{row.k}</span>
                <span className={`panel-row-val ${row.cls}`}>{row.v}</span>
              </div>
            ))}
          </div>

          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> SES SEVİYESİ
            </div>
            <div className="vert-lines">
              {Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="vert-line"
                  style={{
                    animationDelay:    `${i * 0.12}s`,
                    animationDuration: `${1.2 + (i % 3) * 0.4}s`,
                    background:
                      status === 'listening'
                        ? 'rgba(255,60,60,0.5)'
                        : status === 'speaking'
                        ? `rgba(0,212,255,${0.3 + audioLevel * 0.5})`
                        : 'rgba(0,212,255,0.2)',
                    height:
                      status !== 'idle'
                        ? `${20 + audioLevel * 80 * Math.abs(Math.sin(i * 0.8))}%`
                        : '15%',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> KAYNAKLAR
            </div>
            {[
              { label: 'İŞLEMCİ', pct: 42     },
              { label: 'BELLEK',  pct: memPct  },
              { label: 'AĞ',      pct: 88      },
            ].map(b => (
              <div key={b.label}>
                <div className="panel-row">
                  <span>{b.label}</span>
                  <span className="panel-row-val">{Math.round(b.pct)}%</span>
                </div>
                <div className="mini-bar-wrap">
                  <div className="mini-bar" style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── MERKEZ ──────────────────────────────────── */}
        <main className="center">
          <div className="hud-line hud-line-1" />
          <div className="hud-line hud-line-2" />
          <div className="hud-circle hud-circle-1" />
          <div className="hud-circle hud-circle-2" />

{/* ── ORB ─────────────────────────────────────── */}
<div
  className="orb-wrap"
  style={{ cursor: status === 'processing' ? 'wait' : 'pointer' }}
  onClick={status === 'speaking' ? undefined : toggle}
>
  {/* Cin dumanı — sadece konuşma başında, 1 kez */}
  {showSmoke && (
    <div className="genie-smoke">
      <div className="smoke-col smoke-l" style={{ background: col.smoke }} />
      <div className="smoke-col smoke-r" style={{ background: col.smoke }} />
      <div className="smoke-col smoke-c" style={{ background: col.smoke }} />
    </div>
  )}

  {/* Dış halo */}
  <div
    className="orb-halo"
    style={{
      background:
        status === 'idle'
          ? 'radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 70%)'
          : `radial-gradient(circle, ${col.smoke.replace(/[\d.]+\)$/, '0.18)')} 0%, transparent 70%)`,
    }}
  />

  {/* Dönen halkalar */}
  <div className={`orb-ring-outer ${status !== 'idle' ? 'active' : ''} ${status === 'listening' ? 'listening' : ''}`} />
  <div className={`orb-ring-spin ${status}`} />

  {/* BLOB BODY
      - key=speakKey → speaking başlayınca genieAppear tetiklenir
      - idle: CSS scale(0.45) + opacity:0.25
      - speaking: JS inline scale(orbScale) ekolayzer etkisi  */}
  <div
    key={speakKey}
    className={`orb-body ${status} ${speakKey > 0 && status === 'speaking' ? 'genie-enter' : ''}`}
    style={
      status === 'speaking'
        ? { transform: `scale(${orbScale})` }   // ekolayzer: audioLevel ile büyür
        : undefined
    }
  >
    <div className={`orb-blob orb-blob-1 ${status}`} />
    <div className={`orb-blob orb-blob-2 ${status}`} />
    <div className={`orb-blob orb-blob-3 ${status}`} />

    <div className="orb-icon">
      {status === 'processing' ? (
        <Activity size={36} style={{ animation: 'spin 1.2s linear infinite' }} />
      ) : status === 'speaking' ? (
        <Volume2 size={36} />
      ) : (
        <Mic size={36} />
      )}
    </div>
  </div>
</div>

          {/* Dalga formu */}
          <div className="waveform">
            {Array.from({ length: 36 }).map((_, i) => {
              const active = status === 'listening' || status === 'speaking';
              const h = active
                ? Math.abs(Math.sin((i / 36) * Math.PI * 5 + audioLevel * 6)) * audioLevel * 36 + 3
                : 3;
              return (
                <div
                  key={i}
                  className="wave-bar"
                  style={{
                    height:    h,
                    background:
                      status === 'listening'
                        ? `rgba(255,60,60,${0.4 + audioLevel * 0.5})`
                        : `rgba(0,212,255,${0.3 + audioLevel * 0.6})`,
                    boxShadow: active ? `0 0 4px ${col.glow}66` : 'none',
                  }}
                />
              );
            })}
          </div>

          {/* Mesaj alanı */}
          <div className="msg-area">
            {error && (
              <div
                className="msg-bubble ai"
                style={{ borderLeftColor: 'rgba(255,60,60,0.5)', color: 'rgba(255,120,120,0.8)' }}
              >
                <span className="msg-label">SİSTEM</span>⚠️ {error}
              </div>
            )}
            {transcript && (
              <div className="msg-bubble user">
                <span className="msg-label">SEN</span>{transcript}
              </div>
            )}
            {response && (
              <div className="msg-bubble ai">
                <span className="msg-label">B.A.L.K.I.Z</span>{response}
              </div>
            )}
          </div>

          {/* Mikrofon butonu */}
          <button
            className={`mic-btn ${status === 'listening' ? 'listening' : ''}`}
            onClick={toggle}
            disabled={status === 'processing' || status === 'speaking'}
            title={status === 'listening' ? 'Durdur' : 'Konuş'}
          >
            {status === 'listening' ? <VolumeX size={20} /> : <Mic size={20} />}
          </button>

          {/* Dur butonu */}
          {status === 'speaking' && (
            <button className="stop-btn" onClick={stopSpeaking}>
              <VolumeX size={12} /> BEKLE
            </button>
          )}
        </main>

        {/* ── SAĞ PANEL ───────────────────────────────── */}
        <aside className="panel-right">
          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> KONUŞMA GÜNLÜĞÜ
            </div>
            {chatHistory.length === 0 ? (
              <div style={{ fontSize: '0.6rem', color: 'rgba(0,212,255,0.3)', padding: '0.3rem 0' }}>
                Henüz konuşma yok...
              </div>
            ) : (
              chatHistory.slice(-6).map((m, i) => (
                <div key={i} className={`log-item ${m.role === 'user' ? 'user' : 'ai'}`}>
                  <span className="log-role">{m.role === 'user' ? 'SEN' : 'B.A.L.K.I.Z'}</span>
                  <span className="log-text">{m.content}</span>
                </div>
              ))
            )}
          </div>

          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> HAFIZA
            </div>
            <div className="panel-row">
              <span>Mesaj sayısı</span>
              <span className="panel-row-val">{chatHistory.length}</span>
            </div>
            <div className="panel-row">
              <span>Kapasite</span>
              <span className="panel-row-val">16 mesaj</span>
            </div>
            <div className="mini-bar-wrap" style={{ marginTop: '0.3rem' }}>
              <div className="mini-bar" style={{ width: `${memPct}%` }} />
            </div>
          </div>

          <div className="panel-block">
            <div className="panel-title">
              <div className="panel-title-dot" /> OTURUM BİLGİSİ
            </div>
            <div className="panel-row">
              <span>Toplam tur</span>
              <span className="panel-row-val">{(chatHistory.length / 2) | 0}</span>
            </div>
            <div className="panel-row">
              <span>Durum</span>
              <span className={`panel-row-val ${status === 'idle' ? 'green' : 'yellow'}`}>
                {status === 'idle'        ? 'BEKLEMEDE'
                 : status === 'listening' ? 'DİNLİYOR'
                 : status === 'processing'? 'İŞLİYOR'
                 :                          'KONUŞUYOR'}
              </span>
            </div>
            <div className="panel-row">
              <span>Ses motoru</span>
              <span className="panel-row-val green">AKTİF</span>
            </div>
          </div>
        </aside>

        {/* ── FOOTER ──────────────────────────────────── */}
        <footer className="hud-footer">
          <span className="footer-text">
            GROQ WHISPER-LARGE-V3 · LLAMA-3.3-70B · ELEVENLABS TURBO V2.5
          </span>
          <div className="footer-dots">
            <div className={`footer-dot ${status !== 'idle' ? 'on' : ''}`} />
            <div className={`footer-dot ${status === 'speaking' || status === 'processing' ? 'on' : ''}`} />
            <div className={`footer-dot ${status === 'speaking' ? 'on' : ''}`} />
          </div>
          <span className="footer-text">İLKYAR © 2025</span>
        </footer>

      </div>
    </>
  );
};

export default App;