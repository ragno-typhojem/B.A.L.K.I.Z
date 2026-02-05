const { MsEdgeTTS, OUTPUT_FORMAT } = require("msedge-tts");
const fs = require("fs");
const path = require("path");
const os = require("os");

exports.handler = async (event) => {
  // CORS ayarları
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let filePath = null;

  try {
    const { text } = JSON.parse(event.body);
    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Metin yok' }) };

    console.log('🔊 TTS İsteği (Dosya Yöntemi):', text);

    // 1. Geçici dosya yolu oluştur (Netlify/AWS Lambda'da /tmp yazılabilir tek yerdir)
    const tempDir = os.tmpdir();
    const fileName = `audio-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`;
    filePath = path.join(tempDir, fileName);

    // 2. TTS Hazırla
    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // 3. Sesi direkt dosyaya yaz (Stream hatalarını bypass eder)
    await tts.toFile(filePath, text);

    // 4. Dosyayı oku
    const audioBuffer = fs.readFileSync(filePath);
    
    // 5. Base64'e çevir
    const base64Audio = audioBuffer.toString('base64');

    console.log('✅ Ses dosyadan okundu, boyut:', audioBuffer.length);

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
  } finally {
    // 6. Temizlik: Geçici dosyayı sil (Çöp birikmesin)
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log('🧹 Geçici dosya temizlendi.');
      } catch (e) {
        console.error('⚠️ Dosya silinemedi:', e);
      }
    }
  }
};