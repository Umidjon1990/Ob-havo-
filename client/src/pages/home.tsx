import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings, Cloud, Sun, CloudRain, Wind, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import WeatherModal from "@/components/WeatherModal";
import { Link, useSearch } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import mapImg from "@assets/generated_images/clean_grey_map_of_uzbekistan.png";
import { regions } from "@/data/regions";

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState<typeof regions[0] | null>(null);
  const [currentDate, setCurrentDate] = useState("");
  const search = useSearch();

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
        setSelectedRegion(region);
      }
    }
  }, [search]);

  const handleRegionClick = (region: typeof regions[0]) => {
    if (selectedRegion?.id === region.id) {
        setSelectedRegion(null); // Deselect if clicked again
    } else {
        setSelectedRegion(region);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background font-sans select-none">
      <div 
        className="absolute inset-0 z-0 opacity-100"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white/40 via-white/60 to-white/95 dark:from-black/20 dark:via-black/40 dark:to-background backdrop-blur-[2px]" />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-md h-screen flex flex-col">
        
        <header className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <h1 className="text-xl font-display font-bold text-foreground">Ob-Havo</h1>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {currentDate}
            </span>
          </div>
          <div className="flex gap-2">
            <Link href="/forecast">
                <Button variant="outline" size="sm" className="bg-white/50 backdrop-blur-sm border-white/40 text-xs font-bold">
                    Haftalik
                </Button>
            </Link>
            <Link href="/admin">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-black/5">
                    <Settings className="w-5 h-5 text-foreground/70" />
                </Button>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-6 flex flex-col">
            
            {/* Interactive Map Section */}
            <div className="relative w-full aspect-[4/3] glass-card rounded-3xl overflow-hidden shadow-2xl border border-white/60 p-0 mb-6 group">
               <div className="absolute top-3 left-4 z-10 bg-white/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm flex items-center gap-2">
                 <Compass className="w-3 h-3" /> O'zbekiston
               </div>
               
               <img 
                 src={mapImg} 
                 alt="O'zbekiston Xaritasi" 
                 className="w-full h-full object-contain opacity-90 scale-105 relative z-10"
               />

               {/* Map Markers */}
               {regions.map((region) => (
                 <div
                   key={region.id}
                   className="absolute flex items-center justify-center transition-all duration-300"
                   style={{ 
                     left: `${region.x}%`, 
                     top: `${region.y}%`,
                     transform: 'translate(-50%, -50%)',
                     zIndex: selectedRegion?.id === region.id ? 60 : 20
                   }}
                 >
                    {/* Colored Glow/Area Effect */}
                   <div className={`
                        absolute w-24 h-24 -z-10 rounded-full blur-2xl opacity-40 transition-all duration-500 pointer-events-none
                        ${region.color}
                        ${selectedRegion?.id === region.id ? 'opacity-70 scale-125' : 'opacity-30 scale-75'}
                   `} />

                    {/* The Dot Marker */}
                   <motion.button
                     whileHover={{ scale: 1.2 }}
                     whileTap={{ scale: 0.9 }}
                     onClick={() => handleRegionClick(region)}
                     className={`
                       w-5 h-5 rounded-full shadow-lg border-2 border-white transition-all duration-300 relative z-20
                       ${region.color}
                       ${selectedRegion?.id === region.id ? 'scale-125 ring-4 ring-white/40' : 'opacity-90 hover:opacity-100'}
                     `}
                   />

                   {/* Detail Pop-up Card (Only visible when selected) */}
                   <AnimatePresence>
                   {selectedRegion?.id === region.id && (
                     <motion.div 
                        initial={{ opacity: 0, scale: 0.8, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.8, y: 10 }}
                        className="absolute bottom-full mb-3 p-3 rounded-2xl glass-panel border border-white/50 shadow-xl min-w-[140px] z-50 backdrop-blur-xl bg-white/80"
                        style={{
                            left: '50%',
                            translateX: '-50%'
                        }}
                     >
                        <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-sm text-foreground">{region.name}</span>
                            <region.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex items-end gap-2">
                            <span className="text-2xl font-bold text-foreground leading-none">{region.temp}°</span>
                            <span className="text-[10px] text-muted-foreground font-medium mb-1">{region.condition}</span>
                        </div>
                        
                        {/* Little triangle arrow at bottom */}
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/80 rotate-45 border-r border-b border-white/50 clip-path-triangle"></div>
                     </motion.div>
                   )}
                   </AnimatePresence>
                 </div>
               ))}
            </div>

            {/* Region Color Legend Grid */}
            <div className="mb-8">
                <h3 className="font-display font-semibold text-lg mb-3 flex items-center gap-2">
                    <Compass className="w-4 h-4 text-primary" /> Hududni tanlang
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    {regions.map((region) => (
                        <motion.button
                            key={region.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleRegionClick(region)}
                            className={`
                                relative overflow-hidden rounded-xl p-3 flex flex-col items-start gap-1 transition-all duration-300 border
                                ${selectedRegion?.id === region.id 
                                    ? 'bg-white shadow-lg border-primary/20 ring-2 ring-primary/10' 
                                    : 'bg-white/40 hover:bg-white/60 border-white/40'}
                            `}
                        >
                            {/* Color Indicator Strip */}
                            <div className={`absolute top-0 left-0 bottom-0 w-1.5 ${region.color}`} />
                            
                            <div className="pl-2 w-full">
                                <span className="text-xs font-bold text-foreground/80 block truncate">{region.name}</span>
                                {selectedRegion?.id === region.id && (
                                    <motion.span 
                                        initial={{ opacity: 0 }} 
                                        animate={{ opacity: 1 }} 
                                        className="text-[10px] text-primary font-medium"
                                    >
                                        {region.temp}°
                                    </motion.span>
                                )}
                            </div>
                        </motion.button>
                    ))}
                </div>
            </div>

            <div className="mt-auto">
              <FlipCard 
                  arabicWord="سَلَام"
                  uzbekWord="Salom"
                  pronunciation="Salaam"
                  context="Tinchlik va omonlik. Salomlashish odobi - insoniylikning go'zal belgisidir."
              />
            </div>
        </div>
      </div>
    </div>
  );
}
