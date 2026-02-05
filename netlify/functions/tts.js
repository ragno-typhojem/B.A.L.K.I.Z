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

    console.log('🔊 Neural TTS İsteği (Emel):', text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const readableStream = tts.toStream(text);

    // ✅ DÜZELTME BURADA: Stream'i 'for await' yerine 'on(data)' ile okuyoruz.
    // Bu yöntem Node.js'de asla hata vermez.
    const audioBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on("data", (chunk) => chunks.push(chunk));
      readableStream.on("end", () => resolve(Buffer.concat(chunks)));
      readableStream.on("error", (err) => reject(err));
    });

    const base64Audio = audioBuffer.toString('base64');

    console.log('✅ Emel sesi hazırlandı! Boyut:', audioBuffer.length);

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