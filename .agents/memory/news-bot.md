---
name: Daily Arabic News Bot
description: Architecture of the daily Arabic tech/science news feature sent via Telegram
---

## Design

- Separate `news_channels` DB table (not reusing `channels`) — allows independent enable/disable, scheduling, and last_sent tracking from weather channels.
- Scheduler runs every 60s checking O'zbekiston time (UTC+5). Sends once per day per channel at `scheduledTime`.
- `server/lib/news.ts` — generates news + image prompt via GPT-5, generates image via DALL-E 3, formats caption.
- `sendDailyNewsToChannel()` in `telegram.ts` — tries sendPhoto (multipart FormData with Buffer), falls back to sendMessage if image generation fails.

## Format
Arabic text (50-70 words, fusha + harakat) → Uzbek translation → 3 useful phrases. Posted as Telegram photo with HTML caption.

**Why separate table:** News and weather channels may differ; admins may want news on some channels but not weather, and vice versa.

**Why:**
- DALL-E 3 URL expires ~1hr after generation, so image must be downloaded immediately and uploaded as a buffer via multipart/form-data — do NOT store or reuse the URL.
- GPT-5 is the correct model name (released August 2025); do not change unless explicitly requested.
- Replit AI Integrations proxy is used (AI_INTEGRATIONS_OPENAI_BASE_URL + AI_INTEGRATIONS_OPENAI_API_KEY).

## Admin UI
"Arabcha Yangiliklar Boti" card in `/admin` page. Has: add channel, per-channel enable/disable switch, scheduled time input, "Hozir yuborish" button (calls `/api/news-channels/:chatId/send-now`).
