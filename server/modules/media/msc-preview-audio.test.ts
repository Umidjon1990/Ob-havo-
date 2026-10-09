import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

process.env.DATABASE_URL ||= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.OPENAI_API_KEY ||= 'test-not-a-real-key';
process.env.MEDIA_ENCRYPTION_KEY ||= 'audio-repair-test-only';
process.env.APP_URL ||= 'https://example.invalid';

const oldPlans = JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-october-2026.json'), 'utf8')).slice(0, 3);
const revision = JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-n007-v02.json'), 'utf8'));
const rawCommand = JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-preview-audio-command.json'), 'utf8'));
const sourceIds = ['e49da8fe-9a08-4bcd-905d-34cf8ea0e832', '5c0e1640-e588-469c-a996-0f766018f5c4', '8d82eb75-d72e-41a1-b1fb-83f6b5c01327'];
const voiceId = 'Rho2qPfhZy8UjudEdHC2';
const revisedScenes = [8, 12, 15, 16];
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
const copy = <T>(value: T): T => structuredClone(value);
const { previewAudioCommandSchema, loadPreviewAudioPlans, previewAudioAction, enqueuePreviewAudioCommand, runPreviewAudioJob } = await import('./msc-preview-audio');
const { packagePreviewExport } = await import('./msc-preview-export');
const command = previewAudioCommandSchema.parse(rawCommand);
const plans = await loadPreviewAudioPlans();

function sourceFixture() {
  const assets = new Map<string, any>();
  const posts = oldPlans.map((plan: any, n: number) => ({ id: id(n + 1), title: plan.title, variants: { explainer: copy(plan) }, asset_ids: [] }));
  posts.push({ id: id(90), title: 'Approved sample six', variants: { explainer: { ...copy(oldPlans[0]), lesson_code: 'MSC-B01-Q01-N006-S02' }, approved: true }, asset_ids: [id(91)] } as any);
  const sources = oldPlans.map((plan: any, n: number) => ({
    id: sourceIds[n], kind: 'explainer', status: n === 0 ? 'cancelled' : 'completed',
    payload: { post_id: posts[n].id, plan: copy(plan), voice_id: voiceId, render_version: 2 },
    result: { audio_scenes: n === 0 ? [] : plan.scenes.map((_: any, index: number) => {
      const audioId = id(1000 + n * 100 + index), data = Buffer.from(`ID3saved-${n}-${index}`);
      assets.set(audioId, { id: audioId, name: `Saved ${n}/${index}`, mime_type: 'audio/mpeg', size: data.length, data });
      return { scene: index, audio_id: audioId };
    }), pending_scene: null,
      ...(n === 0 ? { cancelled_previous_error: 'Video va sahna ovozlari uchun kamida 100 MB bo‘sh joy kerak. Audio yaratilmadi.', cancelled_previous_status: 'failed' } : {}) },
    error: n === 0 ? 'Foydalanuvchi eski MSC montajini to‘xtatdi. Saqlangan ovozlar v02 uchun saqlanadi.' : null,
  }));
  return { posts, sources, assets };
}

function mockDatabase() {
  const source = sourceFixture();
  let jobs = new Map<string, any>(source.sources.map(j => [j.id, copy(j)]));
  let assets = source.assets;
  const deliveries = [{ post_id: id(90), status: 'published', platform: 'youtube' }];
  const settings = { enabled: true, tests_enabled: true, campaign_enabled: true };
  const events: { sql: string; args: any[] }[] = [];
  let nextJob = 3000, nextAsset = 4000, transaction: any = null;
  let usedBytesOverride: number | null = null;
  let failWhen: ((sql: string, args: any[]) => void) | null = null;
  const protectedBefore = JSON.stringify({ sourceJobs: source.sources, posts: source.posts, deliveries, settings });
  const c = { async query(sql: string, args: any[] = []): Promise<any> {
    events.push({ sql, args: copy(args) });
    failWhen?.(sql, args);
    if (sql === 'BEGIN') { assert.equal(transaction, null, 'transactions must not nest'); transaction = { jobs: new Map([...jobs].map(([key, value]) => [key, copy(value)])), assets: new Map(assets) }; return { rows: [], rowCount: 0 }; }
    if (sql === 'COMMIT') { transaction = null; return { rows: [], rowCount: 0 }; }
    if (sql === 'ROLLBACK') { if (transaction) { jobs = transaction.jobs; assets = transaction.assets; } transaction = null; return { rows: [], rowCount: 0 }; }
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.startsWith('SELECT ') && sql.includes('FROM media_jobs')) {
      let found = [...jobs.values()];
      if (sql.includes("kind='msc_preview_audio_command'")) found = found.filter(j => j.kind === 'msc_preview_audio_command' && j.payload.command_id === args[0]);
      else if (sql.includes('id=ANY')) found = found.filter(j => args[0].includes(j.id));
      else if (sql.includes('id=$1')) found = found.filter(j => j.id === args[0]);
      if (sql.includes("kind='explainer'")) found = found.filter(j => j.kind === 'explainer');
      return { rows: found.map(copy), rowCount: found.length };
    }
    if (sql.includes('SUM(size)')) return { rows: [{ used: usedBytesOverride ?? [...assets.values()].reduce((sum, a) => sum + a.size, 0) }], rowCount: 1 };
    if (sql.startsWith('SELECT ') && sql.includes('FROM media_assets')) {
      const found = sql.includes('id=ANY') ? [...assets.values()].filter(a => args[0].includes(a.id)) : assets.has(args[0]) ? [assets.get(args[0])] : [];
      return { rows: found.filter(a => !sql.includes("mime_type='audio/mpeg'") || a.mime_type === 'audio/mpeg').map(a => ({ ...a })), rowCount: found.length };
    }
    if (sql.startsWith('INSERT INTO media_jobs')) {
      const kind = sql.match(/VALUES\('([^']+)'/)?.[1];
      assert.ok(['msc_preview_audio', 'msc_preview_audio_command'].includes(kind || ''), 'only scoped repair jobs are inserted');
      const value = { id: id(nextJob++), kind, status: kind === 'msc_preview_audio_command' ? 'running' : 'queued', payload: JSON.parse(args[0]), result: args[1] ? JSON.parse(args[1]) : null };
      jobs.set(value.id, value); return { rows: [copy(value)], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE media_jobs')) {
      assert.ok(!sourceIds.includes(args[0]), 'the original source jobs are immutable');
      const value = jobs.get(args[0]);
      if (!value || (sql.includes("AND status='running'") && value.status !== 'running')) return { rows: [], rowCount: 0 };
      const status = sql.match(/SET status='([^']+)'/)?.[1]; if (status) value.status = status;
      if (sql.includes('result=$2')) value.result = JSON.parse(args[1]);
      if (sql.includes('error=NULL')) value.error = null;
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO media_assets')) {
      const mime = sql.match(/VALUES\(\$1,'([^']+)'/)?.[1];
      assert.ok(['audio/mpeg', 'application/zip'].includes(mime || ''), 'repair persists only scene audio and its archive');
      const asset = { id: id(nextAsset++), name: args[0], mime_type: mime, size: args[1], data: args[2] };
      assets.set(asset.id, asset); return { rows: [{ id: asset.id }], rowCount: 1 };
    }
    throw Error(`Unexpected SQL in scoped audio test: ${sql}`);
  } };
  return {
    c, source, deliveries, settings, events,
    get jobs() { return jobs; }, get assets() { return assets; },
    set usedBytes(value: number) { usedBytesOverride = value; },
    set failWhen(value: ((sql: string, args: any[]) => void) | null) { failWhen = value; },
    claim(jobId: string) { const live = jobs.get(jobId); assert.ok(live); live.status = 'running'; return copy(live); },
    assertProtected() { assert.equal(JSON.stringify({ sourceJobs: sourceIds.map(k => jobs.get(k)), posts: source.posts, deliveries, settings }), protectedBefore); },
  };
}

test('revision scope is immutable and plans require exactly three reviewed N007 lessons', async () => {
  assert.deepEqual(plans.map(p => p.lesson_code), revision.map((p: any) => p.lesson_code));
  assert.equal(plans.length, 3); assert.ok(plans.every(p => p.scenes.length === 19));
  for (const bad of [
    { ...command, approved: false }, { ...command, command_id: 'another-id' },
    { ...command, plans_sha256: '0'.repeat(64) }, { ...command, voice_id: 'another-voice' },
    { ...command, lesson_codes: ['MSC-B01-Q01-N006-S02'] }, { ...command, publication: true },
  ]) assert.throws(() => previewAudioCommandSchema.parse(bad));
  const db = mockDatabase();
  await assert.rejects(enqueuePreviewAudioCommand(db.c, command, [{ ...plans[0], lesson_code: 'MSC-B01-Q01-N006-S02' }, ...plans.slice(1)] as any), /revision changed/);
  await assert.rejects(enqueuePreviewAudioCommand(db.c, command, [...plans, plans[0]] as any), /revision changed/);
  assert.equal(db.events.length, 0, 'invalid revisions are rejected before a database transaction');
});

test('exactly twenty-seven clips are generated and thirty saved identical narrations are reused', () => {
  const source = sourceFixture();
  const actions = plans.map((p, n) => p.scenes.map((_, index) => previewAudioAction(p, source.sources[n], index)));
  assert.equal(actions.flat().filter(a => a.action === 'generate').length, 27);
  assert.equal(actions.flat().filter(a => a.action === 'reuse').length, 30);
  assert.ok(actions[0].every(a => a.action === 'generate'));
  for (const n of [1, 2]) {
    assert.deepEqual(actions[n].filter(a => a.action === 'generate').map(a => a.scene), revisedScenes);
    for (const action of actions[n].filter(a => a.action === 'reuse')) assert.equal(action.audio_id, source.sources[n].result.audio_scenes.find((saved: any) => saved.scene === action.scene)?.audio_id);
  }
  assert.throws(() => previewAudioAction(plans[0], { ...source.sources[0], result: { pending_scene: 0, audio_scenes: [] } }, 0), /unknown or missing/);
  assert.throws(() => previewAudioAction(plans[1], { ...source.sources[1], payload: { ...source.sources[1].payload, voice_id: 'other' } }, 0), /same-voice/);
  assert.throws(() => previewAudioAction(plans[1], { ...source.sources[1], id: id(999) }, 0), /source job/);
});

test('enqueue is atomic, idempotent and limited to scoped jobs without source, publication or global mutations', async () => {
  const db = mockDatabase(), first = await enqueuePreviewAudioCommand(db.c, command, plans);
  assert.equal(first.duplicate, false); assert.equal(first.generated_clip_count, 27); assert.equal(first.reused_clip_count, 30);
  assert.deepEqual(first.lessons.map((j: any) => j.lesson_code), [plans[1].lesson_code, plans[2].lesson_code, plans[0].lesson_code]);
  assert.equal(first.lessons.length, 3);
  const repairJobs = [...db.jobs.values()].filter(j => j.kind === 'msc_preview_audio');
  assert.equal(repairJobs.length, 3); assert.ok(repairJobs.every(j => j.payload.voice_id === voiceId && j.payload.command_id === command.command_id && j.payload.plans_sha256 === command.plans_sha256));
  assert.equal(repairJobs.reduce((sum, j) => sum + j.result.audio_scenes.length, 0), 30);
  const second = await enqueuePreviewAudioCommand(db.c, command, plans);
  assert.equal(second.duplicate, true); assert.deepEqual(second.lessons, first.lessons);
  assert.equal([...db.jobs.values()].filter(j => j.kind === 'msc_preview_audio').length, 3);
  assert.equal(db.events.filter(e => e.sql.startsWith('INSERT INTO media_jobs')).length, 4);
  assert.ok(!db.events.some(e => /(?:INSERT|UPDATE|DELETE).*media_(?:posts|deliveries|config)/.test(e.sql)));
  db.assertProtected();
});

test('missing saved audio fails enqueue atomically and has no paid fallback', async () => {
  const db = mockDatabase(); db.assets.delete(id(1100));
  await assert.rejects(enqueuePreviewAudioCommand(db.c, command, plans), /Saved scene audio is missing; no paid fallback/);
  assert.equal(db.jobs.size, 3); assert.equal(db.events.at(-1)?.sql, 'ROLLBACK'); db.assertProtected();
});

test('paid request is checkpointed before call; all three lesson archives are complete with exactly twenty-seven calls', async () => {
  const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans);
  const calls: { code: string; scene: number; text: string }[] = [], archives: any[] = [];
  for (const queuedJob of queued.lessons) {
    const job = db.claim(queuedJob.id);
    const result = await runPreviewAudioJob(db.c, job, {
      async generate(text, voice) {
        const live = db.jobs.get(job.id), scene = live.result.pending_scene;
        assert.equal(voice, voiceId); assert.equal(typeof scene, 'number', 'pending checkpoint exists durably before paid provider call');
        assert.equal(live.payload.plan.scenes[scene].narration, text);
        assert.equal(live.result.audio_scenes.some((s: any) => s.scene === scene), false);
        calls.push({ code: job.payload.lesson_code, scene, text }); return Buffer.from(`ID3generated-${job.payload.lesson_code}-${scene}`);
      },
      async duration() { return 12.5; },
      async pack(input) { archives.push(input); assert.equal(db.jobs.get(job.id).result.pending_scene, null); return Buffer.from('per-lesson-zip'); },
    });
    const expectedGenerated = job.payload.lesson_code === plans[0].lesson_code ? 19 : 4;
    assert.equal(result.generated, expectedGenerated); assert.equal(result.reused, 19 - expectedGenerated);
    assert.equal(db.jobs.get(job.id).status, 'completed'); assert.equal(db.assets.get(result.asset_id).mime_type, 'application/zip');
    await assert.rejects(runPreviewAudioJob(db.c, copy(db.jobs.get(job.id)), { async generate() { throw Error('must never call after complete'); }, async duration() { return 1; }, async pack() { throw Error('must never repack complete job'); } }), /not claimed/);
  }
  assert.equal(calls.length, 27); assert.equal(archives.length, 3);
  assert.equal(archives.reduce((sum, input) => sum + input.manifest.summary.saved_scene_audio, 0), 57);
  assert.equal(archives.flatMap(input => input.manifest.lessons[0].scenes).filter((s: any) => s.source === 'reused').length, 30);
  for (const input of archives) {
    assert.equal(input.files.filter((f: any) => f.path.endsWith('.mp3')).length, 19);
    assert.equal(input.manifest.lessons[0].pending_scene, null);
    assert.ok(input.files.every((f: any) => /^imported\/MSC-B01-Q01-N007-S0[123]\//.test(f.path)));
    assert.ok(!JSON.stringify(input.manifest).includes('N006'));
  }
  db.assertProtected();
});

test('unknown provider failure retains pending checkpoint and refuses any repeated paid request', async () => {
  const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans), job = db.claim(queued.lessons[0].id);
  let calls = 0;
  const deps = { async generate() { calls++; assert.equal(db.jobs.get(job.id).result.pending_scene, 8); throw Error('provider response lost'); }, async duration() { return 1; }, async pack() { throw Error('must not package incomplete audio'); } };
  await assert.rejects(runPreviewAudioJob(db.c, job, deps), /provider response lost/);
  assert.equal(db.jobs.get(job.id).result.pending_scene, 8); assert.equal(db.jobs.get(job.id).result.audio_scenes.length, 15);
  await assert.rejects(runPreviewAudioJob(db.c, copy(db.jobs.get(job.id)), deps), /unresolved; automatic repeat is forbidden/);
  assert.equal(calls, 1); db.assertProtected();
});

test('altered plan, action list or cached voice binding is rejected before any paid call', async () => {
  const mutators: ((job: any) => void)[] = [
    job => { job.payload.plan.scenes[8].narration += ' Unreviewed text.'; },
    job => { job.payload.plan.scenes[0].title = 'Unreviewed title'; },
    job => { job.payload.plan.scenes[0].translation = 'Unreviewed translation'; },
    job => { job.payload.actions.pop(); },
    job => { job.payload.actions[1] = copy(job.payload.actions[0]); },
    job => { job.payload.actions[0].action = 'generate'; job.payload.actions[0].reason = 'reviewed_narration_correction'; job.result.audio_scenes = job.result.audio_scenes.filter((s: any) => s.scene !== 0); },
    job => { job.result.audio_scenes[0].voice_id = 'other-clone'; },
    job => { job.result.audio_scenes[0].model = 'different-model'; },
    job => { delete job.result.audio_scenes[0].language; },
    job => { job.result.audio_scenes[0].text_sha256 = '0'.repeat(64); },
  ];
  for (const mutate of mutators) {
    const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans), job = db.claim(queued.lessons[0].id);
    mutate(job); let calls = 0;
    await assert.rejects(runPreviewAudioJob(db.c, job, { async generate() { calls++; return Buffer.from('ID3never'); }, async duration() { return 1; }, async pack() { return Buffer.from('never'); } }), /scope|reviewed|revision|action|checkpoint|voice/i);
    assert.equal(calls, 0, 'binding changes are detected before charging a provider'); db.assertProtected();
  }
});

test('cache persistence failure rolls back generated asset but retains unresolved paid checkpoint after restart', async () => {
  const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans), job = db.claim(queued.lessons[0].id), assetCount = db.assets.size;
  let calls = 0;
  db.failWhen = (sql, args) => {
    if (sql.startsWith('UPDATE media_jobs SET result=$2,started_at=now()') && args[0] === job.id) throw Error('simulated cache persistence failure');
  };
  const deps = { async generate() { calls++; return Buffer.from('ID3paid-response'); }, async duration() { return 10; }, async pack() { throw Error('must never export an unknown paid clip'); } };
  await assert.rejects(runPreviewAudioJob(db.c, job, deps), /simulated cache persistence failure/);
  assert.equal(db.assets.size, assetCount); assert.equal(db.jobs.get(job.id).result.pending_scene, 8);
  assert.equal(db.jobs.get(job.id).result.audio_scenes.length, 15);
  db.failWhen = null;
  await assert.rejects(runPreviewAudioJob(db.c, copy(db.jobs.get(job.id)), deps), /unresolved; automatic repeat is forbidden/);
  assert.equal(calls, 1); db.assertProtected();
});

test('cached paid clips survive archive failure and are reused after a fresh worker restart', async () => {
  const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans), job = db.claim(queued.lessons[0].id);
  let calls = 0, packs = 0;
  const deps = { async generate() { calls++; return Buffer.from(`ID3paid-${calls}`); }, async duration() { return 9; }, async pack() { packs++; throw Error('archive failed after cached audio'); } };
  await assert.rejects(runPreviewAudioJob(db.c, job, deps), /archive failed after cached audio/);
  assert.equal(calls, 4); assert.equal(db.jobs.get(job.id).result.audio_scenes.length, 19); assert.equal(db.jobs.get(job.id).result.pending_scene, null);
  const result = await runPreviewAudioJob(db.c, copy(db.jobs.get(job.id)), { ...deps, async pack(input) { packs++; assert.equal(input.manifest.summary.saved_scene_audio, 19); return Buffer.from('retry-zip'); } });
  assert.equal(calls, 4, 'a restart cannot repeat the four cached paid clips'); assert.equal(packs, 2);
  assert.equal(result.generated, 4); assert.equal(result.reused, 15); assert.equal(db.jobs.get(job.id).status, 'completed'); db.assertProtected();
});

test('actual per-lesson ZIP contains all reviewed narration and exact generated or reused MP3 files', async () => {
  const db = mockDatabase(), queued = await enqueuePreviewAudioCommand(db.c, command, plans), job = db.claim(queued.lessons[0].id);
  let calls = 0;
  const result = await runPreviewAudioJob(db.c, job, { async generate(_text, voice) { calls++; assert.equal(voice, voiceId); return Buffer.from(`ID3new-${calls}`); }, async duration() { return 8; }, pack: packagePreviewExport });
  const dir = await mkdtemp(join(tmpdir(), 'msc-audio-repair-test-'));
  try {
    const path = join(dir, 'lesson.zip'); await writeFile(path, db.assets.get(result.asset_id).data);
    const run = promisify(execFile); await run('unzip', ['-t', path]);
    const files = (await run('unzip', ['-Z1', path])).stdout.trim().split('\n');
    const code = plans[1].lesson_code!;
    assert.equal(files.filter(f => f.endsWith('.mp3')).length, 19);
    assert.ok(files.includes(`imported/${code}/plan.json`)); assert.ok(files.includes('manifest.json'));
    const manifest = JSON.parse((await run('unzip', ['-p', path, 'manifest.json'])).stdout);
    assert.equal(manifest.lessons[0].scene_count, 19); assert.equal(manifest.lessons[0].source_voice.voice_id, voiceId);
    assert.deepEqual(manifest.lessons[0].scenes.map((s: any) => s.narration), plans[1].scenes.map(s => s.narration));
    assert.equal((await run('unzip', ['-p', path, `imported/${code}/audio/scene_00.mp3`])).stdout, 'ID3saved-1-0');
    assert.equal((await run('unzip', ['-p', path, `imported/${code}/audio/scene_08.mp3`])).stdout, 'ID3new-1');
    assert.equal(calls, 4); db.assertProtected();
  } finally { await rm(dir, { recursive: true, force: true }); }
});
