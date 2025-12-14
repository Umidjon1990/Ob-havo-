import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Cloud, Sun, Wind, Droplets, Thermometer, Calendar, CloudRain, CloudSnow, CloudSun } from "lucide-react";
import { motion } from "framer-motion";
import { Region } from "@/data/regions";
import { useState, useEffect } from "react";
import { fetchWeatherAdvice } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  region: Region;
  lang: 'ar' | 'uz';
}

interface DailyForecast {
  date: string;
  max: number;
  min: number;
  code: number;
}

function getWeatherIconForCode(code: number) {
  if (code === 0) return Sun;
  if (code >= 1 && code <= 3) return CloudSun;
  if (code >= 45 && code <= 48) return Cloud;
  if (code >= 51 && code <= 67) return CloudRain;
  if (code >= 71 && code <= 77) return CloudSnow;
  if (code >= 80 && code <= 82) return CloudRain;
  if (code >= 85 && code <= 86) return CloudSnow;
  return Cloud;
}

function formatDate(dateStr: string, lang: 'ar' | 'uz'): string {
  const date = new Date(dateStr);
  const days = lang === 'ar' 
    ? ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
    : ['Yak', 'Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan'];
  return days[date.getDay()];
}

const translations = {
  ar: {
    wind: "الرِيَاح",
    humidity: "الرُّطُوبَة",
    pressure: "الضَّغْط",
    speed: "كم/س",
    day: "الْيَوْم",
    weekday: "الثُّلَاثَاء",
    quote: "طَقْس رَائِع لِلْمَشْي الْيَوْم!",
    forecast: "٣ كُون",
    max: "أعلى",
    min: "أدنى"
  },
  uz: {
    wind: "Shamol",
    humidity: "Namlik",
    pressure: "Bosim",
    speed: "km/s",
    day: "Hafta kuni",
    weekday: "Seshanba",
    quote: "Bugun sayr qilish uchun ajoyib ob-havo!",
    forecast: "3 kunlik",
    max: "Max",
    min: "Min"
  }
};

export default function WeatherModal({ isOpen, onClose, region, lang }: WeatherModalProps) {
  const [aiAdvice, setAiAdvice] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: weatherData } = useQuery({
    queryKey: ['weather', region?.id],
    queryFn: async () => {
      const res = await fetch(`/api/weather/${region?.id}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isOpen && !!region?.id,
  });

  const dailyForecast: DailyForecast[] = (() => {
    try {
      const parsed = JSON.parse(weatherData?.forecastData || '{}');
      return (parsed.daily || []).slice(0, 3);
    } catch {
      return [];
    }
  })();

  useEffect(() => {
    if (isOpen && region) {
      setLoading(true);
      fetchWeatherAdvice(
        lang === 'ar' ? region.name_ar : region.name_uz,
        region.temp,
        lang === 'ar' ? region.condition_ar : region.condition_uz,
        lang
      ).then(advice => {
        setAiAdvice(advice);
        setLoading(false);
      });
    }
  }, [isOpen, region, lang]);

  if (!region) return null;

  const t = translations[lang];
  const isRtl = lang === 'ar';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xs sm:max-w-md rounded-3xl bg-white/90 dark:bg-black/90 backdrop-blur-xl border-white/20">
        <DialogHeader className="text-center">
          <DialogTitle className="text-2xl font-display font-bold flex flex-col items-center gap-2">
            <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm uppercase tracking-widest">
              {lang === 'ar' ? region.name_ar : region.name_uz}
            </span>
            <span>{region.temp}°</span>
          </DialogTitle>
          <DialogDescription className="text-center text-lg font-medium text-muted-foreground" dir={isRtl ? "rtl" : "ltr"}>
            {lang === 'ar' ? region.condition_ar : region.condition_uz}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-4" dir={isRtl ? "rtl" : "ltr"}>
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Wind className="w-6 h-6 text-blue-500" />
            <span className="text-xs text-muted-foreground">{t.wind}</span>
            <span className="font-bold">12 {t.speed}</span>
          </motion.div>
          
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-cyan-50 dark:bg-cyan-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Droplets className="w-6 h-6 text-cyan-500" />
            <span className="text-xs text-muted-foreground">{t.humidity}</span>
            <span className="font-bold">45%</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Thermometer className="w-6 h-6 text-emerald-700" />
            <span className="text-xs text-muted-foreground">{t.pressure}</span>
            <span className="font-bold">{region.pressure} mm</span>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Calendar className="w-6 h-6 text-purple-500" />
            <span className="text-xs text-muted-foreground">{t.day}</span>
            <span className="font-bold">{t.weekday}</span>
          </motion.div>
        </div>

        {dailyForecast.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-bold text-center text-muted-foreground mb-3 uppercase tracking-wider">{t.forecast}</h4>
            <div className="grid grid-cols-3 gap-2">
              {dailyForecast.map((day, idx) => {
                const DayIcon = getWeatherIconForCode(day.code);
                return (
                  <motion.div
                    key={day.date}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * idx }}
                    className="bg-gradient-to-b from-primary/10 to-primary/5 p-3 rounded-xl flex flex-col items-center gap-1"
                  >
                    <span className="text-xs font-medium text-muted-foreground">{formatDate(day.date, lang)}</span>
                    <DayIcon className="w-5 h-5 text-primary" />
                    <div className="flex gap-1 text-xs">
                      <span className="font-bold text-foreground">{day.max}°</span>
                      <span className="text-muted-foreground">{day.min}°</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 p-4 bg-muted/50 rounded-2xl text-center">
            <p className="text-sm text-muted-foreground italic" dir={isRtl ? "rtl" : "ltr"}>
                {loading ? "..." : `"${aiAdvice || t.quote}"`}
            </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
