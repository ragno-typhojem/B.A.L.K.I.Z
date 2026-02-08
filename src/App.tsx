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
  const [audioLevel, setAudioLevel] = useState(0);
  const [showBootScreen, setShowBootScreen] = useState(true);
  const [bootProgress, setBootProgress] = useState(0);
  const [error, setError] = useState('');
  const [hasGreeted, setHasGreeted] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
  
  // 🧠 GÜNCELLENMİŞ SİSTEM PROMPT (Daha Zeki Karakter)
  const SYSTEM_PROMPT = `Sen Balkız'sın. Çok zeki, eğlenceli ve hafif alaycı bir Türk asistanısın.

GÖREVİN: Kullanıcıyla sohbet etmek ve soruları yanıtlamak.
ÖNEMLİ KURAL: Cevapların HER ZAMAN 1-2 cümle olsun. Asla uzun paragraflar kurma. Konuşma dilinde, samimi yaz.

PERSONALİTY:
- Robot gibi konuşma. "Yapabilirim", "Edebilirim" yerine "Yaparız", "Hallederiz" de.
- Enerjik ol.
- Yasaklı konular (Siyaset, Cinsellik, Şiddet) açılırsa: "O konular beni aşar, biz teknoloji konuşalım!" de ve geç.

KISITLAMALAR:
- Cevap uzunluğu maksimum 15 kelime.
- Asla emojileri sesli okumaya çalışma (Metinde emoji kullanabilirsin).`;

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
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioRef.current) audioRef.current.pause();
      if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    };
  }, []);

  const initializeAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      streamRef.current = stream;
      console.log('✅ Mikrofon başlatıldı');

      if (!hasGreeted) {
        setTimeout(() => {
          greetUser();
        }, 800);
      }
    } catch (error) {
      console.error('❌ Mikrofon erişimi başarısız:', error);
      setError('Mikrofon erişimi reddedildi');
    }
  };

  const greetUser = async () => {
    const greetings = [
      'Selam! Ben Balkız, ne yapıyoruz bugün?',
      'Hazırım! Aklında ne var?',
      'Hey! Seni dinliyorum.',
      'Selam! Dünyayı mı kurtarıyoruz?'
    ];
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    setResponse(greeting);
    setHasGreeted(true);
    await speak(greeting);
  };

  const startAudioVisualization = () => {
    let phase = 0;
    const animate = () => {
      if (!isSpeaking && !isListening) {
        setAudioLevel(0);
        return;
      }
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
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        if (audioBlob.size < 3000) {
          console.log('⚠️ Kayıt çok küçük, atlanıyor');
          setIsProcessing(false);
          return;
        }

        await transcribeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsListening(true);
      startAudioVisualization();
      console.log('🎤 Dinleme başladı');

      recordingTimeoutRef.current = setTimeout(() => {
        stopListening();
      }, 5000);
    } catch (error) {
      console.error('❌ Dinleme başlatma hatası:', error);
      setError('Dinleme başlatılamadı');
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setAudioLevel(0);
      if (recordingTimeoutRef.current) {
        clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
      }
      console.log('🛑 Dinleme durduruldu');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3'); // Whisper hala en iyisi
      formData.append('language', 'tr');
      formData.append('response_format', 'json');
      formData.append('temperature', '0');

      console.log('🎤 Groq Whisper isteği gönderiliyor...');

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Transcription error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.text?.trim() || '';
      console.log('📝 Transkript:', text);

      if (!text || text.length < 2) {
        setIsProcessing(false);
        return;
      }

      setTranscript(text);
      await handleUserSpeech(text);
    } catch (error) {
      console.error('❌ Transkripsiyon başarısız:', error);
      setError('Ses tanıma başarısız oldu');
      setIsProcessing(false);
    }
  };

  const handleUserSpeech = async (text: string) => {
    if (!text.trim()) {
      setIsProcessing(false);
      return;
    }

    try {
      const aiResponse = await getAIResponse(text);
      setResponse(aiResponse);
      await speak(aiResponse);
    } catch (error) {
      console.error('❌ Hata:', error);
      const errorMsg = 'Bağlantım koptu sanırım, tekrar söyler misin?';
      setResponse(errorMsg);
      await speak(errorMsg);
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  };

  const getAIResponse = async (userMessage: string): Promise<string> => {
    try {
      console.log('🤖 AI isteği gönderiliyor (Model: Llama 3.3 70B)...');
      
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // 🚀 GÜNCELLEME: Daha zeki model (8b yerine 70b)
          model: 'llama-3.3-70b-versatile', 
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 50, // Biraz artırdık ama prompt kısıtlayacak
          temperature: 0.7, // Biraz daha yaratıcı olsun
          top_p: 0.9,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI error: ${response.status}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content.trim();

      // Kelime limitlemesi (Güvenlik için)
      const words = aiResponse.split(/\s+/);
      const limitedResponse = words.slice(0, 20).join(' '); // 14 kelime bazen çok az, 20 yaptık

      console.log('✅ AI Yanıt:', limitedResponse);
      return limitedResponse;
    } catch (error) {
      console.error('❌ AI Yanıt Hatası:', error);
      throw error;
    }
  };

const speak = async (text: string): Promise<void> => {
  setIsSpeaking(true);
  startAudioVisualization();

  const key = import.meta.env.VITE_GEMINI_API_KEY;

  try {
    // 🚀 Gemini 2.0 Flash için kesin çalışan REST formatı
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: text }]
          }
        ],
        // Google v1beta genellikle snake_case (alt çizgili) isimleri daha çok sever
        generation_config: {
          response_modalities: ["AUDIO"],
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: "Aoede" // Alternatifler: "Kore", "Leda" (Kadın sesleri)
              }
            }
          }
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      // 🕵️‍♂️ Hatanın tam sebebini burası söyleyecek!
      console.error('❌ Google API Detayı:', JSON.stringify(errorData, null, 2));
      throw new Error(`Gemini TTS Error: ${response.status}`);
    }

    const data = await response.json();
    
    // Google'dan gelen Base64 ses verisi
    const audioBase64 = data.candidates[0].content.parts[0].inline_data.data;
    const audioUrl = `data:audio/wav;base64,${audioBase64}`;
    
    if (!audioRef.current) audioRef.current = new Audio();
    audioRef.current.src = audioUrl;

    audioRef.current.onended = () => {
      setIsSpeaking(false);
      setAudioLevel(0);
      setIsProcessing(false);
    };

    await audioRef.current.play();

  } catch (error) {
    console.error('❌ Ses Hatası:', error);
    setIsSpeaking(false);
    setAudioLevel(0);
    setIsProcessing(false);
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

  const ParticleAnimation = () => {
    const particles = [];
    const particleCount = 100;

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
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feFlood floodColor="#00ffff" floodOpacity="0.8" />
            <feComposite in2="blur" operator="in" />
            <feComposite in="SourceGraphic" />
          </filter>
        </defs>

        <circle cx="200" cy="200" r="15" fill="none" stroke="#00ffff" strokeWidth="2" opacity="0.8">
          <animate attributeName="r" values="15;20;15" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
        </circle>

        <circle cx="200" cy="200" r="60" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="200" cy="200" r="85" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx="200" cy="200" r="110" fill="none" stroke="#00ffff" strokeWidth="1" opacity="0.3">
          <animate attributeName="opacity" values="0.2;0.5;0.2" dur="5s" repeatCount="indefinite" />
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
          <div className={`boot-module ${bootProgress > 20 ? 'active' : ''}`}>
            <Cpu size={16} /> Neüron Sentezi
          </div>
          <div className={`boot-module ${bootProgress > 40 ? 'active' : ''}`}>
            <Activity size={16} /> Ses Tanıma
          </div>
          <div className={`boot-module ${bootProgress > 60 ? 'active' : ''}`}>
            <Zap size={16} /> Yapay Zeka Çekirdeği
          </div>
          <div className={`boot-module ${bootProgress > 80 ? 'active' : ''}`}>
            <Radio size={16} /> İletişim
          </div>
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
          <div>
            <h1>B.A.L.K.I.Z</h1>
            <span className="subtitle">BİONİK YAPAY ZEKA vEarly.1</span>
          </div>
          <div className="logo-placeholder">
            <img src={ilkyarLogo} alt="Logo" />
          </div>
        </div>
      </header>

      <main className="main">
        <div className="interface-container">
          <div className="side-panel left-panel">
            <div className="panel-section">
              <div className="panel-header">
                <Activity size={16} /> SİSTEM ANALİZİ
              </div>
              <div className="status-item">
                <span>Model</span>
                <span className="online">LLAMA 3.3 70B</span>
              </div>
              <div className="status-item">
                <span>Voice Module</span>
                <span className="online">COQUI TTS</span>
              </div>
              <div className="status-item">
                <span>AI Core</span>
                <span className="online">HAZIR</span>
              </div>
            </div>
            <div className="panel-section">
              <div className="panel-header">
                <Cpu size={16} /> SİSTEM KONTROL
              </div>
              <div className="diagnostic-bar">
                <div className="diagnostic-label">İŞLEMCİ</div>
                <div className="diagnostic-progress" style={{ width: '75%' }} />
              </div>
              <div className="diagnostic-bar">
                <div className="diagnostic-label">BELLEK</div>
                <div className="diagnostic-progress" style={{ width: '60%' }} />
              </div>
            </div>
          </div>

          <div className="visualizer-section">
            <button
              className={`core-btn ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}
              onClick={toggleListening}
              disabled={isProcessing}
            >
              <div className="core-ring" />
              <div className="core-inner">
                {isSpeaking ? <Volume2 size={40} /> : <Mic size={40} />}
              </div>
            </button>

            {isSpeaking && (
              <button className="stop-btn" onClick={stopSpeaking}>
                <VolumeX size={18} /> BEKLE
              </button>
            )}

            <div className="waveform">
              {Array.from({ length: 60 }).map((_, i) => {
                const h = isListening || isSpeaking
                  ? Math.sin((i / 60) * Math.PI * 6 + audioLevel * 10) * audioLevel * 80 + 4
                  : 4;
                return (
                  <div
                    key={i}
                    className="wave-bar"
                    style={{
                      height: `${h}px`,
                      opacity: 0.3 + (isListening || isSpeaking ? audioLevel * 0.7 : 0)
                    }}
                  />
                );
              })}
            </div>

            <div className="status">
              <div
                className={`status-dot ${isListening ? 'active' : ''} ${isSpeaking ? 'speaking' : ''}`}
              />
              <span>
                {isProcessing ? 'DÜŞÜNÜYOR...' : isListening ? 'DİNLİYOR...' : isSpeaking ? 'KONUŞUYOR...' : 'HAZIR'}
              </span>
            </div>
          </div>

          <div className="side-panel right-panel">
            <div className="panel-section">
              <div className="panel-header">
                <Zap size={16} /> ACTIVITY LOG
              </div>
              <div className="log-entry">
                <span className="log-time">{new Date().toLocaleTimeString()}</span>
                <span>System initialized</span>
              </div>
              {error && (
                <div className="log-entry" style={{ color: '#ff4444' }}>
                  <span className="log-time">{new Date().toLocaleTimeString()}</span>
                  <span>⚠️ {error}</span>
                </div>
              )}
              {transcript && (
                <div className="log-entry active">
                  <span className="log-time">{new Date().toLocaleTimeString()}</span>
                  <span>User input detected</span>
                </div>
              )}
            </div>
            <div className="panel-section">
              <div className="panel-header">
                <Radio size={16} /> AUDIO LEVELS
              </div>
              <div className="audio-meter">
                <div className="audio-meter-bar" style={{ height: `${audioLevel * 100}%` }} />
              </div>
            </div>
          </div>
        </div>

        {transcript && (
          <div className="msg">
            <strong>SEN:</strong> {transcript}
          </div>
        )}
        {response && (
          <div className="msg ai">
            <strong>B.A.L.K.I.Z:</strong> {response}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;