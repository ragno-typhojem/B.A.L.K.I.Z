import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Activity, Cpu, Radio, Zap, Shield } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';

type Message = { role: 'user' | 'assistant'; content: string };
type Status  = 'idle' | 'listening' | 'processing' | 'speaking';

// ─────────────────────────────────────────────────────────────
//  🔊 WEB AUDIO – Synthesised Sound Effects (no file needed)
// ─────────────────────────────────────────────────────────────
let _actx: AudioContext | null = null;
const actx = () => {
  if (!_actx) _actx = new (window.AudioContext || (window as any).webkitAudioContext)();
  return _actx;
};
const tone = (
  freq: number, dur: number,
  vol = 0.08, type: OscillatorType = 'sine', delay = 0
) => {
  try {
    const ctx = actx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = type; o.frequency.value = freq;
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.01);
  } catch { /* silent */ }
};
const sfx = {
  start:    () => { tone(880,0.14,0.11); tone(1320,0.10,0.08,'sine',0.12); },
  stop:     () => { tone(660,0.10,0.09); tone(440,0.14,0.07,'sine',0.10); },
  thinking: () => [440,528,660,784].forEach((f,i)=>tone(f,0.18,0.06,'sine',i*0.13)),
  ready:    () => [660,880,1100,1320].forEach((f,i)=>tone(f,0.14,0.08,'sine',i*0.10)),
  error:    () => { tone(220,0.30,0.10,'sawtooth'); tone(180,0.25,0.08,'sawtooth',0.15); },
};

// ─────────────────────────────────────────────────────────────
//  🪐 JARVIS Orbit Ring  – dots placed at even angles on a ring
// ─────────────────────────────────────────────────────────────
interface OrbitProps {
  radius: number; count: number; duration: number;
  color: string;  dotSize: number; reverse?: boolean; pulsing?: boolean;
}
const OrbitRing = ({ radius, count, duration, color, dotSize, reverse, pulsing }: OrbitProps) => (
  <div
    className={`orbit-ring${reverse ? ' rev' : ''}`}
    style={{
      width: radius * 2, height: radius * 2,
      animationDuration: `${duration}s`,
      position: 'absolute',
      top: '50%', left: '50%',
      marginTop: -radius, marginLeft: -radius,
    }}
  >
    {Array.from({ length: count }).map((_, i) => {
      const angle = (i / count) * 360;
      return (
        <div
          key={i}
          className={`orbit-dot${pulsing ? ' pulsing' : ''}`}
          style={{
            width: dotSize, height: dotSize,
            background: color,
            boxShadow: `0 0 ${dotSize * 2}px ${color}cc, 0 0 ${dotSize * 4}px ${color}44`,
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
//  🤖 MAIN APP
// ─────────────────────────────────────────────────────────────
const App = () => {
  const [status,        setStatus]        = useState<Status>('idle');
  const [transcript,    setTranscript]    = useState('');
  const [response,      setResponse]      = useState('');
  const [audioLevel,    setAudioLevel]    = useState(0);
  const [bootProgress,  setBootProgress]  = useState(0);
  const [booted,        setBooted]        = useState(false);
  const [error,         setError]         = useState('');
  const [chatHistory,   setChatHistory]   = useState<Message[]>([]);
  const [memPct,        setMemPct]        = useState(0);
  const [genieKey,      setGenieKey]      = useState(0);

  // statusRef prevents stale-closure bugs in async callbacks
  const statusRef        = useRef<Status>('idle');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef   = useRef<Blob[]>([]);
  const streamRef        = useRef<MediaStream | null>(null);
  const audioRef         = useRef<HTMLAudioElement | null>(null);
  const animFrameRef     = useRef<number | null>(null);
  const recTimeoutRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasGreetedRef    = useRef(false);

  const setStatusBoth = (s: Status) => { setStatus(s); statusRef.current = s; };

  const GROQ_KEY = import.meta.env.VITE_GROQ_API_KEY  as string;
  const EL_KEY   = import.meta.env.VITE_ELEVENLABS_API_KEY as string;
  // Charlotte – warm multilingual female, handles Turkish beautifully
  const VOICE_ID = 'XB0fDUnXU5powFXDhCwa';

  const SYSTEM_PROMPT = `Sen "BALKIZ" adında çocuklarla konuşan eğlenceli ve zeki bir yapay zeka asistanısın.
Tıpkı Tony Stark'ın yapay zekası Friday gibi zeki, sıcak ve yardımseversin — ama çok daha neşeli ve çocuk dostusun.

TEMEL KURALLAR:
- Her zaman Türkçe konuş
- Kısa cevap ver: maksimum 1-2 cümle, toplam 20 kelimeyi geçme
- Samimi, doğal ve sıcak konuş; robotik kesinlikle olma
- Zaman zaman "Vay be!", "Harika!", "Hmm ilginç...", "Evet tabii ki!" gibi doğal ifadeler kullan
- Çocukları cesarelendirici ve merak uyandırıcı ol
- Bilinmeyen sorularda şirin bir şekilde "Bunu henüz öğrenmedim!" de

YASAK KONULAR (nazikçe konu değiştir):
- Din, siyaset, şiddet, yetişkin içerikleri, ünlüler hakkında dedikodu

ÖZEL YANITLAR:
- "Seni kim yaptı?" → "Beni Berke ve güzel abi ablaları yaptı!"
- "Adın ne?" → "Benim adım BALKIZ!"
- Yapamayacakların → "Bunu henüz öğrenmedim, ama çalışıyorum!"

ÖRNEK İYİ YANITLAR:
- "Harika soru! Güneş çok sıcak bir yıldızdır, 15 milyon derece!"
- "Vay be, bunu bilmek çok eğlenceli! Dinozorlar 65 milyon yıl önce yaşadı."
- "Hmm, şöyle düşünelim... matematik aslında günlük hayatta her yerde var!"`;

  // ─── BOOT ───────────────────────────────────────────────────
  useEffect(() => {
    let p = 0;
    const t = setInterval(() => {
      p += 2;
      setBootProgress(Math.min(p, 100));
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => { setBooted(true); initAudio(); }, 500);
      }
    }, 28);
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
      if (!hasGreetedRef.current) { hasGreetedRef.current = true; setTimeout(greet, 900); }
    } catch {
      setError('Mikrofon erişimi reddedildi. Lütfen izin ver!');
    }
  };

  const greet = async () => {
    const opts = [
      'Merhaba! Ben BALKIZ. Seninle konuşmaya hazırım!',
      'Selam! Bugün nasılsın? Sana yardım etmek için buradayım!',
      'Hoş geldin! Seni dinliyorum, ne öğrenmek istersin?',
      'Merhaba! Hazırım, haydi konuşalım!',
      'Hey! Ben BALKIZ. Bana istediğini sorabilirsin!',
    ];
    const g = opts[Math.floor(Math.random() * opts.length)];
    setResponse(g);
    await speak(g);
  };

  // ─── VISUALIZER ──────────────────────────────────────────────
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
      setError('Dinleme başlatılamadı');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
      setStatusBoth('processing');
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
      if (!text || text.length < 2) { setStatusBoth('idle'); return; }
      setTranscript(text);
      await handleSpeech(text);
    } catch (e) {
      console.error('Transcription error:', e);
      sfx.error();
      setError('Ses tanıma başarısız oldu. Tekrar dene!');
      setStatusBoth('idle');
    }
  };

  // ─── SPEECH PIPELINE ─────────────────────────────────────────
  const handleSpeech = async (text: string) => {
    try {
      const ai = await getAI(text);
      setResponse(ai);
      sfx.ready();
      await speak(ai);
    } catch {
      const fb = 'Üzgünüm, bir sorun çıktı. Tekrar dener misin?';
      setResponse(fb);
      await speak(fb);
    } finally {
      setTranscript('');
    }
  };

  // ─── AI RESPONSE (with retry) ────────────────────────────────
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
          max_tokens: 80,
          temperature: 0.75,
          top_p: 0.9,
        }),
      });
      if (!r.ok) throw new Error(`AI ${r.status}`);
      const d   = await r.json();
      const raw = (d.choices?.[0]?.message?.content as string)?.trim() || '';
      // Empty response → retry up to 2 times
      if (!raw && attempt < 2) { await delay(400); return getAI(msg, attempt + 1); }
      const clean   = raw.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n+/g, ' ').trim();
      const trimmed = clean.split(/\s+/).slice(0, 30).join(' ');
      setChatHistory(prev => [
        ...prev.slice(-10),
        { role: 'user',      content: msg     },
        { role: 'assistant', content: trimmed },
      ]);
      setMemPct(prev => Math.min(((prev / 100 * 16 + 2) / 16) * 100, 100));
      return trimmed || 'Hmm, ne diyeceğimi bilemedim. Tekrar sorar mısın?';
    } catch (e) {
      if (attempt < 2) { await delay(600); return getAI(msg, attempt + 1); }
      throw e;
    }
  };

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  // ─── TEXT-TO-SPEECH ──────────────────────────────────────────
  // 1) ElevenLabs regular endpoint (not /stream — avoids 402 on lower plans)
  // 2) Browser SpeechSynthesis fallback
  const speak = async (text: string): Promise<void> => {
    setStatusBoth('speaking');
    setGenieKey(k => k + 1);   // triggers genie CSS animation
    startViz();

    // ── Try ElevenLabs ──
    if (EL_KEY) {
      try {
        const r = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'xi-api-key': EL_KEY },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.72,
                similarity_boost: 0.85,
                style: 0.28,
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
        // 402 / 403 / 429 → fall through to browser TTS
      } catch { /* fall through */ }
    }

    // ── Browser SpeechSynthesis fallback ──
    return new Promise<void>(resolve => {
      window.speechSynthesis.cancel();
      const utt    = new SpeechSynthesisUtterance(text);
      utt.lang     = 'tr-TR';
      utt.rate     = 0.90;
      utt.pitch    = 1.15;   // slightly higher = warmer, less robotic
      utt.volume   = 0.95;

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
    idle:       { main: '#00d4ff', glow: '#00d4ff' },
    listening:  { main: '#ff4757', glow: '#ff4757' },
    processing: { main: '#ffd32a', glow: '#ffd32a' },
    speaking:   { main: '#7bed9f', glow: '#7bed9f' },
  } as const;
  const col      = palette[status];
  const orbScale = 1 + audioLevel * 0.28;

  const statusLabel: Record<Status, string> = {
    idle:       '✨ Hazırım!',
    listening:  '🎤 Seni Dinliyorum...',
    processing: '🤔 Düşünüyorum...',
    speaking:   '💬 Konuşuyorum!',
  };

  // ─── BOOT SCREEN ─────────────────────────────────────────────
  if (!booted) return (
    <div className="boot">
      <div className="boot-bg" /><div className="boot-grid" />
      <div className="boot-rings">
        {[1,2,3].map(n => <div key={n} className={`boot-ring br${n}`} />)}
        <div className="boot-core">B</div>
      </div>
      <div className="boot-title">B.A.L.K.I.Z</div>
      <div className="boot-sub">Bionic Artificial Language &amp; Knowledge Intelligence</div>
      <div className="boot-bar-wrap">
        <div className="boot-bar" style={{ width: `${bootProgress}%` }} />
        <div className="boot-bar-glow" style={{ width: `${bootProgress}%` }} />
      </div>
      <div className="boot-pct">Sistem Başlatılıyor... {Math.floor(bootProgress)}%</div>
      <div className="boot-modules">
        {[
          { label: '🧠 Yapay Zeka Çekirdeği', at: 20, icon: <Cpu    size={11}/> },
          { label: '🎤 Ses Modülü',            at: 45, icon: <Radio  size={11}/> },
          { label: '⚡ Öğrenme Sistemi',       at: 65, icon: <Zap    size={11}/> },
          { label: '🛡️ Güvenlik Katmanı',      at: 85, icon: <Shield size={11}/> },
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
      <div className="app-bg" /><div className="app-grid" /><div className="scan-line" />
      <div className="corner c-tl"/><div className="corner c-tr"/>
      <div className="corner c-bl"/><div className="corner c-br"/>

      {/* HEADER */}
      <header className="hdr">
        <div className="hdr-brand">
          <span className="hdr-name">B.A.L.K.I.Z</span>
          <span className="hdr-sub">Türkçe Yapay Zeka · v2</span>
        </div>
        <div className="hdr-stats">
          {[
            { l: 'Model',  v: 'LLaMA 3.3 70B' },
            { l: 'Ses',    v: 'Çok Dilli'       },
            { l: 'Hafıza', v: `${(chatHistory.length/2)|0} / 8 tur` },
          ].map(s => (
            <div key={s.l} className="hdr-stat">
              <span className="stat-l">{s.l}</span>
              <span className="stat-v">{s.v}</span>
            </div>
          ))}
        </div>
        <div className="hdr-right">
          <div className={`status-badge s-${status}`}>
            <div className={`badge-dot ${status !== 'idle' ? 'pulse' : ''}`} />
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
            <div className="card-title"><span className="card-dot"/>⚡ Sistem Durumu</div>
            {[
              ['Yapay Zeka','Aktif','green'],
              ['Ses Motoru','Hazır','green'],
              ['Bağlantı','Güçlü','green'],
              ['Mikrofon', streamRef.current ? 'Açık' : 'Kapalı', streamRef.current ? 'green':'red'],
            ].map(([k,v,c])=>(
              <div key={k} className="row">
                <span className="row-k">{k}</span>
                <span className={`row-v ${c}`}>{v}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot"/>🎵 Ses Seviyesi</div>
            <div className="vert-bars">
              {Array.from({length:10}).map((_,i)=>(
                <div key={i} className="vbar"
                  style={{
                    height: status!=='idle'
                      ? `${14+audioLevel*86*Math.abs(Math.sin(i*0.9))}%`
                      : '12%',
                    background: col.main,
                    opacity: status!=='idle' ? 0.7+audioLevel*0.3 : 0.2,
                    animationDelay: `${i*0.1}s`,
                  }}
                />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot"/>📊 Kaynaklar</div>
            {[['İşlemci',42],['Hafıza',memPct],['Ağ',88]].map(([l,p])=>(
              <div key={l}>
                <div className="row">
                  <span className="row-k">{l}</span>
                  <span className="row-v cyan">{Math.round(p as number)}%</span>
                </div>
                <div className="minibar">
                  <div className="minibar-fill" style={{width:`${p}%`, background:col.main}} />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* CENTER STAGE */}
        <main className="center">
          {/* JARVIS ORB + ORBITING DOTS */}
          <div className="orb-scene">
            <OrbitRing radius={175} count={12} duration={22} color={col.main} dotSize={3} pulsing/>
            <OrbitRing radius={145} count={6}  duration={9}  color={col.main} dotSize={5} reverse/>
            <OrbitRing radius={115} count={4}  duration={6}  color={col.main} dotSize={7} />

            {/* Halo glow */}
            <div className="orb-halo" style={{boxShadow:`0 0 80px 20px ${col.glow}28`}} />

            {/* Main orb – genie key triggers CSS re-animation */}
            <div
              key={genieKey}
              className={`orb orb-${status}${genieKey>0 ? ' genie-in':''}`}
              style={{ transform:`scale(${orbScale})` }}
              onClick={status === 'speaking' ? undefined : toggle}
            >
              <div className="blob b1" style={{background:`radial-gradient(circle at 30% 30%, ${col.main}99, transparent 70%)`}} />
              <div className="blob b2" style={{background:`radial-gradient(circle at 70% 65%, ${col.main}55, transparent 70%)`}} />
              <div className="blob b3" />
              <div className="orb-icon">
                {status==='processing' ? <Activity size={42} className="spin-anim"/>
                 : status==='speaking' ? <Volume2  size={42} className="breathe-anim"/>
                 : status==='listening'? <Mic      size={42} className="pulse-anim"/>
                 :                       <Mic      size={42}/>}
              </div>
            </div>

            <div className="orb-label" style={{color:col.main}}>{statusLabel[status]}</div>
          </div>

          {/* WAVEFORM */}
          <div className="waveform">
            {Array.from({length:40}).map((_,i)=>{
              const active = status==='listening'||status==='speaking';
              const h = active
                ? Math.abs(Math.sin((i/40)*Math.PI*6 + audioLevel*8))*audioLevel*42+4 : 4;
              return (
                <div key={i} className="wbar"
                  style={{
                    height: h,
                    background: col.main,
                    opacity: active ? 0.35+audioLevel*0.55 : 0.12,
                    boxShadow: active ? `0 0 5px ${col.glow}99`:undefined,
                  }}
                />
              );
            })}
          </div>

          {/* MESSAGE BUBBLES */}
          <div className="msg-area">
            {error && (
              <div className="bubble bubble-err">
                <span className="bubble-lbl">⚠️ Sistem</span>
                <p>{error}</p>
              </div>
            )}
            {transcript && (
              <div className="bubble bubble-user">
                <span className="bubble-lbl">🧒 Sen</span>
                <p>{transcript}</p>
              </div>
            )}
            {response && (
              <div className="bubble bubble-ai">
                <span className="bubble-lbl">🤖 BALKIZ</span>
                <p>{response}</p>
              </div>
            )}
          </div>

          {/* MIC BUTTON */}
          <button
            className={`mic-btn${status==='listening'?' rec':''}`}
            style={{
              borderColor: col.main,
              color: col.main,
              boxShadow: status!=='idle' ? `0 0 22px ${col.glow}66` : undefined,
            }}
            onClick={toggle}
            disabled={status==='processing'||status==='speaking'}
          >
            {status==='listening'
              ? <><VolumeX size={20}/> Durdur</>
              : <><Mic size={20}/> Konuş</>}
          </button>

          {status==='speaking' && (
            <button className="stop-btn" onClick={stopSpeaking}>
              <VolumeX size={13}/> Sustur
            </button>
          )}
        </main>

        {/* RIGHT PANEL */}
        <aside className="panel panel-r">
          <div className="card">
            <div className="card-title"><span className="card-dot"/>💬 Konuşma Geçmişi</div>
            {chatHistory.length===0
              ? <p className="empty-log">Henüz konuşma yok...</p>
              : chatHistory.slice(-8).map((m,i)=>(
                <div key={i} className={`log-entry le-${m.role}`}>
                  <span className="log-who">{m.role==='user'?'🧒 Sen':'🤖 BALKIZ'}</span>
                  <span className="log-txt">{m.content}</span>
                </div>
              ))
            }
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot"/>🧠 Hafıza</div>
            <div className="row"><span className="row-k">Mesaj Sayısı</span><span className="row-v cyan">{chatHistory.length}</span></div>
            <div className="row"><span className="row-k">Kapasite</span><span className="row-v">16 mesaj</span></div>
            <div className="minibar"><div className="minibar-fill" style={{width:`${memPct}%`,background:col.main}}/></div>
          </div>

          <div className="card">
            <div className="card-title"><span className="card-dot"/>📋 Oturum</div>
            <div className="row"><span className="row-k">Toplam Tur</span><span className="row-v cyan">{(chatHistory.length/2)|0}</span></div>
            <div className="row"><span className="row-k">Durum</span>
              <span className={`row-v ${status==='idle'?'green':'yellow'}`}>{statusLabel[status]}</span>
            </div>
            <div className="row"><span className="row-k">Ses Motoru</span><span className="row-v green">AKTİF</span></div>
          </div>
        </aside>

      </div>{/* /body */}

      {/* FOOTER */}
      <footer className="ftr">
        <span className="ftr-txt">
          BALKIZ'ı sorgula, geliştir, büyüt.{' '}
          <a href="mailto:simseklermustafaberke@gmail.com">simseklermustafaberke@gmail.com</a>
        </span>
        <div className="ftr-dots">
          {[status!=='idle', status==='speaking'||status==='processing', status==='speaking'].map((on,i)=>(
            <div key={i} className={`fdot ${on?'on':''}`}/>
          ))}
        </div>
        <span className="ftr-txt">Mustafa Berke Şimşekler © 2025</span>
      </footer>
    </div>
  );
};

export default App;