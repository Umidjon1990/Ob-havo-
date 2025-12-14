import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings, Cloud, Sun, CloudRain, Wind, MapPin, X, Info, Quote, Sparkles, Globe, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import WeatherModal from "@/components/WeatherModal";
import VocabularyModal from "@/components/VocabularyModal";
import { Link, useSearch, useLocation } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import { regions } from "@/data/regions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Home() {
  const [activeRegion, setActiveRegion] = useState(regions[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [vocabOpen, setVocabOpen] = useState(false);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [currentDate, setCurrentDate] = useState("");
  const [lang, setLang] = useState<'ar' | 'uz'>('ar');

  const toggleLang = () => {
    setLang(prev => prev === 'ar' ? 'uz' : 'ar');
  };

  const translations = {
    ar: {
      title: "الطَّقْس",
      weekly: "أُسْبُوعِي",
      regions: "الْمَنَاطِق",
      wisdom: "حِكْمَة الْيَوْم",
      quote: "كُلّ يَوْم هُوَ فُرْصَة جَدِيدَة.",
      advice: "مَهْمَا كَان الطَّقْس الْيَوْم، حَافِظ عَلَى مِزَاجِك رَائِعاً!",
      select: "اخْتَر مَنْطِقَة",
      yandex: "بَيَانَات مِنْ ياندكس",
      vocab: "الْقَامُوس / Lug'at"
    },
    uz: {
      title: "Ob-Havo",
      weekly: "Haftalik",
      regions: "HUDUDLAR",
      wisdom: "KUN HIKMATI",
      quote: "Har bir kun - yangi imkoniyat.",
      advice: "Bugungi ob-havo qanday bo'lishidan qat'iy nazar, kayfiyatingizni a'lo darajada saqlang!",
      select: "Hududni tanlang",
      yandex: "Ma'lumotlar Yandex dan",
      vocab: "Lug'at / الْقَامُوس"
    }
  };

  const t = translations[lang];
  const isRtl = lang === 'ar';

  useEffect(() => {
    const date = new Date();
    const locale = lang === 'ar' ? 'ar-EG' : 'uz-UZ';
    setCurrentDate(date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }));

    const params = new URLSearchParams(search);
    const startParam = params.get("startapp") || params.get("region");
    // @ts-ignore
    const tg = window.Telegram?.WebApp;
    const tgStartParam = tg?.initDataUnsafe?.start_param;

    const targetRegionId = startParam || tgStartParam;

    if (targetRegionId) {
      const region = regions.find(r => r.id === targetRegionId.toLowerCase());
      if (region) {
        setActiveRegion(region);
      }
    }
  }, [search, lang]);

  const handleRegionClick = (regionId: string) => {
    const region = regions.find(r => r.id === regionId);
    if (region) {
      setActiveRegion(region);
    }
  };

  return (
    <div className="h-screen w-full relative overflow-hidden bg-background text-foreground flex flex-col font-sans select-none">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroBg} 
          alt="Weather Background" 
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-white/60 backdrop-blur-[2px]" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 flex flex-col h-full max-w-md mx-auto w-full shadow-2xl bg-white/30 backdrop-blur-sm border-x border-white/40">
        
        {/* Header */}
        <header className="p-6 flex justify-between items-center bg-white/40 backdrop-blur-md border-b border-white/30 sticky top-0 z-20" dir={isRtl ? "rtl" : "ltr"}>
           <div>
             <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 font-display">
               {t.title}
             </h1>
             <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 capitalize">
               <Calendar className="w-3 h-3" /> {currentDate}
             </p>
           </div>
           <div className="flex gap-2">
             <button onClick={toggleLang} className="p-2 rounded-full hover:bg-white/50 transition-colors text-primary bg-white/30 backdrop-blur-sm border border-white/40 text-xs font-bold px-3 flex items-center gap-1">
                <Globe className="w-4 h-4" />
                {lang === 'ar' ? 'UZ' : 'AR'}
             </button>
             <button onClick={() => setVocabOpen(true)} className="p-2 rounded-full hover:bg-white/50 transition-colors text-primary bg-white/30 backdrop-blur-sm border border-white/40 text-xs font-bold px-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">{t.vocab}</span>
             </button>
             <Link href="/admin">
                <button className="p-2 rounded-full hover:bg-white/50 transition-colors text-muted-foreground bg-white/30 backdrop-blur-sm border border-white/40">
                  <Settings className="w-5 h-5" />
                </button>
             </Link>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-6 flex flex-col">
            
            {/* Regions Grid Section */}
            <div className="px-4 mb-6">
              <div className="flex items-center justify-between mb-3 px-1" dir={isRtl ? "rtl" : "ltr"}>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold tracking-widest text-primary/80 uppercase">{t.regions}</h3>
                </div>
                <span className="text-[10px] text-muted-foreground/60">{t.yandex}</span>
              </div>
              <div className="grid grid-cols-2 gap-3" dir={isRtl ? "rtl" : "ltr"}>
                {regions.map((region) => (
                  <motion.div
                    key={region.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      setActiveRegion(region);
                      setModalOpen(true);
                    }}
                    className={`cursor-pointer rounded-2xl p-4 flex flex-col items-center justify-center gap-2 relative overflow-hidden glass-card border-white/40 shadow-sm ${activeRegion.id === region.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-white/50' : ''}`}
                  >
                    <div className={`absolute inset-0 opacity-10 ${region.color}`} />
                    <span className="font-display font-bold text-lg text-center z-10">{lang === 'ar' ? region.name_ar : region.name_uz}</span>
                    <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground z-10">
                       <region.icon className="w-3 h-3" />
                       <span>{region.temp}°</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Weather Hero Card (Active Region) */}
            <div className="px-4 mb-8" onClick={() => setModalOpen(true)}>
              <WeatherHero region={activeRegion} lang={lang} />
            </div>

            {/* Daily Word Flip Card */}
            <div className="px-4 mb-20">
               <div className="flex items-center justify-between mb-3 px-1" dir={isRtl ? "rtl" : "ltr"}>
                 <h3 className="text-xs font-bold tracking-widest text-primary/60 uppercase">{t.wisdom}</h3>
                 <Info className="w-4 h-4 text-primary/40" />
               </div>
               <FlipCard 
                 frontContent={
                   <div className="text-center p-6 flex flex-col items-center justify-center h-full bg-gradient-to-br from-white/60 to-white/30">
                     <Quote className="w-8 h-8 text-primary/40 mb-3" />
                     <p className="text-lg font-display font-medium text-foreground/80 italic" dir={isRtl ? "rtl" : "ltr"}>
                       "{t.quote}"
                     </p>
                   </div>
                 }
                 backContent={
                   <div className="text-center p-6 flex flex-col items-center justify-center h-full bg-gradient-to-br from-primary/10 to-primary/5">
                     <Sparkles className="w-8 h-8 text-primary mb-3" />
                     <p className="text-sm font-medium text-foreground/70 leading-relaxed" dir={isRtl ? "rtl" : "ltr"}>
                       {t.advice}
                     </p>
                   </div>
                 }
               />
            </div>
        </div>

        {/* Modal */}
        <AnimatePresence>
          {modalOpen && (
            <WeatherModal 
              isOpen={modalOpen} 
              onClose={() => setModalOpen(false)} 
              region={activeRegion}
              lang={lang}
            />
          )}
          {vocabOpen && (
            <VocabularyModal
              isOpen={vocabOpen}
              onClose={() => setVocabOpen(false)}
              lang={lang}
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}