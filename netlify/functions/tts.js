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
    const { text } = JSON.parse(event.body);

    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing text' }),
      };
    }

    console.log('🔊 XTTS-v2 Request:', { text });

    // ✅ Coqui XTTS-v2 - Hugging Face Space API
    const response = await fetch(
      'https://hcsolakoglu-orkhon-tts.hf.space/api/predict',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [
            text, // Metin
            'tr', // Dil: Türkçe
            null, // Referans ses (null = default kadın sesi)
          ],
        }),
      }
    );

    console.log('📊 XTTS Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ XTTS Error:', errorText);
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: errorText }),
      };
    }

    const result = await response.json();
    
    // Hugging Face Space API response format
    const audioUrl = result.data[0]; // Audio file URL
    
    console.log('✅ Audio URL:', audioUrl);

    // Audio dosyasını indir
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log('✅ Audio downloaded, size:', audioBuffer.byteLength);

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio: base64Audio,
        contentType: 'audio/wav',
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
