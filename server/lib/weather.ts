import { storage } from "../storage";
import { regions } from "../../client/src/data/regions";

// Mock weather service - can be replaced with Yandex Weather API
export async function updateWeatherCache() {
  try {
    for (const region of regions) {
      await storage.upsertWeatherCache({
        regionId: region.id,
        temperature: region.temp,
        condition: region.condition_uz,
        humidity: Math.floor(Math.random() * 30) + 40, // 40-70%
        windSpeed: Math.floor(Math.random() * 15) + 5, // 5-20 km/h
        pressure: region.pressure,
        forecastData: JSON.stringify([]), // Can add forecast data here
      });
    }
    console.log("Weather cache updated successfully");
  } catch (error) {
    console.error("Failed to update weather cache:", error);
  }
}

// Update weather data every 30 minutes
export function startWeatherUpdateSchedule() {
  updateWeatherCache(); // Initial update
  setInterval(updateWeatherCache, 30 * 60 * 1000); // Every 30 minutes
}
