import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import { pool } from '../../db';
import { explainerPlanSchema, type ExplainerPlan } from '../../../shared/explainer';
import { generateAudio } from './audio';
import { mediaLibraryLimit } from './storage-quota';
import { packagePreviewExport, previewSignedUrl } from './msc-preview-export';

const run = promisify(execFile);
const REVISION = '8d76f90c8c77acfa88b3227f54aa1e311e7c16e54724bcc5db2091ad71f34edb';
const VOICE = 'Rho2qPfhZy8UjudEdHC2';
const CODES = [1, 2, 3].map(s => `MSC-B01-Q01-N007-S0${s}`);
const PLAN_HASHES: Record<string, string> = {
  [CODES[0]]: '7f5db85f3516347f0c3fbbbd216a3a66be1c693b76f427896e9ca641b31394dc',
  [CODES[1]]: '63fe85066a142d760693b0c0ccfddcd115e11b898972e6d81da5cb58e785e935',
  [CODES[2]]: '164683042e85ea28a2d4e1f068a8d674462cfb5f81b77d59b13d8d3945ee8a8d',
};
export const SOURCE_JOBS: Record<string, string> = {
  [CODES[0]]: 'e49da8fe-9a08-4bcd-905d-34cf8ea0e832',
  [CODES[1]]: '5c0e1640-e588-469c-a996-0f766018f5c4',
  [CODES[2]]: '8d82eb75-d72e-41a1-b1fb-83f6b5c01327',
};
const NO_CHARGE_FAILURE = 'Video va sahna ovozlari uchun kamida 100 MB bo‘sh joy kerak. Audio yaratilmadi.';
const MAX_PACKAGE = 100 * 1024 * 1024;
const KIND = 'msc_preview_audio';
export const previewAudioCommandSchema = z.object({
  command_id: z.literal('MSC-N007-V02-AUDIO-REPAIR-20261009-V1'),
  operation: z.literal('repair_n007_v02_audio_and_export'), approved: z.literal(true), authorized_at: z.literal('2026-10-09'),
  source: z.literal('User requested sample 7 v02 with the approved visual standard, reusing good audio and correcting missing explanations'),
  plans_sha256: z.literal(REVISION),
}).strict();
type Command = z.infer<typeof previewAudioCommandSchema>;
type AudioAction = { scene: number; action: 'reuse' | 'generate'; audio_id?: string; reason: string; text_sha256: string };
type Checkpoint = { scene: number; audio_id: string; source: 'reused' | 'generated'; text_sha256: string; voice_id: string; model: 'eleven_v4'; language: 'uz'; duration?: number };
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export async function loadPreviewAudioPlans() {
  const raw = JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-n007-v02.json'), 'utf8'));
  return validatePlans(raw);
}
function validatePlans(raw: unknown): ExplainerPlan[] {
  if (hash(JSON.stringify(raw)) !== REVISION) throw Error('Preview revision changed; a different reviewed command is required');
  const plans = z.array(explainerPlanSchema).length(3).parse(raw);
  if (plans.some((p, n) => p.profile !== 'msc' || p.lesson_code !== CODES[n] || p.scenes.length !== 19)) throw Error('Preview is restricted to three nineteen-scene N007 lessons');
  return plans;
}

export function previewAudioAction(plan: ExplainerPlan, sourceJob: any, scene: number): AudioAction {
  if (!plan.lesson_code || !CODES.includes(plan.lesson_code) || sourceJob.id !== SOURCE_JOBS[plan.lesson_code] || sourceJob.kind !== 'explainer' || sourceJob.payload?.voice_id !== VOICE || sourceJob.payload?.render_version !== 2) throw Error('Preview source job or same-voice binding is invalid');
  const original = explainerPlanSchema.parse(sourceJob.payload.plan);
  if (original.lesson_code !== plan.lesson_code || original.profile !== 'msc' || original.scenes.length !== 19 || original.source_question !== plan.source_question || original.source_answer !== plan.source_answer) throw Error('Preview source content is not the approved N007 source');
  const text = plan.scenes[scene]?.narration, before = original.scenes[scene]?.narration;
  if (!text || !before) throw Error('Preview scene is outside the reviewed plan');
  const text_sha256 = hash(text);
  if (text !== before) {
    if (![8, 12, 15, 16].includes(scene)) throw Error('Only the four reviewed missing-explanation narrations may change');
    return { scene, action: 'generate', reason: 'reviewed_narration_correction', text_sha256 };
  }
  const checkpoint = sourceJob.result?.audio_scenes?.find((a: any) => a.scene === scene);
  if (checkpoint) return { scene, action: 'reuse', audio_id: z.string().uuid().parse(checkpoint.audio_id), reason: 'identical_saved_narration', text_sha256 };
  const previousError = sourceJob.result?.cancelled_previous_error || sourceJob.error;
  if (plan.lesson_code === CODES[0] && sourceJob.status === 'cancelled' && previousError === NO_CHARGE_FAILURE && sourceJob.result?.pending_scene == null && (!sourceJob.result?.audio_scenes || sourceJob.result.audio_scenes.length === 0)) return { scene, action: 'generate', reason: 'proven_before_provider_quota_failure', text_sha256 };
  throw Error('Existing audio result is unknown or missing; no automatic paid retry');
}

export async function enqueuePreviewAudioCommand(c: any, rawCommand: Command, rawPlans: ExplainerPlan[]) {
  const command = previewAudioCommandSchema.parse(rawCommand), plans = validatePlans(rawPlans);
  await c.query('BEGIN');
  try {
    await c.query('SELECT pg_advisory_xact_lock(761288)');
    const existing = (await c.query("SELECT id,status,result,payload FROM media_jobs WHERE kind='msc_preview_audio_command' AND payload->>'command_id'=$1 FOR UPDATE", [command.command_id])).rows[0];
    if (existing) { if (existing.payload?.plans_sha256 !== REVISION) throw Error('Existing preview receipt binds another revision'); await c.query('COMMIT'); return { duplicate: true, ...existing.result }; }
    const sources = (await c.query("SELECT * FROM media_jobs WHERE id=ANY($1::uuid[]) AND kind='explainer'", [Object.values(SOURCE_JOBS)])).rows;
    const actions = plans.map(plan => {
      const source = sources.find((j: any) => j.id === SOURCE_JOBS[plan.lesson_code!]);
      if (!source || !['completed', 'cancelled'].includes(source.status)) throw Error('Original preview sources must be finished or explicitly cancelled');
      return plan.scenes.map((_, scene) => previewAudioAction(plan, source, scene));
    });
    if (actions.flat().filter(a => a.action === 'generate').length !== 27 || actions.flat().filter(a => a.action === 'reuse').length !== 30) throw Error('Reviewed preview must generate exactly twenty-seven clips and reuse thirty');
    const reuseIds = actions.flat().flatMap(a => a.audio_id ? [a.audio_id] : []);
    const found = (await c.query("SELECT id FROM media_assets WHERE id=ANY($1::uuid[]) AND mime_type='audio/mpeg'", [reuseIds])).rows;
    if (reuseIds.some(id => !found.some((a: any) => a.id === id))) throw Error('Saved scene audio is missing; no paid fallback');
    // Check conservative capacity before any paid request. This is headroom,
    // not a quota reservation; every provider call and cache write rechecks it.
    const used = Number((await c.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
    if (used + 2 * MAX_PACKAGE > mediaLibraryLimit()) throw Error('At least 200 MB media capacity is needed before preview speech requests');
    const receipt = (await c.query("INSERT INTO media_jobs(kind,status,payload) VALUES('msc_preview_audio_command','running',$1) RETURNING id", [JSON.stringify(command)])).rows[0];
    const jobs: any[] = [];
    // Complete examples with their eight corrections first, then the missing
    // first question. This order is shared by the claim and export workers.
    for (const [order, index] of Array.from([1, 2, 0].entries())) {
      const plan = plans[index], reused: Checkpoint[] = actions[index].filter(a => a.action === 'reuse').map(a => ({ scene: a.scene, audio_id: a.audio_id!, source: 'reused', text_sha256: a.text_sha256, voice_id: VOICE, model: 'eleven_v4', language: 'uz' }));
      const payload = { command_id: command.command_id, plans_sha256: REVISION, lesson_code: plan.lesson_code, source_job_id: SOURCE_JOBS[plan.lesson_code!], voice_id: VOICE, model: 'eleven_v4', language: 'uz', plan, actions: actions[index], queue_order: order };
      const job = (await c.query("INSERT INTO media_jobs(kind,payload,result) VALUES('msc_preview_audio',$1,$2) RETURNING id,status", [JSON.stringify(payload), JSON.stringify({ audio_scenes: reused, pending_scene: null })])).rows[0];
      jobs.push({ ...job, lesson_code: plan.lesson_code });
    }
    await c.query("UPDATE media_jobs SET status='completed',result=$2,completed_at=now() WHERE id=$1", [receipt.id, JSON.stringify({ job_ids: jobs.map(j => j.id), lessons: jobs, generated_clip_count: 27, reused_clip_count: 30 })]);
    await c.query('COMMIT'); return { duplicate: false, lessons: jobs, generated_clip_count: 27, reused_clip_count: 30 };
  } catch (e) { await c.query('ROLLBACK'); throw e; }
}

export type PreviewAudioDeps = { generate: (text: string, voice: string) => Promise<Buffer>; duration: (audio: Buffer) => Promise<number>; pack: typeof packagePreviewExport };
const dependencies: PreviewAudioDeps = {
  generate: (text, voice) => generateAudio({ name: 'MSC N007 v02 reviewed preview', text, voice_id: voice, language: 'uz', model: 'eleven_v4' }),
  async duration(audio) {
    const dir = await mkdtemp(join(tmpdir(), 'msc-preview-duration-'));
    try { await writeFile(join(dir, 'scene.mp3'), audio); return Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', join(dir, 'scene.mp3')], { timeout: 15000, maxBuffer: 1024 * 1024 })).stdout.trim()); }
    finally { await rm(dir, { recursive: true, force: true }); }
  },
  pack: packagePreviewExport,
};
function validJob(job: any) {
  if (job.kind !== KIND || job.payload?.command_id !== 'MSC-N007-V02-AUDIO-REPAIR-20261009-V1' || job.payload?.plans_sha256 !== REVISION || !CODES.includes(job.payload?.lesson_code) || job.payload?.source_job_id !== SOURCE_JOBS[job.payload.lesson_code] || job.payload?.voice_id !== VOICE || job.payload?.model !== 'eleven_v4' || job.payload?.language !== 'uz') throw Error('Preview audio job scope is invalid');
  const plan = explainerPlanSchema.parse(job.payload.plan);
  if (plan.lesson_code !== job.payload.lesson_code || plan.profile !== 'msc' || plan.scenes.length !== 19) throw Error('Preview audio plan scope is invalid');
  if (hash(JSON.stringify(plan)) !== PLAN_HASHES[plan.lesson_code!]) throw Error('Preview lesson differs from the exact reviewed revision');
  const actions = job.payload.actions as AudioAction[];
  if (!Array.isArray(actions) || actions.length !== 19 || new Set(actions.map(a => a.scene)).size !== 19 || actions.some(a => !Number.isInteger(a.scene) || a.scene < 0 || a.scene >= 19 || a.text_sha256 !== hash(plan.scenes[a.scene].narration))) throw Error('Preview audio actions differ from the exact reviewed scenes');
  if (actions.some(a => a.action !== (plan.lesson_code === CODES[0] || [8, 12, 15, 16].includes(a.scene) ? 'generate' : 'reuse'))) throw Error('Preview fresh/reuse clip scope changed');
  return plan;
}
async function previewArchive(c: any, jobs: any[]) {
  const files: { path: string; data: Buffer }[] = [], lessons: any[] = [];
  let bytes = 0;
  for (const job of jobs) {
    const plan = validJob(job), code = plan.lesson_code!, checkpoint: Checkpoint[] = job.result?.audio_scenes || [];
    files.push({ path: `imported/${code}/plan.json`, data: Buffer.from(JSON.stringify(plan, null, 2)) });
    const scenes: any[] = [];
    for (let scene = 0; scene < plan.scenes.length; scene++) {
      const saved = checkpoint.find(a => a.scene === scene);
      if (!saved || saved.text_sha256 !== hash(plan.scenes[scene].narration) || saved.voice_id !== VOICE || saved.model !== 'eleven_v4' || saved.language !== 'uz') throw Error('Preview archive is missing the reviewed audio checkpoint');
      const audio = (await c.query("SELECT id,size,data FROM media_assets WHERE id=$1 AND mime_type='audio/mpeg'", [saved.audio_id])).rows[0];
      if (!audio) throw Error('Saved preview audio was removed; it is not recreated automatically');
      bytes += audio.size; if (bytes > MAX_PACKAGE) throw Error('Preview audio package exceeds 100 MB');
      const path = `imported/${code}/audio/scene_${String(scene).padStart(2, '0')}.mp3`;
      files.push({ path, data: audio.data });
      scenes.push({ index: scene, title: plan.scenes[scene].title, stage: plan.scenes[scene].stage, narration: plan.scenes[scene].narration, audio_id: audio.id, audio_path: path, audio_status: 'saved', source: saved.source, duration: saved.duration || null });
    }
    lessons.push({ lesson_code: code, job_id: job.id, status: 'saved_audio_complete', scene_count: 19, missing_scene_count: 0, pending_scene: null, source_voice: { voice_id: VOICE, model: 'eleven_v4', language: 'uz' }, scenes, images: [], errors: [] });
  }
  return { manifest: { version: 2, operation: 'reviewed_n007_v02_audio_preview', plans_sha256: REVISION, export_codes: lessons.map(l => l.lesson_code), created_at: new Date().toISOString(), lessons, summary: { lessons: lessons.length, complete_audio_lessons: lessons.length, saved_scene_audio: lessons.length * 19, missing_scene_audio: 0 } }, files };
}

export async function runPreviewAudioJob(c: any, job: any, deps: PreviewAudioDeps = dependencies) {
  const plan = validJob(job);
  if (job.status !== 'running') throw Error('Preview audio job is not claimed');
  if (job.result?.pending_scene != null) throw Error('Previous paid preview request is unresolved; automatic repeat is forbidden');
  let checkpoint: Checkpoint[] = job.result?.audio_scenes || [];
  for (const action of job.payload.actions as AudioAction[]) {
    const scene = action.scene;
    if (action.text_sha256 !== hash(plan.scenes[scene]?.narration || '')) throw Error('Reviewed narrator text changed');
    const saved = checkpoint.find(a => a.scene === scene);
    if (saved) {
      if (saved.text_sha256 !== action.text_sha256 || saved.voice_id !== VOICE || saved.model !== 'eleven_v4' || saved.language !== 'uz' || !(await c.query("SELECT id FROM media_assets WHERE id=$1 AND mime_type='audio/mpeg'", [saved.audio_id])).rows[0]) throw Error('Saved preview checkpoint is invalid; no paid fallback');
      continue;
    }
    if (action.action !== 'generate' || !['reviewed_narration_correction', 'proven_before_provider_quota_failure'].includes(action.reason)) throw Error('Missing existing audio must not be regenerated');
    const beat = await c.query("UPDATE media_jobs SET started_at=now() WHERE id=$1 AND status='running'", [job.id]);
    if (!beat.rowCount) throw Error('Preview audio job stopped');
    const used = Number((await c.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
    if (used + 8 * 1024 * 1024 > mediaLibraryLimit()) throw Error('No capacity before preview provider request; audio was not requested');
    const pending = { ...job.result, audio_scenes: checkpoint, pending_scene: scene };
    const marked = await c.query("UPDATE media_jobs SET result=$2 WHERE id=$1 AND status='running'", [job.id, JSON.stringify(pending)]);
    if (!marked.rowCount) throw Error('Preview audio job stopped before provider request');
    job.result = pending;
    const audio = await deps.generate(plan.scenes[scene].narration, VOICE), duration = await deps.duration(audio);
    if (!audio.length || audio.length > 8 * 1024 * 1024 || !(audio.subarray(0, 3).toString() === 'ID3' || (audio[0] === 255 && (audio[1] & 224) === 224)) || !Number.isFinite(duration) || duration <= 0 || duration > 300) throw Error('Preview speech result is invalid; pending provider result is retained');
    await c.query('BEGIN');
    try {
      const live = (await c.query("SELECT status,result FROM media_jobs WHERE id=$1 FOR UPDATE", [job.id])).rows[0];
      if (live?.status !== 'running' || live.result?.pending_scene !== scene) throw Error('Preview audio job stopped after provider request; automatic repeat is forbidden');
      await c.query('SELECT pg_advisory_xact_lock(761281)');
      const usedNow = Number((await c.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
      if (usedNow + audio.length > mediaLibraryLimit()) throw Error('Generated preview speech could not be cached; automatic repeat is forbidden');
      const asset = (await c.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'audio/mpeg',$2,$3) RETURNING id", [`${plan.lesson_code}_v02_scene_${String(scene).padStart(2, '0')}.mp3`, audio.length, audio])).rows[0];
      checkpoint = [...checkpoint, { scene, audio_id: asset.id, source: 'generated', text_sha256: action.text_sha256, voice_id: VOICE, model: 'eleven_v4', language: 'uz', duration }];
      const result = { ...job.result, audio_scenes: checkpoint, pending_scene: null };
      await c.query("UPDATE media_jobs SET result=$2,started_at=now() WHERE id=$1 AND status='running'", [job.id, JSON.stringify(result)]);
      await c.query('COMMIT'); job.result = result;
    } catch (e) { await c.query('ROLLBACK'); throw e; }
  }
  const archive = await deps.pack(await previewArchive(c, [job]));
  if (archive.length > MAX_PACKAGE) throw Error('Preview lesson archive exceeds 100 MB');
  await c.query('BEGIN');
  try {
    const live = (await c.query("SELECT status,result FROM media_jobs WHERE id=$1 FOR UPDATE", [job.id])).rows[0];
    if (live?.status !== 'running') throw Error('Preview job stopped before export');
    await c.query('SELECT pg_advisory_xact_lock(761281)');
    const used = Number((await c.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
    if (used + archive.length > mediaLibraryLimit()) throw Error('Preview lesson ZIP capacity is unavailable; saved audio is preserved');
    const asset = (await c.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES($1,'application/zip',$2,$3) RETURNING id", [`${plan.lesson_code}_v02_audio.zip`, archive.length, archive])).rows[0];
    const result = { ...job.result, export_asset_id: asset.id, revision: REVISION };
    await c.query("UPDATE media_jobs SET status='completed',result=$2,completed_at=now(),error=NULL WHERE id=$1 AND status='running'", [job.id, JSON.stringify(result)]);
    await c.query('COMMIT'); job.result = result; job.status = 'completed';
    return { lesson_code: plan.lesson_code, asset_id: asset.id, generated: checkpoint.filter(a => a.source === 'generated').length, reused: checkpoint.filter(a => a.source === 'reused').length };
  } catch (e) { await c.query('ROLLBACK'); throw e; }
}

export async function processMscPreviewAudioCommand() {
  let command: Command, plans: ExplainerPlan[];
  try { command = previewAudioCommandSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-preview-audio-command.json'), 'utf8'))); plans = await loadPreviewAudioPlans(); }
  catch { return; }
  const c = await pool.connect();
  try { const result = await enqueuePreviewAudioCommand(c, command, plans); if (!result.duplicate) console.info('MSC N007 v02 audio accepted: 27 new clips; 30 existing clips reused; no publication or server render.'); }
  catch (e) { console.info('MSC N007 v02 audio command blocked:', e instanceof Error ? e.message : 'Scoped preview command could not be accepted'); }
  finally { c.release(); }
}

let busy = false;
export async function processMscPreviewAudio() {
  if (busy) return; busy = true;
  let lease: any, locked = false;
  try {
    lease = await pool.connect(); locked = Boolean((await lease.query('SELECT pg_try_advisory_lock(761289) AS locked')).rows[0].locked); if (!locked) return;
    // Two simultaneous preview repair requests maximum across application
    // replicas. Stale unknown requests stop; cached clips never repeat.
    await pool.query("UPDATE media_jobs SET status=CASE WHEN result->>'pending_scene' IS NULL THEN 'queued' ELSE 'failed' END,error=CASE WHEN result->>'pending_scene' IS NULL THEN NULL ELSE 'Previous paid preview request is unresolved; check ElevenLabs history. No automatic repeat.' END WHERE kind='msc_preview_audio' AND payload->>'command_id'=$1 AND payload->>'plans_sha256'=$2 AND payload->>'lesson_code'=ANY($3::text[]) AND status='running' AND started_at<now()-interval '10 minutes'", ['MSC-N007-V02-AUDIO-REPAIR-20261009-V1', REVISION, CODES]);
    const jobs = (await pool.query("UPDATE media_jobs SET status='running',started_at=now() WHERE id IN (SELECT id FROM media_jobs WHERE kind='msc_preview_audio' AND payload->>'command_id'=$1 AND payload->>'plans_sha256'=$2 AND payload->>'lesson_code'=ANY($3::text[]) AND status='queued' ORDER BY (payload->>'queue_order')::int,created_at FOR UPDATE SKIP LOCKED LIMIT 2) RETURNING *", ['MSC-N007-V02-AUDIO-REPAIR-20261009-V1', REVISION, CODES])).rows;
    await Promise.all(jobs.map(async job => {
      const c = await pool.connect();
      try { const result = await runPreviewAudioJob(c, job); console.info('MSC N007 v02 lesson audio ready:', JSON.stringify({ ...result, url: previewSignedUrl(result.asset_id) })); }
      catch (e) { await c.query("UPDATE media_jobs SET status='failed',error=$2,completed_at=now() WHERE id=$1 AND status='running'", [job.id, e instanceof Error ? e.message : 'Scoped preview audio failed; saved clips preserved; no automatic retry']); console.info('MSC N007 v02 audio blocked:', job.payload?.lesson_code, e instanceof Error ? e.message : 'Scoped job failed'); }
      finally { c.release(); }
    }));
    const receipt = (await pool.query("SELECT id,result FROM media_jobs WHERE kind='msc_preview_audio_command' AND payload->>'command_id'='MSC-N007-V02-AUDIO-REPAIR-20261009-V1'")).rows[0];
    if (receipt?.result?.job_ids?.length === 3 && !receipt.result.export_asset_id) {
      const complete = (await pool.query("SELECT * FROM media_jobs WHERE id=ANY($1::uuid[]) AND kind='msc_preview_audio' AND status='completed'", [receipt.result.job_ids])).rows;
      if (complete.length === 3) {
        const archive = await packagePreviewExport(await previewArchive(lease, complete));
        if (archive.length > MAX_PACKAGE) throw Error('Final preview archive exceeds 100 MB');
        await lease.query('BEGIN');
        try {
          await lease.query('SELECT pg_advisory_xact_lock(761281)');
          const used = Number((await lease.query('SELECT COALESCE(SUM(size),0) AS used FROM media_assets')).rows[0].used);
          if (used + archive.length > mediaLibraryLimit()) throw Error('Final preview audio ZIP capacity unavailable; saved audio preserved');
          const asset = (await lease.query("INSERT INTO media_assets(name,mime_type,size,data) VALUES('MSC_N007_v02_all_audio.zip','application/zip',$1,$2) RETURNING id", [archive.length, archive])).rows[0];
          await lease.query('UPDATE media_jobs SET result=$2 WHERE id=$1', [receipt.id, JSON.stringify({ ...receipt.result, export_asset_id: asset.id })]);
          await lease.query('COMMIT'); console.info('MSC N007 v02 full audio package ready:', JSON.stringify({ asset_id: asset.id, url: previewSignedUrl(asset.id) }));
        } catch (e) { await lease.query('ROLLBACK'); throw e; }
      }
    }
  } catch (e) { console.info('MSC N007 v02 audio worker blocked:', e instanceof Error ? e.message : 'Scoped preview worker unavailable'); }
  finally { if (locked) await lease.query('SELECT pg_advisory_unlock(761289)').catch(() => {}); lease?.release(); busy = false; }
}
