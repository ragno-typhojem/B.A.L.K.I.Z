const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

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

    console.log('🔊 Emel TTS İsteği (Direct WebSocket):', text);

    // Microsoft Edge TTS Sunucusu
    const WSS_URL = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4-EB77-479E-B05A-959023B974E9";
    
    // Ses Ayarları (Emel - Türkçe)
    const VOICE = "tr-TR-EmelNeural";
    const RATE = "+0%"; // Hız ayarı (+10% vs yapılabilir)
    const PITCH = "+0Hz";

    // SSML (Konuşma Formatı)
    const ssml = `
      <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='tr-TR'>
        <voice name='${VOICE}'>
          <prosody rate='${RATE}' pitch='${PITCH}'>${text}</prosody>
        </voice>
      </speak>
    `;

    // WebSocket Bağlantısını Başlat ve Sesi Al
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
        
        // 1. Konfigürasyon Gönder
        ws.send(`X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-96kbitrate-mono-mp3"}}}}`);
        
        // 2. Metni (SSML) Gönder
        ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toString()}\r\nPath:ssml\r\n\r\n${ssml}`);
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          // Gelen veri ses verisiyse (header'ı atla, ses verisini al)
          // Binary verinin başında "Path:audio" text header'ı vardır, onu bulup ayıklamalıyız.
          const separator = Buffer.from("\r\n\r\n");
          const index = data.indexOf(separator);
          if (index > -1) {
            chunks.push(data.slice(index + 4));
          }
        } else {
          // Metin mesajı bittiğinde (turn.end) bağlantıyı kapatabiliriz
          const msg = data.toString();
          if (msg.includes("turn.end")) {
            ws.close();
          }
        }
      });

      ws.on('close', () => resolve(Buffer.concat(chunks)));
      ws.on('error', (err) => reject(err));
    });

    const base64Audio = audioData.toString('base64');
    console.log('✅ Ses alındı (WebSocket). Boyut:', audioData.length);

    if (audioData.length < 100) {
      throw new Error("Ses verisi boş veya çok kısa.");
    }

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