import { Wind, Droplets, MapPin, Sun } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherHeroProps {
  region: {
    name: string;
    temp: number;
    condition: string;
    humidity: number;
    wind: number;
  };
}

export default function WeatherHero({ region }: WeatherHeroProps) {
  return (
    <div className="relative w-full flex flex-col items-center justify-center py-6">
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        key={region.name} // Animate when region changes
        className="z-10 flex flex-col items-center"
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">{region.name}</span>
        </div>

        <div className="relative">
          <h1 className="text-8xl font-display font-bold text-foreground tracking-tighter drop-shadow-sm">
            {region.temp}°
          </h1>
          <div className="absolute -right-8 -top-4 text-primary animate-pulse">
            <Sun className="w-12 h-12" />
          </div>
        </div>

        <p className="text-xl font-medium text-muted-foreground mb-2">{region.condition}</p>
        
        {/* Simple Motivational Phrase (Secular) */}
        <p className="text-sm text-primary/80 font-medium mt-2">
          Bugun ajoyib kun bo'ladi!
        </p>

        <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-xs">
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Wind className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Shamol</span>
              <span className="font-bold text-sm">{region.wind} km/s</span>
            </div>
          </div>
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
              <Droplets className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Namlik</span>
              <span className="font-bold text-sm">{region.humidity}%</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
