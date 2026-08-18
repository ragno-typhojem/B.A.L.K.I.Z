import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Brain,
  CheckCircle2,
  Loader2,
  Mic,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Volume2,
  VolumeX,
  Wand2
} from 'lucide-react';
import balkizLogoUrl from './assets/balkiz-logo.svg';

type Status = 'idle' | 'listening' | 'processing' | 'speaking';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type SpeechRecognitionLike = EventTarget & {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = Event & {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const QUICK_QUESTIONS = [
  'Uzay neden karanlık?',
  'Bir deney fikri ver.',
  'Bugün ne öğrenelim?',
  'Robotlar nasıl görür?'
];

const STATUS_META: Record<
  Status,
  { label: string; helper: string; color: string; accent: string; icon: string }
> = {
  idle: {
    label: 'Hazırım',
    helper: 'Butona bas, Türkçe konuş veya aşağıya yaz.',
    color: '#30d8ff',
    accent: '#7cf7c8',
    icon: 'AI'
  },
  listening: {
    label: 'Dinliyorum',
    helper: 'Seni duyuyorum. Bitince tekrar basabilirsin.',
    color: '#ff6fb1',
    accent: '#ffd166',
    icon: 'TR'
  },
  processing: {
    label: 'Düşünüyorum',
    helper: 'Cevabı çocuklara uygun ve kısa hazırlıyorum.',
    color: '#ffd166',
    accent: '#7cf7c8',
    icon: 'OK'
  },
  speaking: {
    label: 'Konuşuyorum',
    helper: 'Dinle, istersen sustur butonuna bas.',
    color: '#7cf7c8',
    accent: '#30d8ff',
    icon: 'VO'
  }
};

const THINKING_LINES = [
  'Soruyu inceliyorum',
  'Türkçe yanıtı sadeleştiriyorum',
  'Güvenli modu kontrol ediyorum',
  'En anlaşılır cevabı seçiyorum'
];

let audioContext: AudioContext | null = null;

function getAudioContext() {
  const AudioCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  audioContext = audioContext || new AudioCtor();
  return audioContext;
}

function playTone(freq: number, duration = 0.12, delay = 0, volume = 0.05) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;

    oscillator.type = 'sine';
    oscillator.frequency.value = freq;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  } catch {
    // Sound effects are optional.
  }
}

function playChime(kind: 'start' | 'stop' | 'ready' | 'error') {
  const notes = {
    start: [523, 659, 784],
    stop: [784, 659, 523],
    ready: [659, 784, 1047],
    error: [220, 196]
  }[kind];

  notes.forEach((note, index) => playTone(note, kind === 'error' ? 0.18 : 0.13, index * 0.08));
}

function selectRecorderMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || '';
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function sanitizeText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export default function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [bootProgress, setBootProgress] = useState(0);
  const [booted, setBooted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Merhaba! Ben BALKIZ. Bana bilim, teknoloji veya merak ettiğin bir şeyi sorabilirsin.'
    }
  ]);
  const [draft, setDraft] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [error, setError] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const [thinkingIndex, setThinkingIndex] = useState(0);

  const statusRef = useRef<Status>('idle');
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const listenTimerRef = useRef<number | null>(null);
  const vizTimerRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const processingRef = useRef(false);
  const liveTranscriptRef = useRef('');

  const meta = STATUS_META[status];
  const turnCount = Math.floor(messages.filter((message) => message.role === 'user').length);
  const supportsSpeechRecognition = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const stars = useMemo(
    () =>
      Array.from({ length: 34 }, (_, index) => ({
        id: index,
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        size: `${2 + Math.random() * 4}px`,
        delay: `${Math.random() * 5}s`,
        duration: `${3 + Math.random() * 5}s`
      })),
    []
  );

  function setStatusBoth(next: Status) {
    statusRef.current = next;
    setStatus(next);
  }

  function setLiveTranscriptBoth(next: string) {
    liveTranscriptRef.current = next;
    setLiveTranscript(next);
  }

  function startVisualizer() {
    stopVisualizer();
    let phase = 0;
    vizTimerRef.current = window.setInterval(() => {
      phase += 0.28;
      const level =
        0.18 +
        Math.abs(Math.sin(phase)) * 0.38 +
        Math.abs(Math.sin(phase * 0.45)) * 0.22 +
        Math.random() * 0.12;
      setAudioLevel(Math.min(1, level));
    }, 90);
  }

  function stopVisualizer() {
    if (vizTimerRef.current) window.clearInterval(vizTimerRef.current);
    vizTimerRef.current = null;
    setAudioLevel(0);
  }

  function clearListenTimer() {
    if (listenTimerRef.current) window.clearTimeout(listenTimerRef.current);
    listenTimerRef.current = null;
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBootProgress((progress) => {
        const next = Math.min(100, progress + 5);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => setBooted(true), 360);
        }
        return next;
      });
    }, 42);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (status !== 'processing') return;
    const timer = window.setInterval(() => {
      setThinkingIndex((index) => (index + 1) % THINKING_LINES.length);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      clearListenTimer();
      stopVisualizer();
      recognitionRef.current?.abort();
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      window.speechSynthesis?.cancel();
      audioRef.current?.pause();
    };
  }, []);

  async function ensureMicrophone() {
    if (streamRef.current) return streamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    streamRef.current = stream;
    return stream;
  }

  async function startListening() {
    if (statusRef.current !== 'idle') return;

    setError('');
    setLiveTranscriptBoth('');
    playChime('start');

    try {
      await ensureMicrophone();
    } catch {
      setError('Mikrofon izni lazım. İzin vermezsen aşağıdaki kutuya yazarak da sorabilirsin.');
      playChime('error');
      return;
    }

    if (supportsSpeechRecognition) {
      startBrowserRecognition();
      return;
    }

    startRecorderFallback();
  }

  function startBrowserRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      startRecorderFallback();
      return;
    }

    const recognition = new Recognition();
    let finalText = '';

    recognition.lang = 'tr-TR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let interim = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = sanitizeText(result[0]?.transcript || '');
        if (result.isFinal) finalText += ` ${text}`;
        else interim += ` ${text}`;
      }

      setLiveTranscriptBoth(sanitizeText(`${finalText} ${interim}`));
    };

    recognition.onerror = () => {
      setError('Sesi anlayamadım. Bir kez daha deneyelim mi?');
      playChime('error');
      setStatusBoth('idle');
      stopVisualizer();
      clearListenTimer();
    };

    recognition.onend = () => {
      clearListenTimer();
      stopVisualizer();
      recognitionRef.current = null;
      const text = sanitizeText(finalText || liveTranscriptRef.current);
      if (text.length > 1) {
        void askBalkiz(text);
      } else if (statusRef.current === 'listening' || statusRef.current === 'processing') {
        setStatusBoth('idle');
      }
    };

    setStatusBoth('listening');
    startVisualizer();
    try {
      recognition.start();
      listenTimerRef.current = window.setTimeout(() => stopListening(), 10000);
    } catch {
      setError('Mikrofon başlatılamadı. Sayfayı yenileyip tekrar deneyebilirsin.');
      playChime('error');
      setStatusBoth('idle');
      stopVisualizer();
    }
  }

  function startRecorderFallback() {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = selectRecorderMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    } catch {
      setError('Bu tarayıcı ses kaydını desteklemiyor. Sorunu alttaki kutuya yazarak sorabilirsin.');
      playChime('error');
      setStatusBoth('idle');
      stopVisualizer();
      return;
    }
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };

    recorder.onstop = async () => {
      clearListenTimer();
      stopVisualizer();
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      if (blob.size < 900) {
        setStatusBoth('idle');
        return;
      }
      setStatusBoth('processing');
      await transcribeAndAsk(blob);
    };

    setStatusBoth('listening');
    startVisualizer();
    recorder.start();
    listenTimerRef.current = window.setTimeout(() => stopListening(), 10000);
  }

  function stopListening() {
    if (statusRef.current !== 'listening') return;
    playChime('stop');
    clearListenTimer();
    recognitionRef.current?.stop();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    setStatusBoth('processing');
  }

  async function transcribeAndAsk(blob: Blob) {
    try {
      const audioBase64 = await blobToDataUrl(blob);
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType: blob.type })
      });

      if (!response.ok) throw new Error('Transcription failed');

      const data = await response.json();
      const text = sanitizeText(data.text || '');
      if (!text) {
        setError('Sesi yakaladım ama kelimeleri seçemedim. Daha yakından tekrar dener misin?');
        setStatusBoth('idle');
        return;
      }

      setLiveTranscriptBoth(text);
      await askBalkiz(text);
    } catch {
      setError('Ses yazıya çevrilemedi. Vercel env içinde GROQ_API_KEY tanımlı mı kontrol et.');
      playChime('error');
      setStatusBoth('idle');
    }
  }

  async function askBalkiz(text: string) {
    const clean = sanitizeText(text);
    if (!clean || processingRef.current || statusRef.current === 'listening' || statusRef.current === 'speaking') return;

    processingRef.current = true;
    setStatusBoth('processing');
    setError('');
    setDraft('');
    setLiveTranscriptBoth(clean);

    const nextMessages: Message[] = [...messages.slice(-10), { role: 'user', content: clean }];
    setMessages(nextMessages);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages })
      });

      if (!response.ok) throw new Error('Chat failed');

      const data = await response.json();
      const answer = sanitizeText(data.text || 'Bunu tekrar sorar mısın?');
      const finalMessages = [...nextMessages, { role: 'assistant' as const, content: answer }];
      setMessages(finalMessages.slice(-12));
      setLiveTranscriptBoth('');
      playChime('ready');
      await speak(answer);
    } catch {
      const fallback = 'Bir bağlantı sorunu çıktı. Anahtarları ve Vercel ayarlarını kontrol edip tekrar deneyelim.';
      setMessages((current) => [...current, { role: 'assistant', content: fallback }].slice(-12));
      setError(fallback);
      playChime('error');
      setStatusBoth('idle');
    } finally {
      processingRef.current = false;
    }
  }

  async function speak(text: string) {
    setStatusBoth('speaking');
    startVisualizer();

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (response.ok && response.status !== 204 && response.headers.get('content-type')?.includes('audio')) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        if (!audioRef.current) audioRef.current = new Audio();
        audioRef.current.src = url;

        await new Promise<void>((resolve) => {
          const done = () => {
            URL.revokeObjectURL(url);
            resolve();
          };
          audioRef.current!.onended = done;
          audioRef.current!.onerror = done;
          audioRef.current!.play().catch(done);
        });
      } else {
        await speakWithBrowser(text);
      }
    } catch {
      await speakWithBrowser(text);
    } finally {
      setStatusBoth('idle');
      stopVisualizer();
    }
  }

  function speakWithBrowser(text: string) {
    return new Promise<void>((resolve) => {
      if (!window.speechSynthesis) return resolve();

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'tr-TR';
      utterance.rate = 0.94;
      utterance.pitch = 1.12;
      utterance.volume = 0.98;

      const applyVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        utterance.voice =
          voices.find((voice) => voice.lang.toLowerCase().startsWith('tr') && /female|kadın/i.test(voice.name)) ||
          voices.find((voice) => voice.lang.toLowerCase().startsWith('tr')) ||
          null;
      };

      if (window.speechSynthesis.getVoices().length) applyVoice();
      else window.speechSynthesis.onvoiceschanged = applyVoice;

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  }

  function stopSpeaking() {
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    window.speechSynthesis?.cancel();
    setStatusBoth('idle');
    stopVisualizer();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askBalkiz(draft);
  }

  if (!booted) {
    return (
      <main className="boot-screen">
        <div className="space-bg" />
        <div className="boot-core">
          <div className="boot-ring ring-one" />
          <div className="boot-ring ring-two" />
          <div className="boot-ring ring-three" />
          <span>B</span>
        </div>
        <h1>B.A.L.K.I.Z</h1>
        <p>Türkçe sesli yapay zeka başlatılıyor</p>
        <div className="boot-track" aria-label="Yükleniyor">
          <span style={{ width: `${bootProgress}%` }} />
        </div>
        <strong>{Math.round(bootProgress)}%</strong>
      </main>
    );
  }

  return (
    <main className="app-shell" style={{ '--status': meta.color, '--accent': meta.accent } as CSSProperties}>
      <div className="space-bg" />
      <div className="grid-glow" />
      <div className="comets" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="stars" aria-hidden="true">
        {stars.map((star) => (
          <span
            key={star.id}
            style={{
              left: star.left,
              top: star.top,
              width: star.size,
              height: star.size,
              animationDelay: star.delay,
              animationDuration: star.duration
            }}
          />
        ))}
      </div>

      <header className="topbar">
        <div className="brand">
          <div className="logo-mark">
            <img src={import.meta.env.VITE_BALKIZ_LOGO_URL || balkizLogoUrl} alt="BALKIZ logo" />
          </div>
          <div>
            <span>B.A.L.K.I.Z</span>
            <small>Bilim Araştırmacısı Logik Kadın İnovatif Zeka</small>
          </div>
        </div>

        <div className="top-pills" aria-label="Sistem durumu">
          <span>
            <CheckCircle2 size={15} /> Güvenli Mod
          </span>
          <span>
            <ShieldCheck size={15} /> Türkçe
          </span>
          <span>
            <Rocket size={15} /> v3.0
          </span>
        </div>

        <div className="partner-logo">
          {import.meta.env.VITE_PARTNER_LOGO_URL ? (
            <img src={import.meta.env.VITE_PARTNER_LOGO_URL} alt="Partner logo" />
          ) : (
            <span>Logo</span>
          )}
        </div>
      </header>

      <section className="stage">
        <aside className="side-panel left-panel">
          <div className="panel-title">
            <Sparkles size={16} />
            Kolay Başlangıç
          </div>
          <button disabled={status !== 'idle'} onClick={() => void askBalkiz('Bana çocuklar için güvenli bir bilim deneyi fikri ver.')}>
            Deney öner
          </button>
          <button disabled={status !== 'idle'} onClick={() => void askBalkiz('Bugün öğrenmek için eğlenceli bir teknoloji konusu seç.')}>
            Konu seç
          </button>
          <button disabled={status !== 'idle'} onClick={() => void askBalkiz('Bana kısa bir bilmece sor.')}>Bilmece sor</button>
        </aside>

        <section className="orb-zone" aria-live="polite">
          <div className={`orb-wrap ${status}`}>
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="orbit orbit-c" />
            <div className="hologram-projector" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <button
              className="orb-button"
              onClick={status === 'listening' ? stopListening : startListening}
              disabled={status === 'processing' || status === 'speaking'}
              aria-label={status === 'listening' ? 'Dinlemeyi durdur' : 'Konuşmaya başla'}
              style={{ transform: `scale(${1 + audioLevel * 0.13})` }}
            >
              <span className="orb-shine" />
              <img className="orb-logo" src={balkizLogoUrl} alt="" aria-hidden="true" />
              <strong>{meta.icon}</strong>
              {status === 'listening' ? <Square size={34} /> : status === 'processing' ? <Loader2 size={34} /> : <Mic size={34} />}
            </button>
          </div>

          <div className="status-card">
            <span>{meta.label}</span>
            <p>{status === 'processing' ? THINKING_LINES[thinkingIndex] : meta.helper}</p>
          </div>

          <div className="holo-readouts" aria-label="Canlı sistem göstergeleri">
            <div>
              <small>Merak Motoru</small>
              <strong>{status === 'idle' ? 'Beklemede' : 'Aktif'}</strong>
            </div>
            <div>
              <small>Ses Işığı</small>
              <strong>{Math.round(audioLevel * 100)}%</strong>
            </div>
            <div>
              <small>Görev Modu</small>
              <strong>Çocuk Dostu</strong>
            </div>
          </div>

          <div className="wave" aria-hidden="true">
            {Array.from({ length: 38 }, (_, index) => {
              const active = status !== 'idle';
              const height = active
                ? 8 + Math.abs(Math.sin(index * 0.62 + audioLevel * 7)) * (16 + audioLevel * 48)
                : 8 + Math.abs(Math.sin(index * 0.5)) * 8;
              return <span key={index} style={{ height }} />;
            })}
          </div>

          <form className="ask-box" onSubmit={handleSubmit}>
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Mikrofon olmazsa buraya yaz..."
              disabled={status === 'processing' || status === 'speaking'}
            />
            <button type="submit" disabled={!draft.trim() || status === 'processing' || status === 'speaking'}>
              <Send size={18} />
            </button>
          </form>

          <div className="quick-row">
            {QUICK_QUESTIONS.map((question) => (
              <button key={question} onClick={() => void askBalkiz(question)} disabled={status !== 'idle'}>
                {question}
              </button>
            ))}
          </div>
        </section>

        <aside className="side-panel right-panel">
          <div className="panel-title">
            <Brain size={16} />
            Oturum
          </div>
          <div className="metric">
            <span>Konuşma</span>
            <strong>{turnCount}</strong>
          </div>
          <div className="metric">
            <span>Ses girişi</span>
            <strong>{supportsSpeechRecognition ? 'Canlı' : 'Kayıt'}</strong>
          </div>
          <div className="metric">
            <span>Durum</span>
            <strong>{meta.label}</strong>
          </div>
        </aside>
      </section>

      <section className="conversation" aria-label="Konuşma">
        {error && (
          <article className="bubble error">
            <strong>Uyarı</strong>
            <p>{error}</p>
          </article>
        )}

        {liveTranscript && (
          <article className="bubble user live">
            <strong>Sen</strong>
            <p>{liveTranscript}</p>
          </article>
        )}

        {messages.slice(-5).map((message, index) => (
          <article className={`bubble ${message.role}`} key={`${message.role}-${index}-${message.content}`}>
            <strong>{message.role === 'user' ? 'Sen' : 'BALKIZ'}</strong>
            <p>{message.content}</p>
          </article>
        ))}
      </section>

      <footer className="footer">
        <span>BALKIZ ile öğren, dene, keşfet.</span>
        <button onClick={stopSpeaking} disabled={status !== 'speaking'}>
          {status === 'speaking' ? <VolumeX size={16} /> : <Volume2 size={16} />}
          Sesi kontrol et
        </button>
        <span>Mustafa Berke Şimşekler © 2026</span>
      </footer>

      <div className="magic-strip" aria-hidden="true">
        <Wand2 size={18} />
        <span />
      </div>
    </main>
  );
}
