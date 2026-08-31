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

export interface Channel {
  id: string;
  chatId: string;
  title: string | null;
  type: string | null;
  enabled: boolean | null;
  createdAt: string | null;
  scheduledTime: string | null;
  lastSentAt: string | null;
}

export async function getChannels(): Promise<Channel[]> {
  try {
    const response = await fetch('/api/channels');
    return await response.json();
  } catch (error) {
    console.error('Error fetching channels:', error);
    return [];
  }
}

export async function addChannel(chatId: string, title: string, type: string = 'channel'): Promise<Channel | null> {
  try {
    const response = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, title, type }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding channel:', error);
    return null;
  }
}

export async function removeChannel(chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/channels/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error('Error removing channel:', error);
    return false;
  }
}

export async function toggleChannel(chatId: string, enabled: boolean): Promise<Channel | null> {
  try {
    const response = await fetch(`/api/channels/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error toggling channel:', error);
    return null;
  }
}

export async function updateChannelSchedule(chatId: string, scheduledTime: string): Promise<Channel | null> {
  try {
    const response = await fetch(`/api/channels/${encodeURIComponent(chatId)}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledTime }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error('Error updating schedule:', error);
    return null;
  }
}

export async function refreshWeatherData(): Promise<{ success: boolean; message: string } | null> {
  try {
    const response = await fetch('/api/weather/refresh', {
      method: 'POST',
    });
    return await response.json();
  } catch (error) {
    console.error('Error refreshing weather:', error);
    return null;
  }
}

export interface GeneratedWord {
  ar: string;
  uz: string;
  context: string;
}

export async function generateNewVocabulary(count: number = 5): Promise<GeneratedWord[]> {
  try {
    const response = await fetch('/api/vocabulary/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
    const data = await response.json();
    return data.words || [];
  } catch (error) {
    console.error('Error generating vocabulary:', error);
    return [];
  }
}

export interface NewsChannel {
  id: string;
  chatId: string;
  title: string | null;
  enabled: boolean | null;
  scheduledTime: string | null;
  lastSentAt: string | null;
  createdAt: string | null;
}

export async function getNewsChannels(): Promise<NewsChannel[]> {
  try {
    const response = await fetch('/api/news-channels');
    return await response.json();
  } catch (error) {
    console.error('Error fetching news channels:', error);
    return [];
  }
}

export async function addNewsChannel(chatId: string, title: string): Promise<NewsChannel | null> {
  try {
    const response = await fetch('/api/news-channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chatId, title }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error adding news channel:', error);
    return null;
  }
}

export async function removeNewsChannel(chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/news-channels/${encodeURIComponent(chatId)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (error) {
    console.error('Error removing news channel:', error);
    return false;
  }
}

export async function toggleNewsChannel(chatId: string, enabled: boolean): Promise<NewsChannel | null> {
  try {
    const response = await fetch(`/api/news-channels/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return await response.json();
  } catch (error) {
    console.error('Error toggling news channel:', error);
    return null;
  }
}

export async function updateNewsChannelSchedule(chatId: string, scheduledTime: string): Promise<NewsChannel | null> {
  try {
    const response = await fetch(`/api/news-channels/${encodeURIComponent(chatId)}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledTime }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    console.error('Error updating news schedule:', error);
    return null;
  }
}

export async function sendNewsNow(chatId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/news-channels/${encodeURIComponent(chatId)}/send-now`, {
      method: 'POST',
    });
    const data = await response.json();
    if (response.ok) return { ok: true };
    return { ok: false, error: data.error || 'Yuborishda xatolik' };
  } catch (error) {
    console.error('Error sending news now:', error);
    return { ok: false, error: 'Tarmoq xatosi' };
  }
}

// ─── Listening Channels ───────────────────────────────────────────────────────

function adminHeaders(headers: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers;
}

export interface ListeningChannel {
  id: string;
  chatId: string;
  title: string | null;
  enabled: boolean | null;
  scheduledTime: string | null;
  scheduledDays: string | null;
  scheduledLevels: string | null;
  lastSentAt: string | null;
  currentLevel: string | null;
  maleVoiceId: string | null;
  femaleVoiceId: string | null;
  createdAt: string | null;
}

export interface VoiceProfile {
  voiceId: string;
  label: string;
  gender: "male" | "female" | "unknown";
}

export async function getListeningVoices(): Promise<VoiceProfile[]> {
  try {
    const response = await fetch('/api/listening-voices', { headers: adminHeaders() });
    return response.ok ? await response.json() : [];
  } catch {
    return [];
  }
}

export async function updateListeningVoice(voiceId: string, label: string, gender: VoiceProfile["gender"]): Promise<VoiceProfile | null> {
  try {
    const response = await fetch(`/api/listening-voices/${encodeURIComponent(voiceId)}`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ label, gender }),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function previewListeningVoice(voiceId: string): Promise<Blob | null> {
  try {
    const response = await fetch(`/api/listening-voices/${encodeURIComponent(voiceId)}/preview`, { method: 'POST', headers: adminHeaders() });
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

export async function getListeningChannels(): Promise<ListeningChannel[]> {
  try {
    const response = await fetch('/api/listening-channels', { headers: adminHeaders() });
    return await response.json();
  } catch (error) {
    return [];
  }
}

export async function addListeningChannel(chatId: string, title: string, scheduledTime: string, scheduledDays: number[] = [0, 1, 2, 3, 4, 5, 6]): Promise<ListeningChannel | null> {
  try {
    const response = await fetch('/api/listening-channels', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ chatId, title, scheduledTime, scheduledDays }),
    });
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function removeListeningChannel(chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}`, { method: 'DELETE', headers: adminHeaders() });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function toggleListeningChannel(chatId: string, enabled: boolean): Promise<ListeningChannel | null> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled }),
    });
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function updateListeningChannelSchedule(chatId: string, scheduledTime: string, scheduledLevels: Record<string, "A1A2" | "B1B2">): Promise<ListeningChannel | null> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}/schedule`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ scheduledTime, scheduledLevels }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function updateListeningChannelVoices(chatId: string, maleVoiceId: string | null, femaleVoiceId: string | null): Promise<ListeningChannel | null> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}/voices`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ maleVoiceId, femaleVoiceId }),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function updateListeningChannelLevel(chatId: string, level: "A1A2" | "B1B2"): Promise<ListeningChannel | null> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}/level`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ level }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function sendListeningNow(chatId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/listening-channels/${encodeURIComponent(chatId)}/send-now`, { method: 'POST', headers: adminHeaders() });
    const data = await response.json();
    if (response.ok) return { ok: true };
    return { ok: false, error: data.error || 'Yuborishda xatolik' };
  } catch (error) {
    return { ok: false, error: 'Tarmoq xatosi' };
  }
}

// ─── Reading Channels ─────────────────────────────────────────────────────────

export interface ReadingChannel {
  id: string;
  chatId: string;
  title: string | null;
  enabled: boolean | null;
  scheduledTime: string | null;
  scheduledDays: string | null;
  scheduledLevels: string | null;
  lastSentAt: string | null;
  currentLevel: string | null;
  createdAt: string | null;
}

export async function getReadingChannels(): Promise<ReadingChannel[]> {
  try {
    const response = await fetch('/api/reading-channels', { headers: adminHeaders() });
    return await response.json();
  } catch (error) {
    return [];
  }
}

export async function addReadingChannel(chatId: string, title: string, scheduledTime: string, scheduledDays: number[] = [0, 1, 2, 3, 4, 5, 6]): Promise<ReadingChannel | null> {
  try {
    const response = await fetch('/api/reading-channels', {
      method: 'POST',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ chatId, title, scheduledTime, scheduledDays }),
    });
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function removeReadingChannel(chatId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/reading-channels/${encodeURIComponent(chatId)}`, { method: 'DELETE', headers: adminHeaders() });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function toggleReadingChannel(chatId: string, enabled: boolean): Promise<ReadingChannel | null> {
  try {
    const response = await fetch(`/api/reading-channels/${encodeURIComponent(chatId)}`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ enabled }),
    });
    return await response.json();
  } catch (error) {
    return null;
  }
}

export async function updateReadingChannelSchedule(chatId: string, scheduledTime: string, scheduledLevels: Record<string, "A1A2" | "B1B2">): Promise<ReadingChannel | null> {
  try {
    const response = await fetch(`/api/reading-channels/${encodeURIComponent(chatId)}/schedule`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ scheduledTime, scheduledLevels }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function updateReadingChannelLevel(chatId: string, level: "A1A2" | "B1B2"): Promise<ReadingChannel | null> {
  try {
    const response = await fetch(`/api/reading-channels/${encodeURIComponent(chatId)}/level`, {
      method: 'PATCH',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ level }),
    });
    return response.ok ? await response.json() : null;
  } catch (error) {
    return null;
  }
}

export async function sendReadingNow(chatId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/reading-channels/${encodeURIComponent(chatId)}/send-now`, { method: 'POST', headers: adminHeaders() });
    const data = await response.json();
    if (response.ok) return { ok: true };
    return { ok: false, error: data.error || 'Yuborishda xatolik' };
  } catch (error) {
    return { ok: false, error: 'Tarmoq xatosi' };
  }
}

export interface LearningTest {
  id: string;
  contentType: "listening" | "reading";
  titleAr: string;
  titleUz: string;
  testDate: string;
  level: "A1A2" | "B1B2";
  channelTitle: string | null;
  createdAt: string | null;
  hasAudio: boolean;
}

export async function getLearningTests(filters: {
  contentType?: "listening" | "reading";
  level?: "A1A2" | "B1B2";
  topic?: string;
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<LearningTest[]> {
  try {
    const params = new URLSearchParams();
    if (filters.contentType) params.set("type", filters.contentType);
    if (filters.level) params.set("level", filters.level);
    if (filters.topic) params.set("topic", filters.topic);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    const response = await fetch(`/api/tests${params.toString() ? `?${params}` : ""}`);
    if (!response.ok) throw new Error("Failed to fetch learning tests");
    return await response.json();
  } catch (error) {
    console.error("Error fetching learning tests:", error);
    throw error;
  }
}

export async function exportLearningTests(
  ids: string[],
  format: "docx" | "pdf",
): Promise<Blob> {
  const response = await fetch("/api/tests/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, format }),
  });
  if (!response.ok) throw new Error("Failed to export learning tests");
  return response.blob();
}

// Admin authentication
export async function adminLogin(username: string, password: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return await response.json();
  } catch (error) {
    return { success: false, error: 'Tarmoq xatosi' };
  }
}

export async function verifyAdminToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return data.valid === true;
  } catch (error) {
    return false;
  }
}

export async function adminLogout(token: string): Promise<void> {
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch (error) {}
}
