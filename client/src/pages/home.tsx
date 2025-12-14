import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Cloud, 
  Sun, 
  Wind, 
  Droplets, 
  Search, 
  MapPin, 
  Menu,
  Thermometer,
  CloudRain
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import heroBg from "@assets/generated_images/abstract_soft_blue_and_white_cloudy_gradient_background_for_weather_app.png";

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentView, setCurrentView] = useState<"current" | "forecast">("current");

  // Mock Data for "Toshkent"
  const mockWeather = {
    temp: 24,
    condition: "Bulutli",
    city: "Toshkent",
    humidity: 45,
    wind: 12,
    feelsLike: 26,
    hourly: [
      { time: "12:00", temp: 24, icon: Cloud },
      { time: "13:00", temp: 25, icon: Sun },
      { time: "14:00", temp: 26, icon: Sun },
      { time: "15:00", temp: 25, icon: Cloud },
      { time: "16:00", temp: 23, icon: CloudRain },
    ],
    daily: [
      { day: "Dushanba", temp: 24, condition: "Quyoshli" },
      { day: "Seshanba", temp: 22, condition: "Yomg'ir" },
      { day: "Chorshanba", temp: 20, condition: "Bulutli" },
    ]
  };

  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background text-foreground font-sans">
      {/* Dynamic Background */}
      <div 
        className="absolute inset-0 z-0 opacity-80"
        style={{
          backgroundImage: `url(${heroBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />
      
      {/* Glass Overlay for Depth */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-white/10 to-white/60 dark:from-black/10 dark:to-background/90 backdrop-blur-[2px]" />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-md md:max-w-4xl h-screen flex flex-col">
        {/* Header */}
        <header className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/20 rounded-full backdrop-blur-md">
              <Cloud className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-display font-bold text-foreground">Ob-Havo AI</h1>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full hover:bg-white/20">
            <Menu className="w-6 h-6" />
          </Button>
        </header>

        {/* Search Bar */}
        <div className="relative mb-8 group">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/30 transition-all" />
          <div className="relative flex items-center glass-panel rounded-full px-4 py-2">
            <Search className="w-5 h-5 text-muted-foreground mr-3" />
            <input 
              type="text"
              placeholder="Shahar nomini kiriting..."
              className="bg-transparent border-none outline-none flex-1 text-lg placeholder:text-muted-foreground/70"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button size="sm" className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground ml-2">
              Izlash
            </Button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto pb-8 no-scrollbar">
          
          {/* Current Weather Hero */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-8 mb-8"
          >
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <MapPin className="w-4 h-4" />
              <span className="text-lg font-medium">{mockWeather.city}</span>
            </div>
            
            <div className="relative">
              <h1 className="text-9xl font-display font-bold bg-gradient-to-b from-foreground to-foreground/50 bg-clip-text text-transparent tracking-tighter">
                {mockWeather.temp}°
              </h1>
              <Cloud className="absolute -top-4 -right-12 w-24 h-24 text-primary/80 drop-shadow-lg animate-pulse" />
            </div>
            
            <p className="text-2xl font-medium text-foreground/80 mt-2">{mockWeather.condition}</p>
            
            <div className="flex gap-8 mt-8 w-full max-w-sm justify-center">
              <div className="glass-card rounded-2xl p-4 flex flex-col items-center flex-1">
                <Wind className="w-6 h-6 text-blue-500 mb-2" />
                <span className="text-sm text-muted-foreground">Shamol</span>
                <span className="font-bold">{mockWeather.wind} km/s</span>
              </div>
              <div className="glass-card rounded-2xl p-4 flex flex-col items-center flex-1">
                <Droplets className="w-6 h-6 text-blue-400 mb-2" />
                <span className="text-sm text-muted-foreground">Namlik</span>
                <span className="font-bold">{mockWeather.humidity}%</span>
              </div>
              <div className="glass-card rounded-2xl p-4 flex flex-col items-center flex-1">
                <Thermometer className="w-6 h-6 text-orange-500 mb-2" />
                <span className="text-sm text-muted-foreground">Sezilishi</span>
                <span className="font-bold">{mockWeather.feelsLike}°</span>
              </div>
            </div>
          </motion.div>

          {/* Hourly Forecast Scroll */}
          <div className="mb-8">
            <div className="flex justify-between items-end mb-4 px-2">
              <h3 className="font-display font-semibold text-xl">Soatlik prognoz</h3>
              <span className="text-sm text-primary font-medium cursor-pointer">Barchasi</span>
            </div>
            
            <ScrollArea className="w-full whitespace-nowrap pb-4">
              <div className="flex gap-4 px-2">
                {mockWeather.hourly.map((hour, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="glass-card rounded-3xl p-4 min-w-[80px] flex flex-col items-center gap-3 hover:bg-white/60 cursor-pointer"
                  >
                    <span className="text-sm font-medium">{hour.time}</span>
                    <hour.icon className="w-8 h-8 text-foreground/80" />
                    <span className="text-lg font-bold">{hour.temp}°</span>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Daily Forecast List */}
          <div className="glass-panel rounded-3xl p-6">
            <h3 className="font-display font-semibold text-xl mb-4">Haftalik prognoz</h3>
            <div className="space-y-4">
              {mockWeather.daily.map((day, i) => (
                <div key={i} className="flex items-center justify-between border-b border-border/50 last:border-0 pb-4 last:pb-0">
                  <span className="font-medium w-24">{day.day}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <CloudRain className="w-5 h-5" />
                    <span className="text-sm">{day.condition}</span>
                  </div>
                  <span className="font-bold text-lg">{day.temp}°</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
