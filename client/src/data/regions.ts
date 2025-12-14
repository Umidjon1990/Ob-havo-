// Full 12 Regions + Karakalpakstan
// Coordinates adjusted to be more accurate on the map
import { Cloud, Sun, CloudRain } from "lucide-react";

export const regions = [
  { id: "nukus", name: "Nukus", temp: 22, condition: "Quyoshli", icon: Sun, x: 20, y: 30, color: "bg-indigo-500" },
  { id: "urganch", name: "Urganch", temp: 24, condition: "Ochiq", icon: Sun, x: 25, y: 40, color: "bg-blue-500" },
  { id: "navoiy", name: "Navoiy", temp: 25, condition: "Bulutli", icon: Cloud, x: 45, y: 45, color: "bg-cyan-500" },
  { id: "buxoro", name: "Buxoro", temp: 27, condition: "Issiq", icon: Sun, x: 38, y: 55, color: "bg-teal-500" },
  { id: "samarqand", name: "Samarqand", temp: 23, condition: "Bulutli", icon: Cloud, x: 55, y: 52, color: "bg-emerald-500" },
  { id: "qarshi", name: "Qarshi", temp: 28, condition: "Issiq", icon: Sun, x: 50, y: 65, color: "bg-lime-500" },
  { id: "termiz", name: "Termiz", temp: 30, condition: "Juda issiq", icon: Sun, x: 58, y: 78, color: "bg-yellow-500" },
  { id: "jizzax", name: "Jizzax", temp: 22, condition: "Yomg'ir", icon: CloudRain, x: 62, y: 45, color: "bg-orange-500" },
  { id: "guliston", name: "Guliston", temp: 23, condition: "Bulutli", icon: Cloud, x: 68, y: 40, color: "bg-red-500" },
  { id: "toshkent", name: "Toshkent", temp: 21, condition: "Yomg'ir", icon: CloudRain, x: 75, y: 32, color: "bg-pink-500" },
  { id: "namangan", name: "Namangan", temp: 20, condition: "Yomg'ir", icon: CloudRain, x: 82, y: 28, color: "bg-purple-500" },
  { id: "andijon", name: "Andijon", temp: 21, condition: "Bulutli", icon: Cloud, x: 88, y: 35, color: "bg-violet-500" },
  { id: "fargona", name: "Farg'ona", temp: 22, condition: "Bulutli", icon: Cloud, x: 80, y: 42, color: "bg-fuchsia-500" },
];
