const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { text } = JSON.parse(event.body);

    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Metin yok' }) };

    console.log('🔊 TTS İsteği (Stream RAM):', text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // ⚠️ KRİTİK DÜZELTME: Buraya 'await' ekledik. Önceki hatanın tek sebebi buydu.
    const readableStream = await tts.toStream(text);

    // Stream verisini RAM'de topla (Diske yazmadan)
    const audioBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on("data", (chunk) => chunks.push(chunk));
      readableStream.on("end", () => resolve(Buffer.concat(chunks)));
      readableStream.on("error", (err) => reject(err));
    });

    // Base64'e çevir
    const base64Audio = audioBuffer.toString('base64');

    console.log('✅ Ses RAM üzerinden hazırlandı. Boyut:', audioBuffer.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audio: base64Audio,
        contentType: 'audio/mpeg',
      }),
    };

  } catch (error) {
    console.error('❌ TTS Hatası:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};