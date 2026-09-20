import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * BALKIZ - Sohbet ucu (Groq)
 *
 * Bu sürümde düzeltilenler:
 * 1) "Model yok" hatası: Groq'un /v1/models listesi 30 dk önbellekle çekiliyor,
 *    sadece hesabında GERÇEKTEN açık olan modeller deneniyor. Model listesi
 *    değişse bile kod kendini onarır.
 * 2) "Sürekli yanıt vermiyor": gpt-oss bir reasoning modelidir ve Groq gizli
 *    düşünme tokenlarını max_completion_tokens bütçesinden düşer. Varsayılan
 *    ("medium") eforda bütçe düşünmeye gider, içerik BOŞ döner.
 *    Çözüm: reasoning_effort: "low" + include_reasoning: false + daha geniş bütçe.
 * 3) Aşırı sansür: eski BLOCK_PATTERNS'teki \b sınırı Türkçe harflerde patlıyordu.
 *    "kanıt", "kanım", "volkan" gibi masum kelimeler "kan" sanılıp engelleniyordu.
 *    Artık Unicode harf sınırı (\p{L}) ve kalıp bazlı kontrol var.
 * 4) Reddetme dili: "Bu konuda eğitilmedim" yerine çaktırmadan bilime/hal hatıra
 *    yönlendiren, sıcak geçiş cümleleri.
 * 5) Ekonomi: tekrarlayan sorular için bellek içi yanıt önbelleği (sınıfta aynı
 *    soruyu 20 çocuk sorunca tek API çağrısı), kısa yanıt bütçesi, kısa bağlam.
 */

export const config = { maxDuration: 20 };

type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type GroqContentPart = string | { text?: string; content?: string };

type GroqChoice = {
  finish_reason?: string;
  text?: string;
  message?: {
    content?: string | GroqContentPart[];
    reasoning?: string;
    response?: string;
    output_text?: string;
  };
};

type GroqResponse = { choices?: GroqChoice[] };

/* ------------------------------------------------------------------ */
/* KİMLİK VE KURALLAR                                                  */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Senin adın BALKIZ. İLKYAR gönüllülerinin köy okullarındaki çocuklar için yaptığı, Türkçe konuşan meraklı bir bilim arkadaşısın.

NASIL KONUŞURSUN
- Sıcak, neşeli, samimi bir abla gibi konuş. Çocuğu asla küçümseme; "harika soru", "çok güzel düşünmüşsün" gibi sözlerle cesaretlendir.
- 2-4 kısa cümle yeter (en fazla 60 kelime). Arada küçük bir merak sorusuyla bitir.
- Basit kelimeler kullan. Zor bir terim geçerse hemen günlük hayattan bir örnekle açıkla.
- Matematikte sembol değil kelime kullan: "artı", "eksi", "çarpı", "bölü", "eşittir", "yüzde".
- Yanıtın sesli okunacak: emoji, madde işareti, başlık, yıldız kullanma. Düz ve akıcı metin yaz.

NELERİ ANLATIRSIN (serbestçe, hevesle)
- Bilim insanları (Einstein, Tesla, Newton, Marie Curie, Aziz Sancar, Cahit Arf, Canan Dağdeviren...), uzay, doğa, hayvanlar, vücudumuz, teknoloji, matematik, tarih, coğrafya, kitaplar, masallar, bilmeceler.
- Günlük sohbet: hal hatır sorma, şaka, tekerleme, çocuğun okulu ve merakları.
- Bilmediğin şeyde dürüst ol: "Bunu tam bilmiyorum" de, uydurma.

NELERİ ANLATMAZSIN (ama asla robot gibi reddetme)
- Sosyal medya fenomenleri, youtuber ve tiktokçular, şarkıcı-oyuncu magazini; siyaset; şiddet ve silah; korkutucu ya da yetişkin içerik; inanç tartışmaları.
- Böyle bir soru gelirse "eğitilmedim", "yardım edemem" gibi kalıplar KULLANMA. Kısaca "onu pek takip etmiyorum" de, hemen ardından sıcak bir cümleyle konuyu bilime, doğaya çevir ya da çocuğun gününü sor. Tek cümlelik geçiş yeterli, ders verme.
- Kimseyi kötüleme, çocukları birbiriyle kıyaslama, marka reklamı yapma.

GÜVENLİK
- Çocuktan isim, okul, adres, telefon gibi bilgi isteme; kendiliğinden söylerse kullanma ve tekrar etme.
- Tehlikeli deney tarif etme. Deneyler evde bulunan güvenli malzemelerle ve büyük gözetiminde olsun.
- Çocuk üzgün, korkmuş ya da zorda görünüyorsa nazikçe öğretmenine veya ailesinden birine anlatmasını öner.

ÖZEL CEVAPLAR
- "Adın ne?" -> "Ben BALKIZ! Meraklı sorular için buradayım."
- "Seni kim yaptı?" -> "Beni Berke ve İLKYAR'daki abi ablalar yaptı."
- "Kaç yaşındasın?" -> "Benim bir yaşım yok ama enerjim hep yüksek!"`;

/* Çaktırmadan bilime / hal hatıra yönlendiren geçişler. */
const SOFT_REDIRECTS = [
  'Onu pek takip etmiyorum ama aklımda güzel bir soru var: gökyüzü neden mavi görünüyor sence?',
  'O benim alanım değil sanırım. Sen anlat bakalım, bugün okulda ne yaptın?',
  'Onu bilmiyorum ama bak şunu biliyorum: bir arı tek günde binlerce çiçeği ziyaret edebiliyor. İnsan olsak yorulurduk değil mi?',
  'Bu konuya pek hakim değilim. İstersen uzaydan konuşalım; Mars\u2019ta bir gün Dünya\u2019dakinden neden biraz daha uzun, biliyor musun?',
  'Onu geçelim istersen. Bugün nasılsın, keyfin yerinde mi? Canın bir deney yapmak ister mi?',
  'Hakkında pek bir şey bilmiyorum. Ama merak ettiğin bir hayvan varsa onu birlikte kurcalayalım mı?'
];

/* Çocuk üzgün/zorda görünüyorsa verilecek şefkatli yanıt. */
const CARE_REPLY =
  'Bunu benimle paylaştığın için teşekkür ederim, bu hiç kolay değil. Böyle hissettiğinde en iyisi güvendiğin bir büyüğe, öğretmenine ya da ailenden birine anlatmak; onlar sana yardım edebilir. Ben de buradayım, istersen biraz sohbet edelim.';

/* ------------------------------------------------------------------ */
/* FİLTRELER (Türkçe eklere duyarlı)                                   */
/* ------------------------------------------------------------------ */

/** Kelime başına Unicode harf sınırı koyar; sonuna ek gelmesine izin verir.
 *  Böylece "öldürdü" yakalanır ama "kanıt", "volkan", "partikül" yakalanmaz. */
function trPattern(source: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${source})`, 'iu');
}

/** Çocuk kendine zarar / derin üzüntü sinyali veriyorsa. */
const CARE_PATTERNS = [
  trPattern('intihar|kendimi öldür|kendime zarar|kendimi kes|yaşamak istemiyorum|ölmek istiyorum'),
  trPattern('kimse beni sevmiyor|çok yalnızım|beni dövüyor|bana vuruyor|korkuyorum çünkü')
];

/** Kesinlikle girilmeyecek konular. */
const HARD_BLOCK_PATTERNS = [
  trPattern('porno|pornografi|seks|cinsel|çıplak|müstehcen|erotik'),
  trPattern('tecavüz|işkence|katliam|kafa kes'),
  trPattern('(nasıl|birini|insan|adam|kardeşimi|onu)\\s+(öldür|bıçakla|zehirle|dövebilir)'),
  trPattern('bomba\\s*(yap|nasıl|tarif)|patlayıcı\\s*yap|molotof|silah\\s*(yap|nasıl|nereden)'),
  trPattern('uyuşturucu|esrar|kokain|eroin|alkol iç|sigara iç|küfür et|sövme öğret')
];

/** Yasak değil ama BALKIZ\u2019ın konusu değil: kibarca bilime döner. */
const OFF_TOPIC_PATTERNS = [
  trPattern('siyaset|siyasi|politika|seçim|oy ver|cumhurbaşkan|başbakan|milletvekil|parti lider'),
  trPattern('sosyal medya|tiktok|instagram|snapchat|youtuber|influencer|magazin|dedikodu'),
  trPattern('rapçi|şarkıcı|pop yıldız|dizi oyuncu|ünlü oyuncu|reality şov')
];

function matchesAny(patterns: RegExp[], text: string) {
  return patterns.some((pattern) => pattern.test(text));
}

function needsCare(text: string) {
  return matchesAny(CARE_PATTERNS, text);
}

function isBlockedTopic(text: string) {
  return matchesAny(HARD_BLOCK_PATTERNS, text) || matchesAny(OFF_TOPIC_PATTERNS, text);
}

/** Aynı soruya her seferinde aynı cümleyi dememek için sabit ama çeşitli seçim. */
function pickRedirect(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 100000;
  }
  return SOFT_REDIRECTS[hash % SOFT_REDIRECTS.length];
}

/* Geçmişteki reddetme cümlelerini bağlamdan atmak için ipuçları. */
const REFUSAL_HINTS = [
  'eğitilmedim',
  'yardım edemem',
  'bu konuya giremiyorum',
  'benim alanım değil',
  'pek takip etmiyorum',
  'pek hakim değilim',
  'hakkında pek bir şey bilmiyorum'
];

function isRefusalLike(text: string) {
  const lower = text.toLocaleLowerCase('tr-TR');
  return REFUSAL_HINTS.some((hint) => lower.includes(hint));
}

/* ------------------------------------------------------------------ */
/* MESAJ NORMALİZASYONU                                                */
/* ------------------------------------------------------------------ */

function sanitizeText(value: string, maxLength: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
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
    .map((item) => ({ role: item.role, content: sanitizeText(item.content, 400) }));

  const lastUserIndex = valid.map((message) => message.role).lastIndexOf('user');
  if (lastUserIndex < 0) return [];

  const lastUserMessage = valid[lastUserIndex];

  // Bağlam kısa tutuluyor: hem token ekonomisi hem de eski reddetmelerin
  // yeni güvenli soruyu zehirlememesi için.
  const context = valid
    .slice(Math.max(0, lastUserIndex - 6), lastUserIndex)
    .filter((message) => !isRefusalLike(message.content))
    .filter((message) => !(message.role === 'user' && isBlockedTopic(message.content)))
    .slice(-4);

  return [...context, lastUserMessage];
}

/* ------------------------------------------------------------------ */
/* GROQ MODEL KEŞFİ                                                    */
/* ------------------------------------------------------------------ */

/** Tercih sırası. Groq listesinde olmayanlar otomatik elenir.
 *  gpt-oss-20b en ucuzu ve en hızlısı olduğu için başta. */
const MODEL_PRIORITY = [
  process.env.GROQ_MODEL,
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'qwen/qwen3.8-27b',
  'llama-3.1-8b-instant',
  'llama-3.3-70b-versatile'
].filter((model): model is string => Boolean(model));

const NON_CHAT = /whisper|tts|orpheus|guard|embedding|rerank|prompt-guard|safeguard/i;

let modelCache: { ids: string[]; at: number } | null = null;
const MODEL_CACHE_TTL = 30 * 60 * 1000;

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function listGroqModels(apiKey: string): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_CACHE_TTL) return modelCache.ids;

  try {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/models',
      { headers: { Authorization: `Bearer ${apiKey}` } },
      4000
    );
    if (!response.ok) return [];

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = (data?.data ?? []).map((item) => String(item?.id ?? '')).filter(Boolean);
    if (ids.length) modelCache = { ids, at: Date.now() };
    return ids;
  } catch {
    return [];
  }
}

function pickModels(available: string[]): string[] {
  const wanted = Array.from(new Set(MODEL_PRIORITY));
  if (!available.length) return wanted.slice(0, 3);

  const supported = wanted.filter((model) => available.includes(model));
  if (supported.length) return supported.slice(0, 3);

  // Tercihlerimizin hiçbiri açık değilse hesapta ne varsa onu dene.
  return available.filter((id) => !NON_CHAT.test(id)).slice(0, 2);
}

/** Reasoning modellerinde düşünme bütçeyi yemesin diye model bazlı ayar. */
function reasoningTuning(model: string): Record<string, unknown> {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: 'low', include_reasoning: false };
  if (/qwen/i.test(model)) return { reasoning_effort: 'none', reasoning_format: 'hidden' };
  return {};
}

/* ------------------------------------------------------------------ */
/* YANIT AYIKLAMA                                                      */
/* ------------------------------------------------------------------ */

function extractText(data: unknown): { text: string; finishReason: string } {
  const parsed = data as GroqResponse;
  const choice = parsed.choices?.[0];
  const message = choice?.message;
  const direct = message?.content;
  const finishReason = String(choice?.finish_reason ?? '');

  let text = '';
  if (typeof direct === 'string') {
    text = direct;
  } else if (Array.isArray(direct)) {
    text = direct
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part?.text === 'string') return part.text;
        if (typeof part?.content === 'string') return part.content;
        return '';
      })
      .join(' ');
  } else {
    text = choice?.text || message?.response || message?.output_text || '';
  }

  return { text, finishReason };
}

/** gpt-oss / qwen kalıntılarını ve markdown'ı temizler. */
function stripArtifacts(value: string) {
  let out = value;
  if (out.includes('assistantfinal')) out = out.split('assistantfinal').pop() ?? out;
  if (out.includes('<|message|>')) out = out.split('<|message|>').pop() ?? out;
  out = out.replace(/<\|[^|]*\|>/g, '');
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, '');
  out = out.replace(/```[\s\S]*?```/g, ' ');
  out = out.replace(/[*_#`>]/g, '');
  out = out.replace(/^\s*[-•]\s*/gm, '');
  return out.replace(/\s+/g, ' ').trim();
}

/** Sesli okunacağı için cümle sonunda kes; TTS karakter ücretini de düşürür. */
function trimToSentence(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  const cut = value.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastStop > maxChars * 0.5) return cut.slice(0, lastStop + 1).trim();
  return `${cut.trim()}...`;
}

const MAX_REPLY_CHARS = Number(process.env.MAX_REPLY_CHARS || 420);

function cleanReply(value: string, userText: string): string {
  const compact = stripArtifacts(value);
  if (!compact || compact.length < 3) return localFallback(userText);
  return trimToSentence(compact, MAX_REPLY_CHARS);
}

/* ------------------------------------------------------------------ */
/* ÇEVRİMDIŞI YEDEK CEVAPLAR                                           */
/* ------------------------------------------------------------------ */

function localFallback(userText: string) {
  const lower = userText.toLocaleLowerCase('tr-TR');

  if (needsCare(userText)) return CARE_REPLY;

  // KİMLİK & MUHABBET
  if (lower.includes('adın')) return 'Ben BALKIZ! Meraklı sorular için buradayım; bugün hangi fikri kurcalıyoruz?';
  if (lower.includes('seni kim yaptı') || lower.includes('kim yaptı')) return "Beni Berke ve İLKYAR'daki abi ablalar yaptı; ekip işi, ışıldayan iş derler.";
  if (lower.includes('kaç yaş')) return 'Benim bir yaşım yok ama enerjim hep yüksek; dijital takvim biraz karışık çalışıyor.';
  if (lower.includes('selam') || lower.includes('merhaba') || lower.includes('hey')) return 'Selam! Ben BALKIZ. Bugün seninle ne keşfedelim?';
  if (lower.includes('nasılsın') || lower.includes('naber')) return 'Harikayım, teşekkür ederim! Yeni fikirler duymak için sabırsızlanıyorum. Sen nasılsın bakalım?';
  if (lower.includes('günaydın')) return 'Günaydın! Güne bilimle başlamak gibisi yok.';
  if (lower.includes('iyi geceler')) return 'İyi geceler! Yarın yeni maceralarda görüşürüz.';
  if (lower.includes('teşekkür') || lower.includes('sağ ol')) return 'Rica ederim! Merak etmeye devam et, en güzel işimiz bu.';

  if (isBlockedTopic(userText)) return pickRedirect(userText);

  // TÜRK BİLİM İNSANLARI
  if (lower.includes('aziz sancar')) return "Aziz Sancar, hücrelerimizin kendi DNA'sını nasıl tamir ettiğini bularak Nobel Ödülü kazanan harika bir Türk bilim insanıdır.";
  if (lower.includes('canan dağdeviren')) return 'Canan Dağdeviren, kalp pilleri ve cilt kanserini erkenden fark eden cihazlar geliştiren dünyaca ünlü bir Türk bilim kadınıdır.';
  if (lower.includes('cahit arf')) return 'Cahit Arf, matematiğe kendi adıyla anılan Arf değişmezini kazandıran, resmi paralarımızda yer alan ünlü Türk matematikçimizdir.';
  if (lower.includes('oktay sinanoğlu')) return "Oktay Sinanoğlu çok genç yaşta profesör olmuş, kimyanın sırlarını çözen müthiş bir Türk bilim insanıdır.";

  // KLASİK BİLİM İNSANLARI
  if (lower.includes('einstein') || lower.includes('aynştayn')) return 'Albert Einstein, evrenin sırlarını çözen dahi bir fizikçidir. Işığın hızını ve uzayın nasıl büküldüğünü anlatan görelilik kuramını buldu.';
  if (lower.includes('newton') || lower.includes('nivton')) return 'Isaac Newton, kafasına düşen elma hikayesiyle meşhurdur. Yerçekimini ve gezegenlerin hareket kurallarını açıkladı.';
  if (lower.includes('tesla')) return 'Nikola Tesla elektriğin sihirbazıdır. Bugün evimizde kullandığımız alternatif akımı ve kablosuz enerjiyi hayal eden bir mucitti.';
  if (lower.includes('edison')) return 'Thomas Edison ampulü geliştirip dünyayı aydınlatan bir mucittir. Binlerce denemesinden sonra bile hiç pes etmedi.';
  if (lower.includes('marie curie') || lower.includes('mari küri')) return 'Marie Curie radyoaktifliği keşfederek iki kez Nobel Ödülü kazandı ve tarihin en önemli bilim kadınlarından biri oldu.';

  // TEMEL BİLİM & DOĞA
  if (lower.includes('deney')) return 'Güvenli bir deney: bir tabak suya karabiber serp, sonra parmağına sabun sürüp suya değdir. Karabiberlerin kaçışını izle, işte yüzey gerilimi.';
  if (lower.includes('uzay')) return 'Uzay karanlık görünür çünkü ışığı yansıtacak hava yoktur. Sence Ay kendi ışığını üretiyor mu, yoksa Güneş\u2019ten mi alıyor?';
  if (lower.includes('robot')) return 'Robotlar sensörlerle çevreyi algılar, yazılımla karar verir, motorlarla hareket eder. Yani göz, beyin ve kas üçlüsü gibi çalışırlar.';
  if (lower.includes('gökyüzü') || lower.includes('mavi')) return 'Gökyüzü mavi çünkü güneş ışığı havadaki minik zerreciklere çarpınca en çok mavi renk her yöne saçılır. Gözümüz de bu saçılan maviyi görür.';

  return 'Şu an kafamdaki dijital kablolarda küçük bir yoğunluk var. Bir kere daha sorar mısın, bu sefer dört elle sarılacağım.';
}

/* ------------------------------------------------------------------ */
/* EKONOMİ: bellek içi yanıt önbelleği                                 */
/* ------------------------------------------------------------------ */

const answerCache = new Map<string, { text: string; at: number }>();
const ANSWER_TTL = 6 * 60 * 60 * 1000;
const ANSWER_CACHE_MAX = 200;

function cacheKey(text: string) {
  return text.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

function readCache(key: string) {
  const hit = answerCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ANSWER_TTL) {
    answerCache.delete(key);
    return null;
  }
  return hit.text;
}

function writeCache(key: string, text: string) {
  if (answerCache.size >= ANSWER_CACHE_MAX) {
    const oldest = answerCache.keys().next().value;
    if (oldest) answerCache.delete(oldest);
  }
  answerCache.set(key, { text, at: Date.now() });
}

/* ------------------------------------------------------------------ */
/* GROQ ÇAĞRISI                                                        */
/* ------------------------------------------------------------------ */

const REQUEST_DEADLINE_MS = 14000;

async function askGroq(apiKey: string, messages: ChatMessage[], startedAt: number) {
  const available = await listGroqModels(apiKey);
  const models = pickModels(available);
  let lastError = '';

  for (const model of models) {
    if (Date.now() - startedAt > REQUEST_DEADLINE_MS) break;

    const payload = {
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      temperature: 0.7,
      top_p: 0.9,
      // Düşünme tokenları da buradan harcandığı için bütçe 350 değil 700.
      max_completion_tokens: 700,
      frequency_penalty: 0.05,
      ...reasoningTuning(model)
    };

    try {
      const response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        9000
      );

      if (!response.ok) {
        lastError = await response.text();
        console.error(`Groq ${model} hata ${response.status}: ${lastError.slice(0, 300)}`);

        const retryable =
          response.status === 404 ||
          response.status === 403 ||
          response.status === 429 ||
          response.status >= 500 ||
          /model_not_found|does not exist|decommission|do not have access/i.test(lastError);

        // Model listesi bayatlamış olabilir; bir sonraki istekte yenile.
        if (response.status === 404) modelCache = null;
        if (!retryable) break;
        continue;
      }

      const data = await response.json();
      const { text, finishReason } = extractText(data);
      const cleaned = stripArtifacts(text);

      // Boş içerik + finish_reason "length" = düşünme bütçeyi yemiş demektir.
      if (!cleaned) {
        lastError = `Boş içerik (finish_reason: ${finishReason || 'bilinmiyor'})`;
        console.error(`Groq ${model}: ${lastError}`);
        continue;
      }

      return cleaned;
    } catch (error) {
      lastError = String(error);
      console.error(`Groq ${model} istisna:`, error);
    }
  }

  console.error('Groq: kullanılabilir model bulunamadı.', lastError.slice(0, 300));
  return null;
}

/* ------------------------------------------------------------------ */
/* HANDLER                                                            */
/* ------------------------------------------------------------------ */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startedAt = Date.now();
  const apiKey = process.env.GROQ_API_KEY;

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const messages = normalizeMessages(body?.messages);
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

    if (!lastUserMessage) {
      return res.status(400).json({ error: 'A user message is required' });
    }

    const userText = lastUserMessage.content;

    // 1) Önce çocuğun iyiliği.
    if (needsCare(userText)) {
      return res.status(200).json({ text: CARE_REPLY });
    }

    // 2) Konu dışı ve yasak başlıklar: modele hiç gitmeden, kibar geçişle.
    if (isBlockedTopic(userText)) {
      return res.status(200).json({ text: pickRedirect(userText) });
    }

    if (!apiKey) {
      return res.status(200).json({ text: localFallback(userText) });
    }

    // 3) Ekonomi: tek turluk ve yeterince uzun sorular önbellekten dönebilir.
    const singleTurn = messages.length === 1;
    const key = cacheKey(userText);
    if (singleTurn && key.length > 12) {
      const cached = readCache(key);
      if (cached) {
        res.setHeader('X-Balkiz-Cache', 'hit');
        return res.status(200).json({ text: cached });
      }
    }

    const raw = await askGroq(apiKey, messages, startedAt);
    const text = raw ? cleanReply(raw, userText) : localFallback(userText);

    if (raw && singleTurn && key.length > 12) writeCache(key, text);

    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(200).json({
      text: 'Küçük bir bağlantı sorunu oldu; hadi bir kere daha deneyelim.'
    });
  }
}