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

  const TEMP_DIR = os.tmpdir();
  const TARGET_FILE = path.join(TEMP_DIR, "audio.mp3"); 

  try {
    const { text } = JSON.parse(event.body);
    if (!text) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Metin yok' }) };

    console.log('🔊 TTS İsteği (Modifiyeli Emel):', text);

    if (fs.existsSync(TARGET_FILE)) fs.unlinkSync(TARGET_FILE);

    const tts = new MsEdgeTTS();
    await tts.setMetadata("tr-TR-EmelNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    // ⚙️ AYARLAR: Emel'i "Balkız"a çeviren kısım
    // RATE: %25 hızlandırdık (Daha akıcı, takılmayan konuşma)
    // PITCH: +5Hz incelttik (Daha genç ve enerjik duyulması için)
    const ssml = `
      <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>
        <voice name='tr-TR-EmelNeural'>
          <prosody rate='+25%' pitch='+5Hz'>${text}</prosody>
        </voice>
      </speak>
    `;

    // Normal .toStream yerine .toFile veya raw SSML gönderimi gerekir ama
    // MsEdgeTTS kütüphanesi SSML'i doğrudan desteklemez, o yüzden raw request atarız
    // VEYA kütüphanenin sunduğu metadata ile yetinip hız ayarını dolaylı yaparız.
    
    // KÜTÜPHANE HİLESİ: MsEdgeTTS kütüphanesi SSML desteğini tam vermiyor.
    // O yüzden manuel XML oluşturup göndermek yerine kütüphaneyi bypass ediyoruz.
    // Aşağıdaki kod "Raw SSML" göndererek tam kontrol sağlar.
    
    // --- KÜTÜPHANE KULLANIMINI İPTAL EDİP SAF SSML İLE İSTEK ATIYORUZ ---
    const WebSocket = require('ws');
    const { v4: uuidv4 } = require('uuid');
    
    const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4-EB77-479E-B05A-959023B974E9";
    
    const audioData = await new Promise((resolve, reject) => {
      const ws = new WebSocket(WSS_URL, {
        headers: {
          "Pragma": "no-cache",
          "Cache-Control": "no-cache",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.77 Safari/537.36 Edg/91.0.864.41",
          "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
        }
      });
      
      const chunks = [];
      ws.on('open', () => {
        const requestId = uuidv4().replace(/-/g, '');
        ws.send(`X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`);
        ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${ssml}`);
      });
      
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const separator = Buffer.from("\r\n\r\n");
          const index = data.indexOf(separator);
          if (index > -1) chunks.push(data.slice(index + 4));
        } else {
          if (data.toString().includes("turn.end")) ws.close();
        }
      });
      
      ws.on('close', () => resolve(Buffer.concat(chunks)));
      ws.on('error', (err) => reject(err));
    });

    const base64Audio = audioData.toString('base64');
    console.log('✅ Ses (SSML) oluşturuldu. Boyut:', audioData.length);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        audio: base64Audio,
        contentType: 'audio/mpeg',
      }),
    };

  } catch (error) {
    console.error('❌ HATA:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};