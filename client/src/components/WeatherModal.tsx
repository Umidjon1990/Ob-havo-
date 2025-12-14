import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Cloud, Sun, Wind, Droplets, Thermometer, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import { Region } from "@/data/regions";

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  region: Region;
  lang: 'ar' | 'uz';
}

const translations = {
  ar: {
    wind: "الرِيَاح",
    humidity: "الرُّطُوبَة",
    pressure: "الضَّغْط",
    speed: "كم/س",
    day: "الْيَوْم",
    weekday: "الثُّلَاثَاء",
    quote: "طَقْس رَائِع لِلْمَشْي الْيَوْم!"
  },
  uz: {
    wind: "Shamol",
    humidity: "Namlik",
    pressure: "Bosim",
    speed: "km/s",
    day: "Hafta kuni",
    weekday: "Seshanba",
    quote: "Bugun sayr qilish uchun ajoyib ob-havo!"
  }
};

export default function WeatherModal({ isOpen, onClose, region, lang }: WeatherModalProps) {
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
            className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl flex flex-col items-center gap-2"
          >
            <Thermometer className="w-6 h-6 text-orange-500" />
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

        <div className="mt-4 p-4 bg-muted/50 rounded-2xl text-center">
            <p className="text-sm text-muted-foreground italic" dir={isRtl ? "rtl" : "ltr"}>
                "{t.quote}"
            </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
