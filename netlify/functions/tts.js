// netlify/functions/tts.js
// Node.js 18+ native fetch kullanıyor, node-fetch gereksiz

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  // Preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // Only POST allowed
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse request
    const { text, model } = JSON.parse(event.body);
    const HF_TOKEN = process.env.VITE_HF_TOKEN;

    if (!text || !model) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing text or model' }),
      };
    }

    if (!HF_TOKEN) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'HF_TOKEN not configured' }),
      };
    }

    console.log('🔊 TTS Request:', { text, model });

    // ✅ YENİ URL: router.huggingface.co
    const response = await fetch(
      `https://router.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${HF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs: text,
          options: {
            wait_for_model: true,
          },
        }),
      }
    );

    console.log('📊 HF Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HF Error:', errorText);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: errorText }),
      };
    }

    // Get audio buffer
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
