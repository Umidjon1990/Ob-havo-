# Railway'ga Deploy Qilish

## 1-Qadam: Railway'da yangi loyiha yarating
1. https://railway.app ga kiring
2. "New Project" bosing
3. "Deploy from GitHub repo" tanlang (yoki "Empty Project")

## 2-Qadam: Environment Variables (Muhit O'zgaruvchilari)
Railway dashboard'da quyidagi o'zgaruvchilarni qo'shing:

| O'zgaruvchi | Qiymat |
|-------------|--------|
| `DATABASE_URL` | Railway PostgreSQL URL (Railway'dan PostgreSQL qo'shing) |
| `TELEGRAM_BOT_TOKEN` | Sizning Telegram bot tokeningiz |
| `OPENAI_API_KEY` | OpenAI API kalitingiz |
| `NODE_ENV` | `production` |
| `APP_URL` | Sizning Railway URL (masalan: `https://your-app.up.railway.app`) |

## 3-Qadam: PostgreSQL qo'shish
1. Railway loyihangizda "New" -> "Database" -> "PostgreSQL" bosing
2. DATABASE_URL avtomatik ulanadi

## 4-Qadam: Deploy
Agar GitHub'dan deploy qilsangiz - avtomatik bo'ladi.
Agar qo'lda deploy qilsangiz:
```bash
railway login
railway link
railway up
```

## 5-Qadam: Telegram Webhook sozlash
Deploy bo'lgandan keyin, ilovangiz URL'ini oling (masalan: https://your-app.up.railway.app)
Keyin /admin sahifasiga kirib webhook'ni sozlang.

## Muhim eslatmalar:
- Railway PostgreSQL bepul tier'da 500MB limit bor
- Hobby plan $5/oy
- Ilovangiz juda yengil, $5/oy yetarli
