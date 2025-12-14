import { useState } from "react";
import { ArrowLeft, Calendar, Cloud, CloudRain, Sun, Wind, Droplets, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import heroBg from "@assets/generated_images/clean_modern_blue_sky_weather_background_with_soft_clouds.png";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Mock Weekly Data
const weeklyForecast = [
  { day: "Dushanba", shortDay: "Dush", date: "15 Dek", tempHigh: 24, tempLow: 14, condition: "Quyoshli", icon: Sun },
  { day: "Seshanba", shortDay: "Sesh", date: "16 Dek", tempHigh: 22, tempLow: 13, condition: "Bulutli", icon: Cloud },
  { day: "Chorshanba", shortDay: "Chor", date: "17 Dek", tempHigh: 20, tempLow: 12, condition: "Yomg'ir", icon: CloudRain },
  { day: "Payshanba", shortDay: "Pay", date: "18 Dek", tempHigh: 18, tempLow: 10, condition: "Yomg'ir", icon: CloudRain },
  { day: "Juma", shortDay: "Juma", date: "19 Dek", tempHigh: 21, tempLow: 11, condition: "Bulutli", icon: Cloud },
  { day: "Shanba", shortDay: "Shan", date: "20 Dek", tempHigh: 23, tempLow: 12, condition: "Quyoshli", icon: Sun },
  { day: "Yakshanba", shortDay: "Yak", date: "21 Dek", tempHigh: 25, tempLow: 14, condition: "Ochiq", icon: Sun },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-panel p-2 rounded-lg border-none shadow-sm">
        <p className="text-xs font-bold">{label}</p>
        <p className="text-xs text-primary">{`${payload[0].value}°`}</p>
      </div>
    );
  }
  return null;
};

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
        <div className="flex items-center gap-4 mb-6">
          <Link href="/">
            <Button variant="ghost" size="icon" className="rounded-full hover:bg-black/5 bg-white/40 backdrop-blur-md">
              <ArrowLeft className="w-6 h-6 text-foreground" />
            </Button>
          </Link>
          <h1 className="text-2xl font-display font-bold text-foreground">Haftalik Prognoz</h1>
        </div>

        {/* Temperature Chart */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mb-6 h-48 w-full glass-card rounded-3xl p-4 border-white/50"
        >
          <div className="flex items-center gap-2 mb-2 px-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-muted-foreground">Harorat Dinamikasi</span>
          </div>
          <div className="h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyForecast}>
                <defs>
                  <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="shortDay" tick={{fontSize: 10}} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 1, strokeDasharray: '3 3' }} />
                <Area 
                  type="monotone" 
                  dataKey="tempHigh" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorTemp)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Forecast List */}
        <ScrollArea className="flex-1 -mx-4 px-4">
          <div className="space-y-3 pb-8">
            {weeklyForecast.map((day, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 + 0.2 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="glass-panel rounded-2xl p-4 flex items-center justify-between border border-white/40 hover:bg-white/60 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-4">
                  <div className={`
                    w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm
                    ${day.condition === "Quyoshli" || day.condition === "Ochiq" ? "bg-orange-100 text-orange-500" : 
                      day.condition === "Yomg'ir" ? "bg-blue-100 text-blue-500" : "bg-gray-100 text-gray-500"}
                  `}>
                    <day.icon className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{day.day}</h3>
                    <p className="text-xs text-muted-foreground font-medium">{day.date} • {day.condition}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="text-lg font-bold">{day.tempHigh}°</span>
                        <span className="text-xs text-muted-foreground">{day.tempLow}°</span>
                    </div>
                    {/* Visual bar for temp range */}
                    <div className="h-10 w-1 bg-gray-200 rounded-full relative overflow-hidden">
                        <div 
                          className="absolute bottom-0 w-full bg-primary/60 rounded-full"
                          style={{ 
                            height: `${((day.tempHigh - day.tempLow) / 20) * 100}%`,
                            bottom: `${((day.tempLow - 10) / 20) * 100}%` 
                          }} 
                        />
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
