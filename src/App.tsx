import { useState, useEffect, useRef } from 'react';
import { Mic, Volume2, VolumeX, Radio, Zap, Activity, Cpu } from 'lucide-react';
import ilkyarLogo from './assets/ilkyar_logo.png';
import './App.css';

type Message = { role: 'user' | 'assistant' | 'system'; content: string };

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
  const [chatHistory, setChatHistory] = useState<Message[]>([]); // 🧠 Hafıza Eklendi

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;
  
  const SYSTEM_PROMPT = `Sen B.A.L.K.I.Z'sın - ciddi ama az da eğlenceli, zeki bir bionik asistansın.
KURALLAR:
1. Kısa, net ve doğal konuş (maksimum 1 - 2 cümle).
2. Asla kelimeleri veya cümleleri yarım bırakma.
3. "Yapıyorum", "ediyorum" gibi robotik onaylar yerine doğrudan eyleme geç veya sonucu söyle.
4. Din, siyaset, cinsellik, şiddet, ünlüler ve popüler kültürden nazikçe konuyu değiştirerek uzaklaş, kaçtığını belli etme.
Senin özelliklerin konuşmak ile kısıtlı, o yüzden yapamayacağın şeyleri nazikçe yapamayacağını söyle.
ÖRNEK:
"Espiri Yap" -> " Adamın biri varmış, ikinci dönem düzeltmiş."
"Seni Kim Yaptı" -> "Berke ve İLKYAR ekibi"`
;

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
      'Sistem devrede. Nasıl yardımcı olabilirim?'
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
      }, 12000); // 12 Saniye sınırı
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

      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: formData
      });

      if (!response.ok) throw new Error(`Transcription error: ${response.status}`);

      const data = await response.json();
      const text = data.text?.trim() || '';

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
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...chatHistory,
        { role: 'user', content: userMessage }
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', 
          messages: messages,
          max_tokens: 150,
          temperature: 0.4,
          top_p: 0.9,
          presence_penalty: 0.2,
          frequency_penalty: 0.2,
        }),
      });

      if (!response.ok) throw new Error(`AI error: ${response.status}`);

      const data = await response.json();
      const aiResponse = data.choices[0].message.content.trim();

      // Son 10 mesajı hafızada tut
      setChatHistory(prev => [
        ...prev.slice(-10), 
        { role: 'user', content: userMessage }, 
        { role: 'assistant', content: aiResponse }
      ]);

      return aiResponse;
    } catch (error) {
      console.error('❌ AI Yanıt Hatası:', error);
      throw error;
    }
  };

  const speak = async (text: string): Promise<void> => {
    setIsSpeaking(true);
    startAudioVisualization();

    const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
    const VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; 

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_flash_v2_5", 
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.6,
            style: 0.35,
            use_speaker_boost: true
          }
        })
      });

      if (!response.ok) throw new Error(`API Hatası: ${response.status}`);

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = audioUrl;

      audioRef.current.onended = () => {
        setIsSpeaking(false);
        setAudioLevel(0);
        setIsProcessing(false);
      };

      await audioRef.current.play();

    } catch (error) {
      console.error('❌ Balkız Ses Hatası:', error);
      setIsSpeaking(false);
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

  // ... ParticleAnimation bileşeni aynı kalıyor ...
  const ParticleAnimation = () => {
    // ... (Kod kalabalığı yapmamak için burayı atlamadım, kopyalarken orijinal dosyanla değiştirebilirsin) ...
    return <svg className="particle-animation" viewBox="0 0 400 400"></svg>; // Örnek
  };

  if (showBootScreen) {
    return (
      <div className="boot-screen">
        <h1 className="boot-title">B.A.L.K.I.Z</h1>
        <p className="boot-subtitle">BİONİK YAPAY ZEKA</p>
        <div className="boot-progress-container">
          <div className="boot-progress-bar" style={{ width: `${bootProgress}%` }} />
        </div>
        <p className="boot-status">HAZIRLANIYOR... {bootProgress}%</p>
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
                <span className="online">FLASH V2.5</span>
              </div>
              <div className="status-item">
                <span>AI Core</span>
                <span className="online">HAZIR</span>
              </div>
            </div>
            <div className="panel-section">
              <div className="panel-header">
                <Cpu size={16} /> HAFIZA KULLANIMI
              </div>
              <div className="diagnostic-bar">
                <div className="diagnostic-label">SOHBET GEÇMİŞİ</div>
                <div className="diagnostic-progress" style={{ width: `${(chatHistory.length / 20) * 100}%` }} />
              </div>
            </div>
          </div>

      <div className="visualizer-section">
            {/* 🚀 YENİ: Organik, Cin Gibi Hareketli Enerji Topu (Blob) */}
            <div 
              className={`ai-orb-container ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''} ${isProcessing ? 'processing' : ''}`}
              onClick={toggleListening}
              style={{
                transform: `scale(${1 + audioLevel * 0.6})`, // Sese göre nefes alma tepkisi
                transition: 'transform 0.05s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
            >
              {/* Sürekli dönen ve şekil değiştiren organik katmanlar */}
              <div className="blob blob-1"></div>
              <div className="blob blob-2"></div>
              <div className="blob blob-3"></div>
              
              {/* Merkezdeki İkon */}
              <div className="core-icon">
                {isProcessing ? <Activity size={40} className="spin" /> : 
                 isSpeaking ? <Volume2 size={40} /> : 
                 <Mic size={40} />}
              </div>
            </div>

            {isSpeaking && (
              <button className="stop-btn" onClick={stopSpeaking} style={{ marginTop: '120px' }}>
                <VolumeX size={18} /> BEKLE
              </button>
            )}

            <div className="status" style={{ marginTop: '140px' }}>
              <div className={`status-dot ${isListening ? 'active' : ''} ${isSpeaking ? 'speaking' : ''}`} />
              <span>
                {isProcessing ? 'SİSTEM DÜŞÜNÜYOR...' : isListening ? 'SİSTEM DİNLİYOR...' : isSpeaking ? 'SİSTEM KONUŞUYOR...' : 'SİSTEM HAZIR'}
              </span>
            </div>
          </div>

          <div className="side-panel right-panel">
            <div className="panel-section">
              <div className="panel-header">
                <Zap size={16} /> ETKİNLİK GÜNLÜĞÜ
              </div>
              {chatHistory.slice(-3).map((msg, idx) => (
                <div key={idx} className={`log-entry ${msg.role === 'user' ? 'active' : ''}`}>
                  <span>{msg.role === 'user' ? '🗣️' : '🤖'} {msg.content.substring(0, 20)}...</span>
                </div>
              ))}
              {error && (
                <div className="log-entry" style={{ color: '#ff4444' }}>
                  <span>⚠️ {error}</span>
                </div>
              )}
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