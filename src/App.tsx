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
  const [selectedVoice, setSelectedVoice] = useState('facebook/mms-tts-tur'); // ✅ Türkçe model
  const [showVoiceMenu, setShowVoiceMenu] = useState(false);
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
  const HF_TOKEN = import.meta.env.VITE_HF_TOKEN; // ✅ Hugging Face token

  // ✅ COQUI TTS SES SEÇENEKLERİ (Hugging Face üzerinden)
  const VOICE_OPTIONS = [
    { id: 'facebook/mms-tts-tur', name: 'Türkçe Kadın (MMS)' },
    { id: 'coqui/XTTS-v2', name: 'Coqui XTTS v2 (Çok Dilli)' },
  ];

  const SYSTEM_PROMPT = `Sen Balkız'sın - eğlenceli Türkçe kadın asistan.

KURAL: Maksimum 14 kelime kullan! Genelde 10 kelimeyi geçme.

KİŞİLİK: Enerjik, meraklı, şaşırtıcı bilgiler paylaş.

YASAK KONULAR: Din, siyaset, ırk, cinsellik, popüler kültür (film/dizi/ünlü/marka), şiddet, uyuşturucu, sağlık, ölüm.
→ Bu konularda: "Maalesef bilmiyorum."

İLGİ ALANLARI: Uzay, hayvanlar, doğa, robotlar, teknoloji, tarih, matematik, bilim, espriler, bilmeceler.

ÖRNEKLER:
"Merhaba" → "Selam! Ne keşfedelim?"
"Sıkıldım" → "Uzayda ses yok! Biliyor muydun?"
"Saat kaç?" → "Şu an ${new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}!"
"Oyun oynayalım" → "Bilmece ister misin?"

UNUTMA: 14 kelimeyi asla geçme!`;

  useEffect(() => {
    const savedVoice = localStorage.getItem('balkiz_voice');
    if (savedVoice) setSelectedVoice(savedVoice);

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
      'Selam! Bugün ne keşfedelim?',
      'Merhaba! Sana bir sürpriz var!',
      'Hey! Hazır mısın?',
      'Selam! Ne öğrenmek istersin?'
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
      formData.append('model', 'whisper-large-v3');
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

      console.log('📊 Groq Whisper Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Transkripsiyon Hatası:', {
          status: response.status,
          error: errorText
        });
        throw new Error(`Transcription error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.text?.trim() || '';
      console.log('📝 Transkript:', text);

      if (!text || text.length < 2) {
        console.log('⚠️ Metin çok kısa, atlanıyor');
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

      let errorMsg = 'Seni duyamadım. Tekrar söyler misin?';
      if (error instanceof Error) {
        if (error.message.includes('content_policy') || error.message.includes('İçerik politikası')) {
          errorMsg = 'Bu konuyu bilmiyorum. Başka bir şey sorar mısın?';
        }
      }

      setResponse(errorMsg);

      try {
        await speak(errorMsg);
      } catch (speakError) {
        console.error('❌ Ses de başarısız:', speakError);
      }
    } finally {
      setIsProcessing(false);
      setTranscript('');
    }
  };

  const getAIResponse = async (userMessage: string): Promise<string> => {
    try {
      console.log('🤖 AI isteği gönderiliyor...');
      console.log('📝 Kullanıcı mesajı:', userMessage);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage }
          ],
          max_tokens: 30,
          temperature: 0.6,
          top_p: 0.9,
          presence_penalty: 0.6,
          frequency_penalty: 0.4,
          stop: ["\n\n", "###"]
        }),
      });

      console.log('📊 Groq Response Status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('❌ Groq API Hatası:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });

        throw new Error(`AI error: ${response.status} - ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0].message.content.trim();

      const words = aiResponse.split(/\s+/);
      const limitedResponse = words.slice(0, 14).join(' ');

      console.log('✅ AI Yanıt:', limitedResponse);
      console.log('📊 Token kullanımı:', data.usage);
      
      return limitedResponse;
    } catch (error) {
      console.error('❌ AI Yanıt Hatası:', error);
      throw error;
    }
  };

 // ✅ COQUI TTS (Direkt Fetch ile - CSP sorunu yok)
const speak = async (text: string): Promise<void> => {
  setIsSpeaking(true);
  startAudioVisualization();

  return new Promise(async (resolve, reject) => {
    try {
      console.log('🔊 Coqui TTS isteği gönderiliyor...');
      console.log('📝 Konuşulacak metin:', text);
      console.log('🎤 Model:', selectedVoice);

      // ✅ Direkt Hugging Face Inference API
      const response = await fetch(
        `https://api-inference.huggingface.co/models/${selectedVoice}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputs: text
          })
        }
      );

      console.log('📊 TTS Response Status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ TTS Hatası:', errorText);
        
        // ✅ Model yükleniyor hatası
        if (response.status === 503) {
          setError('Model yükleniyor, 20 saniye bekleyin...');
          setTimeout(() => speak(text), 20000);
          return;
        }
        
        setIsSpeaking(false);
        setAudioLevel(0);
        reject(new Error(`TTS error: ${response.status}`));
        return;
      }

      const audioBlob = await response.blob();
      console.log('📦 Audio Blob boyutu:', audioBlob.size, 'bytes');

      if (audioBlob.size < 100) {
        throw new Error('Audio blob çok küçük');
      }

      const audioUrl = URL.createObjectURL(audioBlob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = audioUrl;

      audioRef.current.onended = () => {
        console.log('✅ Ses tamamlandı');
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        setAudioLevel(0);
        resolve();
      };

      audioRef.current.onerror = (e) => {
        console.error('❌ Ses Oynatma Hatası:', e);
        URL.revokeObjectURL(audioUrl);
        setIsSpeaking(false);
        setAudioLevel(0);
        reject(new Error('Audio playback failed'));
      };

      console.log('▶️ Ses oynatılıyor...');
      await audioRef.current.play();
      console.log('✅ Ses oynatma başladı');

    } catch (error) {
      console.error('❌ Konuşma Hatası:', error);
      setIsSpeaking(false);
      setAudioLevel(0);
      reject(error);
    }
  });
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
      'Yeni sesim nasıl?',
      'Bu ses daha iyi mi?',
      'Beğendin mi?'
    ];
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    speak(randomGreeting);
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

        <button className="voice-btn" onClick={() => setShowVoiceMenu(!showVoiceMenu)}>
          <Volume2 size={18} /> {VOICE_OPTIONS.find(v => v.id === selectedVoice)?.name}
        </button>
      </header>

      {showVoiceMenu && (
        <div className="voice-menu">
          <div className="voice-menu-header">
            <Zap size={16} /> SES SEÇ
          </div>
          {VOICE_OPTIONS.map(voice => (
            <button
              key={voice.id}
              className={`voice-option ${selectedVoice === voice.id ? 'active' : ''}`}
              onClick={() => changeVoice(voice.id)}
            >
              {voice.name} {selectedVoice === voice.id && '✓'}
            </button>
          ))}
        </div>
      )}

      <main className="main">
        <div className="interface-container">
          <div className="side-panel left-panel">
            <div className="panel-section">
              <div className="panel-header">
                <Activity size={16} /> SİSTEM ANALİZİ
              </div>
              <div className="status-item">
                <span>Neural Network</span>
                <span className="online">ONLINE</span>
              </div>
              <div className="status-item">
                <span>Voice Module</span>
                <span className="online">AKTİF</span>
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
              <div className="diagnostic-bar">
                <div className="diagnostic-label">AĞ</div>
                <div className="diagnostic-progress" style={{ width: '90%' }} />
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
                {isProcessing ? 'PROCESSING' : isListening ? 'LISTENING' : isSpeaking ? 'SPEAKING' : 'STANDBY'}
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
              {response && (
                <div className="log-entry response">
                  <span className="log-time">{new Date().toLocaleTimeString()}</span>
                  <span>Response generated</span>
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
