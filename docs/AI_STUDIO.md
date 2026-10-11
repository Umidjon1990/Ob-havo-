# OB-HAVO AI Media Studio

Open `/admin?section=studio` with the existing admin account. The learning,
weather, Instagram, Telegram, YouTube and existing production queues retain
their separate routes and tables. Studio migrations are additive and repeat safe.

## Providers and workflow

1. Create a project, attach JPG/PNG character and style references and an optional
   MP4 example. A sample analysis extracts four real frames and video metadata;
   it does not claim to transcribe or hear the example's audio.
2. Save the script and explicitly lock approved wording. OpenAI can return a
   storyboard draft, but it never silently applies it or changes a locked script.
3. Lucid Origin uses the v2 async API with FAST/ULTRA, private outputs, Cinematic,
   prompt enhancement OFF, one content reference and one style reference.
   References travel as BASE64 bytes, supported by the current v2 OpenAPI schema.
   This model does not expose a dedicated Character Reference control. Inspect
   faces, wardrobe and hands before approving a shot.
   Leonardo Lightning XL is also selectable. It uses the documented v1 API,
   model `b24e16ff-06e3-43eb-8d33-4416c2d75876`, Photography, Alchemy quality,
   enhancement OFF and private results. Lightning image sizes are 720×1280,
   1280×720 or 1024×1024, with at most four outputs and a 1500-character prompt.
   References upload through
   init-image and the returned multipart S3 form, without forwarding API headers.
   SDXL guidance uses Character 133/Mid, Content 100/Low and Style 67/High.
   Only one Character Reference is supported; a second portrait can be Content
   Reference, but this does not guarantee both identities in the output.
4. Optionally animate an approved image through Leonardo's Kling 2.6 API, using
   a start frame, 5/10 seconds and generated audio OFF. This also uses the
   Leonardo API balance; account/model availability is verified by the provider.
5. Select an exact ElevenLabs voice and generate narration, or import an existing
   MP3. The existing audio provider supports Uzbek/Arabic and 2000 characters.
6. Approve every selected shot before rendering. FFmpeg assembles images with a
   gentle camera move or real supplied video clips. It does not fabricate character
   animation from stills. It burns shot-timed captions, ducks music below narration,
   adds opening/final fades and exports MP4, cover and ZIP (MP4, cover, SRT, project).
   Render uses scene durations, not automatic word alignment. Longer narration
   blocks export rather than being cut. A short video holds its last frame if needed.

Supported formats: 1080×1920, 1920×1080, 1440×1440; up to 32 scenes / 180 seconds.
Assets remain in the existing quota-limited PostgreSQL media library. Studio
references and job outputs are included in deletion protection. Files must remain
under 50 MB; reference guidance accepts at most 7 MB per source image.

## Configuration

Set `LEONARDO_API_KEY` directly in Railway → OB-HAVO → production → web → Variables.
Do not send it in chat or commit it. Existing `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`,
`ADMIN_PASSWORD`, `MEDIA_ENCRYPTION_KEY`, `APP_URL` and `DATABASE_URL` are reused.
Provider credentials are never returned by Studio endpoints or command receipts.

Queue endpoints require `paid_authorized: true` for external generation and a
unique `idempotency_key`. Render does not invoke a paid provider. Recorded prices
come only from provider `cost` or legacy `apiCreditCost`; missing prices remain
unknown. USD and credits are distinct units. Pricing calculator:
https://app.leonardo.ai/api-access/pricing-calculator

## Control from ChatGPT through the connected Railway tool

The available Railway connection can set `MEDIA_STUDIO_COMMAND_JSON` on the
**web** service. After redeploy/startup, the app executes that bounded JSON command
and writes a durable receipt. No admin password, browser login or provider secret
needs to pass through the chat. This bridge takes a deployment/startup cycle; it
is not an automatically installed custom ChatGPT connector or an instant RPC.

Use the existing connected Railway `set-variables` tool with:

```json
{
  "projectId": "ce115b46-4975-4d78-af9c-010f3c6a087a",
  "environmentId": "631524c5-3640-4290-a69e-aa9e5cc5ee6a",
  "serviceId": "3494c2d2-5de9-40f8-8f73-2042723ab55f",
  "variables": {
    "MEDIA_STUDIO_COMMAND_JSON": "{\"command_id\":\"water-story-create-v1\",\"operation\":\"project.create\",\"data\":{\"template\":\"water-story\"}}"
  }
}
```

Verify the deployment reaches `SUCCESS`. Read bounded runtime logs filtered by
`AI_STUDIO_RECEIPT` and the command ID. The logged creation receipt gives the real
project ID. Command receipts are also visible in the Studio UI and protected API.
Replaying an accepted command ID makes no new mutation or paid call. Give each
new request its own ID; never reuse an ID for different instructions.

| Operation | Data |
| --- | --- |
| `project.create` | Full `StudioProjectInput`, or `{ "template": "water-story" }` |
| `project.read` | `{ "id": "PROJECT_UUID" }`, or `{}` for recent projects |
| `project.update` | `{ "id": "PROJECT_UUID", "version": 1, "project": FULL_INPUT, "unlock_script": false }` |
| `job.queue` | A validated job request below |
| `job.read` | `{ "id": "JOB_UUID" }` or `{ "project_id": "PROJECT_UUID" }` |
| `job.resume` | `{ "id": "JOB_UUID" }`; polls an already recorded generation, never creates another one |
| `asset.import` | `{ "name": "reference.png", "mime_type": "image/png", "url": "SIGNED_FILE_URL" }`; bounded import from approved OpenAI file storage hosts |
| `asset.link` | `{ "id": "ASSET_UUID" }`; returns a signed download link valid for 15 minutes |
| `image.test` | One-shot project, `shot_id`, `image_model`, optional `seed`, `paid_authorized: true`, and 1–3 inline references (`name`, `mime_type`, `role`: character/content/style, `data_base64`); atomically imports private references and queues exactly one output |

The bridge accepts at most 120,000 UTF-8 bytes. Inline reference bytes are
validated and remain in the private database; they never appear in receipts.
`project.update` can optionally include `image_job` (shot_id, image_model,
paid_authorized and guidance/seed fields). The same transaction then queues
exactly one image with the command ID as its idempotency key. If validation
fails, both the project update and queued work roll back together.
Railway limits each variable to 32,768 characters. A reference can therefore
use `data_env` instead of `data_base64`, naming only `MEDIA_STUDIO_REFERENCE_1`,
`MEDIA_STUDIO_REFERENCE_2` or `MEDIA_STUDIO_REFERENCE_3`. Each holds bounded
base64 bytes; arbitrary environment names, including API keys, are rejected.
Clear these transport variables after the command has imported the files.
Completion logs `AI_STUDIO_JOB_RESULT` contain only result IDs, recorded cost,
metadata and a 15-minute owner download link. Generation requests are never
retried after an ambiguous paid submission. A reference-upload failure occurs
before any generation submission and has no paid-generation ambiguity.

Example generation request, only after the owner has authorized the paid call:

```json
{
  "command_id": "water-offer-command-v1",
  "operation": "job.queue",
  "data": {
    "kind": "image",
    "project_id": "ACTUAL_PROJECT_UUID_FROM_RECEIPT",
    "shot_id": "offer",
    "image_model": "lightning-xl",
    "mode": "FAST",
    "quantity": 1,
    "content_reference_asset_id": "ACTUAL_IMPORTED_ASSET_UUID",
    "style_reference_asset_id": "ACTUAL_IMPORTED_ASSET_UUID",
    "paid_authorized": true,
    "idempotency_key": "water-offer-generation-v1"
  }
}
```

Other job kinds: `video` (shot_id, duration 5/10), `audio` (voice_id, language,
model), `plan`, and `render` (burn_subtitles). All require project_id and
idempotency_key; external calls additionally require paid_authorized.

## Protected HTTP API

`/api/media/studio` reuses existing admin sessions and same-origin write checks.
Routes: GET status/template/projects/jobs/commands; POST projects/jobs/assets;
GET projects/:id; PUT projects/:id; POST jobs/:id/resume. Uploads use raw JPG/PNG/
MP4/MP3 bytes and an encoded `X-File-Name`. Existing media routes preview and
download generated files. Optimistic project versions protect unsaved concurrent
edits; workers attach an output only if the affected shot/script still matches
the original snapshot.

## Recovery and validation

Provider IDs are checkpointed after submission. Subsequent worker ticks and
deployments poll the saved ID. Timeout or interrupted paid submission without an
ID enters `needs_review`, and cannot automatically resume/retry. If a generated
file download or quota check fails, the ID remains available and `job.resume`
only fetches that original generation. Rendering can safely restart after a stale
claim, because it invokes no paid generation. Queued work runs while the browser
is closed, provided Railway is running and schedulers are enabled.

Local verification uses mocked provider calls (no API charges), disposable
PostgreSQL-compatible PGlite, authenticated API checks and real FFmpeg/ZIP probes.
Set a dummy OpenAI key for existing tests that initialize its SDK. The PGlite test
dependency lives outside this repository; set `MEDIA_TEST_PGLITE_PATH` to its
module. Production keys and database are never used for these tests.

Official specifications:
https://docs.leonardo.ai/docs/generate-images-using-image-to-image-guidance
https://docs.leonardo.ai/docs/how-to-upload-an-image-using-a-presigned-url
https://docs.leonardo.ai/v1.0/reference/creategeneration
https://docs.leonardo.ai/docs/lucid-origin
https://docs.leonardo.ai/reference/creategeneration
https://docs.leonardo.ai/docs/kling-26
https://docs.leonardo.ai/v1.0/reference/getgenerationbyid
