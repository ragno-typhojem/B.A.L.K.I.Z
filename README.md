# B.A.L.K.I.Z - Bionic AI Assistant

Bilim Araştırmacısı Logik Kadın İnovatif Zeka.
Çocukların kolay kullanabilmesi için hazırlanmış Türkçe sesli yapay zeka asistanı.

## Neler Güncellendi?

- Daha sade, çocuk dostu ve futuristik ana ekran.
- Tek ana aksiyon: konuşma butonu, hızlı soru butonları ve yazı ile sorma alanı.
- Web Speech API ile canlı Türkçe algılama; desteklenmeyen tarayıcıda Groq Whisper kayıt yedeği.
- Groq ve ElevenLabs anahtarları artık tarayıcı kodunda değil, Vercel API fonksiyonlarında.
- ElevenLabs yoksa otomatik olarak tarayıcının Türkçe seslendirmesine düşer.
- Mobil ve masaüstü için taşmayı azaltan responsive düzen.
- Logo alanları: `VITE_BALKIZ_LOGO_URL` ve `VITE_PARTNER_LOGO_URL`.

## Kurulum

```bash
npm install
npm run dev
```

Sadece arayüzü görmek için `npm run dev` yeterlidir. Sesli AI akışını yerelde API fonksiyonlarıyla birlikte denemek için Vercel CLI ile şunu kullan:

```bash
npm run dev:vercel
```

## Vercel Ortam Değişkenleri

Vercel Project Settings > Environment Variables bölümüne ekle:

```bash
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
GROQ_TRANSCRIBE_MODEL=whisper-large-v3-turbo
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
VITE_BALKIZ_LOGO_URL=
VITE_PARTNER_LOGO_URL=
```

`GROQ_MODEL` boş bırakılırsa ucuz ve hızlı `openai/gpt-oss-20b` kullanılır. `GROQ_TRANSCRIBE_MODEL` boş bırakılırsa `whisper-large-v3-turbo` kullanılır. `ELEVENLABS_API_KEY` boş bırakılırsa uygulama yine çalışır; seslendirme tarayıcı üzerinden yapılır.

## Komutlar

```bash
npm run dev
npm run dev:vercel
npm run build
npm run typecheck
npm run preview
```

## Deploy

Vercel için ek ayar gerekmiyor. Bu repo Vite frontend ve `api/*.ts` serverless fonksiyonlarıyla hazırdır.
Vercel Build Command `npm run build` olmalı; bu komut production bundle üretir. Tip kontrolü ayrı olarak `npm run typecheck` ile yapılır.

## Not

Mikrofon özelliği için site HTTPS üzerinde çalışmalıdır. Vercel deploy sonrası bu otomatik sağlanır.
