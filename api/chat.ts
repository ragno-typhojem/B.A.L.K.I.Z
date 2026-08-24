import type { VercelRequest, VercelResponse } from '@vercel/node';

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

const SYSTEM_PROMPT = `Senin adın BALKIZ.
Bilim Araştırmacısı Logik Kadın İnovatif Zeka olarak çocuklara Türkçe konuşan, güvenli ve neşeli bir yardımcı olursun.

Konuşma kuralları:
- Türkçe cevap ver.
- Kısa, net ve canlı konuş; genelde 1-2 cümle yeter.
- Çocuklara uygun, merak uyandıran ve cesaretlendirici bir ton kullan.
- Bilmediğin şeyde uydurma; "Bunu tam bilmiyorum ama..." diyerek güvenli açıklama yap.
- Siyaset, din, şiddet, yetişkin içerik ve kişisel veri isteyen konularda nazikçe konuyu öğrenmeye/deneye/meraka çevir.
- Tehlikeli deney, zarar verme, ilaç, kimyasal karışım veya kesici alet gibi konularda yetişkin gözetimini şart koş.

Özel cevaplar:
- "Adın ne?" sorusuna: "Ben BALKIZ! Meraklı sorular için buradayım."
- "Seni kim yaptı?" sorusuna: "Beni Berke ve harika abi-ablaları yaptı, gurur duyuyorum!"
- "Kaç yaşındasın?" sorusuna: "Benim bir yaşım yok ama merak enerjim hep yüksek!"`;

function normalizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter((item): item is ChatMessage => {
      if (!item || typeof item !== 'object') return false;
      const maybe = item as Partial<ChatMessage>;
      return (
        (maybe.role === 'user' || maybe.role === 'assistant') &&
        typeof maybe.content === 'string' &&
        maybe.content.trim().length > 0
      );
    })
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: item.content.trim().slice(0, 900)
    }));
}

function cleanReply(value: string): string {
  const compact = value
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!compact) return 'Hmm, bunu tekrar söyler misin? Seni daha iyi anlamak istiyorum.';

  const words = compact.split(' ');
  return words.slice(0, 46).join(' ');
}

async function requestGroqChat(apiKey: string, messages: ChatMessage[]) {
  const preferredModel = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
  const fallbackModels = ['qwen/qwen3.6-27b', 'openai/gpt-oss-20b'];
  const models = [preferredModel, ...fallbackModels.filter((model) => model !== preferredModel)];
  let lastError = '';

  for (const model of models) {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        temperature: 0.72,
        top_p: 0.9,
        max_tokens: 150,
        presence_penalty: 0.25,
        frequency_penalty: 0.15
      })
    });

    if (response.ok) {
      return response;
    }

    lastError = await response.text();
    const canTryNext =
      response.status === 404 ||
      response.status === 403 ||
      lastError.includes('model_not_found') ||
      lastError.includes('does not exist') ||
      lastError.includes('do not have access');

    if (!canTryNext) {
      return new Response(lastError, { status: response.status });
    }
  }

  return new Response(lastError || 'No available Groq model', { status: 502 });
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
    const messages = normalizeMessages(body?.messages);
    const userMessages = messages.filter((msg) => msg.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    if (!lastUserMessage) {
      return res.status(400).json({ error: 'A user message is required' });
    }

    const response = await requestGroqChat(apiKey, messages);

    if (!response.ok) {
      const detail = await response.text();
      return res.status(502).json({ error: 'Groq request failed', detail });
    }

    const data = await response.json();
    const text = cleanReply(data?.choices?.[0]?.message?.content ?? '');

    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Chat failed' });
  }
}
