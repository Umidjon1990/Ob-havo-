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
