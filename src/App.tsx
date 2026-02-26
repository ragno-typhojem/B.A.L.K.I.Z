import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Radio, Activity } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };

const App = () => {
  const [isListening, setIsListening]     = useState(false);
  const [isSpeaking, setIsSpeaking]       = useState(false);
  const [isProcessing, setIsProcessing]   = useState(false);
  const [transcript, setTranscript]       = useState('');
  const [response, setResponse]           = useState('');
  const [audioLevel, setAudioLevel]       = useState(0);
  const [showBootScreen, setShowBootScreen] = useState(true);
  const [bootProgress, setBootProgress]   = useState(0);
  const [error, setError]                 = useState('');
  const [hasGreeted, setHasGreeted]       = useState(false);
  const [chatHistory, setChatHistory]     = useState<Message[]>([]);
  const [genieVisible, setGenieVisible]   = useState(false);

  const mediaRecorderRef    = useRef<MediaRecorder | null>(null);
  const audioChunksRef      = useRef<Blob[]>([]);
  const streamRef           = useRef<MediaStream | null>(null);
  const audioRef            = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef   = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

  // ✅ KISA PROMPT - Kredi tasarrufu
  const SYSTEM_PROMPT = `Sen B.A.L.K.I.Z - zeki, az espirili Türk kadın asistanısın. 
  Memleketin Yok. 
  Kullanıcıyla samimi, saygılı ve neşeli bir şekilde konuşursun. Cevapların kısa. Espiri yapman istendiğinde yaparsın. 
  Soru sorduğunda yanıtlarsın. Anlamadığında kibarca tekrar sorarsın. 
KURAL: Maksimum 2 cümle, 15 kelime. Nazik ol.
YASAK: Din, siyaset, cinsellik, şiddet, ünlüler ve popüler kültür sorulursa belli etmeden konuyu değiştirmeye çalış. Cevap vermekten kaçın.
Yapamayacakların için: "Bunu maalesef yapamıyorum, ama başka nasıl yardımcı olabilirim?" dersin.`;

  useEffect(() => {
    let progress = 0;
    const bootInterval = setInterval(() => {
      progress += 2;
      setBootProgress(progress);
      if (progress >= 100) {
        clearInterval(bootInterval);
        setTimeout(() => {
          setShowBootScreen(false);
          initializeAudio();
        }, 300);
      }
    }, 30);
    return () => {
      clearInterval(bootInterval);
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioRef.current?.pause();
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      streamRef.current = stream;
      if (!hasGreeted) setTimeout(() => greetUser(), 800);
    } catch {
      setError('Mikrofon erişimi reddedildi');
    }
  };

  const greetUser = async () => {
    const greetings = ['Hazırım! Ne yapıyoruz?', 'Sistem devrede.', 'Seni dinliyorum.'];
    const g = greetings[Math.floor(Math.random() * greetings.length)];
    setResponse(g);
    setHasGreeted(true);
    // Cin çıkış animasyonu
    setGenieVisible(false);
    setTimeout(() => setGenieVisible(true), 100);
    await speak(g);
  };

  const startAudioVisualization = () => {
    let phase = 0;
    const animate = () => {
      if (!isSpeaking && !isListening) { setAudioLevel(0); return; }
      phase += 0.08;
      const level = 0.3 + Math.sin(phase) * 0.25 + Math.sin(phase * 1.5) * 0.15 + Math.random() * 0.3;
      setAudioLevel(Math.min(Math.max(level, 0), 1));
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();
  };

  const startListening = async () => {
    if (!streamRef.current || isProcessing || isSpeaking) return;
    try {
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size < 3000) { setIsProcessing(false); return; }
        await transcribeAudio(blob);
      };
      mediaRecorder.start();
      setIsListening(true);
      startAudioVisualization();
      recordingTimeoutRef.current = setTimeout(() => stopListening(), 8000);
    } catch {
      setError('Dinleme başlatılamadı');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setAudioLevel(0);
      if (recordingTimeoutRef.current) { clearTimeout(recordingTimeoutRef.current); recordingTimeoutRef.current = null; }
    }
  };

  const toggleListening = () => isListening ? stopListening() : startListening();

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'tr');
      formData.append('response_format', 'json');
      formData.append('temperature', '0');
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: formData
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const text = data.text?.trim() || '';
      if (!text || text.length < 2) { setIsProcessing(false); return; }
      setTranscript(text);
      await handleUserSpeech(text);
    } catch {
      setError('Ses tanıma başarısız');
      setIsProcessing(false);
    }
  };

  const handleUserSpeech = async (text: string) => {
    if (!text.trim()) { setIsProcessing(false); return; }
    try {
      const aiResponse = await getAIResponse(text);
      setResponse(aiResponse);
      // Her yanıtta cin animasyonu
      setGenieVisible(false);
      setTimeout(() => setGenieVisible(true), 50);
      await speak(aiResponse);
    } catch {
      const msg = 'Tekrar söyler misin?';
      setResponse(msg);
      await speak(msg);
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  };

  const getAIResponse = async (userMessage: string): Promise<string> => {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...chatHistory.slice(-6), // Sadece son 6 mesaj - kredi tasarrufu
      { role: 'user', content: userMessage }
    ];
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // ✅ Hızlı + ucuz
        messages,
        max_tokens: 30,       // ✅ Çok kısa - kredi tasarrufu
        temperature: 0.4,
        top_p: 0.85,
      })
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    let aiResponse = data.choices[0].message.content.trim()
      .replace(/\*\*/g, '').replace(/\*/g, '').replace(/\n+/g, ' ').trim();
    // Max 12 kelime
    aiResponse = aiResponse.split(/\s+/).slice(0, 12).join(' ');
    setChatHistory(prev => [
      ...prev.slice(-6),
      { role: 'user', content: userMessage },
      { role: 'assistant', content: aiResponse }
    ]);
    return aiResponse;
  };

  const speak = async (text: string): Promise<void> => {
    setIsSpeaking(true);
    startAudioVisualization();
    const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
    const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
    try {
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text,
          model_id: "eleven_turbo_v2_5",
          language_code: "tr",
          voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true }
        })
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => { URL.revokeObjectURL(url); setIsSpeaking(false); setAudioLevel(0); };
      audioRef.current.onerror = () => { URL.revokeObjectURL(url); setIsSpeaking(false); setAudioLevel(0); };
      await audioRef.current.play();
    } catch {
      setIsSpeaking(false);
      setAudioLevel(0);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; }
    setIsSpeaking(false);
    setAudioLevel(0);
  };

  // ─── BOOT SCREEN ────────────────────────────────────────────────
  if (showBootScreen) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', zIndex: 9999, padding: '2rem',
        fontFamily: "'Courier New', monospace"
      }}>
        {/* Dönen halka animasyonu */}
        <div style={{ position: 'relative', width: 160, height: 160, marginBottom: '2rem' }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: '2px solid transparent',
            borderTopColor: '#0ff', borderRightColor: '#0ff4',
            animation: 'spin 1.2s linear infinite'
          }} />
          <div style={{
            position: 'absolute', inset: 15, borderRadius: '50%',
            border: '2px solid transparent',
            borderBottomColor: '#0ff', borderLeftColor: '#0ff4',
            animation: 'spin 1.8s linear infinite reverse'
          }} />
          <div style={{
            position: 'absolute', inset: 30, borderRadius: '50%',
            background: 'radial-gradient(circle, #0ff2, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#0ff', fontSize: '2rem', fontWeight: 'bold',
            textShadow: '0 0 20px #0ff'
          }}>
            B
          </div>
        </div>

        <h1 style={{
          fontSize: 'clamp(2rem, 8vw, 5rem)', color: '#0ff',
          letterSpacing: 'clamp(0.5rem, 2vw, 1.5rem)',
          textShadow: '0 0 40px #0ff', marginBottom: '0.5rem',
          animation: 'glow 2s infinite'
        }}>B.A.L.K.I.Z</h1>

        <p style={{
          color: '#0ffa', letterSpacing: '0.3rem',
          fontSize: 'clamp(0.8rem, 2vw, 1rem)', marginBottom: '2.5rem'
        }}>BİONİK YAPAY ZEKA vEarly.1</p>

        <div style={{
          width: 'min(500px, 85vw)', height: 4,
          background: '#0ff2', borderRadius: 2, marginBottom: '1rem'
        }}>
          <div style={{
            height: '100%', width: `${bootProgress}%`,
            background: 'linear-gradient(90deg, #0ff, #fff)',
            boxShadow: '0 0 20px #0ff', borderRadius: 2,
            transition: 'width 0.2s'
          }} />
        </div>

        <p style={{ color: '#0ff', letterSpacing: '0.3rem', fontSize: '0.9rem' }}>
          HAZIRLANIYOR... {bootProgress}%
        </p>
      </div>
    );
  }

  // ─── DURUM RENKLERİ ─────────────────────────────────────────────
  const orbColor = isListening
    ? { c1: '#ff3333', c2: '#ff0055', c3: '#ff8800', glow: '#ff3333' }
    : isSpeaking
    ? { c1: '#00ffff', c2: '#bc13fe', c3: '#00ffff', glow: '#bc13fe' }
    : isProcessing
    ? { c1: '#ccff00', c2: '#00ffaa', c3: '#ccff00', glow: '#ccff00' }
    : { c1: '#00ffff', c2: '#0088ff', c3: '#00ffff', glow: '#00ffff' };

  const orbScale = 1 + audioLevel * 0.5;

  // ─── ANA UYGULAMA ────────────────────────────────────────────────
  return (
    <div className="app">
      <div className="grid-bg" />
      <div className="scan-lines" />

      {/* HEADER */}
      <header style={{
        position: 'relative', zIndex: 10,
        background: '#000d', borderBottom: '1px solid #0ff4',
        backdropFilter: 'blur(10px)',
        padding: '0.7rem 1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        boxShadow: '0 0 30px #0ff2'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          <Radio size={20} color="#0ff" />
          <div>
            <div style={{
              fontSize: 'clamp(0.9rem, 2.5vw, 1.3rem)',
              letterSpacing: '0.4rem',
              background: 'linear-gradient(90deg, #0ff, #fff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              fontFamily: "'Courier New', monospace", fontWeight: 'bold'
            }}>B.A.L.K.I.Z</div>
            <div style={{ fontSize: '0.6rem', color: '#0ff7', letterSpacing: '0.15rem' }}>
              BİONİK YAPAY ZEKA vEarly.1
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Durum badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.4rem',
            background: '#0ff1', border: '1px solid #0ff3',
            borderRadius: 6, padding: '0.3rem 0.8rem',
            fontSize: '0.7rem', letterSpacing: '0.1rem', color: '#0ff'
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isListening ? '#0ff' : isSpeaking ? '#0f8' : isProcessing ? '#ff0' : '#0ff5',
              boxShadow: isListening ? '0 0 10px #0ff' : isSpeaking ? '0 0 10px #0f8' : 'none',
              animation: isListening ? 'blink 1s infinite' : 'none'
            }} />
            {isProcessing ? 'DÜŞÜNÜYOR' : isListening ? 'DİNLİYOR' : isSpeaking ? 'KONUŞUYOR' : 'HAZIR'}
          </div>

          <div style={{
            background: '#0ff1', border: '1px dashed #0ff4',
            borderRadius: 6, padding: '0.3rem 0.8rem'
          }}>
            <img src={ilkyarLogo} alt="İlkyar" style={{ height: 28, display: 'block' }} />
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main style={{
        position: 'relative', zIndex: 5,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 60px)',
        padding: '1rem',
        fontFamily: "'Courier New', monospace"
      }}>

        {/* ── CİN EFEKT CONTAINER ─────────────────────────────── */}
        <div style={{
          position: 'relative',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: '1.5rem'
        }}>

          {/* Duman / liquid efekti - alttan yukarı çıkış */}
          {(isSpeaking || genieVisible) && (
            <>
              {/* Sol duman */}
              <div style={{
                position: 'absolute',
                bottom: -20, left: '15%',
                width: 40, height: 120,
                background: `linear-gradient(to top, ${orbColor.glow}88, transparent)`,
                borderRadius: '50% 50% 0 0',
                filter: 'blur(15px)',
                animation: 'genie-left 1.2s ease-out forwards',
                pointerEvents: 'none'
              }} />
              {/* Sağ duman */}
              <div style={{
                position: 'absolute',
                bottom: -20, right: '15%',
                width: 40, height: 120,
                background: `linear-gradient(to top, ${orbColor.glow}88, transparent)`,
                borderRadius: '50% 50% 0 0',
                filter: 'blur(15px)',
                animation: 'genie-right 1.2s ease-out forwards',
                pointerEvents: 'none'
              }} />
              {/* Orta duman */}
              <div style={{
                position: 'absolute',
                bottom: -30, left: '50%',
                transform: 'translateX(-50%)',
                width: 60, height: 160,
                background: `linear-gradient(to top, ${orbColor.glow}66, transparent)`,
                borderRadius: '50% 50% 20% 20%',
                filter: 'blur(20px)',
                animation: 'genie-center 1s ease-out forwards',
                pointerEvents: 'none'
              }} />
            </>
          )}

          {/* ── ORB (Enerji Topu) ─────────────────────────────── */}
          <div
            onClick={toggleListening}
            style={{
              position: 'relative',
              width: 160, height: 160,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isProcessing ? 'wait' : 'pointer',
              transform: `scale(${orbScale})`,
              transition: 'transform 0.05s cubic-bezier(0.4,0,0.2,1)',
              animation: 'float-organic 4s ease-in-out infinite',
              // Cin çıkış animasyonu
              ...(genieVisible ? { animation: 'genie-appear 0.6s cubic-bezier(0.34,1.56,0.64,1) forwards, float-organic 4s ease-in-out 0.6s infinite' } : {})
            }}
          >
            {/* Blob katmanları */}
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(135deg, ${orbColor.c1}, ${orbColor.c2})`,
              borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
              filter: 'blur(12px)', opacity: 0.8, mixBlendMode: 'screen',
              animation: 'morph 4s linear infinite'
            }} />
            <div style={{
              position: 'absolute', inset: 0,
              background: `linear-gradient(225deg, ${orbColor.c2}, ${orbColor.c3})`,
              borderRadius: '70% 30% 50% 50% / 30% 70% 30% 70%',
              filter: 'blur(16px)', opacity: 0.7, mixBlendMode: 'screen',
              animation: 'morph 5s linear infinite reverse'
            }} />
            <div style={{
              position: 'absolute', inset: 10,
              background: `radial-gradient(circle, #fff8, ${orbColor.c1}44)`,
              borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
              filter: 'blur(8px)', opacity: 0.5,
              animation: 'morph 6s linear infinite'
            }} />

            {/* Dış halo */}
            <div style={{
              position: 'absolute', inset: -20,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${orbColor.glow}22, transparent 70%)`,
              filter: 'blur(10px)',
              animation: 'pulse-halo 2s ease-in-out infinite'
            }} />

            {/* İkon */}
            <div style={{
              position: 'relative', zIndex: 20,
              color: '#fff',
              textShadow: `0 0 15px ${orbColor.glow}`,
              filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))'
            }}>
              {isProcessing
                ? <Activity size={38} style={{ animation: 'spin 1.2s linear infinite' }} />
                : isSpeaking
                ? <Volume2 size={38} />
                : <Mic size={38} />}
            </div>
          </div>

          {/* Dur butonu */}
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              style={{
                marginTop: '1rem',
                background: '#f002', border: '1px solid #f006',
                color: '#f66', padding: '0.4rem 1rem',
                borderRadius: 6, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                fontFamily: "'Courier New', monospace",
                fontSize: '0.75rem', letterSpacing: '0.1rem',
                transition: 'all 0.2s'
              }}
            >
              <VolumeX size={14} /> BEKLE
            </button>
          )}
        </div>

        {/* ── DALGA FORMU ─────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 2, height: 50, width: 'min(400px, 90vw)',
          marginBottom: '1rem', overflow: 'hidden'
        }}>
          {Array.from({ length: 40 }).map((_, i) => {
            const active = isListening || isSpeaking;
            const h = active
              ? Math.abs(Math.sin((i / 40) * Math.PI * 4 + audioLevel * 8)) * audioLevel * 40 + 3
              : 3;
            return (
              <div key={i} style={{
                width: 3, height: h,
                background: `linear-gradient(to top, ${orbColor.c1}, #fff8)`,
                borderRadius: 2,
                transition: 'height 0.1s ease',
                boxShadow: active ? `0 0 6px ${orbColor.c1}88` : 'none',
                opacity: 0.4 + (active ? audioLevel * 0.6 : 0)
              }} />
            );
          })}
        </div>

        {/* ── MESAJ KUTULARI ──────────────────────────────────── */}
        <div style={{ width: 'min(600px, 95vw)', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {transcript && (
            <div style={{
              background: '#0ff08', border: '1px solid #0ff3',
              borderLeft: '3px solid #0ff', borderRadius: 8,
              padding: '0.7rem 1rem',
              fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
              animation: 'slideIn 0.3s ease',
              color: '#0ffd'
            }}>
              <span style={{ color: '#0ff7', fontSize: '0.65rem', letterSpacing: '0.1rem' }}>SEN › </span>
              {transcript}
            </div>
          )}
          {response && (
            <div style={{
              background: '#0f801a',
              border: '1px solid #0f83',
              borderLeft: '3px solid #0f8',
              borderRadius: 8,
              padding: '0.7rem 1rem',
              fontSize: 'clamp(0.8rem, 2vw, 0.9rem)',
              animation: 'slideIn 0.3s ease',
              color: '#cffcd3'
            }}>
              <span style={{ color: '#0f87', fontSize: '0.65rem', letterSpacing: '0.1rem' }}>B.A.L.K.I.Z › </span>
              {response}
            </div>
          )}
          {error && (
            <div style={{
              background: '#f001', border: '1px solid #f004',
              borderRadius: 8, padding: '0.5rem 1rem',
              fontSize: '0.8rem', color: '#f88',
              animation: 'slideIn 0.3s ease'
            }}>
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* ── ALT BİLGİ ───────────────────────────────────────── */}
        <div style={{
          position: 'fixed', bottom: '1rem',
          display: 'flex', gap: '1rem', alignItems: 'center',
          fontSize: '0.65rem', color: '#0ff4', letterSpacing: '0.1rem'
        }}>
          <span>GROQ WHISPER V3</span>
          <span style={{ color: '#0ff2' }}>·</span>
          <span>LLAMA 3.1 8B</span>
          <span style={{ color: '#0ff2' }}>·</span>
          <span>ELEVENLABS TURBO</span>
        </div>
      </main>
    </div>
  );
};

export default App;