import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import { Link } from "wouter";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import mapImg from "@assets/generated_images/stylized_minimal_map_of_uzbekistan_outline_in_blue_or_white.png";

// Mock Data
const regions = [
  { id: 1, name: "Toshkent", temp: 24, condition: "Quyoshli", x: 70, y: 30 },
  { id: 2, name: "Samarqand", temp: 26, condition: "Ochiq", x: 55, y: 50 },
  { id: 3, name: "Buxoro", temp: 28, condition: "Issiq", x: 40, y: 60 },
  { id: 4, name: "Xiva", temp: 27, condition: "Quyoshli", x: 20, y: 40 },
  { id: 5, name: "Andijon", temp: 23, condition: "Bulutli", x: 85, y: 35 },
  { id: 6, name: "Namangan", temp: 22, condition: "Yomg'ir", x: 82, y: 25 },
];

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState(regions[0]);
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const date = new Date();
    setCurrentDate(date.toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' }));
  }, []);

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
      
      {/* Gradient Overlay for Text Readability */}
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
            
            {/* Weather Hero */}
            <div className="mb-8">
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

            {/* Interactive Map Section */}
            <div className="mb-8 relative w-full aspect-[4/3] glass-card rounded-2xl overflow-hidden shadow-sm border border-white/40 p-4 flex items-center justify-center">
               <img 
                 src={mapImg} 
                 alt="O'zbekiston Xaritasi" 
                 className="w-full h-full object-contain opacity-80"
               />
               {/* Overlay clickable dots for mockup */}
               {regions.map((region) => (
                 <motion.button
                   key={region.id}
                   whileHover={{ scale: 1.2 }}
                   whileTap={{ scale: 0.9 }}
                   onClick={() => setSelectedRegion(region)}
                   className={`absolute w-3 h-3 rounded-full border-2 border-white shadow-md transition-colors ${selectedRegion.id === region.id ? 'bg-primary' : 'bg-white/50'}`}
                   style={{ 
                     left: `${region.x}%`, 
                     top: `${region.y}%` 
                   }}
                 />
               ))}
               <div className="absolute bottom-2 right-4 text-[10px] text-muted-foreground font-medium bg-white/50 px-2 py-1 rounded-full backdrop-blur-sm">
                 Xarita
               </div>
            </div>

            {/* Regions Grid */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                  <Compass className="w-4 h-4 text-primary" /> Viloyatlar
                  </h3>
              </div>
              
              <ScrollArea className="w-full whitespace-nowrap pb-2">
                  <div className="flex gap-3 px-1">
                  {regions.map((region) => (
                      <motion.button
                      key={region.id}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setSelectedRegion(region)}
                      className={`
                          relative flex flex-col items-center justify-center p-4 rounded-2xl min-w-[100px] border transition-all duration-300
                          ${selectedRegion.id === region.id 
                          ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/20' 
                          : 'glass-card border-white/40 hover:border-primary/50'}
                      `}
                      >
                      <span className="text-sm font-medium mb-1">{region.name}</span>
                      <span className="text-xl font-bold">{region.temp}°</span>
                      </motion.button>
                  ))}
                  </div>
              </ScrollArea>
            </div>

            {/* Flip Card - Word of the Day (Secular/Educational) */}
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
