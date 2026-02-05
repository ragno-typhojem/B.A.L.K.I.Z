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

    console.log('🔊 Emel TTS İsteği (Library):', text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // 🛡️ GARANTİ ÇÖZÜM: Stream'i hem await'li hem await'siz yakalıyoruz.
    // Bazı sürümlerde Promise dönüyor, bazılarında direkt Stream.
    let readableStream;
    const rawStream = tts.toStream(text);
    
    if (rawStream instanceof Promise) {
      readableStream = await rawStream;
    } else {
      readableStream = rawStream;
    }

    // Stream'i RAM'de birleştir (Dosya sistemi yok, hata riski yok)
    const audioBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      
      // Stream olaylarını dinle
      readableStream.on("data", (chunk) => chunks.push(chunk));
      
      readableStream.on("end", () => {
        if (chunks.length === 0) return reject(new Error("Ses verisi boş döndü."));
        resolve(Buffer.concat(chunks));
      });
      
      readableStream.on("error", (err) => reject(err));
    });

    const base64Audio = audioBuffer.toString('base64');
    console.log('✅ Ses oluşturuldu. Boyut:', audioBuffer.length);

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