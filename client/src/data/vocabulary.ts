import { Cloud, Sun, CloudRain, CloudLightning, CloudSnow, Wind, Droplets, Thermometer, Calendar } from "lucide-react";

export interface VocabularyItem {
  id: string;
  ar: string;
  uz: string;
  category: 'condition' | 'metric' | 'general' | 'time';
  icon?: any;
}

export const vocabulary: VocabularyItem[] = [
  // Conditions
  { id: 'sunny', ar: 'مُشْمِس', uz: 'Quyoshli', category: 'condition', icon: Sun },
  { id: 'clear', ar: 'صَافِي', uz: 'Ochiq', category: 'condition', icon: Sun },
  { id: 'cloudy', ar: 'غَائِم', uz: 'Bulutli', category: 'condition', icon: Cloud },
  { id: 'partly_cloudy', ar: 'غَائِم جُزْئِيّاً', uz: 'Biroz bulutli', category: 'condition', icon: Cloud },
  { id: 'hot', ar: 'حَارّ', uz: 'Issiq', category: 'condition', icon: Sun },
  { id: 'very_hot', ar: 'حَارّ جِدّاً', uz: 'Juda issiq', category: 'condition', icon: Sun },
  { id: 'rain', ar: 'مُمْطِر', uz: 'Yomg\'ir', category: 'condition', icon: CloudRain },
  { id: 'heavy_rain', ar: 'مُمْطِر بَغْزَارَة', uz: 'Kuchli yomg\'ir', category: 'condition', icon: CloudRain },
  
  // Metrics
  { id: 'wind', ar: 'الرِيَاح', uz: 'Shamol', category: 'metric', icon: Wind },
  { id: 'humidity', ar: 'الرُّطُوبَة', uz: 'Namlik', category: 'metric', icon: Droplets },
  { id: 'pressure', ar: 'الضَّغْط', uz: 'Bosim', category: 'metric', icon: Thermometer },
  { id: 'temp', ar: 'دَرَجَة الْحَرَارَة', uz: 'Harorat', category: 'metric', icon: Thermometer },
  
  // General
  { id: 'weather', ar: 'الطَّقْس', uz: 'Ob-havo', category: 'general' },
  { id: 'regions', ar: 'الْمَنَاطِق', uz: 'Hududlar', category: 'general' },
  { id: 'city', ar: 'مَدِينَة', uz: 'Shahar', category: 'general' },
  { id: 'wisdom', ar: 'حِكْمَة', uz: 'Hikmat', category: 'general' },
  
  // Time
  { id: 'today', ar: 'الْيَوْم', uz: 'Bugun', category: 'time', icon: Calendar },
  { id: 'week', ar: 'أُسْبُوع', uz: 'Hafta', category: 'time' },
  { id: 'hour', ar: 'سَاعَة', uz: 'Soat', category: 'time' },
];