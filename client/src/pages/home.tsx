import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings, Cloud, Sun, CloudRain, Wind, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import WeatherModal from "@/components/WeatherModal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link, useSearch } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import mapImg from "@assets/generated_images/minimalist_3d_isometric_glass_map_of_uzbekistan,_high_tech,_clean_white_and_blue.png";
import { regions } from "@/data/regions";

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState(regions[9]); // Default Toshkent
  const [currentDate, setCurrentDate] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
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
        setIsModalOpen(true); // Auto-open modal on deep link
      }
    }
  }, [search]);

  const handleRegionClick = (region: typeof regions[0]) => {
    setSelectedRegion(region);
    setIsModalOpen(true);
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
            <Link href="/admin">
                <Button variant="ghost" size="icon" className="rounded-full hover:bg-black/5">
                    <Settings className="w-5 h-5 text-foreground/70" />
                </Button>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
            
            <div className="mb-6">
              <WeatherHero 
                  weather={{
                  temp: selectedRegion.temp,
                  condition: selectedRegion.condition,
                  city: selectedRegion.name,
                  humidity: 45,
                  wind: 12
                  }}
              />
            </div>

            {/* Interactive 3D Isometric Map */}
            <div className="mb-8 relative w-full aspect-[4/3] glass-card rounded-3xl overflow-hidden shadow-2xl border border-white/60 p-0 group">
               <div className="absolute top-3 left-4 z-10 bg-white/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm flex items-center gap-2">
                 <Compass className="w-3 h-3" /> O'zbekiston
               </div>
               
               <img 
                 src={mapImg} 
                 alt="O'zbekiston Xaritasi" 
                 className="w-full h-full object-contain opacity-90 scale-105 group-hover:scale-110 transition-transform duration-700"
               />

               {regions.map((region) => (
                 <motion.button
                   key={region.id}
                   whileHover={{ scale: 1.1, zIndex: 100 }}
                   whileTap={{ scale: 0.95 }}
                   onClick={() => handleRegionClick(region)}
                   className="absolute flex flex-col items-center justify-center transition-all duration-300 group"
                   style={{ 
                     left: `${region.x}%`, 
                     top: `${region.y}%`,
                     transform: 'translate(-50%, -50%)',
                     zIndex: selectedRegion.id === region.id ? 50 : 10
                   }}
                 >
                   {/* Animated Pulse Ring */}
                   {selectedRegion.id === region.id && (
                     <motion.div 
                       className="absolute w-12 h-12 rounded-full border-2 border-primary/30"
                       animate={{ scale: [1, 1.5], opacity: [1, 0] }}
                       transition={{ duration: 1.5, repeat: Infinity }}
                     />
                   )}

                   {/* Icon Bubble */}
                   <div className={`
                     w-8 h-8 rounded-full shadow-lg flex items-center justify-center mb-1 transition-all duration-300
                     ${selectedRegion.id === region.id 
                       ? 'bg-primary text-white ring-4 ring-primary/20 scale-110' 
                       : 'bg-white/90 text-primary hover:bg-white hover:scale-110'}
                   `}>
                     <region.icon className="w-4 h-4" />
                   </div>
                   
                   {/* Always Visible Label */}
                   <div className={`
                       px-2 py-0.5 rounded-md text-[10px] font-bold backdrop-blur-md shadow-sm whitespace-nowrap border transition-all
                       ${selectedRegion.id === region.id
                         ? 'bg-primary text-primary-foreground border-primary/50 translate-y-[-2px]'
                         : 'bg-white/60 text-foreground/80 border-white/40'}
                     `}
                   >
                     {region.name}
                   </div>
                 </motion.button>
               ))}
            </div>

            {/* Region Dropdown Selection */}
            <div className="mb-8 px-4">
              <Select
                value={selectedRegion.id}
                onValueChange={(value) => {
                  const region = regions.find((r) => r.id === value);
                  if (region) handleRegionClick(region);
                }}
              >
                <SelectTrigger className="w-full glass-card border-white/40 h-12 text-lg font-medium">
                  <SelectValue placeholder="Viloyatni tanlang" />
                </SelectTrigger>
                <SelectContent className="glass-panel border-white/20 max-h-[300px]">
                  {regions.map((region) => (
                    <SelectItem key={region.id} value={region.id} className="text-base cursor-pointer">
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Quick Select List */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" /> Viloyatlar
                  </h3>
                  <Link href="/forecast">
                    <Button variant="ghost" size="sm" className="text-primary text-xs font-bold hover:bg-primary/10">
                      Haftalik to'liq &rarr;
                    </Button>
                  </Link>
              </div>
              
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex gap-3 px-1">
                  {regions.map((region) => (
                      <motion.button
                      key={region.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleRegionClick(region)}
                      className={`
                          relative flex flex-col items-center justify-center px-4 py-3 rounded-2xl min-w-[90px] border transition-all duration-300
                          ${selectedRegion.id === region.id 
                          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20' 
                          : 'glass-card border-white/40 hover:border-primary/50'}
                      `}
                      >
                      <span className="text-xs font-medium mb-1">{region.name}</span>
                      <span className="text-lg font-bold">{region.temp}°</span>
                      </motion.button>
                  ))}
                  </div>
              </ScrollArea>
            </div>

            <div className="mb-6">
              <FlipCard 
                  arabicWord="سَلَام"
                  uzbekWord="Salom"
                  pronunciation="Salaam"
                  context="Tinchlik va omonlik. Salomlashish odobi - insoniylikning go'zal belgisidir."
              />
            </div>
        </div>
      </div>
      
      {/* Modal for Details */}
      <WeatherModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        region={selectedRegion} 
      />
    </div>
  );
}
