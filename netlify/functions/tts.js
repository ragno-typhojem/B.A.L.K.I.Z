// netlify/functions/tts.js
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const { text, voice = 'v2/tr_speaker_0' } = JSON.parse(event.body);
    const HF_TOKEN = process.env.VITE_HF_TOKEN;

    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing text' }),
      };
    }

    if (!HF_TOKEN) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'HF_TOKEN not configured' }),
      };
    }

    console.log('🔊 Bark TTS Request:', { text, voice });

    // ✅ Suno Bark - Çok dilli TTS (GARANTİ ÇALIŞAN)
    const response = await fetch(
      'https://api-inference.huggingface.co/models/suno/bark',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          parameters: {
            voice_preset: voice, // Türkçe kadın sesi
          },
        }),
      }
    );

    console.log('📊 Bark Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Bark Error:', errorText);
      
      // Eğer model yükleniyor ise bekle
      if (response.status === 503) {
        const errorData = JSON.parse(errorText);
        if (errorData.estimated_time) {
          return {
            statusCode: 503,
            headers,
            body: JSON.stringify({ 
              error: 'Model loading',
              estimated_time: errorData.estimated_time,
              message: `Model yükleniyor, ${errorData.estimated_time} saniye bekleyin`
            }),
          };
        }
      }
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: errorText }),
      };
    }

    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log('✅ Audio generated, size:', audioBuffer.byteLength);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: base64Audio,
        contentType: response.headers.get('content-type') || 'audio/wav',
      }),
    };
  } catch (error) {
    console.error('❌ Function Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
