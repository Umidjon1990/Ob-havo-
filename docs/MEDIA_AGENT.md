# Zamonaviy Media Agent

The existing React/Vite/Express/PostgreSQL application now has a private media workspace at `/admin`. Public `/`, `/forecast`, `/tests`, their content and the existing Telegram weather/news/listening/reading schedulers are preserved.

## Modules

- `client/src/modules/weather/pages`: original weather pages, byte-for-byte content moved behind existing route exports.
- `client/src/modules/learning/pages`: original public test archive.
- `client/src/modules/administration/legacy-admin.tsx`: existing administrative controls, split into Weather, Weekly Tests and Arabic News views without changing channel schedules.
- `client/src/modules/media`: responsive private panel, post editor, asset library, calendar, account connections, rules/history and reference notes.
- `server/modules/media`: additive schema, durable sessions, encrypted credentials, authenticated routes, transactional scheduling, provider adapters and asynchronous workers.

## Available workflows

1. Sign in with the existing `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
2. Add a Telegram channel and verify the bot can post. Weather/test subscriptions are separate from media subscriptions and are not imported or modified automatically.
3. Upload JPG, PNG, MP4 or MP3 into the library. Files are persisted in PostgreSQL BYTEA; maximum 50 MB each and a 1 GB application-wide library cap. This is a bounded initial storage solution using the existing database, not a new paid storage service. Move larger-scale video storage to an object-storage adapter in a later iteration.
4. Create a text, image, video, carousel or stickman post. Attach final media in order. Add separate platform captions. YouTube visibility, child-directed and synthetic-media settings are available in its variant tab.
5. Schedule one post or atomically schedule an entire prepared monthly set to selected verified accounts. Dates are displayed as Asia/Tashkent. Each account has its own persistent delivery row and status.
6. Request 10, 15 or 20 AI drafts for a future month. Generation uses the existing OpenAI key, `gpt-5` by default (`MEDIA_TEXT_MODEL` overrides it). Active brand and relevant format rules are read before each draft; selected reference notes are included. Each completed draft is persisted independently. This costs OpenAI API usage when invoked from the panel. Tests never call paid providers.
7. Download a production text package; create media using the existing creative tools; upload the finished files and schedule them. Image/video generation and montage by Higgsfield/HyperFrames are not server-side integrations in this release. The creative packages contain scripts, voice text, scene/timing and montage instructions.

## Provider connections

### Telegram

Uses the existing `TELEGRAM_BOT_TOKEN`. Add a media destination explicitly and verify it. The bot needs channel administrator posting permission. Text/image/video/carousel adapters use the official Bot API. No real channel receives anything until the administrator schedules a media post or uses the existing explicit send buttons.

### Instagram

This release accepts an Instagram **Login** API token and professional account ID, not a browser password and not a Facebook Login token. It requires `instagram_business_basic` and `instagram_business_content_publish`. A verified account can publish JPG images, MP4 Reels and 2–10-image JPG carousels. Default Graph API version is v23.0 (`INSTAGRAM_API_VERSION` overrides it). Actual media size, codec, dimensions and account permission acceptance are also checked by the provider. Tokens are encrypted in the database. Token expiry requires replacement/reverification in this release; automatic OAuth consent and renewal are follow-up work.

### YouTube

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Railway for a Google web OAuth client with YouTube Data API enabled. Register the exact redirect URI:

`https://web-production-d1f0.up.railway.app/api/media/oauth/youtube/callback`

The administrator then connects the channel using the panel's Google button. The OAuth state is single-use, time-limited and bound to the current admin session; refresh tokens are encrypted. Uploads use resumable sessions persisted before transmitting the file. A retry probes an existing session before sending remaining bytes, avoiding a second upload. An unverified API project may be restricted to private uploads until Google's compliance audit; a private API result is surfaced as a warning in the delivery history.

The ChatGPT plugin's signed-in social-media accounts are not automatically transferable to the Railway app. Google/Meta account-owner authorization still has to occur for this application.

### Metricool

Kept as an optional external link. There is no Metricool API/MCP connection in this release and no quota bypass. The admin should not schedule the same post in both systems. n8n is optional; the core queue does not require it.

## Persistence and delivery reliability

New `media_*` tables are created additively and repeatably. Existing data is not dropped. New tables are ensured both by the migration and startup, so the existing deployment command remains compatible.

Scheduling validates all requested destinations and media inside a transaction. Bulk scheduling either commits the entire set or none. Post/account uniqueness prevents accidental duplicate scheduling. Published posts are immutable; a new draft can be made via Copy. Assets attached to posts cannot be deleted.

A 15-second worker claims due deliveries through `FOR UPDATE SKIP LOCKED`. Processing claims and provider state are persistent. Known safe temporary failures back off, up to 12 attempts; ambiguous send outcomes and stale publication claims become **needs_review**, with no automatic resend. The admin must check the destination and resolve the outcome. Exactly-once external delivery cannot be guaranteed by Telegram/Meta for an interrupted network response; this limitation is handled explicitly instead of claiming a successful or failed send without evidence.

AI jobs run asynchronously and preserve completed drafts if the process ends. An interrupted paid AI job is not silently regenerated. Weather/test prompts, voices, schedules and export rendering were not changed.

## Security and environment

- Existing admin credentials continue to apply. Legacy bearer calls remain compatible; the new panel uses an HttpOnly SameSite cookie.
- Session token hashes and 7-day expiry are persisted in PostgreSQL. Logout revokes the session. Prior in-memory sessions require one fresh login after rollout.
- Management routes, including legacy weather/channel/news controls, require authentication; public weather and test routes remain public.
- Browser mutation requests are checked against the site's origin. Login attempts have a 10-attempt/15-minute bound.
- `MEDIA_ENCRYPTION_KEY`: dedicated secret for encrypted credentials and signed publication asset URLs. Keep it stable; rotating it requires reconnecting accounts. Existing admin password is only a fallback.
- Asset URLs shared with publishers are signed and expire within 7 days. Private asset listing/download is authenticated. Content type, file signatures, range bounds and size are validated.
- Response bodies are no longer logged, preventing session tokens or private drafts from entering runtime logs.
- `DISABLE_SCHEDULERS=true`: test environments only. Do not set this on the existing production service; it disables both old and new schedules to avoid duplicated test messages in clones.

## Validation

- TypeScript check and production build.
- Existing learning validation, selected-voice fallback, DOCX/PDF and Arabic escaping tests.
- Media platform constraints, monthly calendar dates, encrypted credentials, revoked/durable sessions, private endpoints, origin checks, asset ranges/deletion guards, transactional scheduling, immutable scheduled posts, queue duplicate prevention and ambiguous outcome recovery.
- Mocked Instagram container reuse and interrupted YouTube upload-session probing.
- Desktop/mobile browser flows: sign-in, create post, save/version rule, section separation, existing public routes and overflow checks.

Run `npm run test:media` for unit/provider tests. Integration tests require `MEDIA_TEST_DATABASE_URL` pointing to a **disposable test database**, never production. For local sandbox testing a PGlite module can be supplied via `MEDIA_TEST_PGLITE_PATH` without adding it to production dependencies. Tests block external provider requests.

The local sandbox's PDF browser test used a test-only Puppeteer pipe/minimal-launch override because random browser debug TCP ports were unavailable. Production PDF code and styling were left unchanged.

## Next integrations

Complete Google/Meta account consent, run an administrator-chosen live publication, add token renewal, and connect server-accessible creative APIs with explicit usage budgets. Recurring autonomous generation of finished videos, all-chat automatic memory synchronization, Instagram DM/comment automation and Metricool integration are not enabled merely by installing this panel.

## Audio studio (6 October 2026)

Private admin → Audio yaratish loads account voices (including professional/instant clones) from ElevenLabs `/v2/voices` and v4 models from `/v1/models`. Uses the existing server-only `ELEVENLABS_API_KEY`; it must allow voice/model reads and audio generation for the same workspace that owns the clone. Voices from the library appear after they are added to that account and refreshed.

Uzbek/Arabic narration uses `/v1/text-to-dialogue` with explicit `eleven_v4` or `eleven_v4_turbo`, selected voice ID and `uz`/`ar` language code. Input is limited to 2,000 characters; original diacritics/numerals are preserved. No automatic paid retries or provider/voice fallback. Generated MP3 is stored in existing media_assets under the 1 GB quota; preview and download stay behind admin authentication. One audio generation runs at a time per server process. Repeated requests after completion create separate audio assets and consume credits; if the connection is lost check ElevenLabs history before regenerating.

Articles can now attach MP3 assets; HTML references use `<audio src="{{asset:ASSET_UUID}}"></audio>`. Existing weekly Arabic listening remains on its previous model and voice settings.

## Explainer video studio

The private admin has an **Explainer video** section. Workflow: choose a source post → generate/edit a 2–8-scene script → approve → synthesize each scene using the selected ElevenLabs voice, `eleven_v4`, language `uz` → measure actual audio duration → render a vertical MP4. Arabic and Uzbek narration use the same voice. Arabic examples remain editable RTL text with embedded Noto Naskh Arabic, separate from the generated images. The plan stores source post, existing image IDs, on-screen text, narrator text, motion and SFX separately.

The first lesson plan is **Fikr bildirishning 5 usuli**: a concrete hook, five useful Arabic expressions with short Uzbek explanations, pronunciation practice, a small test and a call to complete the Article practice. Author approval precedes lesson production. Keep examples secular and generated characters neutral male/boys only; reuse the post's 3D cartoon images. Do not claim an unprovided source book or automatic publishing.

Renderer: bundled offline Chromium + FFmpeg, 720×1280, 24fps H.264/AAC. Initial motion options are gentle pop/slide/zoom on scene cards, with quiet synthetic pop/whoosh/tick/typing sound effects and optional uploaded MP3 background music at low volume. This renderer does not generate new animated 3D characters, provide word-level captions, or run Higgsfield/HyperFrames remotely. JSON scene plans are downloadable for later advanced editing. Duration is measured from generated speech (minimum 3 seconds per scene, plus 0.5 seconds reading pause, maximum 180 seconds total); output maximum 50 MB. Narrator text maximum 2000 characters total.

Approved rendering runs in a durable `media_jobs` queue (`kind=explainer`) independently of the campaign queue. The admin can close the page and return. Completed video and audio are stored in the media library; actual scene timings appear in the studio. No automatic paid retry after a failed/interrupted synthesis. Editing, deleting and scheduling a queued/running video is blocked. Production requires the Docker image with FFmpeg and the existing ElevenLabs/OpenAI keys. Publishing stays a separate reviewed action; Article videos use the existing `{{asset:ID}}` placeholder after attaching the MP4 to that Article.

## Full MSC lessons and batch rendering (October 2026)

The studio has separate `short` and `msc` profiles. Short explainers retain their 2–8 scene, 2,000-character total and 720×1280/24fps behavior. MSC accepts up to 40 scenes, 2,000 narration characters per scene, 40,000 total and up to 30 minutes of actual measured audio; it renders 1080×1920/30fps. Original question/answer, lesson code, stage order, full answer coverage and each analysis phrase are validated before queueing. MSC analysis shows two columns; phrase scenes label the source usage and new authored example. No closing exercise is inserted by this profile.

Import a JSON plan or array, or use **Oktabr 2026 · 9 MSC darsini import qilish**. The shipped nine-source-scripts package covers samples 7–9, three questions each, with 19 scenes per lesson. Duplicate lesson codes reject the entire import. Attach real topic imagery to each lesson, select the authorized Umidjon professional/cloned voice, review, and queue selected lessons. Selection order is retained by the durable queue. Import does not generate speech or publish anything.

A database advisory lease serializes workers across server replicas. A heartbeat runs during slow synthesis/encoding. All screen layouts are preflighted before paid speech. Each scene MP3 and its asset ID are checkpointed in the job result; these assets cannot be deleted while referenced. After a definite local failure, the explicit resume button reuses saved audio and the original frozen plan. An unresolved provider response/pending scene blocks resume to avoid a duplicate paid call. Interrupted running jobs become failed after the existing 20-minute grace period; no automatic paid retries. Existing finished jobs cannot be queued again through a second click.

The 1 GB library quota and 50 MB output limit are retained. A worker checks 100 MB free space before synthesis, plus transactional quota checks on each audio/final write. Jobs fail with a clear message if capacity is insufficient. Publishing and its playlist/channel scheduling remain separate operations; never claim videos scheduled merely because render jobs were queued.

Verification: schema/source integrity tests for all nine 19-scene plans, reordered/missing-source rejection, escaped two-column HTML, queue order/duplicate protection, unresolved-audio resume protection, full media test suite, TypeScript and production build. A local synthetic-tone MP4 checks codec/resolution/fps/decoding without spending narration credits. Live Umidjon synthesis requires an authenticated administrator and configured provider account; it is not implied by these offline checks.


### MSC paketini bitta buyruq bilan yaratish

Explainer sahifasining yuqorisida **Barcha 9 darsni Umidjon ovozida tayyorlash** bor. Autentifikatsiyalangan `POST /api/media/explainer/packages/msc-october-2026/start` (`approved: true`, ixtiyoriy `voice_id`) manbadagi 9 ssenariy, 9 haqiqiy JPG muqova, Telegram HTML havolalari, YouTube tavsifi va Toshkent nashr takliflarini bir tranzaksiyada birlashtiradi. Bitta Umidjon cloned/professional ovozi bo‘lsa, avtomatik tanlanadi; bir nechta bo‘lsa narratorni bir marta tanlash kerak. Yangi AI matn yaratish yoki boshqa ovozga almashtirish yo‘q.

Oldin import qilingan kodlar qayta ishlatiladi; tahrirlangan ssenariylar saqlanadi. Introga mavzu muqovasi biriktiriladi. Tayyor, queued/running va natijasi noma’lum ishlar takrorlanmaydi. Bitta paketga bir vaqtdagi so‘rovlar advisory lock bilan ketma-ket bajariladi. Saqlangan job `plan` va ovoz snapshotidan ishlaydi. Natijasi aniq failed ish qayta buyruqda shu ovoz bilan davom etadi; `pending_scene` mavjud bo‘lsa o‘z-o‘zidan qayta so‘rov yuborilmaydi. Kutubxonadagi 1 GB limit doirasida video va audio uchun konservativ joy tekshiruvi bor.

Server qayta ishga tushgach 20 daqiqadan eski running ishlar, faqat render_version=2 va pending_scene=null bo‘lsa, saqlangan sahna audiosidan avtomatik davom ettiriladi. Noma’lum so‘rov failed holatida aniq xato bilan qoladi. Brauzerning yopilishi server navbatini to‘xtatmaydi. Jadvaldagi MP4 havolasi faqat haqiqiy yakuniy asset mavjud bo‘lganda ko‘rsatiladi. `suggested_at` haqiqiy rejalashtirilgan nashr emas; kanalga nashr yaratish alohida amal.

Barcha 9 video tayyor bo‘lganda autentifikatsiyalangan GET `/api/media/explainer/packages/msc-october-2026/download` vaqtinchalik ZIP yaratadi (9 MP4 + 9 plan/nashr JSON). Tayyor bo‘lmagan yoki dublikat kodli paket 409 bilan to‘xtaydi; soxta tayyor video qo‘shilmaydi.


### Brauzersiz bir martalik buyruq va avtomatik nashr

Foydalanuvchining 2026-10-09 topshirig‘i uchun `docs/examples/msc-october-2026-command.json` egasi tasdiqlagan aniq 9 darsni tayyorlash + Telegram/YouTube rejalashtirish buyrug‘idir. Worker startupda uni bir marta bajaradi; `msc_command` receipt va 9 yaratish ishi hamda `msc_publication` ishi bitta tranzaksiyada saqlanadi. Doimiy command_id keyingi deploylarda pullik ishlarni takrorlashga yo‘l qo‘ymaydi. Brauzer token/cookie ishlatilmaydi; provayder kalitlari serverning avvalgi xavfsiz ulanishida qoladi. Xato buyruq receipt bilan qayd qilinadi, avtomatik pullik qayta urinish yo‘q; paneldagi paket tugmasi ayni mavjud ishlarni davom ettirishga xizmat qiladi.

Paket start API `publish:true` bo‘lsa ham avtomatik nashr ishini yaratadi. Worker barcha 9 haqiqiy MP4 tayyor bo‘lgach `@zamonaviymedia` bot ruxsati va ayni kanalga tegishli ro‘yxatdagi hisobni, Umidjon YouTube kanalini, playlist egaligini hamda yozish scope’ini tekshiradi. Boshqa kanal ishlatilmaydi. 12,14,16,19,21,23,26,28,30-oktabr 14:00 Asia/Tashkent bo‘yicha nashrlar rejalashtiriladi. O‘tib ketgan slot hozirgi nashrga almashtirilmaydi. Xato panelda ko‘rsatiladi.

Telegram uchun `variants.telegram_format=article` qo‘shildi: yakuniy video va asl HTML matndagi barcha havolalar bitta Rich Message’da yuboriladi. YouTube formati video bo‘lib qoladi; muqova, tavsif va mavjud Milliy sertifikat playlistiga yangi 9 dars ketma-ket qo‘shiladi. Har bir darsdagi ikkala nashr bitta tranzaksiyada yaratiladi; uzilishdan keyin faqat yetishmayotgan hisoblar rejalashtiriladi. Bekor qilingan yozuv avtomatik yoqilmaydi. Mavjud nashrlar qayta yuborilmaydi. Jarayon bo‘yicha command qabul qilindi degani videolar tayyor yoki nashr qilindi degani emas.
