import { Buffer } from 'node:buffer';
import type { VercelRequest, VercelResponse } from '@vercel/node';

function extensionFromMime(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  return 'webm';
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
      return res.status(400).json({ error: 'Audio data is missing' });
    }

    const bytes = Buffer.from(rawBase64, 'base64');
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const form = new FormData();
    form.append('file', new Blob([arrayBuffer], { type: mimeType }), `speech.${extensionFromMime(mimeType)}`);
    form.append('model', 'whisper-large-v3');
    form.append('language', 'tr');
    form.append('response_format', 'json');
    form.append('temperature', '0');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    });

    if (!response.ok) {
      const detail = await response.text();
      return res.status(response.status).json({ error: 'Transcription failed', detail });
    }

    const data = await response.json();
    const text = String(data?.text ?? '').trim();
    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Transcription failed' });
  }
}
