import { Wind, Droplets, MapPin, Sun, Clock, Cloud, CloudRain, CloudSnow, LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { Region } from "@/data/regions";

interface WeatherHeroProps {
  region: Region;
  lang: 'ar' | 'uz';
}

function getHourlyIcon(condition: string): LucideIcon {
  const lowerCondition = condition?.toLowerCase() || '';
  if (lowerCondition.includes('qor') || lowerCondition.includes('snow') || lowerCondition.includes('ثلج')) return CloudSnow;
  if (lowerCondition.includes('yomg\'ir') || lowerCondition.includes('rain') || lowerCondition.includes('مطر')) return CloudRain;
  if (lowerCondition.includes('ochiq') || lowerCondition.includes('clear') || lowerCondition.includes('صافي')) return Sun;
  return Cloud;
}

const translations = {
  ar: {
    wind: "الرِيَاح",
    humidity: "الرُّطُوبَة",
    pressure: "الضَّغْط",
    speed: "كم/س",
    motivational: "سَيَكُونُ يَوْماً رَائِعاً!",
    hourly: "التَّوَقُّعَات بِالسَّاعَات"
  },
  uz: {
    wind: "Shamol",
    humidity: "Namlik",
    pressure: "Bosim",
    speed: "km/s",
    motivational: "Bugun ajoyib kun bo'ladi!",
    hourly: "Soatlik ma'lumot"
  }
};

export default function WeatherHero({ region, lang }: WeatherHeroProps) {
  const t = translations[lang];
  const isRtl = lang === 'ar';

  return (
    <div className="relative w-full flex flex-col items-center justify-center py-6">
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        key={region.id} // Animate when region changes
        className="z-10 flex flex-col items-center w-full"
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">
            {lang === 'ar' ? region.name_ar : region.name_uz}
          </span>
        </div>

        <div className="relative">
          <h1 className="text-8xl font-display font-bold text-foreground tracking-tighter drop-shadow-sm">
            {region.temp}°
          </h1>
          <div className="absolute -right-8 -top-4 text-primary animate-pulse">
            <Sun className="w-12 h-12" />
          </div>
        </div>

        <p className="text-xl font-medium text-muted-foreground mb-2" dir={isRtl ? "rtl" : "ltr"}>
          {lang === 'ar' ? region.condition_ar : region.condition_uz}
        </p>
        
        <p className="text-sm text-primary/80 font-medium mt-2" dir={isRtl ? "rtl" : "ltr"}>
          {t.motivational}
        </p>

        <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-xs" dir={isRtl ? "rtl" : "ltr"}>
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Wind className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t.wind}</span>
              <span className="font-bold text-sm">{region.wind} {t.speed}</span>
            </div>
          </div>
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
              <Droplets className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">{t.humidity}</span>
              <span className="font-bold text-sm">{region.humidity}%</span>
            </div>
          </div>
        </div>

        {/* Hourly Forecast Section */}
        <div className="w-full mt-8 px-2">
          <div className="flex items-center gap-2 mb-3 px-1 opacity-70" dir={isRtl ? "rtl" : "ltr"}>
            <Clock className="w-3 h-3" />
            <span className="text-xs font-bold uppercase tracking-wider">{t.hourly}</span>
          </div>
          <div className="flex overflow-x-auto gap-3 pb-4 no-scrollbar mask-gradient-sides">
            {region.hourly.slice(0, 12).map((hour, idx) => {
              const condition = lang === 'ar' ? region.condition_ar : region.condition_uz;
              const HourIcon = hour.icon || getHourlyIcon(condition);
              return (
                <div key={idx} className="flex-shrink-0 flex flex-col items-center gap-2 bg-white/20 backdrop-blur-md p-3 rounded-xl min-w-[60px] border border-white/30">
                  <span className="text-xs font-medium text-muted-foreground">{hour.time}</span>
                  <HourIcon className="w-5 h-5 text-primary" />
                  <span className="text-sm font-bold">{hour.temp}°</span>
                </div>
              );
            })}
          </div>
        </div>

      </motion.div>
    </div>
  );
}
