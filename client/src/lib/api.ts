// API utility functions for fetching data from backend

export async function fetchWeather(regionId: string) {
  try {
    const response = await fetch(`/api/weather/${regionId}`);
    if (!response.ok) throw new Error('Failed to fetch weather');
    return await response.json();
  } catch (error) {
    console.error('Error fetching weather:', error);
    return null;
  }
}

export async function fetchWeatherAdvice(region: string, temperature: number, condition: string, lang: 'ar' | 'uz') {
  try {
    const response = await fetch('/api/weather/advice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ region, temperature, condition, lang }),
    });
    if (!response.ok) throw new Error('Failed to fetch advice');
    const data = await response.json();
    return data.advice;
  } catch (error) {
    console.error('Error fetching advice:', error);
    return lang === 'ar' 
      ? "مَهْمَا كَان الطَّقْس الْيَوْم، حَافِظ عَلَى مِزَاجِك رَائِعاً!"
      : "Bugungi ob-havo qanday bo'lishidan qat'iy nazar, kayfiyatingizni a'lo darajada saqlang!";
  }
}

export async function fetchVocabularyExample(word: string, translation: string, lang: 'ar' | 'uz') {
  try {
    const response = await fetch('/api/vocabulary/example', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, translation, lang }),
    });
    if (!response.ok) throw new Error('Failed to fetch example');
    const data = await response.json();
    return data.example;
  } catch (error) {
    console.error('Error fetching example:', error);
    return '';
  }
}

export async function setupTelegramWebhook() {
  try {
    const response = await fetch('/api/telegram/setup-webhook', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error setting up webhook:', error);
    return null;
  }
}

export async function getBotSettings() {
  try {
    const response = await fetch('/api/bot-settings');
    return await response.json();
  } catch (error) {
    console.error('Error fetching bot settings:', error);
    return null;
  }
}

export async function updateBotSettings(settings: any) {
  try {
    const response = await fetch('/api/bot-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return await response.json();
  } catch (error) {
    console.error('Error updating bot settings:', error);
    return null;
  }
}

export async function testChannelMessage(channelId: string) {
  try {
    const response = await fetch('/api/telegram/test-channel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error testing channel:', error);
    return null;
  }
}
