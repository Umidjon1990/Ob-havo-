import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings, Cloud, Sun, CloudRain, Wind, MapPin, X, Info, Quote, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import WeatherModal from "@/components/WeatherModal";
import { Link, useSearch, useLocation } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import { regions } from "@/data/regions";
import { UzbekistanMap } from "@/components/UzbekistanMap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Home() {
  const [activeRegion, setActiveRegion] = useState(regions[0]);
  const [modalOpen, setModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const date = new Date();
    setCurrentDate(date.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' }));

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
  }, [search]);

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
        <header className="p-6 flex justify-between items-center bg-white/40 backdrop-blur-md border-b border-white/30 sticky top-0 z-20">
           <div>
             <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600 font-display">
               Ob-Havo
             </h1>
             <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 capitalize">
               <Calendar className="w-3 h-3" /> {currentDate}
             </p>
           </div>
           <div className="flex gap-2">
             <button onClick={() => setLocation('/forecast')} className="p-2 rounded-full hover:bg-white/50 transition-colors text-primary bg-white/30 backdrop-blur-sm border border-white/40 text-xs font-bold px-3">
                Haftalik
             </button>
             <Link href="/admin">
                <button className="p-2 rounded-full hover:bg-white/50 transition-colors text-muted-foreground bg-white/30 backdrop-blur-sm border border-white/40">
                  <Settings className="w-5 h-5" />
                </button>
             </Link>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-6 flex flex-col">
            
            {/* Interactive Map Section */}
            <div className="relative w-full aspect-[1.53] glass-card rounded-3xl overflow-hidden shadow-2xl border border-white/60 mb-6 group bg-white/40 mx-4 mt-4 w-[calc(100%-2rem)]">
               <div className="absolute top-3 left-4 z-10 bg-white/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm flex items-center gap-2 pointer-events-none">
                 <Compass className="w-3 h-3" /> O'zbekiston
               </div>
               
               <UzbekistanMap 
                 onRegionSelect={handleRegionClick}
                 selectedRegion={activeRegion.id}
                 className="p-1"
               />

               {/* Dropdown Selection Overlay on Map */}
               <div className="absolute top-3 right-4 z-10 w-40">
                 <Select 
                   value={activeRegion.id} 
                   onValueChange={(val) => {
                     const region = regions.find(r => r.id === val);
                     if (region) setActiveRegion(region);
                   }}
                 >
                   <SelectTrigger className="w-full h-8 text-xs bg-white/80 backdrop-blur-md border-white/50 shadow-sm rounded-full px-3">
                     <SelectValue placeholder="Hududni tanlang" />
                   </SelectTrigger>
                   <SelectContent>
                     {regions.map((region) => (
                       <SelectItem key={region.id} value={region.id} className="text-xs">
                         {region.name}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
            </div>

            {/* Weather Hero Card (Active Region) */}
            <div className="px-4 mb-8" onClick={() => setModalOpen(true)}>
              <WeatherHero region={activeRegion} />
            </div>

            {/* Daily Word Flip Card */}
            <div className="px-4 mb-20">
               <div className="flex items-center justify-between mb-3 px-1">
                 <h3 className="text-xs font-bold tracking-widest text-primary/60 uppercase">KUN SO'ZI</h3>
                 <Info className="w-4 h-4 text-primary/40" />
               </div>
               <FlipCard 
                 frontContent={
                   <div className="text-center p-6 flex flex-col items-center justify-center h-full bg-gradient-to-br from-white/60 to-white/30">
                     <Quote className="w-8 h-8 text-primary/40 mb-3" />
                     <p className="text-lg font-display font-medium text-foreground/80 italic">
                       "Har bir kun - yangi imkoniyat."
                     </p>
                   </div>
                 }
                 backContent={
                   <div className="text-center p-6 flex flex-col items-center justify-center h-full bg-gradient-to-br from-primary/10 to-primary/5">
                     <Sparkles className="w-8 h-8 text-primary mb-3" />
                     <p className="text-sm font-medium text-foreground/70 leading-relaxed">
                       Bugungi ob-havo qanday bo'lishidan qat'iy nazar, kayfiyatingizni a'lo darajada saqlang!
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
            />
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
