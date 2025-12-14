import { Cloud, Sun, CloudRain, CloudLightning, CloudSnow, Wind } from "lucide-react";

export interface Region {
  id: string;
  name_ar: string;
  name_uz: string;
  temp: number;
  condition_ar: string;
  condition_uz: string;
  icon: any;
  color: string;
  humidity: number;
  wind: number;
  pressure: number;
  hourly: { time: string; temp: number; icon: any }[];
}

const generateHourly = (baseTemp: number) => {
  return Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    temp: baseTemp + Math.floor(Math.random() * 4 - 2),
    icon: i > 6 && i < 19 ? Cloud : CloudSnow
  }));
};

// December 2024 - Winter temperatures for Uzbekistan
export const regions: Region[] = [
  { 
    id: "nukus", 
    name_ar: "نُوكُوس", 
    name_uz: "Nukus", 
    temp: -2, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-indigo-500", 
    humidity: 75, 
    wind: 12,
    pressure: 758,
    hourly: generateHourly(-2)
  },
  { 
    id: "urganch", 
    name_ar: "أُورْجِينْتْش", 
    name_uz: "Urganch", 
    temp: 0, 
    condition_ar: "بَارِد", 
    condition_uz: "Sovuq", 
    icon: Cloud, 
    color: "bg-blue-500", 
    humidity: 70, 
    wind: 10,
    pressure: 760,
    hourly: generateHourly(0)
  },
  { 
    id: "navoiy", 
    name_ar: "نَوَاوِي", 
    name_uz: "Navoiy", 
    temp: 3, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-cyan-500", 
    humidity: 65, 
    wind: 8,
    pressure: 755,
    hourly: generateHourly(3)
  },
  { 
    id: "buxoro", 
    name_ar: "بُخَارَى", 
    name_uz: "Buxoro", 
    temp: 5, 
    condition_ar: "صَافِي", 
    condition_uz: "Ochiq", 
    icon: Sun, 
    color: "bg-teal-500", 
    humidity: 60, 
    wind: 6,
    pressure: 752,
    hourly: generateHourly(5)
  },
  { 
    id: "samarqand", 
    name_ar: "سَمَرْقَنْد", 
    name_uz: "Samarqand", 
    temp: 2, 
    condition_ar: "غَائِم جُزْئِيّاً", 
    condition_uz: "Biroz bulutli", 
    icon: Cloud, 
    color: "bg-emerald-500", 
    humidity: 70, 
    wind: 5,
    pressure: 750,
    hourly: generateHourly(2)
  },
  { 
    id: "qarshi", 
    name_ar: "قَرْشِي", 
    name_uz: "Qarshi", 
    temp: 6, 
    condition_ar: "صَافِي", 
    condition_uz: "Ochiq", 
    icon: Sun, 
    color: "bg-lime-500", 
    humidity: 55, 
    wind: 10,
    pressure: 748,
    hourly: generateHourly(6)
  },
  { 
    id: "termiz", 
    name_ar: "تِرْمِذ", 
    name_uz: "Termiz", 
    temp: 10, 
    condition_ar: "صَافِي", 
    condition_uz: "Ochiq", 
    icon: Sun, 
    color: "bg-yellow-500", 
    humidity: 50, 
    wind: 8,
    pressure: 745,
    hourly: generateHourly(10)
  },
  { 
    id: "jizzax", 
    name_ar: "جِيزَاك", 
    name_uz: "Jizzax", 
    temp: 1, 
    condition_ar: "ثَلْج", 
    condition_uz: "Qor", 
    icon: CloudSnow, 
    color: "bg-orange-500", 
    humidity: 80, 
    wind: 15,
    pressure: 755,
    hourly: generateHourly(1)
  },
  { 
    id: "guliston", 
    name_ar: "جُولِيسْتَان", 
    name_uz: "Guliston", 
    temp: 2, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-red-500", 
    humidity: 75, 
    wind: 12,
    pressure: 758,
    hourly: generateHourly(2)
  },
  { 
    id: "toshkent", 
    name_ar: "طَشْقَنْد", 
    name_uz: "Toshkent", 
    temp: 4, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-pink-500", 
    humidity: 72, 
    wind: 6,
    pressure: 760,
    hourly: generateHourly(4)
  },
  { 
    id: "namangan", 
    name_ar: "نَمَنْغَان", 
    name_uz: "Namangan", 
    temp: 0, 
    condition_ar: "ثَلْج", 
    condition_uz: "Qor", 
    icon: CloudSnow, 
    color: "bg-purple-500", 
    humidity: 85, 
    wind: 4,
    pressure: 759,
    hourly: generateHourly(0)
  },
  { 
    id: "andijon", 
    name_ar: "أَنْدِيجَان", 
    name_uz: "Andijon", 
    temp: 1, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-violet-500", 
    humidity: 78, 
    wind: 5,
    pressure: 757,
    hourly: generateHourly(1)
  },
  { 
    id: "fargona", 
    name_ar: "فَرْغَانَة", 
    name_uz: "Farg'ona", 
    temp: 2, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-fuchsia-500", 
    humidity: 76, 
    wind: 7,
    pressure: 756,
    hourly: generateHourly(2)
  },
];
