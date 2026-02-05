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

  // Netlify'ın geçici klasörü
  const TEMP_DIR = os.tmpdir();
  // Kütüphane varsayılan olarak bu isimle dosya oluşturur
  const TARGET_FILE = path.join(TEMP_DIR, "audio.mp3"); 

  try {
    const { text } = JSON.parse(event.body);
    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Metin yok' }) };

    console.log('🔊 TTS İsteği (Klasör Yöntemi):', text);

    // Varsa eski dosyayı temizle (Çakışma olmasın)
    if (fs.existsSync(TARGET_FILE)) {
      fs.unlinkSync(TARGET_FILE);
    }

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // ⚠️ İŞTE ÇÖZÜM: Dosya adı DEĞİL, Klasör yolu veriyoruz!
    // Kütüphane buraya "audio.mp3" adında bir dosya bırakacak.
    await tts.toFile(TEMP_DIR, text);

    // Dosyanın oluşmasını bekle (Bazen milisaniyelik gecikme olabilir)
    if (!fs.existsSync(TARGET_FILE)) {
      throw new Error("Ses dosyası oluşturulamadı (Dosya bulunamadı).");
    }

    // Dosyayı oku
    const audioBuffer = fs.readFileSync(TARGET_FILE);
    const base64Audio = audioBuffer.toString('base64');

    console.log('✅ Ses dosyadan okundu. Boyut:', audioBuffer.length);

    // Temizlik: İşimiz bitince dosyayı silelim
    fs.unlinkSync(TARGET_FILE);

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
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};