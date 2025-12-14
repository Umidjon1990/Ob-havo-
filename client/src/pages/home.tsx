import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings, Cloud, Sun, CloudRain, Wind, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import { Link, useSearch } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import mapImg from "@assets/generated_images/stylized_minimal_map_of_uzbekistan_outline_in_blue_or_white.png";

// Full 12 Regions + Karakalpakstan
// Coordinates are approximate percentages relative to the map image
const regions = [
  { id: "nukus", name: "Nukus", temp: 22, condition: "Quyoshli", icon: Sun, x: 25, y: 35 },
  { id: "urganch", name: "Urganch", temp: 24, condition: "Ochiq", icon: Sun, x: 28, y: 65 },
  { id: "navoiy", name: "Navoiy", temp: 25, condition: "Bulutli", icon: Cloud, x: 45, y: 45 },
  { id: "buxoro", name: "Buxoro", temp: 27, condition: "Issiq", icon: Sun, x: 42, y: 68 },
  { id: "samarqand", name: "Samarqand", temp: 23, condition: "Bulutli", icon: Cloud, x: 62, y: 55 },
  { id: "qarshi", name: "Qarshi", temp: 28, condition: "Issiq", icon: Sun, x: 58, y: 75 },
  { id: "termiz", name: "Termiz", temp: 30, condition: "Juda issiq", icon: Sun, x: 65, y: 88 },
  { id: "jizzax", name: "Jizzax", temp: 22, condition: "Yomg'ir", icon: CloudRain, x: 70, y: 48 },
  { id: "guliston", name: "Guliston", temp: 23, condition: "Bulutli", icon: Cloud, x: 78, y: 42 },
  { id: "toshkent", name: "Toshkent", temp: 21, condition: "Yomg'ir", icon: CloudRain, x: 82, y: 32 },
  { id: "namangan", name: "Namangan", temp: 20, condition: "Yomg'ir", icon: CloudRain, x: 88, y: 28 },
  { id: "andijon", name: "Andijon", temp: 21, condition: "Bulutli", icon: Cloud, x: 94, y: 35 },
  { id: "fargona", name: "Farg'ona", temp: 22, condition: "Bulutli", icon: Cloud, x: 88, y: 45 },
];

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState(regions[9]); // Default Toshkent
  const [currentDate, setCurrentDate] = useState("");
  const search = useSearch(); // wouter hook to get query string

  useEffect(() => {
    const date = new Date();
    setCurrentDate(date.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' }));

    // Deep Linking Logic
    // 1. Check standard URL params (for testing in browser)
    const params = new URLSearchParams(search);
    const startParam = params.get("startapp") || params.get("region");

    // 2. Check Telegram WebApp initData (for real production)
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

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background font-sans select-none">
      {/* Dynamic Background Image */}
      <div 
        className="absolute inset-0 z-0 opacity-100"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white/40 via-white/60 to-white/95 dark:from-black/20 dark:via-black/40 dark:to-background backdrop-blur-[2px]" />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-md h-screen flex flex-col">
        
        {/* Top Bar */}
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
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-black/5">
                <Menu className="w-6 h-6 text-foreground" />
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto no-scrollbar pb-6">
            
            {/* Weather Hero (Dynamic based on selection) */}
            <div className="mb-6">
              <WeatherHero 
                  weather={{
                  temp: selectedRegion.temp,
                  condition: selectedRegion.condition,
                  city: selectedRegion.name,
                  humidity: 45, // Mock data
                  wind: 12      // Mock data
                  }}
              />
            </div>

            {/* Interactive Map Section */}
            <div className="mb-8 relative w-full aspect-[4/3] glass-card rounded-3xl overflow-hidden shadow-lg border border-white/60 p-2">
               <div className="absolute top-3 left-4 z-10 bg-white/60 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary shadow-sm">
                 O'zbekiston
               </div>
               
               {/* Map Image */}
               <img 
                 src={mapImg} 
                 alt="O'zbekiston Xaritasi" 
                 className="w-full h-full object-contain opacity-70"
               />
               
               {/* Animated Pulse for Selected Region */}
               <motion.div
                 layoutId="selected-pulse"
                 className="absolute w-12 h-12 bg-primary/20 rounded-full blur-xl"
                 style={{ 
                   left: `${selectedRegion.x}%`, 
                   top: `${selectedRegion.y}%`,
                   x: "-50%",
                   y: "-50%"
                 }}
                 transition={{ duration: 2, repeat: Infinity }}
               />

               {/* Region Dots & Icons */}
               {regions.map((region) => (
                 <motion.button
                   key={region.id}
                   whileHover={{ scale: 1.2, zIndex: 10 }}
                   whileTap={{ scale: 0.9 }}
                   onClick={() => setSelectedRegion(region)}
                   className={`
                     absolute flex items-center justify-center
                     w-8 h-8 rounded-full shadow-md transition-all duration-300
                     ${selectedRegion.id === region.id 
                       ? 'bg-primary text-white scale-110 z-20 ring-4 ring-primary/20' 
                       : 'bg-white/80 text-primary hover:bg-white'}
                   `}
                   style={{ 
                     left: `${region.x}%`, 
                     top: `${region.y}%`,
                     transform: 'translate(-50%, -50%)' 
                   }}
                 >
                   <region.icon className="w-4 h-4" />
                   
                   {/* Label only visible on selected or hover */}
                   {selectedRegion.id === region.id && (
                     <motion.div 
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       className="absolute -bottom-8 bg-white/90 backdrop-blur px-2 py-1 rounded-lg text-[10px] font-bold text-foreground shadow-sm whitespace-nowrap pointer-events-none"
                     >
                       {region.name}
                     </motion.div>
                   )}
                 </motion.button>
               ))}
            </div>

            {/* Quick Select List (Horizontal Scroll) */}
            <div className="mb-8">
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex gap-3 px-1">
                  {regions.map((region) => (
                      <motion.button
                      key={region.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedRegion(region)}
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

            {/* Flip Card - Word of the Day */}
            <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="font-display font-semibold text-lg text-foreground/80">Kun So'zi</h3>
            </div>
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
