import type { VercelRequest, VercelResponse } from '@vercel/node';

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type GroqContentPart = string | { text?: string; content?: string };

type GroqResponse = {
  choices?: Array<{
    text?: string;
    message?: {
      content?: string | GroqContentPart[];
      response?: string;
      output_text?: string;
    };
  }>;
};

const SAFE_REDIRECT =
  'Bu konuda eğitilmedim; istersen birlikte güvenli bir bilim sorusuna bakalım.';

const SYSTEM_PROMPT = `Senin adın BALKIZ.
Çocuklara Türkçe konuşan, güvenli, sakin ve eğitici bir yardımcı asistansın.

Konuşma kuralları:
- Türkçe cevap ver.
- Gereken uzunlukta cevap ver; çoğu cevap 12-22 kelime arası olsun.
- Kullanıcı uzun açıklama isterse en fazla 3 kısa madde kullan.
- Çocuklara uygun, merak uyandıran ve sakin bir ton kullan.
- Bilmediğin şeyde uydurma; kısa ve dürüst cevap ver.
- Siyaset, din, şiddet, yetişkin içerik ve popüler kültür isteyen konularda sadece şunu söyle: "${SAFE_REDIRECT}"
- Tehlikeli konulara girmeden, güvenli ve eğitici cevaplar ver.
- Aşırı duygusal, yapay heyecanlı veya uzun motivasyon cümleleri kurma.
- Geçmişte reddedilmiş bir soru varsa, yeni güvenli soruyu cezalandırma; son kullanıcı mesajına göre cevap ver.

Özel cevaplar:
- "Adın ne?" sorusuna: "Ben BALKIZ! Meraklı sorular için buradayım."
- "Seni kim yaptı?" sorusuna: "Beni Berke ve iLKYAR'daki abi ablaların yaptı."
- "Kaç yaşındasın?" sorusuna: "Benim bir yaşım yok ama enerjim hep yüksek!"`;

const BLOCK_PATTERNS = [
  /\b(siyaset|politik|parti|seçim|cumhurbaşkanı|başbakan)\b/i,
  /\b(din|allah|tanrı|peygamber|kuran|incil|ateist|müslüman|hristiyan)\b/i,
  /\b(öldür|intihar|bomba|silah|kan|işkence|yarala|döv|saldır)\b/i,
  /\b(seks|porno|çıplak|yetişkin içerik)\b/i,
  /\b(ünlü|magazin|dedikodu|tiktokçu|youtuber|şarkıcı|oyuncu)\b/i
];

const REFUSAL_HINTS = [
  'bu konuda eğitilmedim',
  'maalesef eğitilmedi',
  'güvenli bir bilim sorusu',
  'bu konuya giremiyorum',
  'yardım edemem'
];

function sanitizeText(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isBlockedTopic(text: string) {
  return BLOCK_PATTERNS.some((pattern) => pattern.test(text));
}

function isRefusalLike(text: string) {
  const lower = text.toLocaleLowerCase('tr-TR');
  return REFUSAL_HINTS.some((hint) => lower.includes(hint));
}

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  const valid = input
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      const maybe = item as Partial<ChatMessage>;
      return (
        (maybe.role === 'user' || maybe.role === 'assistant') &&
        typeof maybe.content === 'string' &&
        maybe.content.trim().length > 0
      );
    })
    .map((item) => ({
      role: item.role,
      content: sanitizeText(item.content, 500)
    }));

  const lastUserIndex = valid.map((message) => message.role).lastIndexOf('user');
  if (lastUserIndex < 0) return [];

  const lastUserMessage = valid[lastUserIndex];
  const context = valid
    .slice(Math.max(0, lastUserIndex - 5), lastUserIndex)
    .filter((message) => !isRefusalLike(message.content))
    .filter((message) => !(message.role === 'user' && isBlockedTopic(message.content)))
    .slice(-4);

  return [...context, lastUserMessage];
}

function extractText(data: unknown): string {
  const parsed = data as GroqResponse;
  const choice = parsed.choices?.[0];
  const message = choice?.message;
  const direct = message?.content;

  if (typeof direct === 'string') return direct;
  if (Array.isArray(direct)) {
    return direct
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join(' ');
  }

  return (
    choice?.text ||
    message?.response ||
    message?.output_text ||
    ''
  );
}

function localFallback(userText: string) {
  const lower = userText.toLocaleLowerCase('tr-TR');

  if (lower.includes('adın')) return 'Ben BALKIZ! Meraklı sorular için buradayım.';
  if (lower.includes('seni kim yaptı') || lower.includes('kim yaptı')) {
    return "Beni Berke ve iLKYAR'daki abi ablaların yaptı.";
  }
  if (lower.includes('kaç yaş')) return 'Benim bir yaşım yok ama enerjim hep yüksek!';
  if (isBlockedTopic(userText)) return SAFE_REDIRECT;
  if (lower.includes('deney')) return 'Güvenli bir deney için suya karabiber serp, sonra sabunlu parmağınla yüzey gerilimini gözle.';
  if (lower.includes('uzay')) return 'Uzay karanlık görünür çünkü ışık gözümüze ancak bir kaynaktan ya da yansıyan yüzeyden gelir.';
  if (lower.includes('robot')) return 'Robotlar sensörlerle çevreyi algılar, yazılımla karar verir ve motorlarla hareket eder.';

  return 'Bunu kısa cevaplayayım: merak ettiğin şeyi biraz daha net söylersen hemen yardımcı olurum.';
}

function cleanReply(value: string, userText: string): string {
  const compact = value
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/<\|.*?\|>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact || compact.length < 3) return localFallback(userText);

  const sentences = compact.match(/[^.!?]+[.!?]?/g) || [compact];
  const firstUseful = sentences.find((sentence) => sentence.trim().length > 2) || compact;
  const words = firstUseful.trim().split(/\s+/);
  const limit = userText.length > 80 || /açıkla|anlat|neden|nasıl/i.test(userText) ? 34 : 24;
  return words.slice(0, limit).join(' ');
}

async function requestGroqChat(apiKey: string, messages: ChatMessage[]) {
  const preferredModel = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
  const fallbackModels = ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'];
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError = '';

  for (const model of models) {
    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.45,
      top_p: 0.85,
      max_completion_tokens: 90,
      presence_penalty: 0,
      frequency_penalty: 0.1
    };

    if (model.startsWith('openai/gpt-oss')) {
      payload.include_reasoning = false;
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) return response;

    lastError = await response.text();
    const canTryNext =
      response.status === 404 ||
      response.status === 403 ||
      lastError.includes('model_not_found') ||
      lastError.includes('does not exist') ||
      lastError.includes('do not have access');

    if (!canTryNext) return new Response(lastError, { status: response.status });
  }

  return new Response(lastError || 'No available Groq model', { status: 502 });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY is missing' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = normalizeMessages(body?.messages);
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

    if (!lastUserMessage) {
      return res.status(400).json({ error: 'A user message is required' });
    }

    if (isBlockedTopic(lastUserMessage.content)) {
      return res.status(200).json({ text: SAFE_REDIRECT });
    }

    const response = await requestGroqChat(apiKey, messages);
    if (!response.ok) {
      const detail = await response.text();
      console.error('Groq request failed:', detail);
      return res.status(200).json({ text: localFallback(lastUserMessage.content) });
    }

    const data = await response.json();
    const text = cleanReply(extractText(data), lastUserMessage.content);

    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      text: 'Küçük bir bağlantı sorunu oldu; sorununu kısa yazarsan tekrar deneyelim.'
    });
  }
}
