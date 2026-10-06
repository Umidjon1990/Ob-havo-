# Instagram agent

The private admin has an Instagram agent section. Weather and weekly-test routes are unchanged.

## Available

- Approved keyword responses for comments and inbound Direct messages. Unknown questions stay in the inbox for manual response. No invented prices or course details.
- Comment private replies, public replies, manual hiding and deletion; keyword hiding rules. Rules start disabled unless explicitly enabled when saved. The oldest matching enabled rule wins.
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

## Verification

npm run check
node --import tsx script/build.ts
MEDIA_TEST_PGLITE_PATH=/absolute/path/to/@electric-sql/pglite/dist/index.js npm run test:media

API mocks verify signed callbacks, duplicate delivery, approved answers and partial insight failures. These tests do not prove that a production Meta token has the required permissions. AI text review is advisory; pixel-level crop, Arabic glyph appearance, voice identity and narration/music intelligibility still need visual or listening review.
