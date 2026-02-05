// netlify/functions/tts.js
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

    // Microsoft Edge TTS Başlat
    const tts = new MsEdgeTTS();
    
    // ✅ SES AYARI: "tr-TR-EmelNeural" (En gerçekçi Türkçe Kadın Sesi)
    // Alternatif: "tr-TR-NestleNeural" (Daha reklam/tanıtım tonunda)
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // Stream'i Buffer'a çeviren yardımcı fonksiyon
    const streamToBuffer = async (stream) => {
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    };

    // Sesi oluştur
    const readableStream = tts.toStream(text);
    const audioBuffer = await streamToBuffer(readableStream);
    
    // Base64'e çevir
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