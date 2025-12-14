import { useState } from "react";
import { ArrowLeft, Calendar, Cloud, CloudRain, Sun, Wind, Droplets } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";

// Mock Weekly Data
const weeklyForecast = [
  { day: "Dushanba", date: "15 Dek", tempHigh: 24, tempLow: 14, condition: "Quyoshli", icon: Sun },
  { day: "Seshanba", date: "16 Dek", tempHigh: 22, tempLow: 13, condition: "Bulutli", icon: Cloud },
  { day: "Chorshanba", date: "17 Dek", tempHigh: 20, tempLow: 12, condition: "Yomg'ir", icon: CloudRain },
  { day: "Payshanba", date: "18 Dek", tempHigh: 18, tempLow: 10, condition: "Yomg'ir", icon: CloudRain },
  { day: "Juma", date: "19 Dek", tempHigh: 21, tempLow: 11, condition: "Bulutli", icon: Cloud },
  { day: "Shanba", date: "20 Dek", tempHigh: 23, tempLow: 12, condition: "Quyoshli", icon: Sun },
  { day: "Yakshanba", date: "21 Dek", tempHigh: 25, tempLow: 14, condition: "Ochiq", icon: Sun },
];

export default function Forecast() {
  return (
    <div className="min-h-screen w-full relative overflow-hidden bg-background font-sans select-none">
      {/* Background */}
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
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-black/5">
              <ArrowLeft className="w-6 h-6 text-foreground" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">Haftalik Prognoz</h1>
        </div>

        {/* Forecast List */}
        <ScrollArea className="flex-1 pr-4 -mr-4">
          <div className="space-y-3 pb-6">
            {weeklyForecast.map((day, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="glass-card rounded-2xl p-4 flex items-center justify-between group hover:bg-white/80 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/50 flex items-center justify-center shadow-sm">
                    <day.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{day.day}</h3>
                    <p className="text-xs text-muted-foreground font-medium">{day.date}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="block text-lg font-bold">{day.tempHigh}°</span>
                        <span className="block text-xs text-muted-foreground">{day.tempLow}°</span>
                    </div>
                </div>
              </motion.div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
