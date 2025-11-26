import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Radio, Zap, Activity, Cpu } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';
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

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;

  const SYSTEM_PROMPT = `Sen Balkız, profesyonel bir Türkçe kadın asistansın. Kısa, öz ve net yanıtlar ver (maksimum 2-3 cümle). Profesyonel ve yardımcı ol.`;

  const VOICE_OPTIONS = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: '1' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: '2' },
    { id: 'MF3mGyEYCl7XYWbV9V6O', name: '3' },
    { id: 'ThT5KcBeYPX3keUQqHPh', name: '4' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: '5' }
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
        // Sessiz başla - ses yok
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

  if (!SpeechRecognition) {
    console.error('❌ Speech Recognition desteklenmiyor');
    return;
  }

  recognitionRef.current = new SpeechRecognition();
  recognitionRef.current.lang = 'tr-TR';
  recognitionRef.current.continuous = true;
  recognitionRef.current.interimResults = false;

  recognitionRef.current.onstart = () => {
    console.log('🎤 Mikrofon başladı');
  };

  recognitionRef.current.onresult = (event: any) => {
    const text = event.results[event.results.length - 1][0].transcript;
    console.log('📝 Transkript:', text);
    setTranscript(text);
    handleUserSpeech(text);
  };

  recognitionRef.current.onerror = (event: any) => {
    console.error('❌ Ses Tanıma Hatası:', event.error);
    if (event.error === 'no-speech') {
      console.log('⚠️ Ses algılanmadı, tekrar deneniyor...');
      setTimeout(() => {
        if (isListening && !isProcessing) startListening();
      }, 1000);
    }
  };

  recognitionRef.current.onend = () => {
    console.log('🛑 Mikrofon kapandı');
    if (isListening && !isProcessing) {
      setTimeout(() => startListening(), 300);
    }
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
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.8,
          style: 0.4,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('ElevenLabs API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        voiceId: selectedVoice
      });
      throw new Error(`Audio error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);

    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = audioUrl;
    audioRef.current.onended = () => {
      setIsSpeaking(false);
      setAudioLevel(0);
      URL.revokeObjectURL(audioUrl);
    };
    audioRef.current.onerror = (e) => {
      console.error('Audio playback error:', e);
      setIsSpeaking(false);
      setAudioLevel(0);
    };
    await audioRef.current.play();
  } catch (error) {
    console.error('speak error:', error);
    setIsSpeaking(false);
    setAudioLevel(0);
    throw error;
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

    </div>
  );
};

export default App;