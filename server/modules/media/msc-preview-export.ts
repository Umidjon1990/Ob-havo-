import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool } from '../../db';
import { explainerPlanSchema } from '../../../shared/explainer';
import { assetSignature } from './security';
import { appBaseUrl } from './providers';
import { mediaLibraryLimit } from './storage-quota';

const run = promisify(execFile);
export const MSC_PREVIEW_EXPORT_KIND = 'msc_preview_export';
export const EXPORT_CODES = [1, 2, 3].map(s => `MSC-B01-Q01-N007-S0${s}`);
export const OLD_PACKAGE_CODES = [7, 8, 9].flatMap(n => [1, 2, 3].map(s => `MSC-B01-Q01-N00${n}-S0${s}`));
const PACKAGE_ID = 'msc-october-2026';
const CANCEL_REASON = 'Foydalanuvchi eski MSC montajini to‘xtatdi. Saqlangan ovozlar v02 uchun saqlanadi.';
export const previewExportCommandSchema = z.object({
  command_id: z.literal('MSC-N007-V02-EXPORT-AND-STOP-OLD-20261009-V1'),
  operation: z.literal('export_saved_audio_and_cancel_old_msc_package'),
  approved: z.literal(true),
  authorized_at: z.literal('2026-10-09'),
  source: z.literal('User stopped unapproved October MSC generation and requested sample 7 v02 preview using existing good audio'),
}).strict();
type Command = z.infer<typeof previewExportCommandSchema>;
type FileEntry = { path: string; data: Buffer };
type ExportInput = { manifest: any; files: FileEntry[] };

// Approval is not a native media_posts column. Explicit stored approval flags
// and any completed/ambiguous provider delivery are therefore fail-closed.
export function previewProtectedPost(post: any, deliveries: any[]) {
  const v = post.variants || {};
  return v.approved === true || v.user_approved === true || v.explainer_approved === true ||
    v.approval_status === 'approved' || Boolean(v.approved_at) ||
    deliveries.some(d => d.post_id === post.id && ['published', 'publishing', 'needs_review'].includes(d.status));
}
export function previewSignedUrl(assetId: string, now = Date.now()) {
  const expires = String(now + 60 * 60 * 1000);
  return `${appBaseUrl()}/api/media/assets/${assetId}/public?expires=${expires}&sig=${assetSignature(assetId, expires)}`;
}

export async function packagePreviewExport(input: ExportInput): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'msc-preview-export-'));
  try {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(input.manifest, null, 2));
    const files = ['manifest.json'];
    for (const file of input.files) {
      // Only internally generated lesson/scene paths are accepted, never an
      // arbitrary media asset name or user-provided archive path.
      if (!/^imported\/MSC-B01-Q01-N007-S0[123]\/(?:plan\.json|audio\/(?:scene_\d{2}|full)\.mp3|images\/[a-f0-9-]{36}\.(?:png|jpg))$/.test(file.path)) throw Error('Invalid scoped export path');
      await mkdir(join(dir, file.path.split('/').slice(0, -1).join('/')), { recursive: true });
      await writeFile(join(dir, file.path), file.data);
      files.push(file.path);
    }
    await run('zip', ['-q', '-0', 'MSC_N007_v02_saved_audio.zip', ...files], { cwd: dir, timeout: 60000, maxBuffer: 1024 * 1024 });
    return await readFile(join(dir, 'MSC_N007_v02_saved_audio.zip'));
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function collectSavedPreview(c: any, cancellation: any): Promise<ExportInput> {
  const posts = (await c.query("SELECT id,title,variants FROM media_posts WHERE variants->'explainer'->>'lesson_code'=ANY($1::text[]) ORDER BY created_at DESC", [EXPORT_CODES])).rows;
  const jobs = (await c.query("SELECT id,status,payload,result,error,created_at FROM media_jobs WHERE kind='explainer' AND payload->>'post_id'=ANY($1::text[]) ORDER BY created_at DESC", [posts.map((p: any) => p.id)])).rows;
  const files: FileEntry[] = [], lessons: any[] = [];
  const assetCache = new Map<string, any>();
  async function asset(id: unknown, mime: string[]) {
    if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) return null;
    if (!assetCache.has(id)) assetCache.set(id, (await c.query('SELECT id,mime_type,size,data FROM media_assets WHERE id=$1', [id])).rows[0] || null);
    const found = assetCache.get(id);
    return found && mime.includes(found.mime_type) ? found : null;
  }
  for (const code of EXPORT_CODES) {
    const candidates = posts.filter((p: any) => p.variants?.explainer?.lesson_code === code);
    if (candidates.length !== 1) {
      lessons.push({ lesson_code: code, status: candidates.length ? 'ambiguous_posts' : 'missing_post', scenes: [], errors: [candidates.length ? 'Duplicate lesson posts; automatic asset selection refused.' : 'Saved lesson post not found.'] });
      continue;
    }
    const post = candidates[0], errors: string[] = [];
    const parsed = explainerPlanSchema.safeParse(post.variants.explainer);
    if (!parsed.success || parsed.data.profile !== 'msc') {
      lessons.push({ lesson_code: code, post_id: post.id, status: 'invalid_plan', scenes: [], errors: ['Saved MSC source plan is invalid.'] });
      continue;
    }
    const plan = parsed.data;
    files.push({ path: `imported/${code}/plan.json`, data: Buffer.from(JSON.stringify(plan, null, 2)) });
    // Use the checkpoint whose plan matches the narration being exported.
    // Never silently bind a scene voice from a different script revision.
    const job = jobs.find((j: any) => j.payload?.post_id === post.id && j.payload?.plan?.lesson_code === code &&
      JSON.stringify(j.payload.plan.scenes?.map((s: any) => s.narration)) === JSON.stringify(plan.scenes.map(s => s.narration)));
    const checkpoints = Array.isArray(job?.result?.audio_scenes) ? job.result.audio_scenes : [];
    const scenes: any[] = [];
    for (const [index, scene] of Array.from(plan.scenes.entries())) {
      const checkpoint = checkpoints.find((a: any) => a.scene === index);
      const audio = await asset(checkpoint?.audio_id, ['audio/mpeg']);
      const audioPath = audio ? `imported/${code}/audio/scene_${String(index).padStart(2, '0')}.mp3` : null;
      if (audio && audioPath) files.push({ path: audioPath, data: audio.data });
      const timing = job?.result?.timings?.[index];
      scenes.push({ index, title: scene.title, stage: scene.stage, narration: scene.narration,
        audio_id: audio?.id || null, audio_path: audioPath,
        audio_status: audio ? 'saved' : job?.result?.pending_scene === index ? 'provider_result_unknown' : checkpoint ? 'missing_asset' : 'not_saved',
        render_timing: timing && Number.isFinite(timing.start) && Number.isFinite(timing.duration) ? { start: timing.start, duration: timing.duration } : null });
    }
    const fullAudioId = job?.result?.audio_id || post.variants.explainer_audio_id;
    const fullAudio = await asset(fullAudioId, ['audio/mpeg']);
    if (fullAudio) files.push({ path: `imported/${code}/audio/full.mp3`, data: fullAudio.data });
    const imageIds = Array.from(new Set([...plan.scenes.map(s => s.image_id), post.variants.youtube_cover_id].filter(Boolean)));
    const images: any[] = [];
    for (const id of imageIds) {
      const image = await asset(id, ['image/png', 'image/jpeg']);
      if (!image) { errors.push(`Saved image asset missing: ${id}`); continue; }
      const path = `imported/${code}/images/${image.id}.${image.mime_type === 'image/png' ? 'png' : 'jpg'}`;
      files.push({ path, data: image.data }); images.push({ asset_id: image.id, path, mime_type: image.mime_type });
    }
    const previousError = job?.result?.cancelled_previous_error;
    if (previousError) errors.push(String(previousError).slice(0, 1000));
    if (job?.error && job.error !== previousError) errors.push(String(job.error).slice(0, 1000));
    const missing = scenes.filter(s => s.audio_status !== 'saved').length;
    lessons.push({ lesson_code: code, post_id: post.id, job_id: job?.id || null, job_status: job?.status || 'not_found',
      original_job_status: job?.result?.cancelled_previous_status || job?.status || null,
      status: missing ? 'incomplete_audio' : 'saved_audio_complete', scene_count: scenes.length, missing_scene_count: missing,
      pending_scene: job?.result?.pending_scene ?? null, full_audio_path: fullAudio ? `imported/${code}/audio/full.mp3` : null,
      full_audio_note: fullAudio ? 'Existing mixed narration track may include original SFX and padding; scene tracks are preferred.' : null,
      source_question: plan.source_question, source_answer: plan.source_answer,
      source_voice: job ? { voice_id: job.payload.voice_id || null, model: 'eleven_v4', language: 'uz' } : null,
      scenes, images, errors });
  }
  return { manifest: { version: 1, operation: 'read_only_saved_audio_export', created_at: new Date().toISOString(),
    export_codes: EXPORT_CODES, cancellation, lessons,
    summary: { lessons: lessons.length, complete_audio_lessons: lessons.filter(l => l.status === 'saved_audio_complete').length,
      saved_scene_audio: lessons.reduce((n, l) => n + l.scenes.filter((s: any) => s.audio_status === 'saved').length, 0),
      missing_scene_audio: lessons.reduce((n, l) => n + (l.missing_scene_count || 0), 0) },
    notes: ['No voice provider calls, new render, publication, credentials, or account tokens are included.',
      'render_timing refers to the old renderer; missing timings must be measured from saved MP3 files.'] }, files };
}

// Cancellation is committed before archive assembly. A failed archive never
// resumes old rendering. The export receipt and ZIP asset commit atomically,
// so redeploy/retry cannot duplicate a completed archive or invoke providers.
export async function executeMscPreviewExport(c: any, rawCommand: Command, pack = packagePreviewExport) {
  const command = previewExportCommandSchema.parse(rawCommand);
  let receipt: any, cancellation: any;
  await c.query('BEGIN');
  try {
    await c.query('SELECT pg_advisory_xact_lock(761286)');
    receipt = (await c.query("SELECT id,status,result FROM media_jobs WHERE kind='msc_preview_export' AND payload->>'command_id'=$1 FOR UPDATE", [command.command_id])).rows[0];
    if (receipt?.status === 'completed' && receipt.result?.asset_id) { await c.query('COMMIT'); return { duplicate: true, ...receipt.result }; }
    if (!receipt) receipt = (await c.query("INSERT INTO media_jobs(kind,status,payload) VALUES('msc_preview_export','running',$1) RETURNING id", [JSON.stringify(command)])).rows[0];
    const posts = (await c.query("SELECT id,variants FROM media_posts WHERE variants->'explainer'->>'lesson_code'=ANY($1::text[]) FOR UPDATE", [OLD_PACKAGE_CODES])).rows;
    const deliveries = (await c.query('SELECT post_id,status FROM media_deliveries WHERE post_id=ANY($1::uuid[])', [posts.map((p: any) => p.id)])).rows;
    const protectedPosts = posts.filter((p: any) => previewProtectedPost(p, deliveries));
    const targetIds = posts.filter((p: any) => p.variants?.explainer?.profile === 'msc' && OLD_PACKAGE_CODES.includes(p.variants?.explainer?.lesson_code) && !previewProtectedPost(p, deliveries)).map((p: any) => p.id);
    const jobs = (await c.query("UPDATE media_jobs SET status='cancelled',result=COALESCE(result,'{}'::jsonb)||jsonb_build_object('cancelled_previous_error',error,'cancelled_previous_status',status),error=$2,completed_at=now() WHERE kind='explainer' AND status IN ('queued','running','failed') AND payload->>'post_id'=ANY($1::text[]) AND payload->'plan'->>'profile'='msc' AND payload->'plan'->>'lesson_code'=ANY($3::text[]) AND payload->>'render_version'='2' RETURNING id", [targetIds, CANCEL_REASON, OLD_PACKAGE_CODES])).rows;
    // This is exactly the obsolete nine-lesson package orchestrator, not a
    // global delivery/job pause. Existing approved/published posts stay intact.
    const publication = (await c.query("UPDATE media_jobs SET status='cancelled',error=$2,completed_at=now() WHERE kind='msc_publication' AND payload->>'package_id'=$1 AND status IN ('queued','running','failed') AND CASE WHEN jsonb_typeof(payload->'post_ids')='array' THEN jsonb_array_length(payload->'post_ids')=9 ELSE false END AND payload->'post_ids' <@ $3::jsonb RETURNING id", [PACKAGE_ID, CANCEL_REASON, JSON.stringify(posts.map((p: any) => p.id))])).rows;
    const previousCancellation = receipt.result?.cancellation || {};
    const union = (key: string, ids: string[]) => Array.from(new Set([...(previousCancellation[key] || []), ...ids]));
    cancellation = { post_ids: union('post_ids', targetIds), protected_post_ids: union('protected_post_ids', protectedPosts.map((p: any) => p.id)),
      cancelled_job_ids: union('cancelled_job_ids', jobs.map((j: any) => j.id)), cancelled_publication_job_ids: union('cancelled_publication_job_ids', publication.map((j: any) => j.id)),
      preserves_assets: true, preserves_completed_jobs: true, preserves_existing_deliveries: true };
    await c.query("UPDATE media_jobs SET status='running',result=$2,error=NULL WHERE id=$1", [receipt.id, JSON.stringify({ cancellation })]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; }
  try {
    const input = await collectSavedPreview(c, cancellation);
    const archive = await pack(input);
    if (archive.length > 120 * 1024 * 1024) throw Error('Scoped audio archive exceeds 120 MB');
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock(761281)');
    const used = Number((await c.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
    if (used + archive.length > mediaLibraryLimit()) throw Error('No media space for scoped audio export; saved assets and cancellation remain intact');
    const created = (await c.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES('MSC_N007_v02_saved_audio.zip','application/zip',$1,$2) RETURNING id", [archive.length, archive])).rows[0];
    const result = { asset_id: created.id, size: archive.length, cancellation, summary: input.manifest.summary };
    await c.query("UPDATE media_jobs SET status='completed',completed_at=now(),error=NULL,result=$2 WHERE id=$1", [receipt.id, JSON.stringify(result)]);
    await c.query('COMMIT');
    return { duplicate: false, ...result };
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    await c.query("UPDATE media_jobs SET status='failed',error='Scoped saved-audio export failed. Old unapproved MSC jobs remain cancelled; existing assets were preserved.',completed_at=now() WHERE id=$1", [receipt.id]).catch(() => {});
    throw e;
  }
}

export async function processMscPreviewExport() {
  let command: Command;
  try { command = previewExportCommandSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-preview-export-command.json'), 'utf8'))); }
  catch { return; }
  const c = await pool.connect(); let locked = false;
  try {
    locked = Boolean((await c.query('SELECT pg_try_advisory_lock(761286) AS locked')).rows[0].locked);
    if (!locked) return;
    const result = await executeMscPreviewExport(c, command);
    console.info('MSC N007 saved-audio export:', JSON.stringify({ duplicate: result.duplicate, summary: result.summary, cancellation: result.cancellation, url: previewSignedUrl(result.asset_id) }));
  } catch {
    console.info('MSC N007 saved-audio export blocked. Check the scoped msc_preview_export receipt; old cancelled jobs are not resumed.');
  } finally { if (locked) await c.query('SELECT pg_advisory_unlock(761286)').catch(() => {}); c.release(); }
}
