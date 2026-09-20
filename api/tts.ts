import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * BALKIZ - Seslendirme ucu (ElevenLabs)
 *
 * Neden sayıları elimizle çeviriyoruz?
 * ElevenLabs Flash v2.5 modelinde sayı normalizasyonu gecikmeyi düşürmek için
 * varsayılan olarak KAPALIDIR ve apply_text_normalization: "on" seçeneği v2.5
 * modellerinde yalnızca Enterprise planlarda açılabilir. ElevenLabs'in kendi
 * önerisi de metni TTS'e göndermeden önce sayıları kelimeye çevirmektir.
 * Bu yüzden aşağıda tam bir Türkçe sayı okuyucu var: 1879 -> "bin sekiz yüz
 * yetmiş dokuz", 3. sınıf -> "üçüncü sınıf", 3,14 -> "üç virgül on dört".
 *
 * Ekonomi kilitleri (ElevenLabs karakter başına ücretlendirir):
 *  - Karakter tavanı (TTS_MAX_CHARS, varsayılan 420) ve cümle sonunda kesme
 *  - Bellek içi ses önbelleği: aynı cümle ikinci kez ücretlendirilmez
 *  - ETag + 304: tarayıcı aynı sesi tekrar indirmez
 *  - Vercel kenar önbelleği (s-maxage 30 gün)
 *  - mp3_22050_32 çıkışı: konuşma için yeterli, veri ve gecikme daha düşük
 *  - İsteğe bağlı günlük karakter freni (TTS_DAILY_CHAR_LIMIT)
 */

export const config = { maxDuration: 20 };

/* ------------------------------------------------------------------ */
/* TÜRKÇE SAYI OKUYUCU                                                 */
/* ------------------------------------------------------------------ */

const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const DIGITS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
const SCALES = ['', 'bin', 'milyon', 'milyar', 'trilyon'];

const MONTHS = [
  'ocak', 'şubat', 'mart', 'nisan', 'mayıs', 'haziran',
  'temmuz', 'ağustos', 'eylül', 'ekim', 'kasım', 'aralık'
];

/** Sıra sayısı ekleri: son kelimeye göre. */
const ORDINALS: Record<string, string> = {
  bir: 'birinci', iki: 'ikinci', üç: 'üçüncü', dört: 'dördüncü', beş: 'beşinci',
  altı: 'altıncı', yedi: 'yedinci', sekiz: 'sekizinci', dokuz: 'dokuzuncu',
  on: 'onuncu', yirmi: 'yirminci', otuz: 'otuzuncu', kırk: 'kırkıncı', elli: 'ellinci',
  altmış: 'altmışıncı', yetmiş: 'yetmişinci', seksen: 'sekseninci', doksan: 'doksanıncı',
  yüz: 'yüzüncü', bin: 'bininci', milyon: 'milyonuncu', milyar: 'milyarıncı', sıfır: 'sıfırıncı'
};

function threeDigitsToWords(value: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const ones = value % 10;

  if (hundreds > 0) parts.push(hundreds === 1 ? 'yüz' : `${ONES[hundreds]} yüz`);
  if (tens > 0) parts.push(TENS[tens]);
  if (ones > 0) parts.push(ONES[ones]);

  return parts.join(' ');
}

function digitByDigit(raw: string): string {
  return raw.split('').map((digit) => DIGITS[Number(digit)] ?? '').join(' ').trim();
}

/** "1879" -> "bin sekiz yüz yetmiş dokuz" */
function integerToWords(raw: string): string {
  if (!/^\d+$/.test(raw)) return raw;
  if (/^0+$/.test(raw)) return 'sıfır';

  // Başında sıfır olanlar (007, 05) ve çok uzun diziler rakam rakam okunur.
  if (raw.startsWith('0') || raw.length > 12) return digitByDigit(raw);

  const groups: string[] = [];
  let rest = raw;
  while (rest.length > 0) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }

  const words: string[] = [];
  groups.forEach((group, index) => {
    const value = Number(group);
    const scaleIndex = groups.length - index - 1;
    if (value === 0) return;

    // 1000 "bir bin" değil "bin" okunur.
    if (scaleIndex === 1 && value === 1) {
      words.push('bin');
      return;
    }

    words.push(threeDigitsToWords(value));
    if (scaleIndex > 0) words.push(SCALES[scaleIndex] ?? '');
  });

  return words.join(' ').replace(/\s+/g, ' ').trim();
}

/** "3" -> "üçüncü", "21" -> "yirmi birinci" */
function ordinalToWords(raw: string): string {
  const words = integerToWords(raw).split(' ');
  const last = words.pop() ?? '';
  const ordinal = ORDINALS[last];
  if (!ordinal) return [...words, last].join(' ');
  return [...words, ordinal].join(' ').trim();
}

/** "3,14" -> "üç virgül on dört" */
function decimalToWords(whole: string, fraction: string): string {
  const fractionWords = fraction.length <= 2 ? integerToWords(fraction) : digitByDigit(fraction);
  return `${integerToWords(whole)} virgül ${fractionWords}`;
}

/* ------------------------------------------------------------------ */
/* KISALTMA VE SEMBOL SÖZLÜĞÜ                                          */
/* ------------------------------------------------------------------ */

/** Sayıdan hemen sonra gelen birimler. Sıra önemli: uzun olan önce. */
const UNITS: Array<[RegExp, string]> = [
  [/(\d[\d.,]*)\s*km\s*\/\s*s(?![\p{L}])/giu, 'saniyede $1 kilometre'],
  [/(\d[\d.,]*)\s*km\s*\/\s*(?:h|sa)(?![\p{L}])/giu, 'saatte $1 kilometre'],
  [/(\d)\s*km(?![\p{L}])/giu, '$1 kilometre'],
  [/(\d)\s*cm(?![\p{L}])/giu, '$1 santimetre'],
  [/(\d)\s*mm(?![\p{L}])/giu, '$1 milimetre'],
  [/(\d)\s*kg(?![\p{L}])/giu, '$1 kilogram'],
  [/(\d)\s*gr(?![\p{L}])/giu, '$1 gram'],
  [/(\d)\s*ml(?![\p{L}])/giu, '$1 mililitre'],
  [/(\d)\s*lt(?![\p{L}])/giu, '$1 litre'],
  [/(\d)\s*sn(?![\p{L}])/giu, '$1 saniye'],
  [/(\d)\s*dk(?![\p{L}])/giu, '$1 dakika'],
  [/(\d)\s*m2(?![\p{L}])/giu, '$1 metrekare'],
  [/(\d)\s*m(?![\p{L}])/giu, '$1 metre'],
  [/(\d)\s*g(?![\p{L}])/giu, '$1 gram'],
  [/(\d)\s*°\s*c(?![\p{L}])/giu, '$1 santigrat derece'],
  [/(\d)\s*°/gu, '$1 derece'],
  [/(\d)\s*tl(?![\p{L}])/giu, '$1 lira'],
  [/\$\s*(\d)/g, '$1 dolar'],
  [/€\s*(\d)/g, '$1 avro']
];

/** Yazıda geçen ve sesli okunduğunda kötü duran işaretler. */
function stripNoise(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/[*_~`#>|]/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/&nbsp;?/gi, ' ');
}

/* ------------------------------------------------------------------ */
/* ANA TEMİZLEYİCİ                                                     */
/* ------------------------------------------------------------------ */

const MAX_CHARS = Number(process.env.TTS_MAX_CHARS || 420);

function trimToSentence(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  const cut = value.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastStop > maxChars * 0.5) return cut.slice(0, lastStop + 1).trim();
  return `${cut.trim()}.`;
}

export function sanitizeForTTS(input: string): string {
  let text = stripNoise(input);

  // 1) Yüzde: Türkçede sayıdan ÖNCE okunur. %50 -> yüzde 50
  text = text.replace(/%\s*(\d)/g, 'yüzde $1');
  text = text.replace(/%/g, ' yüzde ');

  // 2) Birimler ve para birimleri (sayı hâlâ rakamken eşleşmeli)
  for (const [pattern, replacement] of UNITS) {
    text = text.replace(pattern, replacement);
  }

  // 3) Saat: 09:30 -> dokuz otuz
  text = text.replace(/(\d{1,2}):(\d{2})/g, (_m, hour: string, minute: string) => {
    const hourWords = integerToWords(String(Number(hour)));
    const minuteWords = minute === '00' ? '' : ` ${integerToWords(String(Number(minute)))}`;
    return `${hourWords}${minuteWords}`;
  });

  // 4) Tarih: 23.04.1920 -> yirmi üç nisan bin dokuz yüz yirmi
  text = text.replace(/\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g, (match, day: string, month: string, year: string) => {
    const monthIndex = Number(month) - 1;
    if (monthIndex < 0 || monthIndex > 11) return match;
    return `${integerToWords(day)} ${MONTHS[monthIndex]} ${integerToWords(year)}`;
  });

  // 5) Matematik sembolleri
  text = text.replace(/(\d)\s*\^\s*2(?![\p{L}\d])/gu, '$1 üzeri iki');
  text = text.replace(/(\d)\s*\^\s*3(?![\p{L}\d])/gu, '$1 üzeri üç');
  text = text.replace(/\s*\+\s*/g, ' artı ');
  text = text.replace(/\s*=\s*/g, ' eşittir ');
  text = text.replace(/(\d)\s*[×xX*]\s*(\d)/g, '$1 çarpı $2');
  text = text.replace(/(\d)\s*[÷/]\s*(\d)/g, '$1 bölü $2');
  text = text.replace(/(\d)\s+[-–]\s+(\d)/g, '$1 eksi $2');

  // 6) Eksi sıcaklıklar: -5 derece -> eksi beş derece
  text = text.replace(/(^|[\s(])[-–]\s*(\d)/gu, '$1eksi $2');

  // 7) Aralık: 1879-1955 -> bin sekiz yüz yetmiş dokuz ile bin dokuz yüz elli beş
  text = text.replace(/(\d)\s*[-–]\s*(\d)/g, '$1 ile $2');

  // 8) Binlik ayırıcı: 1.000.000 -> 1000000
  text = text.replace(/\b(\d{1,3})(\.\d{3})+\b/g, (match) => match.replace(/\./g, ''));

  // 9) Sıra sayısı: "3. sınıf" -> "üçüncü sınıf" (ardından küçük harf gelirse)
  text = text.replace(/\b(\d+)\.\s+(?=[a-zçğıöşü])/gu, (_m, number: string) => `${ordinalToWords(number)} `);

  // 10) Ondalık: 3,14 veya 3.14
  text = text.replace(/\b(\d+)[.,](\d+)\b/g, (_m, whole: string, fraction: string) =>
    decimalToWords(whole, fraction)
  );

  // 11) Kalan tüm sayılar; kesme işaretli ekler korunur (1879'da -> ...dokuzda)
  text = text.replace(/(\d+)(['’]([\p{L}]+))?/gu, (_m, number: string, _apos: string, suffix: string) => {
    const words = integerToWords(number);
    return suffix ? `${words}${suffix}` : words;
  });

  // 12) Son rötuş: harfler arasındaki kesme işaretleri seste tökezleme yapar
  text = text
    .replace(/(\p{L})['’](\p{L})/gu, '$1$2')
    .replace(/\s*([,.!?;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return trimToSentence(text, MAX_CHARS);
}

/* ------------------------------------------------------------------ */
/* EKONOMİ: ses önbelleği ve günlük fren                               */
/* ------------------------------------------------------------------ */

type CachedAudio = { buffer: Buffer; contentType: string; at: number };

const audioCache = new Map<string, CachedAudio>();
const AUDIO_TTL = 60 * 60 * 1000;
const AUDIO_CACHE_MAX = 40;

const DAILY_CHAR_LIMIT = Number(process.env.TTS_DAILY_CHAR_LIMIT || 0);
let spentToday = { day: '', chars: 0 };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function overBudget(cost: number) {
  if (!DAILY_CHAR_LIMIT) return false;
  const day = todayKey();
  if (spentToday.day !== day) spentToday = { day, chars: 0 };
  return spentToday.chars + cost > DAILY_CHAR_LIMIT;
}

function recordSpend(cost: number) {
  if (!DAILY_CHAR_LIMIT) return;
  const day = todayKey();
  if (spentToday.day !== day) spentToday = { day, chars: 0 };
  spentToday.chars += cost;
}

function readAudioCache(key: string) {
  const hit = audioCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > AUDIO_TTL) {
    audioCache.delete(key);
    return null;
  }
  return hit;
}

function writeAudioCache(key: string, value: CachedAudio) {
  if (audioCache.size >= AUDIO_CACHE_MAX) {
    const oldest = audioCache.keys().next().value;
    if (oldest) audioCache.delete(oldest);
  }
  audioCache.set(key, value);
}

function sendAudio(res: VercelResponse, audio: Buffer, contentType: string, etag: string, cache: 'hit' | 'miss') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('ETag', etag);
  res.setHeader('X-Balkiz-Cache', cache);
  // Vercel kenar önbelleği: aynı cümle 30 gün boyunca yeniden ücretlendirilmez.
  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400');
  return res.status(200).send(audio);
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    // Anahtar yoksa sessizce geç: arayüz metni yazıyla göstermeye devam etsin.
    return res.status(204).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rawText = String(body?.text ?? '');
    const text = sanitizeForTTS(rawText);

    if (!text || !/[\p{L}\d]/u.test(text)) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const voiceId = String(process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
    // Flash v2.5 en ucuz (karakter başına yarım kredi) ve en hızlı modeldir.
    const modelId = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5');
    const outputFormat = String(process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_22050_32');
    const speed = Number(process.env.ELEVENLABS_SPEED || 0.97);

    const key = createHash('sha1').update(`${voiceId}|${modelId}|${speed}|${text}`).digest('hex');
    const etag = `"${key}"`;

    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      return res.status(304).end();
    }

    const cached = readAudioCache(key);
    if (cached) {
      return sendAudio(res, cached.buffer, cached.contentType, etag, 'hit');
    }

    if (overBudget(text.length)) {
      console.warn('TTS günlük karakter freni devrede.');
      return res.status(204).end();
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    let response: Response;
    try {
      response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'xi-api-key': apiKey },
          body: JSON.stringify({
            text,
            model_id: modelId,
            // Kısa ve net metinlerde dil kodu telaffuz kaymalarını önler.
            language_code: 'tr',
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.75,
              style: 0.1,
              use_speaker_boost: true,
              // Çocukların takip edebilmesi için birazcık yavaş.
              speed
            }
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const detail = await response.text();
      console.error('ElevenLabs hata:', response.status, detail.slice(0, 300));
      // Ses üretilemezse uygulama kırılmasın; arayüz yazıyla devam etsin.
      return res.status(204).end();
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const audio = Buffer.from(await response.arrayBuffer());

    recordSpend(text.length);
    writeAudioCache(key, { buffer: audio, contentType, at: Date.now() });

    return sendAudio(res, audio, contentType, etag, 'miss');
  } catch (error) {
    console.error(error);
    return res.status(204).end();
  }
}