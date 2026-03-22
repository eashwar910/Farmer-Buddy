const translations = {
  en: {
    welcome: "Welcome to SmartAgro",
    subtitle: "Your all-in-one farming companion",
    bodycam: "Bodycam",
    bodycamDesc: "Employee monitoring and live streaming",
    leafDisease: "Leaf Disease Detection",
    leafDiseaseDesc: "Upload a leaf image to detect diseases using AI",
    sensorAnalysis: "Farm Sensor Analysis",
    sensorAnalysisDesc: "Track and analyze IoT sensor data",
    agronomistChat: "Agronomist Chat",
    agronomistChatDesc: "Ask agricultural questions to the AI expert",
    settings: "Settings",
    language: "Language",
    theme: "Theme",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    english: "English",
    malay: "Bahasa Malaysia",
    location: "Location",
    weather: "Weather",
    goodMorning: "Good Morning",
    goodAfternoon: "Good Afternoon",
    goodEvening: "Good Evening",
  },
  ms: {
    welcome: "Selamat Datang ke SmartAgro",
    subtitle: "Pembantu pertanian lengkap anda",
    bodycam: "Bodycam",
    bodycamDesc: "Pemantauan pekerja dan penstriman langsung",
    leafDisease: "Pengesanan Penyakit Daun",
    leafDiseaseDesc: "Muat naik gambar daun untuk mengesan penyakit menggunakan AI",
    sensorAnalysis: "Analisis Sensor Ladang",
    sensorAnalysisDesc: "Jejak dan analisis data sensor IoT",
    agronomistChat: "Sembang Agronomi",
    agronomistChatDesc: "Tanya soalan pertanian kepada pakar AI",
    settings: "Tetapan",
    language: "Bahasa",
    theme: "Tema",
    darkMode: "Mod Gelap",
    lightMode: "Mod Cerah",
    english: "English",
    malay: "Bahasa Malaysia",
    location: "Lokasi",
    weather: "Cuaca",
    goodMorning: "Selamat Pagi",
    goodAfternoon: "Selamat Tengah Hari",
    goodEvening: "Selamat Petang",
  }
};

export type LanguageType = 'en' | 'ms';

export const t = (key: keyof typeof translations['en'], language: LanguageType): string => {
  return translations[language][key] || translations['en'][key] || key;
};
