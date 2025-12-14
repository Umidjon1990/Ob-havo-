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
    temp: baseTemp + Math.floor(Math.random() * 5 - 2),
    icon: i > 6 && i < 19 ? Sun : Cloud
  }));
};

export const regions: Region[] = [
  { 
    id: "nukus", 
    name_ar: "نُوكُوس", 
    name_uz: "Nukus", 
    temp: 22, 
    condition_ar: "مُشْمِس", 
    condition_uz: "Quyoshli", 
    icon: Sun, 
    color: "bg-indigo-500", 
    humidity: 30, 
    wind: 15,
    pressure: 758,
    hourly: generateHourly(22)
  },
  { 
    id: "urganch", 
    name_ar: "أُورْجِينْتْش", 
    name_uz: "Urganch", 
    temp: 24, 
    condition_ar: "صَافِي", 
    condition_uz: "Ochiq", 
    icon: Sun, 
    color: "bg-blue-500", 
    humidity: 35, 
    wind: 12,
    pressure: 760,
    hourly: generateHourly(24)
  },
  { 
    id: "navoiy", 
    name_ar: "نَوَاوِي", 
    name_uz: "Navoiy", 
    temp: 25, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-cyan-500", 
    humidity: 40, 
    wind: 10,
    pressure: 755,
    hourly: generateHourly(25)
  },
  { 
    id: "buxoro", 
    name_ar: "بُخَارَى", 
    name_uz: "Buxoro", 
    temp: 27, 
    condition_ar: "حَارّ", 
    condition_uz: "Issiq", 
    icon: Sun, 
    color: "bg-teal-500", 
    humidity: 25, 
    wind: 8,
    pressure: 752,
    hourly: generateHourly(27)
  },
  { 
    id: "samarqand", 
    name_ar: "سَمَرْقَنْد", 
    name_uz: "Samarqand", 
    temp: 23, 
    condition_ar: "غَائِم جُزْئِيّاً", 
    condition_uz: "Biroz bulutli", 
    icon: Cloud, 
    color: "bg-emerald-500", 
    humidity: 45, 
    wind: 5,
    pressure: 750,
    hourly: generateHourly(23)
  },
  { 
    id: "qarshi", 
    name_ar: "قَرْشِي", 
    name_uz: "Qarshi", 
    temp: 28, 
    condition_ar: "حَارّ", 
    condition_uz: "Issiq", 
    icon: Sun, 
    color: "bg-lime-500", 
    humidity: 20, 
    wind: 14,
    pressure: 748,
    hourly: generateHourly(28)
  },
  { 
    id: "termiz", 
    name_ar: "تِرْمِذ", 
    name_uz: "Termiz", 
    temp: 30, 
    condition_ar: "حَارّ جِدّاً", 
    condition_uz: "Juda issiq", 
    icon: Sun, 
    color: "bg-yellow-500", 
    humidity: 15, 
    wind: 10,
    pressure: 745,
    hourly: generateHourly(30)
  },
  { 
    id: "jizzax", 
    name_ar: "جِيزَاك", 
    name_uz: "Jizzax", 
    temp: 22, 
    condition_ar: "مُمْطِر", 
    condition_uz: "Yomg'ir", 
    icon: CloudRain, 
    color: "bg-orange-500", 
    humidity: 60, 
    wind: 18,
    pressure: 755,
    hourly: generateHourly(22)
  },
  { 
    id: "guliston", 
    name_ar: "جُولِيسْتَان", 
    name_uz: "Guliston", 
    temp: 23, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-red-500", 
    humidity: 55, 
    wind: 12,
    pressure: 758,
    hourly: generateHourly(23)
  },
  { 
    id: "toshkent", 
    name_ar: "طَشْقَنْد", 
    name_uz: "Toshkent", 
    temp: 21, 
    condition_ar: "مُمْطِر", 
    condition_uz: "Yomg'ir", 
    icon: CloudRain, 
    color: "bg-pink-500", 
    humidity: 65, 
    wind: 8,
    pressure: 760,
    hourly: generateHourly(21)
  },
  { 
    id: "namangan", 
    name_ar: "نَمَنْغَان", 
    name_uz: "Namangan", 
    temp: 20, 
    condition_ar: "مُمْطِر بَغْزَارَة", 
    condition_uz: "Kuchli yomg'ir", 
    icon: CloudRain, 
    color: "bg-purple-500", 
    humidity: 70, 
    wind: 6,
    pressure: 759,
    hourly: generateHourly(20)
  },
  { 
    id: "andijon", 
    name_ar: "أَنْدِيجَان", 
    name_uz: "Andijon", 
    temp: 21, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-violet-500", 
    humidity: 68, 
    wind: 7,
    pressure: 757,
    hourly: generateHourly(21)
  },
  { 
    id: "fargona", 
    name_ar: "فَرْغَانَة", 
    name_uz: "Farg'ona", 
    temp: 22, 
    condition_ar: "غَائِم", 
    condition_uz: "Bulutli", 
    icon: Cloud, 
    color: "bg-fuchsia-500", 
    humidity: 65, 
    wind: 9,
    pressure: 756,
    hourly: generateHourly(22)
  },
];
