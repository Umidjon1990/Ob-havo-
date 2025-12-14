import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Menu, Search, Compass, Calendar, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import FlipCard from "@/components/FlipCard";
import WeatherHero from "@/components/WeatherHero";
import PrayerTimes from "@/components/PrayerTimes";
import { Link } from "wouter";
import heroBg from "@assets/generated_images/vertical_background_with_subtle_islamic_geometric_patterns_over_a_soft_blue_sky_gradient.png";

// Mock Data
const regions = [
  { id: 1, name: "Toshkent", temp: 24, condition: "Quyoshli" },
  { id: 2, name: "Samarqand", temp: 26, condition: "Ochiq" },
  { id: 3, name: "Buxoro", temp: 28, condition: "Issiq" },
  { id: 4, name: "Xiva", temp: 27, condition: "Quyoshli" },
  { id: 5, name: "Andijon", temp: 23, condition: "Bulutli" },
  { id: 6, name: "Namangan", temp: 22, condition: "Yomg'ir" },
];

export default function Home() {
  const [selectedRegion, setSelectedRegion] = useState(regions[0]);
  const [currentDate, setCurrentDate] = useState("");

  useEffect(() => {
    const date = new Date();
    // Simple format for now, ideally use Hijri calendar library
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
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white/30 via-white/50 to-white/90 dark:from-black/20 dark:via-black/40 dark:to-background backdrop-blur-[1px]" />

      <div className="relative z-10 container mx-auto px-4 py-6 max-w-md h-screen flex flex-col">
        
        {/* Top Bar */}
        <header className="flex justify-between items-center mb-6">
          <div className="flex flex-col">
            <h1 className="text-xl font-display font-bold text-foreground">Bismillah</h1>
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

            {/* Prayer Times - NEW */}
            <PrayerTimes />

            {/* Regions "Map" / Grid */}
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

            {/* Flip Card - Word of the Day */}
            <div className="mb-6">
            <div className="flex items-center justify-between mb-4 px-1">
                <h3 className="font-display font-semibold text-lg text-foreground/80">Kun Hikmati</h3>
            </div>
            <FlipCard 
                arabicWord="شُكْر"
                uzbekWord="Shukr"
                pronunciation="Shukr"
                context="Ne'matlarga minnatdor bo'lish. Alloh taolo aytadi: «Agar shukr qilsangiz, albatta, (ne'matimni) ziyoda qilurman» (Ibrohim surasi, 7-oyat)."
            />
            </div>
        </div>

      </div>
    </div>
  );
}
