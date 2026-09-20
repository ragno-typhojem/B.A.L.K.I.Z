import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * BALKIZ - Ses tanıma ucu (Groq Whisper)
 *
 * Bu sürümde düzeltilenler:
 *  - Boyut kontrolü: base64 gövde Vercel'in 4.5 MB sınırını aşınca istek
 *    sessizce patlıyordu. Artık net bir hata dönüyor.
 *  - Sözlük yönlendirmesi (prompt): "Einstein", "Tesla", "BALKIZ", "İLKYAR"
 *    gibi kelimeler artık doğru yazılıyor. Whisper'a bağlam vermek ücretsizdir.
 *  - Halüsinasyon filtresi: sessiz kayıtlarda Türkçe Whisper sürekli
 *    "Altyazı M.K.", "Abone olmayı unutmayın" gibi cümleler uydurur.
 *    Bunlar ayıklanıp boş metin döndürülür, böylece boşuna sohbet çağrısı
 *    yapılmaz (hem doğruluk hem ekonomi).
 *  - Zaman aşımı ve 429/5xx için tek seferlik yeniden deneme.
 *  - Model: whisper-large-v3-turbo, saat başı en ucuz seçenek.
 */

export const config = { maxDuration: 20 };

// Vercel Functions gövde sınırı 4.5 MB'dir ve yükseltilemez.
// base64 veriyi ~%33 şişirdiği için tavanı 4 MB'de tutuyoruz (~60 sn kayıt).
const MAX_BASE64_BYTES = 4_000_000;

/** Whisper'a verilen bağlam ipucu: isimler ve terimler doğru yazılsın. */
const TRANSCRIBE_PROMPT =
  'Bu, ilkokul çağındaki bir çocuğun BALKIZ adlı bilim asistanına sorduğu Türkçe bir sorudur. ' +
  'Sık geçen kelimeler: BALKIZ, İLKYAR, Einstein, Newton, Tesla, Edison, Marie Curie, Aziz Sancar, ' +
  'Cahit Arf, uzay, gezegen, Güneş, Ay, deney, robot, matematik, hayvan, doğa, öğretmen.';

/** Sessiz veya gürültülü kayıtlarda Whisper'ın uydurduğu tipik cümleler. */
const HALLUCINATIONS = [
  'altyazı m.k.',
  'altyazı mk',
  'altyazılar',
  'abone olmayı unutmayın',
  'abone ol',
  'izlediğiniz için teşekkürler',
  'izlediğiniz için teşekkür ederim',
  'bir sonraki videoda görüşmek üzere',
  'kanalıma abone olun',
  'amara.org',
  'subtitles by',
  'teşekkürler',
  'altyazı',
  'müzik',
  'alkış'
];

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'mp4';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function normalizeForCheck(text: string) {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}.\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Gerçek bir soru mu, yoksa sessizlik halüsinasyonu mu? */
function looksLikeHallucination(text: string) {
  const normalized = normalizeForCheck(text);
  if (!normalized) return true;

  // Kısa metinlerde tam/parça eşleşme halüsinasyon sayılır.
  if (normalized.length <= 60 && HALLUCINATIONS.some((phrase) => normalized.includes(phrase))) {
    return true;
  }

  // "aaaa", "hmm hmm hmm" gibi tekrarlar
  if (/^(.)\1{3,}$/u.test(normalized.replace(/\s/g, ''))) return true;

  // Tek harflik çıktı
  if (normalized.replace(/[^\p{L}]/gu, '').length < 2) return true;

  return false;
}

async function callWhisper(apiKey: string, form: FormData, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GROQ_API_KEY is missing' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const audioBase64 = String(body?.audioBase64 ?? '');
    const mimeType = String(body?.mimeType ?? 'audio/webm');
    const rawBase64 = audioBase64.includes(',') ? audioBase64.split(',').pop() ?? '' : audioBase64;

    if (!rawBase64 || rawBase64.length < 200) {
      return res.status(400).json({ error: 'Audio data is missing', text: '' });
    }

    if (rawBase64.length > MAX_BASE64_BYTES) {
      return res.status(413).json({
        error: 'Audio too large',
        text: '',
        hint: 'Kayıt süresini 30-45 saniyeyle sınırla veya daha düşük bit hızı kullan.'
      });
    }

    const bytes = Buffer.from(rawBase64, 'base64');
    const arrayBuffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer;

    const buildForm = () => {
      const form = new FormData();
      form.append('file', new Blob([arrayBuffer], { type: mimeType }), `speech.${extensionFromMime(mimeType)}`);
      form.append('model', process.env.GROQ_TRANSCRIBE_MODEL || 'whisper-large-v3-turbo');
      form.append('language', 'tr');
      form.append('response_format', 'json');
      form.append('temperature', '0');
      form.append('prompt', TRANSCRIBE_PROMPT);
      return form;
    };

    let response = await callWhisper(apiKey, buildForm(), 15000);

    // Ücretsiz katmanda 429 sık görülür; bir kez daha dene.
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      response = await callWhisper(apiKey, buildForm(), 12000);
    }

    if (!response.ok) {
      const detail = await response.text();
      console.error('Whisper hata:', response.status, detail.slice(0, 300));
      return res.status(response.status).json({ error: 'Transcription failed', text: '', detail });
    }

    const data = await response.json();
    const text = String(data?.text ?? '').replace(/\s+/g, ' ').trim();

    if (looksLikeHallucination(text)) {
      // Boş metin dönüyoruz: arayüz "seni duyamadım, tekrar söyler misin?" desin.
      return res.status(200).json({ text: '', empty: true });
    }

    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Transcription failed', text: '' });
  }
}