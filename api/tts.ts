import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Matematik sembollerini Türkçe kelimelere çeviren ve markdown kalıntılarını silen filtre
function sanitizeForTTS(text: string): string {
  let cleanText = text.replace(/[*_~`#]/g, '');
  
  // ElevenLabs yutmasın diye Matematiksel Operatörleri Türkçeleştirme
  cleanText = cleanText.replace(/\+/g, ' artı ');
  cleanText = cleanText.replace(/=/g, ' eşittir ');
  cleanText = cleanText.replace(/%/g, ' yüzde ');
  
  // Eksi ve Bölü işaretini sadece sayılar arasında ise çevir (tirelerle karışmasını engeller)
  cleanText = cleanText.replace(/(\d+)\s*-\s*(\d+)/g, '$1 eksi $2');
  cleanText = cleanText.replace(/(\d+)\s*\/\s*(\d+)/g, '$1 bölü $2');
  
  // 2x2 veya 2 X 2 şeklindeki çarpım işlemlerini "çarpı" kelimesine dönüştür
  cleanText = cleanText.replace(/(\d+)\s*[xX]\s*(\d+)/g, '$1 çarpı $2');

  return cleanText.replace(/\s+/g, ' ').trim().slice(0, 520);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(204).end();
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const rawText = String(body?.text ?? '');
    const text = sanitizeForTTS(rawText);

    const voiceId = String(process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
    // eleven_flash_v2_5 en ucuz ve çocuk sesleri için en hızlı modeldir.
    const modelId = String(process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5');

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          // Çocuklara daha uygun, enerjik ve berrak bir okuma stili ayarları
          stability: 0.45, 
          similarity_boost: 0.75,
          style: 0.1, 
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({ error: 'TTS failed', detail });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    
    // EKONOMİ KİLİDİ: Vercel önbelleklemesi ile aynı soruda API ücretini sıfırlar.
    res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
    
    return res.status(200).send(audio);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'TTS failed' });
  }
}