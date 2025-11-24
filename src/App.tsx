import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Radio, Zap, Activity, Cpu } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';

const App = () => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('21m00Tcm4TlvDq8ikWAM');
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [showBootScreen, setShowBootScreen] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const GROQ_API_KEY = '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';
  const ELEVENLABS_API_KEY = 'sk_f2f37b00c6c3a9925dc17d25e480670286ea34879abb813c';

  const SYSTEM_PROMPT = `Sen Balkız, profesyonel bir Türkçe kadın asistansın. Kısa, öz ve net yanıtlar ver (maksimum 2-3 cümle). Profesyonel ve yardımcı ol.`;

  const VOICE_OPTIONS = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Ramiz' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Büşra' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Ebru' },
    { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Cansu' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Fatma' }
  ];

  useEffect(() => {
    const savedVoice = localStorage.getItem('balkiz_voice');
    if (savedVoice) setSelectedVoice(savedVoice);

    let progress = 0;
    const bootInterval = setInterval(() => {
      progress += 1;
      setBootProgress(progress);
      if (progress >= 100) {
        clearInterval(bootInterval);
        setTimeout(() => {
          setShowBootScreen(false);
          setupSpeechRecognition();
          setTimeout(() => speak('Sistem aktif. Selam!'), 1000);
        }, 500);
      }
    }, 50);

    return () => {
      clearInterval(bootInterval);
      if (recognitionRef.current) recognitionRef.current.stop();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const setupSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.lang = 'tr-TR';
    recognitionRef.current.continuous = true;
    recognitionRef.current.interimResults = false;
    recognitionRef.current.onresult = (event: any) => {
      const text = event.results[event.results.length - 1][0].transcript;
      setTranscript(text);
      handleUserSpeech(text);
    };
    recognitionRef.current.onerror = (event: any) => {
      if (event.error === 'no-speech') setTimeout(() => { if (isListening && !isProcessing) startListening(); }, 1000);
    };
    recognitionRef.current.onend = () => {
      if (isListening && !isProcessing) setTimeout(() => startListening(), 300);
    };
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

  const startListening = () => {
    if (!recognitionRef.current || isProcessing) return;
    try { recognitionRef.current.start(); setIsListening(true); startAudioVisualization(); }
    catch (error: any) { if (!error.message.includes('already started')) console.error(error); }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (error) {}
      setIsListening(false);
      setAudioLevel(0);
    }
  };

  const toggleListening = () => isListening ? stopListening() : startListening();

  const handleUserSpeech = async (text: string) => {
    if (!text.trim() || isProcessing) return;
    setIsProcessing(true);
    stopListening();
    try {
      const aiResponse = await getAIResponse(text);
      setResponse(aiResponse);
      await speak(aiResponse);
    } catch (error) {
      const errorMsg = 'Üzgünüm, bir hata oluştu. Ama pes etmiyorum.';
      setResponse(errorMsg);
      await speak(errorMsg);
    } finally {
      setIsProcessing(false);
      setTranscript('');
      setTimeout(() => startListening(), 1000);
    }
  };

  const getAIResponse = async (userMessage: string): Promise<string> => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage }],
        max_tokens: 200,
        temperature: 0.7,
      }),
    });
    if (!response.ok) throw new Error('AI error');
    const data = await response.json();
    return data.choices[0].message.content;
  };

  const speak = async (text: string): Promise<void> => {
    setIsSpeaking(true);
    startAudioVisualization();
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoice}`, {
        method: 'POST',
        headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': ELEVENLABS_API_KEY },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true }
        })
      });
      if (!response.ok) throw new Error('Audio error');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = audioUrl;
      audioRef.current.onended = () => { setIsSpeaking(false); setAudioLevel(0); URL.revokeObjectURL(audioUrl); };
      audioRef.current.onerror = () => { setIsSpeaking(false); setAudioLevel(0); };
      await audioRef.current.play();
    } catch (error) {
      setIsSpeaking(false);
      setAudioLevel(0);
    }
  };

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsSpeaking(false);
      setAudioLevel(0);
    }
  };

  const changeVoice = (voiceId: string) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('balkiz_voice', voiceId);
    setShowVoiceMenu(false);
    const greetings = [
      'Merhaba günün nasıl geçiyor?',
      'Selam! nasılsın?',
      'Yeni sesle merhaba, sana nasıl yardımcı olabilirim?',
      'Balkız hazır — yeni tonda selamlar!',
      'Yeni sesimde seni dinliyorum, ne istersin?',
      'Hoş geldin, bu benim yeni sesim.',
      'Selam, ses değiştirdim — devam edebilirim.',
      'Yeni tınımla merhaba!',
      'Ses güncellendi, sorularını bekliyorum.',
      'Deneme sesim bu, ne düşünüyorsun?'
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    speak(randomGreeting);
  };

  const ParticleAnimation = () => {
    const particles = [];
    const particleCount = 150;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 60 + (i % 3) * 25;
      const x = 200 + Math.cos(angle) * radius;
      const y = 200 + Math.sin(angle) * radius;
      const delay = (i / particleCount) * 2;
      const duration = 2 + (i % 3) * 0.5;

      particles.push(
        <circle
          key={i}
          cx={x}
          cy={y}
          r={1.5 + Math.random() * 1.5}
          fill="#00ffff"
          opacity={0.4 + Math.random() * 0.4}
        >
          <animate
            attributeName="opacity"
            values="0.2;1;0.2"
            dur={`${duration}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animate
            attributeName="r"
            values="1;3;1"
            dur={`${duration}s`}
            begin={`${delay}s`}
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 200 200`}
            to={`360 200 200`}
            dur="20s"
            repeatCount="indefinite"
          />
        </circle>
      );
    }

    return (
      <svg className="particle-animation" viewBox="0 0 400 400">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="4" result="blur"/>
            <feFlood floodColor="#00ffff" floodOpacity="0.8"/>
            <feComposite in2="blur" operator="in"/>
            <feComposite in="SourceGraphic"/>
          </filter>
        </defs>

        <circle cx="200" cy="200" r="15" fill="none" stroke="#00ffff" strokeWidth="2" opacity="0.8">
          <animate attributeName="r" values="15;20;15" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
        </circle>

        <circle cx="200" cy="200" r="60" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite"/>
        </circle>
        <circle cx="200" cy="200" r="85" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="4s" repeatCount="indefinite"/>
        </circle>
        <circle cx="200" cy="200" r="110" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="5s" repeatCount="indefinite"/>
        </circle>

        <g filter="url(#glow)">
          {particles}
        </g>

        {Array.from({ length: 8 }).map((_, i) => {
          const angle = (i / 8) * 360;
          return (
            <line
              key={`line${i}`}
              x1="200"
              y1="200"
              x2={200 + Math.cos((angle * Math.PI) / 180) * 130}
              y2={200 + Math.sin((angle * Math.PI) / 180) * 130}
              stroke="#00ffff"
              strokeWidth="0.5"
              opacity="0.2"
            >
              <animate
                attributeName="opacity"
                values="0.1;0.4;0.1"
                dur="3s"
                begin={`${i * 0.3}s`}
                repeatCount="indefinite"
              />
            </line>
          );
        })}
      </svg>
    );
  };

  if (showBootScreen) {
    return (
      <div className="boot-screen">
        <ParticleAnimation />
        <h1 className="boot-title">B.A.L.K.I.Z</h1>
        <p className="boot-subtitle">BİONİK YAPAY ZEKA</p>
        <div className="boot-progress-container">
          <div className="boot-progress-bar" style={{ width: `${bootProgress}%` }} />
        </div>
        <p className="boot-status">HAZIRLANIYOR... {bootProgress}%</p>
        <div className="boot-modules">
          <div className={`boot-module ${bootProgress > 20 ? 'active' : ''}`}><Cpu size={16} /> Neüron Sentezi</div>
          <div className={`boot-module ${bootProgress > 40 ? 'active' : ''}`}><Activity size={16} /> Ses Tanıma</div>
          <div className={`boot-module ${bootProgress > 60 ? 'active' : ''}`}><Zap size={16} /> Yapay Zeka Çekirdeği</div>
          <div className={`boot-module ${bootProgress > 80 ? 'active' : ''}`}><Radio size={16} /> İletişim</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="grid-bg" />
      <div className="scan-lines" />

      <header className="header">
        <div className="logo-section">
          <Radio size={24} />
          <div><h1>B.A.L.K.I.Z</h1><span className="subtitle">BİONİK YAPAY ZEKA vEarly.1</span></div>
        <div className="logo-placeholder">
          <img src={ilkyarLogo} alt="Logo" />
        </div>
        </div>

        <button className="voice-btn" onClick={() => setShowVoiceMenu(!showVoiceMenu)}>
          <Volume2 size={18} /> {VOICE_OPTIONS.find(v => v.id === selectedVoice)?.name}
        </button>
      </header>

      {showVoiceMenu && (
        <div className="voice-menu">
          <div className="voice-menu-header"><Zap size={16} /> SES SEÇ</div>
          {VOICE_OPTIONS.map(voice => (
            <button key={voice.id} className={`voice-option ${selectedVoice === voice.id ? 'active' : ''}`} onClick={() => changeVoice(voice.id)}>
              {voice.name} {selectedVoice === voice.id && '✓'}
            </button>
          ))}
        </div>
      )}

      <main className="main">
        <div className="interface-container">
          <div className="side-panel left-panel">
            <div className="panel-section">
              <div className="panel-header"><Activity size={16} /> SİSTEM ANALİZİ</div>
              <div className="status-item"><span>Neural Network</span><span className="online">ONLINE</span></div>
              <div className="status-item"><span>Voice Module</span><span className="online">AKTİF</span></div>
              <div className="status-item"><span>AI Core</span><span className="online">HAZIR</span></div>
            </div>
            <div className="panel-section">
              <div className="panel-header"><Cpu size={16} /> SİSTEM KONTROL</div>
              <div className="diagnostic-bar"><div className="diagnostic-label">İŞLEMCİ</div><div className="diagnostic-progress" style={{ width: '75%' }} /></div>
              <div className="diagnostic-bar"><div className="diagnostic-label">BELLEK</div><div className="diagnostic-progress" style={{ width: '60%' }} /></div>
              <div className="diagnostic-bar"><div className="diagnostic-label">AĞ</div><div className="diagnostic-progress" style={{ width: '90%' }} /></div>
            </div>
          </div>

          <div className="visualizer-section">
            <button className={`core-btn ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`} onClick={toggleListening} disabled={isProcessing}>
              <div className="core-ring" />
              <div className="core-inner">{isSpeaking ? <Volume2 size={40} /> : <Mic size={40} />}</div>
            </button>

            {isSpeaking && <button className="stop-btn" onClick={stopSpeaking}><VolumeX size={18} /> BEKLE</button>}

            <div className="waveform">
              {Array.from({ length: 60 }).map((_, i) => {
                const h = (isListening || isSpeaking) ? Math.sin((i / 60) * Math.PI * 6 + audioLevel * 10) * audioLevel * 80 + 4 : 4;
                return <div key={i} className="wave-bar" style={{ height: `${h}px`, opacity: 0.3 + (isListening || isSpeaking ? audioLevel * 0.7 : 0) }} />;
              })}
            </div>

            <div className="status">
              <div className={`status-dot ${isListening ? 'active' : ''} ${isSpeaking ? 'speaking' : ''}`} />
              <span>{isProcessing ? 'PROCESSING' : isListening ? 'LISTENING' : isSpeaking ? 'SPEAKING' : 'STANDBY'}</span>
            </div>
          </div>

          <div className="side-panel right-panel">
            <div className="panel-section">
              <div className="panel-header"><Zap size={16} /> ACTIVITY LOG</div>
              <div className="log-entry"><span className="log-time">{new Date().toLocaleTimeString()}</span><span>System initialized</span></div>
              {transcript && <div className="log-entry active"><span className="log-time">{new Date().toLocaleTimeString()}</span><span>User input detected</span></div>}
              {response && <div className="log-entry response"><span className="log-time">{new Date().toLocaleTimeString()}</span><span>Response generated</span></div>}
            </div>
            <div className="panel-section">
              <div className="panel-header"><Radio size={16} /> AUDIO LEVELS</div>
              <div className="audio-meter"><div className="audio-meter-bar" style={{ height: `${audioLevel * 100}%` }} /></div>
            </div>
          </div>
        </div>

        {transcript && <div className="msg"><strong>SEN:</strong> {transcript}</div>}
        {response && <div className="msg ai"><strong>B.A.L.K.I.Z:</strong> {response}</div>}
      </main>

    <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow-x: hidden; }
        body { font-family: 'Courier New', monospace; background: #000; color: #0ff; }
        .app { width: 100vw; min-height: 100vh; height: 100%; position: relative; overflow-x: hidden; }

        .grid-bg { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(#0ff08 1px, transparent 1px), linear-gradient(90deg, #0ff08 1px, transparent 1px); background-size: 40px 40px; pointer-events: none; animation: gridMove 20s linear infinite; z-index: 0; }
        @keyframes gridMove { to { transform: translate(40px, 40px); } }
        .scan-lines { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(transparent 50%, #0ff03 50%); background-size: 100% 4px; pointer-events: none; animation: scanMove 8s linear infinite; z-index: 1; }
        @keyframes scanMove { to { transform: translateY(4px); } }

        .boot-screen { position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100%; height: 100%; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; padding: 2rem; overflow: hidden; }
        .particle-animation { width: min(500px, 80vw); height: min(500px, 80vw); margin-bottom: 2rem; filter: drop-shadow(0 0 20px #0ff8); }
        .boot-title { font-size: clamp(2.5rem, 8vw, 6rem); color: #0ff; letter-spacing: clamp(0.5rem, 2.5vw, 2rem); text-shadow: 0 0 40px #0ff; animation: glow 2s infinite; margin-bottom: 1rem; text-align: center; white-space: nowrap; }
        @keyframes glow { 50% { text-shadow: 0 0 60px #0ff; } }
        .boot-subtitle { font-size: clamp(1rem, 3vw, 2rem); color: #0ffc; letter-spacing: clamp(0.3rem, 1.5vw, 0.8rem); margin-bottom: 3rem; text-align: center; }
        .boot-progress-container { width: min(800px, 85vw); height: 5px; background: #0ff3; border-radius: 3px; margin-bottom: 1.5rem; }
        .boot-progress-bar { height: 100%; background: linear-gradient(90deg, #0ff, #fff); box-shadow: 0 0 30px #0ff; transition: width 0.2s; }
        .boot-status { font-size: clamp(1.2rem, 3vw, 1.8rem); color: #0ff; letter-spacing: clamp(0.2rem, 1vw, 0.4rem); margin-bottom: 2.5rem; text-align: center; }
        .boot-modules { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; width: min(800px, 85vw); max-width: 100%; }
        .boot-module { display: flex; align-items: center; justify-content: center; gap: 0.8rem; padding: 1.2rem; background: #0ff1; border: 1px solid #0ff3; border-radius: 8px; font-size: clamp(0.9rem, 2vw, 1.1rem); color: #0ff6; letter-spacing: 0.15rem; transition: all 0.3s; }
        .boot-module.active { color: #0ff; border-color: #0ff; background: #0ff2; box-shadow: 0 0 15px #0ff6; }

        .header { position: relative; z-index: 10; background: #000d; border-bottom: 2px solid #0ff6; backdrop-filter: blur(10px); padding: clamp(0.8rem, 2vw, 1.2rem) clamp(1rem, 3vw, 2rem); display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem; box-shadow: 0 0 40px #0ff3; }
        .logo-section { display: flex; align-items: center; gap: 0.8rem; }
        .logo-section h1 { font-size: clamp(1rem, 3vw, 1.8rem); letter-spacing: clamp(0.2rem, 1vw, 0.6rem); background: linear-gradient(90deg, #0ff, #fff); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
        .logo-placeholder { padding: clamp(0.5rem, 1.5vw, 0.8rem) clamp(1rem, 3vw, 2rem); background: #0ff1; border: 2px dashed #0ff5; border-radius: 8px; color: #0ff6; font-size: clamp(0.6rem, 1.5vw, 0.8rem); letter-spacing: clamp(0.1rem, 0.5vw, 0.2rem); display: flex; align-items: center; justify-content: center; }
        .logo-placeholder img { max-width: 100px; height: auto; display: block; }
        .logo-placeholder { padding: clamp(0.5rem, 1.5vw, 0.8rem) clamp(1rem, 3vw, 2rem); background: #0ff1; border: 2px dashed #0ff5; border-radius: 8px; color: #0ff6; font-size: clamp(0.6rem, 1.5vw, 0.8rem); letter-spacing: clamp(0.1rem, 0.5vw, 0.2rem); }
        .voice-btn { background: #0ff1; border: 1px solid #0ff5; color: #0ff; padding: clamp(0.5rem, 1.5vw, 0.7rem) clamp(0.8rem, 2vw, 1.3rem); border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.6rem; font-family: inherit; font-size: clamp(0.7rem, 1.5vw, 0.8rem); letter-spacing: 0.1rem; transition: all 0.3s; white-space: nowrap; }
        .voice-btn:hover { background: #0ff2; box-shadow: 0 0 30px #0ff8; }

        .voice-menu { position: fixed; top: clamp(70px, 15vw, 90px); right: clamp(0.5rem, 3vw, 2rem); background: #000f; border: 2px solid #0ff8; border-radius: 8px; padding: 0.8rem; z-index: 100; min-width: min(200px, 90vw); max-width: 90vw; box-shadow: 0 0 60px #0ffa; animation: slideDown 0.3s; }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } }
        .voice-menu-header { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.8rem; margin-bottom: 0.8rem; border-bottom: 1px solid #0ff5; font-size: clamp(0.7rem, 1.5vw, 0.85rem); letter-spacing: 0.15rem; }
        .voice-option { width: 100%; background: #0ff08; border: 1px solid #0ff4; color: #0ff; padding: 0.8rem; margin-bottom: 0.4rem; border-radius: 5px; cursor: pointer; text-align: left; transition: all 0.3s; font-family: inherit; font-size: clamp(0.7rem, 1.5vw, 0.85rem); }
        .voice-option:hover { background: #0ff2; border-color: #0ff; transform: translateX(5px); }
        .voice-option.active { background: #0ff3; border-color: #0ff; box-shadow: 0 0 25px #0ff8; }

        .main { position: relative; z-index: 5; display: flex; flex-direction: column; align-items: center; padding: clamp(1rem, 3vw, 2rem); min-height: calc(100vh - clamp(60px, 10vw, 80px)); width: 100%; }
        .interface-container { width: 100%; max-width: 1600px; display: grid; grid-template-columns: 1fr; gap: clamp(1rem, 2vw, 2rem); align-items: start; }

        .side-panel { background: #0006; border: 1px solid #0ff3; border-radius: 8px; padding: clamp(1rem, 2vw, 1.5rem); backdrop-filter: blur(10px); display: none; }
        .panel-section { margin-bottom: 2rem; }
        .panel-header { display: flex; align-items: center; gap: 0.5rem; font-size: clamp(0.7rem, 1.5vw, 0.8rem); letter-spacing: 0.15rem; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid #0ff2; }
        .status-item { display: flex; justify-content: space-between; padding: 0.5rem 0; font-size: clamp(0.65rem, 1.5vw, 0.75rem); }
        .online { color: #0f8; text-shadow: 0 0 10px #0f86; font-weight: bold; }
        .diagnostic-bar { margin-bottom: 0.8rem; }
        .diagnostic-label { font-size: clamp(0.6rem, 1.2vw, 0.7rem); color: #0ff9; margin-bottom: 0.3rem; }
        .diagnostic-progress { height: 6px; background: linear-gradient(90deg, #0ff, #0f8); border-radius: 3px; box-shadow: 0 0 10px #0ff5; transition: width 0.5s; }
        .log-entry { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.5rem; margin-bottom: 0.5rem; background: #0ff03; border-left: 2px solid #0ff3; border-radius: 4px; font-size: clamp(0.6rem, 1.2vw, 0.7rem); }
        .log-entry.active { border-left-color: #0ff; background: #0ff1; }
        .log-entry.response { border-left-color: #0f8; background: #0f81; }
        .log-time { color: #0ff5; font-size: clamp(0.55rem, 1vw, 0.65rem); }
        .audio-meter { width: 100%; height: 150px; background: #0ff05; border: 1px solid #0ff2; border-radius: 6px; display: flex; align-items: flex-end; justify-content: center; padding: 0.5rem; }
        .audio-meter-bar { width: 60%; background: linear-gradient(to top, #0ff, #0f8); border-radius: 4px; transition: height 0.1s; box-shadow: 0 0 20px #0ff6; }

        .visualizer-section { display: flex; flex-direction: column; align-items: center; width: 100%; }
        .core-btn { width: clamp(120px, 30vw, 180px); height: clamp(120px, 30vw, 180px); border-radius: 50%; border: none; background: radial-gradient(circle, #0ff3, transparent); cursor: pointer; position: relative; transition: all 0.4s; margin: clamp(1rem, 3vw, 2rem) 0; }
        .core-btn:hover { transform: scale(1.05); }
        .core-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .core-ring { position: absolute; inset: clamp(6px, 2vw, 8px); border: clamp(2px, 1vw, 4px) solid #0ff6; border-radius: 50%; transition: all 0.4s; }
        .core-btn.listening .core-ring { border-color: #0ff; box-shadow: 0 0 50px #0ff, inset 0 0 50px #0ff8; animation: pulse 1.8s infinite; }
        .core-btn.speaking .core-ring { border-color: #0f8; box-shadow: 0 0 50px #0f8, inset 0 0 50px #0f88; animation: pulse 1.3s infinite; }
        @keyframes pulse { 50% { transform: scale(1.1); } }
        .core-inner { position: absolute; inset: clamp(20px, 6vw, 30px); background: #000e; border: clamp(2px, 0.5vw, 3px) solid #0ff8; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #0ff; transition: all 0.3s; }
        .core-inner svg { width: clamp(30px, 8vw, 40px); height: clamp(30px, 8vw, 40px); }
        .core-btn.listening .core-inner { background: #0ff3; box-shadow: 0 0 60px #0ff; }
        .core-btn.speaking .core-inner { background: #0f83; box-shadow: 0 0 60px #0f8; color: #0f8; }

        .stop-btn { background: #f002; border: 2px solid #f008; color: #f00; padding: clamp(0.5rem, 1.5vw, 0.7rem) clamp(1rem, 2vw, 1.5rem); border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-family: inherit; font-size: clamp(0.7rem, 1.5vw, 0.8rem); letter-spacing: 0.12rem; transition: all 0.3s; margin-top: 0.8rem; }
        .stop-btn:hover { background: #f004; box-shadow: 0 0 30px #f00a; transform: scale(1.05); }

        .waveform { display: flex; align-items: center; justify-content: center; gap: clamp(1px, 0.3vw, 2px); height: clamp(60px, 15vw, 90px); margin-top: 1.5rem; width: 100%; max-width: 100%; overflow: hidden; }
        .wave-bar { width: clamp(2px, 0.5vw, 3px); background: linear-gradient(to top, #0ff, #fff8); border-radius: 2px; transition: all 0.12s; box-shadow: 0 0 10px #0ff9; }

        .status { display: flex; align-items: center; gap: clamp(0.5rem, 2vw, 1rem); background: #000b; border: 1px solid #0ff5; padding: clamp(0.6rem, 1.5vw, 0.9rem) clamp(1rem, 3vw, 2rem); border-radius: 8px; backdrop-filter: blur(10px); margin-top: 1.5rem; }
        .status-dot { width: clamp(10px, 2.5vw, 14px); height: clamp(10px, 2.5vw, 14px); border-radius: 50%; background: #0ff5; transition: all 0.3s; position: relative; flex-shrink: 0; }
        .status-dot::before { content: ''; position: absolute; inset: -3px; border: 2px solid #0ff5; border-radius: 50%; }
        .status-dot.active { background: #0ff; box-shadow: 0 0 25px #0ff; animation: blink 1.5s infinite; }
        .status-dot.active::before { border-color: #0ff; animation: ripple 1.5s infinite; }
        .status-dot.speaking { background: #0f8; box-shadow: 0 0 25px #0f8; }
        .status-dot.speaking::before { border-color: #0f8; }
        @keyframes blink { 50% { opacity: 0.4; } }
        @keyframes ripple { to { transform: scale(2); opacity: 0; } }
        .status span { font-size: clamp(0.7rem, 1.8vw, 0.9rem); letter-spacing: clamp(0.05rem, 0.3vw, 0.15rem); }

        .msg { background: #000c; border: 1px solid #0ff5; border-radius: 8px; padding: clamp(0.8rem, 2vw, 1.2rem); margin: 0.8rem 0; max-width: min(1200px, 95vw); width: 100%; animation: slideIn 0.4s; font-size: clamp(0.8rem, 1.8vw, 0.9rem); line-height: 1.6; word-wrap: break-word; }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-25px); } }
        .msg.ai { border-color: #0f8a; }

        @media (min-width: 1024px) {
          .interface-container { grid-template-columns: 280px 1fr 280px; }
          .side-panel { display: block; }
        }

        @media (max-width: 768px) {
          .header { flex-direction: column; text-align: center; }
          .logo-section { flex-direction: column; }
          .particle-animation { width: 70vw; height: 70vw; }
        }

        @media (max-width: 480px) {
          .boot-modules { grid-template-columns: 1fr; }
          .voice-menu { left: 5vw; right: 5vw; width: 90vw; }
          .boot-title { font-size: clamp(2rem, 10vw, 3rem); white-space: normal; }
        }
      `}</style>

    </div>
  );
};

export default App;