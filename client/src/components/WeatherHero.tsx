import { Cloud, Sun, Wind, Droplets, MapPin, Moon } from "lucide-react";
import { motion } from "framer-motion";

interface WeatherHeroProps {
  weather: {
    temp: number;
    condition: string;
    city: string;
    humidity: number;
    wind: number;
  };
}

export default function WeatherHero({ weather }: WeatherHeroProps) {
  return (
    <div className="relative w-full flex flex-col items-center justify-center py-6">
      {/* Decorative Islamic Pattern Circle (CSS based) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
        <div className="w-64 h-64 border-[1px] border-primary rounded-full animate-spin-slow" style={{ animationDuration: '60s' }} />
        <div className="w-48 h-48 border-[1px] border-primary rounded-full absolute animate-spin-slow" style={{ animationDuration: '40s', animationDirection: 'reverse' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="z-10 flex flex-col items-center"
      >
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 backdrop-blur-sm mb-4">
          <MapPin className="w-3 h-3 text-primary" />
          <span className="text-xs font-bold text-primary uppercase tracking-wider">{weather.city}</span>
        </div>

        <div className="relative">
          <h1 className="text-8xl font-display font-bold text-foreground tracking-tighter drop-shadow-sm">
            {weather.temp}°
          </h1>
          <div className="absolute -right-8 -top-4 text-primary animate-pulse">
            <Sun className="w-12 h-12" />
          </div>
        </div>

        <p className="text-xl font-medium text-muted-foreground mb-2">{weather.condition}</p>
        
        {/* Religious Phrase */}
        <p className="text-sm text-primary/80 font-arabic font-medium mt-2">
          "SubhanAllah, bugun havo ajoyib!"
        </p>

        <div className="grid grid-cols-2 gap-4 mt-8 w-full max-w-xs">
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
              <Wind className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Shamol</span>
              <span className="font-bold text-sm">{weather.wind} km/s</span>
            </div>
          </div>
          <div className="glass-card rounded-xl p-3 flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-500">
              <Droplets className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">Namlik</span>
              <span className="font-bold text-sm">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
