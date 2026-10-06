# Instagram Reels studiyasi

Admin panel: `/admin?section=reels`. Mavjud ob-havo va haftalik test yo‘llari saqlangan.

Har bir video paketi `media_posts.variants.reels` ichida saqlanadi: manba va tekshirilgan da’volar, hook, diktor matni, sahnalar, Umidjon voice ID, MP3, Higgsfield kirish klipi, sahna rasmlari, yakuniy MP4, kalit so‘zlar, Direct matni, HTTPS havola va obuna talabi. Cover `instagram_cover_id` orqali nashrga beriladi.

Chatda tayyorlangan JSON paketni import qilish yoki Al-Qomus namunasidan boshlash mumkin. Video, cover, audio va sahna rasmlarini tanlash/yuklash bitta muharrirda. Yaratish tugmalaridan oldin paket avtomatik saqlanadi. Natijalar kutubxonaga yoziladi. Yakuniy MP4 40–60 soniya, 9:16, kamida 1080×1920 ekanligi ffprobe orqali tekshiriladi. Fayl limiti 50 MB, umumiy kutubxona 1 GB.

`reels_plan`: OpenAI orqali 1–12 ssenariy va professional vizual promptlar. Bu video fayllari yaratildi degani emas. Manba URL avtomatik yuklanmaydi: tasdiqlangan imkoniyatlar source_notes orqali beriladi. Shu sabab ichki tarmoqqa URL orqali so‘rov yuborilmaydi. Oylik sanalar faqat kelajakdagi Toshkent 18:00 vaqtlaridan tanlanadi.

`reels_audio`: ElevenLabs v4, tanlangan klon, o‘zbekcha. Matn/ovoz/model xeshi bir xil bo‘lsa saqlangan audio qayta ishlatiladi. Pulli so‘rovlar avtomatik qayta yuborilmaydi. Uzilishda ElevenLabs tarixi tekshiriladi.

`reels_render`: haqiqiy HyperFrames 0.8.137, lokal GSAP va Noto WOFF2 shriftlar, 30 fps / 1080×1920. TTS tayyor bo‘lishi, Higgsfield kirish MP4 si va oraliq sahna rasmlari biriktirilishi kerak. Nutq tezlashtirilmaydi. Sahnalar audio davomiyligiga moslanadi; tabiiy tovush, past fon musiqa va sinxron whoosh. Istalsa shaxsiy musiqa MP3 si. Higgsfield generatsiyasi chatdagi ulangan vosita orqali amalga oshiriladi, loyiha esa tayyor klipni qabul qiladi; Railwayda Higgsfield API ulandi deb da’vo qilinmaydi.

Joblar DB navbatida ishlaydi, yurak urishi saqlanadi. Jarayon davomida postni tahrirlash/o‘chirish/rejalash bloklanadi. Node 22+, FFmpeg va Chromium Dockerda o‘rnatiladi; render bir ishchida ketadi. `HYPERFRAMES_BROWSER_PATH` bilan mahalliy Chromiumni ko‘rsatish mumkin.

Nashr qilgach, Meta qaytargan haqiqiy media ID bilan `media_automations` ga postga xos private_reply qoidasi bog‘lanadi. `source_delivery_id` yagona. Alohida tranzaksiya xatosi videoni qayta nashr qilmaydi. Kiruvchi izohlar qayta ishlanishidan oldin bog‘lash tugaydi. Qoida bir marta bog‘lanadi; foydalanuvchi o‘chirgan yoki pausaga qo‘ygan qoida avtomatik qayta yoqilmaydi.

Obuna talabi amaldagi Direct davomiy jarayonidan foydalanadi: izoh → shaxsiy xabardagi OBUNA kodi → o‘quvchining Direct javobi → Meta follow holati → material. Noaniq tekshiruvda havola berilmaydi. Yangi obunadan so‘ng o‘zi keladigan webhook bor deb taxmin qilinmaydi. Bu Meta ruxsatlari va boshqa hisob bilan jonli sinovga bog‘liq; mock sinov jonli tasdiq o‘rnini bosmaydi.

Nashrga tayyorlik belgisi texnik tekshiruv bilan birga kerak. Chat agenti buyurtma doirasida videoni ko‘rib tayyor deb belgilashi mumkin. Faqat video yaratish topshirig‘i avtomatik Instagram nashrini boshlamaydi.

Sinov: `MEDIA_TEST_PGLITE_PATH=<pglite ESM> OPENAI_API_KEY=unit-test-placeholder npm run test:media`. Production DB bilan sinov qilinmaydi.
