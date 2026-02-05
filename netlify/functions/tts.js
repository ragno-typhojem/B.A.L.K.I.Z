const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");
const path = require("path");
const os = require("os");

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  const tempFile = path.join(os.tmpdir(), `voice-${Date.now()}.mp3`);

  try {
    const { text } = JSON.parse(event.body);
    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Metin yok' }) };

    console.log('🔊 Emel TTS İsteği:', text);

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // ✅ 1. Stream'i Garantili Alma Yöntemi
    let stream;
    try {
      // Önce await ile dene
      stream = await tts.toStream(text);
    } catch (e) {
      // Hata verirse düz çağırmayı dene (Versiyon farkı için)
      stream = tts.toStream(text);
    }

    // ✅ 2. Dosyayı Biz Oluşturuyoruz (Kütüphaneye güvenmiyoruz)
    const writeStream = fs.createWriteStream(tempFile);

    // Stream'i dosyaya borula (Pipe)
    await new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      
      stream.on('error', (err) => reject(err));
      writeStream.on('finish', () => resolve());
      writeStream.on('error', (err) => reject(err));
    });

    // ✅ 3. Dosyayı Oku
    const audioBuffer = fs.readFileSync(tempFile);
    const base64Audio = audioBuffer.toString('base64');

    console.log('✅ Ses başarıyla oluşturuldu. Boyut:', audioBuffer.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audio: base64Audio,
        contentType: 'audio/mpeg',
      }),
    };

  } catch (error) {
    console.error('❌ KRİTİK HATA:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message, stack: error.stack }) };
  } finally {
    // Temizlik: Dosyayı sil
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch(e) { /* Silinemezse dert etme */ }
    }
  }
};