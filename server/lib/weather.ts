import { storage } from "../storage";

const cityCoordinates: Record<string, { lat: number; lon: number; name_uz: string; name_ar: string }> = {
  toshkent: { lat: 41.2995, lon: 69.2401, name_uz: "Toshkent", name_ar: "طَشْقَنْد" },
  samarqand: { lat: 39.6270, lon: 66.9750, name_uz: "Samarqand", name_ar: "سَمَرْقَنْد" },
  buxoro: { lat: 39.7675, lon: 64.4224, name_uz: "Buxoro", name_ar: "بُخَارَى" },
  andijon: { lat: 40.7821, lon: 72.3442, name_uz: "Andijon", name_ar: "أَنْدِيجَان" },
  namangan: { lat: 40.9983, lon: 71.6726, name_uz: "Namangan", name_ar: "نَمَنْغَان" },
  fargona: { lat: 40.3864, lon: 71.7864, name_uz: "Farg'ona", name_ar: "فَرْغَانَة" },
  nukus: { lat: 42.4531, lon: 59.6103, name_uz: "Nukus", name_ar: "نُوكُوس" },
  qarshi: { lat: 38.8606, lon: 65.7975, name_uz: "Qarshi", name_ar: "قَرْشِي" },
  urganch: { lat: 41.5500, lon: 60.6333, name_uz: "Urganch", name_ar: "أُورْجِينْتْش" },
  jizzax: { lat: 40.1158, lon: 67.8422, name_uz: "Jizzax", name_ar: "جِيزَاك" },
  navoiy: { lat: 40.0844, lon: 65.3792, name_uz: "Navoiy", name_ar: "نَوَاوِي" },
  guliston: { lat: 40.4897, lon: 68.7840, name_uz: "Guliston", name_ar: "جُولِيسْتَان" },
  termiz: { lat: 37.2242, lon: 67.2783, name_uz: "Termiz", name_ar: "تِرْمِذ" }
};

const weatherCodeToCondition: Record<number, { uz: string; ar: string }> = {
  0: { uz: "Ochiq", ar: "صَافِي" },
  1: { uz: "Asosan ochiq", ar: "صَافِي غَالِباً" },
  2: { uz: "Biroz bulutli", ar: "غَائِم جُزْئِيّاً" },
  3: { uz: "Bulutli", ar: "غَائِم" },
  45: { uz: "Tuman", ar: "ضَبَاب" },
  48: { uz: "Qirov tuman", ar: "ضَبَاب صَقِيع" },
  51: { uz: "Yengil yomg'ir", ar: "رَذَاذ خَفِيف" },
  53: { uz: "Yomg'ir", ar: "رَذَاذ" },
  55: { uz: "Kuchli yomg'ir", ar: "رَذَاذ كَثِيف" },
  61: { uz: "Yengil yomg'ir", ar: "مَطَر خَفِيف" },
  63: { uz: "Yomg'ir", ar: "مَطَر" },
  65: { uz: "Kuchli yomg'ir", ar: "مَطَر غَزِير" },
  71: { uz: "Yengil qor", ar: "ثَلْج خَفِيف" },
  73: { uz: "Qor", ar: "ثَلْج" },
  75: { uz: "Kuchli qor", ar: "ثَلْج كَثِيف" },
  77: { uz: "Qor donalari", ar: "حُبَيْبَات ثَلْج" },
  80: { uz: "Yengil yog'in", ar: "زَخَّات خَفِيفَة" },
  81: { uz: "Yog'in", ar: "زَخَّات" },
  82: { uz: "Kuchli yog'in", ar: "زَخَّات غَزِيرَة" },
  85: { uz: "Yengil qor yog'ishi", ar: "زَخَّات ثَلْج خَفِيفَة" },
  86: { uz: "Kuchli qor yog'ishi", ar: "زَخَّات ثَلْج كَثِيفَة" },
  95: { uz: "Momaqaldiroq", ar: "عَاصِفَة رَعْدِيَّة" },
  96: { uz: "Do'l bilan momaqaldiroq", ar: "عَاصِفَة رَعْدِيَّة مَعَ بَرَد" },
  99: { uz: "Kuchli do'l", ar: "بَرَد شَدِيد" }
};

function getConditionFromCode(code: number): { uz: string; ar: string } {
  return weatherCodeToCondition[code] || { uz: "Noma'lum", ar: "غَيْر مَعْرُوف" };
}

interface OpenMeteoResponse {
  current_weather: {
    temperature: number;
    windspeed: number;
    weathercode: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    relativehumidity_2m: number[];
    surface_pressure: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    weathercode: number[];
  };
}

async function fetchWeatherForCity(regionId: string): Promise<{
  temperature: number;
  condition_uz: string;
  condition_ar: string;
  humidity: number;
  windSpeed: number;
  pressure: number;
  hourlyData: { time: string; temp: number }[];
  dailyForecast: { date: string; max: number; min: number; code: number }[];
} | null> {
  const coords = cityCoordinates[regionId];
  if (!coords) return null;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&hourly=temperature_2m,relativehumidity_2m,surface_pressure&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia/Tashkent`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch weather for ${regionId}: ${response.status}`);
      return null;
    }

    const data: OpenMeteoResponse = await response.json();
    const condition = getConditionFromCode(data.current_weather.weathercode);
    
    const now = new Date();
    const currentHour = now.getHours();
    
    const hourlyData = data.hourly.time.slice(currentHour, currentHour + 24).map((time, i) => ({
      time: new Date(time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(data.hourly.temperature_2m[currentHour + i])
    }));

    const dailyForecast = data.daily.time.map((date, i) => ({
      date,
      max: Math.round(data.daily.temperature_2m_max[i]),
      min: Math.round(data.daily.temperature_2m_min[i]),
      code: data.daily.weathercode[i]
    }));

    return {
      temperature: Math.round(data.current_weather.temperature),
      condition_uz: condition.uz,
      condition_ar: condition.ar,
      humidity: Math.round(data.hourly.relativehumidity_2m[currentHour] || 60),
      windSpeed: Math.round(data.current_weather.windspeed),
      pressure: Math.round((data.hourly.surface_pressure[currentHour] || 1013) * 0.75), // Convert hPa to mmHg
      hourlyData,
      dailyForecast
    };
  } catch (error) {
    console.error(`Error fetching weather for ${regionId}:`, error);
    return null;
  }
}

export async function updateWeatherCache() {
  console.log("Updating weather cache with real data from Open-Meteo...");
  
  try {
    const regionIds = Object.keys(cityCoordinates);
    
    for (const regionId of regionIds) {
      const weather = await fetchWeatherForCity(regionId);
      
      if (weather) {
        await storage.upsertWeatherCache({
          regionId,
          temperature: weather.temperature,
          condition: weather.condition_uz,
          humidity: weather.humidity,
          windSpeed: weather.windSpeed,
          pressure: weather.pressure,
          forecastData: JSON.stringify({
            hourly: weather.hourlyData,
            daily: weather.dailyForecast,
            condition_ar: weather.condition_ar
          }),
        });
        console.log(`✓ ${regionId}: ${weather.temperature}°C, ${weather.condition_uz}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log("Weather cache updated successfully with real data!");
  } catch (error) {
    console.error("Failed to update weather cache:", error);
  }
}

export function startWeatherUpdateSchedule() {
  updateWeatherCache();
  setInterval(updateWeatherCache, 30 * 60 * 1000);
}

export { cityCoordinates, getConditionFromCode };
