# Audioli karusel

## Foydalanish

1. Media Agent → **Audioli karusel**. JPG/PNG rasmlarni va MP3 musiqani yuklang.
2. **Yangi karusel** orqali sarlavha, caption va 2–10 ta manba rasmni kerakli tartibda tanlab saqlang. Mavzu yoki til cheklovi yo‘q.
3. Karuselga MP3 tanlang. Musiqa boshlanishi, har slayd davomiyligi (3–60 soniya), ovoz balandligi va yumshoq kirish/chiqishni belgilang.
4. **Saqlash va tayyorlash** ni bosing. Sahifa yopilsa ham navbat davom etadi. MP3 kesmasi fayl davomiyligiga sig‘ishi kerak.
5. **Oldindan ko‘rish** da har bir videoli slaydni ovozi bilan tekshiring. Tayyor bo‘lgach **Vaqtni belgilash** orqali Instagram/Telegram hisobini va Toshkent vaqtidagi nashr sanasini tanlang.

Har bir rasm alohida 1080×1350 H.264/AAC MP4 ga aylanadi. Rasm chetlari kesilmaydi; boshqa nisbatdagi rasmlar qora fon bilan to‘ldiriladi. Tanlangan musiqa kesmasi **har slaydda qayta boshlanadi**. Bu video karusel; Instagram ilovasidagi musiqa katalogini foto-karuselga biriktirish yoki slaydlar orasida uzluksiz katalog musiqasi funksiyasi emas. Oldindan yuklangan MP3 ishlatiladi; yangi pulli generatsiya API chaqirilmaydi.

## Tizim

- `variants.carousel_audio`: MP3 ID, boshlanish, slayd davomiyligi, ovoz, fade.
- `variants.carousel_audio_output`: server yaratgan tartibli video ID lar va manba/sozlama kaliti. Mijoz yuborgan output metadata qabul qilinmaydi; rasmlar, tartib yoki musiqa sozlamalari o‘zgarsa eski natija bekor bo‘ladi.
- `media_jobs.kind = carousel_audio`: mavjud durable navbat. Post tayyorlanayotganda uni tahrirlash, o‘chirish va rejalash bloklanadi.
- Ishchi har 15 soniyada navbatni tekshiradi. Alohida advisory lock parallel replikalardan bitta renderni tanlaydi. 20 daqiqadan ortiq heartbeat olinmagan mahalliy ish tiklanadi; natija claim ID bilan atomik saqlanadi.
- Fayllar mavjud media kutubxonasi va signed public URLs orqali beriladi. Har bir video ≤50 MB, bitta render natijasi ≤100 MB; umumiy kutubxona limiti saqlanadi.
- Instagram video child containerlarini tayyor bo‘lishini kutadi, saqlangan ID larni qayta ishlatadi, keyin `CAROUSEL` parent yaratadi. Telegram `sendMediaGroup` video album yuboradi.
- Jadval va delivery retry/ambiguous-response himoyalari mavjud nashr navbatidan foydalanadi. YouTube karusel hisoblanmaydi.

## API

Barcha endpointlar mavjud admin session/Bearer va same-origin himoyasidan foydalanadi.

| Endpoint | Vazifa |
| --- | --- |
| `GET /api/media/posts/:id/carousel-audio` | Joriy natija tayyorligi va mos render holati |
| `PUT /api/media/posts/:id/carousel-audio` | `{audio: settings yoki null, updated_at: ISO}` bilan sozlamalarni saqlash |
| `POST /api/media/posts/:id/carousel-audio/render` | `{updated_at: ISO}` bilan idempotent navbatga qo‘yish yoki tayyor natijani qayta ishlatish |

## Tekshiruv

`npm run check`, `npm run build`, `node --import tsx --test server/modules/media/carousel-audio.test.ts`.

To‘liq DB/FFmpeg integratsiya testi uchun alohida scratch joyga `@electric-sql/pglite` o‘rnating va `MEDIA_TEST_PGLITE_PATH` ni uning `dist/index.js` manziliga bering. Test ishlab chiqarish bazasiga ulanmaydi. Haqiqiy PNG/MP3 dan video yaratib, H.264/AAC, 1080×1350, davomiylik, slayd tartibi va ovoz balandligini tekshiradi. Navbatni tiklash, qayta bosish, auth, eskirgan sozlamalar va tayyorlanmagan nashrni bloklash ham tekshiriladi. Instagram/Telegram chaqiriqlari taqlid qilinadi; test ochiq post yubormaydi.

API mosligi uchun Meta manbasi: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing — carousel children va video processing status.
