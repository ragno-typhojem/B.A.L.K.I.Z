import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';

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
    const text = String(body?.text ?? '').trim().slice(0, 520);
    const voiceId = String(process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL');
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
          stability: 0.86,
          similarity_boost: 0.78,
          style: 0,
          speed: 1.03,
          use_speaker_boost: false
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({ error: 'TTS failed', detail });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(audio);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'TTS failed' });
  }
}
