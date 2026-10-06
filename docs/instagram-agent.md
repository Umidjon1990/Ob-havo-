# Instagram agent

The private admin has an Instagram agent section. Weather and weekly-test routes are unchanged.

## Available

- Approved keyword responses for comments and inbound Direct messages. Unknown questions stay in the inbox for manual response. No invented prices or course details.
- Comment private replies, public replies, manual hiding and deletion; keyword hiding rules. Rules start disabled unless explicitly enabled when saved. Post-scoped matching rules take precedence over account-wide rules; the oldest match within that scope wins.
- Per-post keyword/material configuration, published Instagram post selection and editing. The same keyword can map to different lessons on different posts. Direct-only rules have no post context and should use a distinct keyword for each lesson.
- Optional strict follow requirement for material DMs. New form entries suggest this requirement; existing rules remain unchanged until edited. No material is released unless Meta returns boolean `is_user_follow_business: true` for the inbound messaging sender.
- Signed Instagram webhook ingestion, account matching, echo filtering and durable event deduplication. Actions are claimed before sending. An interrupted or ambiguous write needs review and is not automatically retried.
- Private replies expire after seven days; message replies after 24 hours from that inbound event. One handled event cannot send a second answer.
- Background media insight collection for the last 30 Instagram deliveries published by this system. Each metric is independent; missing values are not shown as zero. Latest saved-count ranking and hook text appear in the panel.
- Separate media asset lists for Telegram, Instagram and YouTube; empty override uses the master asset list. Scheduled and published posts remain locked. Copy the post or cancel its schedule before changing files.
- Free ffprobe checks before publication. Corrupt media stops publishing; aspect ratio, codec and resolution recommendations are warnings. The panel additionally measures the first 180 seconds of audio and offers an explicit paid OpenAI language review.
- Persistent vocabulary, 3D visual, cover and clone-voice requirements; editable existing rules are preserved. Campaign counts now accept 1–31 posts, with 8/12/30 presets.

## Meta setup still required for interaction automation

Publishing access does not imply messaging, comment or insights permissions. Add the needed Instagram Login permissions on the same Meta app, grant them to the account and replace its token through the existing account form when required:

- instagram_business_manage_comments
- instagram_business_manage_messages
- instagram_business_manage_insights

In the private Instagram agent panel save the Meta App Secret and a random verify token of at least 24 characters. Both are encrypted and never returned by API responses. In Meta configure the callback URL displayed in the panel and the same verify token. Subscribe to comments and messages, then use the panel's account subscription button. Saving secrets is not proof that Meta verified the callback. Use a real inbound message and comment from another account to confirm delivery.

Do not paste secrets into repository files, logs or chat. Never use a production database for tests.

The connection check reads `me?fields=id,user_id,username` and account-level `subscribed_apps`. It caches the professional `user_id` only when the authenticated Meta response also matches the existing account ID. Publishing IDs and credentials are preserved. Incoming callbacks match either verified ID, and never fall back to the only configured account. The subscription action uses the professional ID and only reports success when Meta returns `success: true`.

The private panel shows the last signature-verified receipt time and matched/parsed/inserted/duplicate counts. The receipt retains only account IDs, field names and counters, without raw payloads, sender IDs or message text. Runtime logs contain counters only. A callback HTTP 200 means receipt processing completed; it does not mean an inbox message was inserted. Synthetic Meta events with ID 0 stay out of the inbox.

The optional comment/permission check reads the token's permission list and up to ten comments on each of the five most recent account posts. It distinguishes owner comments where Meta returns author identifiers. Unsupported or failed permission introspection remains unknown, not denied. A bounded author-field fallback applies only to Graph error 100. These fetched comments remain an explicit read-only diagnostic: they do not populate the webhook inbox, enqueue jobs, send responses or enable rules.

## Per-post material and follow requirement

In Instagram agent, choose **Izoh**, the published post under **Qaysi post uchun?**, the comma-separated keywords, **Directga material yuborish**, and the final reply containing that lesson's URL. Enable **Obuna shart** and **Saqlangach avtomatik ishlasin**, then save. Use **Tahrirlash** to change the URL or keywords later. Full edits cancel outstanding requests for the previous rule version; disabling also cancels them. They cannot unlock a different lesson.

A gated comment first receives one private reply without the lesson URL, asking the recipient to follow the profile and answer `OBUNA CODE` in Direct. The returned Meta `recipient_id` binds that durable request to the actual messaging recipient; the comment author ID is never assumed to be their messaging ID. Missing recipient identity or an ambiguous write requires review and does not retry automatically.

The recipient's fresh Direct reply initiates `GET /{sender_id}?fields=is_user_follow_business` on the configured Instagram Login API. Boolean true releases the saved response once, false asks them to follow and retry, and missing fields, unexpected values or API errors hold the URL and show a follow-check error in the panel. A typed “OBUNA” is a request to check, never evidence of following. Standalone `OBUNA` works when exactly one active material request exists for that account and recipient; with multiple requests the supplied code identifies the lesson. Requests expire after seven days, and continuations still require the inbound 24-hour message window. Another account, sender, expired request or disabled/deleted rule cannot release the saved material.

An already-following sender matching a gated Direct-only rule can receive the material immediately after the explicit check. Follow status is not polled in the background. Production availability of the profile field and messaging consent must be verified with a real inbound Direct from the same test recipient; passing mocked tests alone does not establish token eligibility.

## Public information URLs

The server serves `/privacy` and `/data-deletion` as public UTF-8 HTML before API authentication and the SPA fallback. They require no login, JavaScript or database query. Both have Uzbek and English text and use the operator contact shown in the Meta app: `umidjonabdurayimov04@gmail.com`.

In Meta App Settings → Basic, set the Privacy Policy URL to `https://web-production-d1f0.up.railway.app/privacy`. Select **Data deletion instructions URL** (not callback) and enter `https://web-production-d1f0.up.railway.app/data-deletion`. These are information pages, not automated deletion endpoints. Saving them does not prove the app is published or that all permissions are approved; inspect Meta's remaining requirements.

The operator must monitor the contact mailbox and handle deletion requests manually: confirm ownership, identify the affected account and sender IDs, remove that user's matching `media_interactions` records and any explicitly requested user-owned media from active storage, and report the outcome. For an account-owner disconnection request, also revoke platform access and remove stored connection credentials through a scoped administrative process. Do not bulk-delete unrelated users' records or shared content. App revocation alone does not erase local data. Any provider-log or backup limitation should be explained to the requester. Update these pages when processing practices or the contact change.

## Verification

npm run check
node --import tsx script/build.ts
MEDIA_TEST_PGLITE_PATH=/absolute/path/to/@electric-sql/pglite/dist/index.js npm run test:media

API mocks verify signed callbacks, duplicate delivery, approved answers, partial insight failures, post-scoped precedence and follow-gated delivery. Follow tests cover false/missing/non-boolean/error results, Meta recipient binding, wrong sender/account, duplicate continuation, expiry, rule edits/disabling/deletion and ambiguous sends. These tests do not prove that a production Meta token has the required permissions. AI text review is advisory; pixel-level crop, Arabic glyph appearance, voice identity and narration/music intelligibility still need visual or listening review.
