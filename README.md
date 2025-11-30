# 🎬 B.A.L.K.I.Z - Bionic AI Assistant
Bilim Araştırmacısı Logik Kadın İnovatif Zekâ
Türkçe ses tanıma ve yapay zeka destekli, futuristik arayüzlü bir AI asistanı.

## ✨ Özellikler

- 🎨 **Futuristik Arayüz** - Animasyonlu orbital halkalar, waveform görselleştirme
- 🎤 **Gerçek Zamanlı Türkçe Ses Tanıma** - Web Speech API
- 🤖 **Groq API Entegrasyonu** - Llama 3.1 70B modeli
- 🔊 **ElevenLabs TTS**
- 📊 **Sistem Panelleri** - Durum göstergeleri ve aktivite günlüğü

## 🚀 Hızlı Başlangıç

```bash
# Kurulum
npm install

# Geliştirme
npm run dev

# Production build
npm run build
```

## 🔧 Yapılandırma

Kullandığınız github env ortamında, (bizimki netlify) API anahtarlarınızı güncelleyin:

```typescript
const GROQ_API_KEY = 'your_groq_api_key_here';
const ELEVENLABS_API_KEY = 'your_elevenlabs_api_key_here';
```

## 📦 Teknoloji Stack'i

- React 18 + TypeScript
- Vite
- Web Speech API
- Groq API (LLM)
- ElevenLabs API (TTS)
- Lucide React (İkonlar)

## 📱 Kullanım

1. Sayfayı aç → Boot animasyonu başlar
2. Merkez butona tıkla → Dinlemeye başla
3. Türkçe konuş → AI yanıt verir
4. Sağ üstten ses seç → Farklı sesler

## 📄 Lisans

MIT Lisansı

---

**⭐ Katkı Sağla -- Geliştiriciye geri dönüş ver.**