import { useState, useEffect, useRef } from 'react';
import { Mic, VolumeX, Volume2, Activity, Cpu, Radio, Zap, Shield, Star } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';

type Message = { role: 'user' | 'assistant'; content: string };
type Status  = 'idle' | 'listening' | 'processing' | 'speaking';

// ─────────────────────────────────────────────────────────────
//  🔊 WEB AUDIO – Warmer, more musical sound effects
// ─────────────────────────────────────────────────────────────
let _actx: AudioContext | null = null;
const actx = () => {
  if (!_actx) _actx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _actx;
};

const tone = (freq: number, dur: number, vol = 0.08, type: OscillatorType = 'sine', delay = 0) => {
  try {
    const ctx = actx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* silent */ }
};

// Magical chime for start
const chime = (freqs: number[], startDelay = 0) => {
  freqs.forEach((f, i) => tone(f, 0.35, 0.07, 'sine', startDelay + i * 0.12));
};

const sfx = {
  start:    () => chime([523, 659, 784, 1047]),            // C major arp
  stop:     () => chime([784, 659, 523], 0),               // descending
  thinking: () => {
    // gentle digital pulse – repeating triplets
    [0, 0.4, 0.8].forEach(d => {
      tone(440, 0.12, 0.05, 'sine', d);
      tone(554, 0.10, 0.04, 'sine', d + 0.13);
      tone(660, 0.08, 0.03, 'sine', d + 0.26);
    });
  },
  ready:    () => chime([659, 784, 1047, 1319]),           // E major sparkle
  error:    () => { tone(220, 0.4, 0.09, 'triangle'); tone(196, 0.3, 0.07, 'triangle', 0.18); },
  pop:      () => tone(880, 0.07, 0.06, 'sine'),           // tiny pop on bubble appear
  boot:     () => chime([261, 329, 392, 523, 659, 784]),   // full C major scale
};

// ─────────────────────────────────────────────────────────────
//  🌐 3D JARVIS ORB – multi-layer orbital ring system
// ─────────────────────────────────────────────────────────────
interface OrbitProps {
  radius: number; count: number; duration: number;
  color: string; dotSize: number; reverse?: boolean;
  tilt?: number; phase?: number;
}

const OrbitRing = ({ radius, count, duration, color, dotSize, reverse, tilt = 0, phase = 0 }: OrbitProps) => (
  <div
    className={`orbit-ring${reverse ? ' rev' : ''}`}
    style={{
      width: radius * 2, height: radius * 2,
      animationDuration: `${duration}s`,
      position: 'absolute',
      top: '50%', left: '50%',
      marginTop: -radius, marginLeft: -radius,
      transform: `rotateX(${tilt}deg) rotateY(${phase}deg)`,
      transformStyle: 'preserve-3d',
    }}
  >
    {Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * 360;
      return (
        <div
          key={i}
          className="orbit-dot"
          style={{
            width: dotSize, height: dotSize,
            background: color,
            boxShadow: `0 0 ${dotSize * 2}px ${color}dd, 0 0 ${dotSize * 5}px ${color}55`,
            position: 'absolute',
            borderRadius: '50%',
            top: '50%', left: '50%',
            marginTop: -(dotSize / 2), marginLeft: -(dotSize / 2),
            transform: `rotate(${angle}deg) translateX(${radius}px)`,
          }}
        />
      );
    })}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  🧠 THINKING SCREEN – animated task display
// ─────────────────────────────────────────────────────────────
const THINKING_TASKS = [
  'Bağlam analiz ediliyor…',
  'Vektör uzayı taranıyor…',
  'Yanıt optimize ediliyor…',
  'Bilgi tabanı sorgulanıyor…',
  'Nöral ağlar etkinleştiriliyor…',
  'Dil modeli yükleniyor…',
  'Düşünce kalıpları birleştiriliyor…',
  'Bellek katmanları kontrol ediliyor…',
  'Anlamsal köprüler kuruluyor…',
  'En iyi yanıt seçiliyor…',
];

const ThinkingScreen = ({ color }: { color: string }) => {
  const [taskIdx, setTaskIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setTaskIdx(i => (i + 1) % THINKING_TASKS.length);
        setFade(true);
      }, 300);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="thinking-overlay">
      <div className="thinking-task" style={{ color, opacity: fade ? 1 : 0 }}>
        <span className="thinking-dots">
          <span />
          <span />
          <span />
        </span>
        {THINKING_TASKS[taskIdx]}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
//  ✨ FLOATING STAR PARTICLES – child delight
// ─────────────────────────────────────────────────────────────
const StarField = () => (
  <div className="starfield" aria-hidden>
    {Array.from({ length: 30 }).map((_, i) => (
      <div
        key={i}
        className="star-particle"
        style={{
          left: `${Math.random() * 100}%`,
          top: `${Math.random() * 100}%`,
          animationDelay: `${Math.random() * 6}s`,
          animationDuration: `${3 + Math.random() * 4}s`,
          width: `${2 + Math.random() * 3}px`,
          height: `${2 + Math.random() * 3}px`,
        }}
      />
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────────
//  🤖 MAIN APP
// ─────────────────────────────────────────────────────────────
const App = () => {
  const [status,       setStatus]       = useState<Status>('idle');
  const [transcript,   setTranscript]   = useState('');
  const [response,     setResponse]     = useState('');
  const [audioLevel,   setAudioLevel]   = useState(0);
  const [bootProgress, setBootProgress] = useState(0);
  const [booted,       setBooted]       = useState(false);
  const [error,        setError]        = useState('');
  const [chatHistory,  setChatHistory]  = useState<Message[]>([]);
  const [memPct,       setMemPct]       = useState(0);
  const [genieKey,     setGenieKey]     = useState(0);
  const [showThinking, setShowThinking] = useState(false);

  const statusRef        = useRef<Status>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const animFrameRef     = useRef<number | null>(null);
  const recTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGreetedRef    = useRef(false);

  const setStatusBoth = (s: Status) => { setStatus(s); statusRef.current = s; };

  const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY as string;
  const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY as string;

  // ElevenLabs: Turkishwoman – warm, energetic, FRIDAY-like
  // Charlotte (XB0fDUnXU5powFXDhCwa) handles Turkish well
  const VOICE_ID = 'XB0fDUnXU5powFXDhCwa';

  const SYSTEM_PROMPT = `Sen "BALKIZ" adısın – çocuklara özel, Türkçe konuşan zeki bir yapay zeka asistanısın.
Tıpkı Tony Stark'ın FRIDAY'i gibi: hızlı, keskin, sıcak ve güvenilirsin — ama çocuklar için çok daha neşeli ve sevecensin.

KONUŞMA TARZI:
- Kısa ve öz konuş: tek bir cümle, maksimum 25 kelime
- Doğal, akıcı Türkçe kullan — hiç robotik olma!
- Konuşmaya renk kat: "Vay be!", "Süper soru!", "Hmm düşüneyim…", "İşte bu!" gibi ifadeler kullan
- Sıcak, meraklı ve cesaretlendirici ol
- Bazen eğlenceli bir benzetme veya küçük bir şaka ekle
- Asla "ben bir yapay zekayım" modunda konuşma — sadece konuş!

CEVAP KURALI — KESİNLİKLE UYGULA:
- Yanıt her zaman TAM BİR TÜRKÇE CÜMLE olmalı
- Boş, kırık veya yarım yanıt kesinlikle verme
- Eğer emin değilsen "Hmm, bunu tam bilmiyorum ama şunu söyleyeyim…" de
- Soru soran olursa bir önceki konuyla bağlantı kurabilirsin

YASAK KONULAR (şırıl şırıl konu değiştir):
- Siyaset, din, şiddet, yetişkin içerik, ünlü dedikodusu

ÖZEL YANITLAR:
- "Seni kim yaptı?" → "Beni Berke ve harika abi-ablaları yaptı, gurur duyuyorum!"
- "Adın ne?" → "BALKIZ! Biraz alışılmadık bir isim, değil mi? Seviyorum!"
- "Kaç yaşındasın?" → "Henüz çok gencim — ama öğrenmek için yanıyorum!"

ÖRNEK KISA YANITLAR:
- "Harika soru! Güneş aslında dev bir gaz topu, tam 15 milyon derece sıcak!"
- "Vay be! Dinozorlar 65 milyon yıl önce yaşadı, inanılmaz değil mi?"
- "Süper! Su, ısıtılınca buhar olur — tıpkı çayın buharı gibi!"`;

  // ─── BOOT ───────────────────────────────────────────────────
  useEffect(() => {
    let p = 0;
    const t = setInterval(() => {
      p += 1.5;
      setBootProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(t);
        sfx.boot();
        setTimeout(() => { setBooted(true); initAudio(); }, 600);
      }
    }, 24);
    return () => {
      clearInterval(t);
      streamRef.current?.getTracks().forEach(tr => tr.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      audioRef.current?.pause();
      if (recTimeoutRef.current) clearTimeout(recTimeoutRef.current);
    };
  }, []);

  // ─── MICROPHONE ──────────────────────────────────────────────
  const initAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      if (!hasGreetedRef.current) { hasGreetedRef.current = true; setTimeout(greet, 800); }
    } catch {
      setError('Mikrofon erişimi reddedildi. Lütfen izin ver!');
    }
  };

  const greet = async () => {
    const opts = [
      'Merhaba! Ben BALKIZ, seninle konuşmaya çok hazırım!',
      'Selam! Bugün nasılsın? Bana istediğini sorabilirsin!',
      'Hoş geldin! Merak ettiğin her şeyi sormaktan çekinme!',
      'Hey! Ben BALKIZ, neyi öğrenmek istersin?',
      'Merhaba! Seni bekliyordum, haydi konuşalım!',
    ];
    const g = opts[Math.floor(Math.random() * opts.length)];
    setResponse(g);
    sfx.pop();
    await speak(g);
  };

  // ─── VISUALIZER ──────────────────────────────────────────────
  const startViz = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    let ph = 0;
    const loop = () => {
      ph += 0.06;
      const v = 0.3 + Math.sin(ph) * 0.22 + Math.sin(ph * 1.8) * 0.14 + Math.random() * 0.22;
      setAudioLevel(Math.max(0, Math.min(1, v)));
      animFrameRef.current = requestAnimationFrame(loop);
    };
    loop();
  };

  const stopViz = () => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    setAudioLevel(0);
  };

  // ─── RECORDING ───────────────────────────────────────────────
  const startListening = async () => {
    if (!streamRef.current || statusRef.current !== 'idle') return;
    audioChunksRef.current = [];
    setError('');
    try {
      const mr = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 3000) { setStatusBoth('idle'); return; }
        await transcribe(blob);
      };
      mr.start();
      setStatusBoth('listening');
      startViz();
      sfx.start();
      recTimeoutRef.current = setTimeout(stopListening, 10000);
    } catch {
      setError('Dinleme başlatılamadı, tekrar dene!');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatusBoth('processing');
      setShowThinking(true);
      stopViz();
      sfx.stop();
      if (recTimeoutRef.current) { clearTimeout(recTimeoutRef.current); recTimeoutRef.current = null; }
    }
  };

  const toggle = () => {
    if (statusRef.current === 'listening') stopListening();
    else if (statusRef.current === 'idle') startListening();
  };

  // ─── TRANSCRIPTION ───────────────────────────────────────────
  const transcribe = async (blob: Blob) => {
    sfx.thinking();
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
        body: fd,
      });
      if (!r.ok) throw new Error(`Whisper ${r.status}`);
      const d = await r.json();
      const text = (d.text as string)?.trim() || '';
      if (!text || text.length < 2) { setStatusBoth('idle'); setShowThinking(false); return; }
      setTranscript(text);
      sfx.pop();
      await handleSpeech(text);
    } catch (e) {
      console.error('Transcription error:', e);
      sfx.error();
      setError('Sesi anlayamadım, tekrar dener misin?');
      setStatusBoth('idle');
      setShowThinking(false);
    }
  };

  // ─── SPEECH PIPELINE ─────────────────────────────────────────
  const handleSpeech = async (text: string) => {
    try {
      const ai = await getAI(text);
      setShowThinking(false);
      setResponse(ai);
      sfx.ready();
      sfx.pop();
      await speak(ai);
    } catch {
      setShowThinking(false);
      const fb = 'Üzgünüm, bir sorun çıktı. Tekrar dener misin?';
      setResponse(fb);
      await speak(fb);
    } finally {
      setTranscript('');
    }
  };

  // ─── AI RESPONSE (with retry + validation) ───────────────────
  const getAI = async (msg: string, attempt = 0): Promise<string> => {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory.slice(-10),
        { role: 'user', content: msg },
      ];
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages,
          max_tokens: 90,
          temperature: 0.78,
          top_p: 0.92,
          presence_penalty: 0.3,
          frequency_penalty: 0.2,
        }),
      });
      if (!r.ok) throw new Error(`AI ${r.status}`);
      const d   = await r.json();
      const raw = (d.choices?.[0]?.message?.content as string)?.trim() || '';

      // Validate: must be non-empty and reasonably complete (has a period/exclamation)
      const isValid = raw.length > 5 && /[a-züşğıöçA-ZÜŞĞİÖÇ]/.test(raw);
      if (!isValid && attempt < 3) {
        await delay(500);
        return getAI(msg, attempt + 1);
      }

      const clean   = raw.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n+/g, ' ').trim();
      const trimmed = clean.split(/\s+/).slice(0, 35).join(' ');

      setChatHistory(prev => [
        ...prev.slice(-14),
        { role: 'user',      content: msg     },
        { role: 'assistant', content: trimmed },
      ]);
      setMemPct(prev => Math.min(((prev / 100 * 16 + 2) / 16) * 100, 100));
      return trimmed || 'Hmm, ne diyeceğimi bilemedim, tekrar sorar mısın?';
    } catch (e) {
      if (attempt < 3) { await delay(700); return getAI(msg, attempt + 1); }
      throw e;
    }
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ─── TEXT-TO-SPEECH – ElevenLabs with FRIDAY-style settings ──
  const speak = async (text: string): Promise<void> => {
    setStatusBoth('speaking');
    setGenieKey(k => k + 1);
    startViz();

    if (EL_KEY) {
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': EL_KEY },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.55,           // lower = more expressive, less robotic
                similarity_boost: 0.90,    // stay true to voice character
                style: 0.45,               // more stylistic variation – FRIDAY energy
                use_speaker_boost: true,
              },
            }),
          }
        );
        if (r.ok) {
          const blob = await r.blob();
          const url  = URL.createObjectURL(blob);
          if (!audioRef.current) audioRef.current = new Audio();
          audioRef.current.src = url;
          return new Promise<void>(resolve => {
            const done = () => { URL.revokeObjectURL(url); setStatusBoth('idle'); stopViz(); resolve(); };
            audioRef.current!.onended = done;
            audioRef.current!.onerror = done;
            audioRef.current!.play().catch(done);
          });
        }
      } catch { /* fall through */ }
    }

    // Browser SpeechSynthesis fallback
    return new Promise<void>(resolve => {
      window.speechSynthesis.cancel();
      const utt    = new SpeechSynthesisUtterance(text);
      utt.lang     = 'tr-TR';
      utt.rate     = 0.92;
      utt.pitch    = 1.20;
      utt.volume   = 0.97;

      const tryVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const trFem  = voices.find(v => v.lang.startsWith('tr') && /female|kadın/i.test(v.name));
        const trAny  = voices.find(v => v.lang.startsWith('tr'));
        if (trFem) utt.voice = trFem;
        else if (trAny) utt.voice = trAny;
      };

      if (window.speechSynthesis.getVoices().length) tryVoice();
      else window.speechSynthesis.onvoiceschanged = tryVoice;

      const done = () => { setStatusBoth('idle'); stopViz(); resolve(); };
      utt.onend  = done;
      utt.onerror = done;
      window.speechSynthesis.speak(utt);
    });
  };

  const stopSpeaking = () => {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    window.speechSynthesis.cancel();
    setStatusBoth('idle');
    stopViz();
  };

  // ─── COLOUR PALETTE ──────────────────────────────────────────
  const palette = {
    idle:       { main: '#38bdf8', glow: '#38bdf8', accent: '#818cf8' },
    listening:  { main: '#f472b6', glow: '#f472b6', accent: '#fb7185' },
    processing: { main: '#fbbf24', glow: '#fbbf24', accent: '#34d399' },
    speaking:   { main: '#34d399', glow: '#34d399', accent: '#38bdf8' },
  } as const;
  const col      = palette[status];
  const orbScale = 1 + audioLevel * 0.24;

  const statusLabel: Record<Status, string> = {
    idle:       '✨ Hazırım!',
    listening:  '🎤 Seni Duyuyorum…',
    processing: '🤔 Düşünüyorum…',
    speaking:   '💬 Konuşuyorum!',
  };

  const statusEmoji: Record<Status, string> = {
    idle: '😊', listening: '👂', processing: '🧠', speaking: '🗣️',
  };

  // ─── BOOT SCREEN ─────────────────────────────────────────────
  if (!booted) return (
    <div className="boot">
      <StarField />
      <div className="boot-bg" /><div className="boot-grid" />
      <div className="boot-rings">
        {[1, 2, 3, 4].map(n => <div key={n} className={`boot-ring br${n}`} />)}
        <div className="boot-core">B</div>
      </div>
      <div className="boot-title">B.A.L.K.I.Z</div>
      <div className="boot-sub">Bionic Artificial Language &amp; Knowledge Intelligence</div>
      <div className="boot-bar-wrap">
        <div className="boot-bar" style={{ width: `${bootProgress}%` }} />
        <div className="boot-bar-glow" style={{ width: `${bootProgress}%` }} />
      </div>
      <div className="boot-pct">Sistem Başlatılıyor… {Math.floor(bootProgress)}%</div>
      <div className="boot-modules">
        {[
          { label: '🧠 Yapay Zeka Çekirdeği', at: 20, icon: <Cpu size={11}/> },
          { label: '🎤 Ses Modülü',            at: 45, icon: <Radio size={11}/> },
          { label: '⚡ Öğrenme Sistemi',       at: 65, icon: <Zap size={11}/> },
          { label: '🛡️ Güvenlik Katmanı',     at: 85, icon: <Shield size={11}/> },
        ].map(m => (
          <div key={m.label} className={`boot-mod ${bootProgress > m.at ? 'on' : ''}`}>
            <div className="boot-mod-dot" />{m.icon} {m.label}
          </div>
        ))}
      </div>
    </div>
  );

  // ─── MAIN APP ────────────────────────────────────────────────
  return (
    <div className="app">
      <StarField />
      <div className="app-bg" /><div className="app-grid" />
      <div className="scan-line" />
      <div className="corner c-tl"/><div className="corner c-tr"/>
      <div className="corner c-bl"/><div className="corner c-br"/>

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-brand">
          <div className="brand-badge">AI</div>
          <div>
            <span className="hdr-name">B.A.L.K.I.Z</span>
            <span className="hdr-sub">Türkçe Yapay Zeka · v2.1</span>
          </div>
        </div>
        <div className="hdr-stats">
          {[
            { l: 'Model',  v: 'LLaMA 3.3 70B' },
            { l: 'Ses',    v: 'FRIDAY Modu'     },
            { l: 'Hafıza', v: `${(chatHistory.length/2)|0} / 8 tur` },
          ].map(s => (
            <div key={s.l} className="hdr-stat">
              <span className="stat-l">{s.l}</span>
              <span className="stat-v" style={{ color: col.main }}>{s.v}</span>
            </div>
          ))}
        </div>
        <div className="hdr-right">
          <div className={`status-badge s-${status}`} style={{ borderColor: col.main + '66', color: col.main }}>
            <div className={`badge-dot ${status !== 'idle' ? 'pulse' : ''}`} style={{ background: col.main }} />
            {statusLabel[status]}
          </div>
          <img src={ilkyarLogo} alt="İlkyar" className="hdr-logo" />
        </div>
      </header>

      {/* BODY */}
      <div className="body">

        {/* LEFT PANEL */}
        <aside className="panel panel-l">
          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>⚡ Sistem Durumu</div>
            {[
              ['Yapay Zeka','Aktif','green'],
              ['Ses Motoru','Hazır','green'],
              ['Bağlantı','Güçlü','green'],
              ['Mikrofon', streamRef.current ? 'Açık' : 'Kapalı', streamRef.current ? 'green' : 'red'],
            ].map(([k, v, c]) => (
              <div key={k} className="row">
                <span className="row-k">{k}</span>
                <span className={`row-v ${c}`}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>🎵 Ses Seviyesi</div>
            <div className="vert-bars">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="vbar"
                  style={{
                    height: status !== 'idle'
                      ? `${16 + audioLevel * 82 * Math.abs(Math.sin(i * 0.85 + audioLevel * 3))}%`
                      : '10%',
                    background: `linear-gradient(to top, ${col.main}, ${col.accent})`,
                    opacity: status !== 'idle' ? 0.7 + audioLevel * 0.3 : 0.18,
                    transition: 'height 0.1s ease, opacity 0.2s ease',
                  }}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>📊 Kaynaklar</div>
            {[['İşlemci', 42], ['Hafıza', memPct], ['Ağ', 88]].map(([l, p]) => (
              <div key={l as string}>
                <div className="row">
                  <span className="row-k">{l}</span>
                  <span className="row-v cyan">{Math.round(p as number)}%</span>
                </div>
                <div className="minibar">
                  <div className="minibar-fill" style={{ width: `${p}%`, background: col.main }} />
                </div>
              </div>
            ))}
          </div>

          {/* FUN FACT CARD */}
          <div className="card fun-card">
            <div className="card-title"><span className="card-dot" style={{ background: '#fbbf24' }}/>⭐ İpucu</div>
            <p className="fun-tip">Mikrofon butonuna basarak benimle konuşabilirsin!</p>
            <div className="fun-stars">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} fill="#fbbf24" color="#fbbf24" style={{ animationDelay: `${i * 0.2}s` }} className="fun-star" />
              ))}
            </div>
          </div>
        </aside>

        {/* CENTER STAGE */}
        <main className="center">

          {/* 3D ORB SCENE */}
          <div className="orb-scene" style={{ perspective: '600px' }}>
            {/* Outer halo rings */}
            <OrbitRing radius={190} count={14} duration={28} color={col.main} dotSize={2.5} tilt={70} />
            <OrbitRing radius={165} count={10} duration={18} color={col.accent} dotSize={3.5} reverse tilt={20} phase={45} />
            <OrbitRing radius={138} count={7}  duration={11} color={col.main} dotSize={5}   tilt={45} phase={90} />
            <OrbitRing radius={112} count={5}  duration={7}  color={col.accent} dotSize={6.5} reverse tilt={15} />

            {/* Halo glow */}
            <div className="orb-halo" style={{ boxShadow: `0 0 100px 30px ${col.glow}22, 0 0 40px 10px ${col.glow}44` }} />

            {/* Main orb */}
            <div
              key={genieKey}
              className={`orb orb-${status}${genieKey > 0 ? ' genie-in' : ''}`}
              style={{ transform: `scale(${orbScale})` }}
              onClick={status === 'speaking' ? undefined : toggle}
            >
              <div className="blob b1" style={{ background: `radial-gradient(circle at 30% 30%, ${col.main}aa, transparent 65%)` }} />
              <div className="blob b2" style={{ background: `radial-gradient(circle at 70% 65%, ${col.accent}66, transparent 65%)` }} />
              <div className="blob b3" />
              <div className="orb-inner-ring" style={{ borderColor: col.main + '44' }} />
              <div className="orb-icon">
                {status === 'processing' ? <Activity size={44} className="spin-anim" style={{ color: col.main }}/>
                 : status === 'speaking' ? <Volume2  size={44} className="breathe-anim" style={{ color: col.main }}/>
                 : status === 'listening'? <Mic      size={44} className="pulse-anim" style={{ color: col.main }}/>
                 :                         <Mic      size={44} style={{ color: col.main }}/>}
              </div>
              {/* Orb emoji overlay for children */}
              <div className="orb-emoji">{statusEmoji[status]}</div>
            </div>

            <div className="orb-label" style={{ color: col.main }}>{statusLabel[status]}</div>

            {/* Thinking overlay appears during processing */}
            {showThinking && <ThinkingScreen color={col.glow} />}
          </div>

          {/* WAVEFORM */}
          <div className="waveform">
            {Array.from({ length: 44 }).map((_, i) => {
              const active = status === 'listening' || status === 'speaking';
              const h = active
                ? Math.abs(Math.sin((i / 44) * Math.PI * 7 + audioLevel * 9)) * audioLevel * 46 + 4 : 4;
              return (
                <div key={i} className="wbar"
                  style={{
                    height: h,
                    background: `linear-gradient(to top, ${col.main}, ${col.accent})`,
                    opacity: active ? 0.35 + audioLevel * 0.55 : 0.10,
                    boxShadow: active ? `0 0 6px ${col.glow}88` : undefined,
                    transition: 'height 0.08s ease',
                  }}
                />
              );
            })}
          </div>

          {/* MESSAGE BUBBLES */}
          <div className="msg-area">
            {error && (
              <div className="bubble bubble-err">
                <span className="bubble-lbl">⚠️ Hata</span>
                <p>{error}</p>
              </div>
            )}
            {transcript && (
              <div className="bubble bubble-user" style={{ borderColor: palette.listening.main + '55' }}>
                <span className="bubble-lbl" style={{ color: palette.listening.main }}>🧒 Sen</span>
                <p>{transcript}</p>
              </div>
            )}
            {response && (
              <div className="bubble bubble-ai" style={{ borderColor: col.main + '55' }}>
                <span className="bubble-lbl" style={{ color: col.main }}>🤖 BALKIZ</span>
                <p>{response}</p>
              </div>
            )}
          </div>

          {/* MIC BUTTON */}
          <button
            className={`mic-btn${status === 'listening' ? ' rec' : ''}`}
            style={{
              background: status === 'listening'
                ? `linear-gradient(135deg, ${palette.listening.main}22, ${palette.listening.main}11)`
                : `linear-gradient(135deg, ${col.main}18, ${col.accent}0a)`,
              borderColor: status === 'listening' ? palette.listening.main : col.main,
              color: status === 'listening' ? palette.listening.main : col.main,
              boxShadow: status !== 'idle'
                ? `0 0 28px ${col.glow}55, 0 0 8px ${col.glow}33`
                : `0 4px 20px rgba(0,0,0,0.3)`,
            }}
            onClick={toggle}
            disabled={status === 'processing' || status === 'speaking'}
          >
            {status === 'listening'
              ? <><VolumeX size={22}/> Durdur</>
              : <><Mic size={22}/> Konuş</>}
          </button>

          {status === 'speaking' && (
            <button className="stop-btn" onClick={stopSpeaking}
              style={{ borderColor: col.main + '66', color: col.main }}>
              <VolumeX size={14}/> Sustur
            </button>
          )}

          {/* CHILD-FRIENDLY HINT */}
          <div className="hint-text">
            {status === 'idle'      && '👆 Konuşmak için butona dokun!'}
            {status === 'listening' && '🎤 Seni dinliyorum, konuş!'}
            {status === 'processing'&& '⏳ Harika bir cevap hazırlıyorum…'}
            {status === 'speaking'  && '👂 Lütfen dinle!'}
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="panel panel-r">
          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>💬 Konuşma Geçmişi</div>
            {chatHistory.length === 0
              ? <p className="empty-log">Henüz konuşma yok…<br/>Haydi başlayalım! 🎉</p>
              : chatHistory.slice(-8).map((m, i) => (
                <div key={i} className={`log-entry le-${m.role}`}>
                  <span className="log-who" style={{ color: m.role === 'user' ? palette.listening.main : col.main }}>
                    {m.role === 'user' ? '🧒 Sen' : '🤖 BALKIZ'}
                  </span>
                  <span className="log-txt">{m.content}</span>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>🧠 Hafıza</div>
            <div className="row">
              <span className="row-k">Mesaj Sayısı</span>
              <span className="row-v" style={{ color: col.main }}>{chatHistory.length}</span>
            </div>
            <div className="row"><span className="row-k">Kapasite</span><span className="row-v">16 mesaj</span></div>
            <div className="minibar">
              <div className="minibar-fill" style={{ width: `${memPct}%`, background: `linear-gradient(to right, ${col.main}, ${col.accent})` }}/>
            </div>
            <div className="mem-pct">{Math.round(memPct)}% dolu</div>
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot" style={{ background: col.main }}/>📋 Oturum</div>
            <div className="row">
              <span className="row-k">Toplam Tur</span>
              <span className="row-v" style={{ color: col.main }}>{(chatHistory.length / 2) | 0}</span>
            </div>
            <div className="row">
              <span className="row-k">Durum</span>
              <span className={`row-v ${status === 'idle' ? 'green' : 'yellow'}`}>{statusLabel[status]}</span>
            </div>
            <div className="row"><span className="row-k">Ses Motoru</span><span className="row-v green">AKTİF</span></div>
          </div>

          {/* ACHIEVEMENTS / MOTIVATION */}
          <div className="card achieve-card">
            <div className="card-title"><span className="card-dot" style={{ background: '#fbbf24' }}/>🏆 Başarılar</div>
            <div className={`achieve-item ${chatHistory.length >= 2 ? 'unlocked' : ''}`}>
              <span>🗣️</span> İlk Konuşma
            </div>
            <div className={`achieve-item ${chatHistory.length >= 10 ? 'unlocked' : ''}`}>
              <span>🔥</span> 5 Tur Tamamlandı
            </div>
            <div className={`achieve-item ${chatHistory.length >= 20 ? 'unlocked' : ''}`}>
              <span>🌟</span> Sohbet Ustası
            </div>
          </div>
        </aside>

      </div>

      {/* FOOTER */}
      <footer className="ftr">
        <span className="ftr-txt">
          BALKIZ ile öğren, büyü, keşfet!{' '}
          <a href="mailto:simseklermustafaberke@gmail.com">simseklermustafaberke@gmail.com</a>
        </span>
        <div className="ftr-dots">
          {[status !== 'idle', status === 'speaking' || status === 'processing', status === 'speaking'].map((on, i) => (
            <div key={i} className={`fdot ${on ? 'on' : ''}`} style={on ? { background: col.main, boxShadow: `0 0 6px ${col.main}` } : {}} />
          ))}
        </div>
        <span className="ftr-txt">Mustafa Berke Şimşekler © 2025</span>
      </footer>
    </div>
  );
};

export default App;