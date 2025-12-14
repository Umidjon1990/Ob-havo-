import { Moon, Sun, Sunrise, Sunset } from "lucide-react";

const prayers = [
  { name: "Bomdod", time: "05:45", icon: Sunrise },
  { name: "Peshin", time: "12:30", icon: Sun },
  { name: "Asr", time: "16:15", icon: Sun },
  { name: "Shom", time: "18:50", icon: Sunset },
  { name: "Xufton", time: "20:15", icon: Moon },
];

export default function PrayerTimes() {
  return (
    <div className="w-full mb-6">
      <h3 className="font-display font-semibold text-lg mb-3 px-1 flex items-center gap-2">
        <Moon className="w-4 h-4 text-primary" /> Namoz Vaqtlari
      </h3>
      <div className="grid grid-cols-5 gap-2">
        {prayers.map((prayer, index) => (
          <div key={index} className="flex flex-col items-center gap-1 group">
            <div className="w-12 h-16 glass-card rounded-2xl flex flex-col items-center justify-center border-white/40 group-hover:bg-primary/10 transition-colors">
              <prayer.icon className="w-4 h-4 text-primary mb-1" />
              <span className="text-xs font-bold">{prayer.time}</span>
            </div>
            <span className="text-[10px] font-medium text-muted-foreground">{prayer.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
