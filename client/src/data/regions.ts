// Full 12 Regions + Karakalpakstan
// Coordinates adjusted for Mercator projection (SVG viewbox 1000x652)
import { Cloud, Sun, CloudRain } from "lucide-react";

export const regions = [
  { id: "nukus", name: "نوكوس", temp: 22, condition: "مشمس", icon: Sun, x: 22.7, y: 25.5, color: "bg-indigo-500", humidity: 30, wind: 15 },
  { id: "urganch", name: "أورجينتش", temp: 24, condition: "صافي", icon: Sun, x: 28.5, y: 50.0, color: "bg-blue-500", humidity: 35, wind: 12 },
  { id: "navoiy", name: "نواوي", temp: 25, condition: "غائم", icon: Cloud, x: 49.7, y: 42.0, color: "bg-cyan-500", humidity: 40, wind: 10 },
  { id: "buxoro", name: "بخارى", temp: 27, condition: "حار", icon: Sun, x: 46.0, y: 65.9, color: "bg-teal-500", humidity: 25, wind: 8 },
  { id: "samarqand", name: "سمرقند", temp: 23, condition: "غائم", icon: Cloud, x: 60.1, y: 68.1, color: "bg-emerald-500", humidity: 45, wind: 5 },
  { id: "qarshi", name: "قرشي", temp: 28, condition: "حار", icon: Sun, x: 58.9, y: 79.2, color: "bg-lime-500", humidity: 20, wind: 14 },
  { id: "termiz", name: "ترمز", temp: 30, condition: "حار جداً", icon: Sun, x: 65.3, y: 87.7, color: "bg-yellow-500", humidity: 15, wind: 10 },
  { id: "jizzax", name: "جيزك", temp: 22, condition: "ممطر", icon: CloudRain, x: 65.8, y: 61.0, color: "bg-orange-500", humidity: 60, wind: 18 },
  { id: "guliston", name: "جوليستان", temp: 23, condition: "غائم", icon: Cloud, x: 72.6, y: 61.3, color: "bg-red-500", humidity: 55, wind: 12 },
  { id: "toshkent", name: "طشقند", temp: 21, condition: "ممطر", icon: CloudRain, x: 74.8, y: 52.0, color: "bg-pink-500", humidity: 65, wind: 8 },
  { id: "namangan", name: "نمنكان", temp: 20, condition: "ممطر", icon: CloudRain, x: 85.6, y: 56.4, color: "bg-purple-500", humidity: 70, wind: 6 },
  { id: "andijon", name: "أنديجان", temp: 21, condition: "غائم", icon: Cloud, x: 91.3, y: 57.3, color: "bg-violet-500", humidity: 68, wind: 7 },
  { id: "fargona", name: "فرغانة", temp: 22, condition: "غائم", icon: Cloud, x: 86.8, y: 60.9, color: "bg-fuchsia-500", humidity: 65, wind: 9 },
];
