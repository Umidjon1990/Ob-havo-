import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
process.env.DATABASE_URL ||= 'postgres://unused:unused@127.0.0.1:1/unused';
process.env.OPENAI_API_KEY ||= 'test-not-a-real-key';
process.env.MEDIA_ENCRYPTION_KEY ||= 'export-test-only';
process.env.APP_URL ||= 'https://example.invalid';
const { executeMscPreviewExport, packagePreviewExport, previewExportCommandSchema, previewProtectedPost, previewSignedUrl, EXPORT_CODES, OLD_PACKAGE_CODES } = await import('./msc-preview-export');
const { validAssetSignature } = await import('./security');
const { explainerPlanSchema } = await import('../../../shared/explainer');
const command = previewExportCommandSchema.parse(JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-preview-export-command.json'), 'utf8')));
const plans = JSON.parse(await readFile(join(process.cwd(), 'docs/examples/msc-october-2026.json'), 'utf8')).map((p: any) => explainerPlanSchema.parse(p));
const id = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;

function mockDatabase() {
  const posts = plans.map((p: any, n: number) => ({ id: id(n + 1), title: p.title, variants: { explainer: p, ...(n === 3 ? { user_approved: true } : {}) } }));
  const approved006: any = { id: id(90), title: 'Approved six', variants: { explainer: { ...plans[0], lesson_code: 'MSC-B01-Q01-N006-S02' }, approved: true }, asset_ids: [id(91)] };
  posts.push(approved006);
  const assets = new Map<string, any>();
  const jobs: any[] = plans.map((p: any, n: number) => ({ id: id(100 + n), kind: 'explainer', status: n === 0 ? 'failed' : n < 3 ? 'completed' : 'queued',
    payload: { post_id: posts[n].id, plan: p, voice_id: 'Umidjon-clone-id', render_version: 2, credentials: 'never-export-this-provider-secret' },
    result: { pending_scene: n === 0 ? 0 : null, audio_scenes: n === 0 ? [] : p.scenes.map((_: any, scene: number) => {
      const audioId = id(1000 + 100 * n + scene); const data = Buffer.from(`saved-audio-${n}-${scene}`);
      assets.set(audioId, { id: audioId, mime_type: 'audio/mpeg', size: data.length, data });
      return { scene, audio_id: audioId };
    }), timings: p.scenes.map((s: any, index: number) => ({ start: index * 10, duration: 10, title: s.title })) }, error: n === 0 ? 'Ovoz so‘rovi natijasi noma’lum.' : null }));
  const protectedJob = { id: id(900), kind: 'explainer', status: 'queued', payload: { post_id: approved006.id, plan: approved006.variants.explainer, render_version: 2 } };
  jobs.push(protectedJob, { id: id(901), kind: 'campaign', status: 'queued', payload: {} },
    { id: id(902), kind: 'msc_publication', status: 'queued', payload: { package_id: 'msc-october-2026', post_ids: posts.slice(0, 9).map((p: any) => p.id) } },
    { id: id(903), kind: 'msc_publication', status: 'queued', payload: { package_id: 'other-package', post_ids: posts.map((p: any) => p.id) } });
  const deliveries = [{ post_id: approved006.id, status: 'published' }, { post_id: posts[4].id, status: 'published' }];
  let receipt: any; const events: string[] = []; let archives = 0;
  const c = { async query(sql: string, args: any[] = []): Promise<any> {
    events.push(sql);
    if (sql.startsWith('SELECT id,status,result')) return { rows: receipt ? [receipt] : [] };
    if (sql.startsWith("INSERT INTO media_jobs(kind,status,payload) VALUES('msc_preview_export'")) { receipt = { id: id(950), status: 'running', payload: JSON.parse(args[0]) }; return { rows: [receipt] }; }
    if (sql.startsWith('SELECT id,variants FROM media_posts') || sql.startsWith('SELECT id,title,variants FROM media_posts')) return { rows: posts.filter(p => args[0].includes(p.variants.explainer.lesson_code)) };
    if (sql.startsWith('SELECT post_id,status FROM media_deliveries')) return { rows: deliveries.filter(d => args[0].includes(d.post_id)) };
    if (sql.startsWith("UPDATE media_jobs SET status='cancelled'")) {
      const targets = jobs.filter(j => ['queued', 'running', 'failed'].includes(j.status) && (sql.includes("kind='explainer'") ?
        j.kind === 'explainer' && args[0].includes(j.payload.post_id) && args[2].includes(j.payload.plan?.lesson_code) && j.payload.plan?.profile === 'msc' && j.payload.render_version === 2 :
        j.kind === 'msc_publication' && j.payload.package_id === args[0] && j.payload.post_ids.length === 9 && j.payload.post_ids.every((v: string) => JSON.parse(args[2]).includes(v))));
      targets.forEach(j => { if (j.kind === 'explainer') j.result = { ...j.result, cancelled_previous_error: j.error, cancelled_previous_status: j.status }; j.status = 'cancelled'; j.error = args[1]; }); return { rows: targets.map(j => ({ id: j.id })) };
    }
    if (sql.startsWith('SELECT id,status,payload,result,error,created_at FROM media_jobs')) return { rows: jobs.filter(j => j.kind === 'explainer' && args[0].includes(j.payload.post_id)) };
    if (sql.startsWith('SELECT id,mime_type,size,data')) return { rows: assets.has(args[0]) ? [assets.get(args[0])] : [] };
    if (sql.includes('SUM(size)')) return { rows: [{ used: 0 }] };
    if (sql.startsWith('INSERT INTO media_assets')) { archives++; const a = { id: id(990), mime_type: 'application/zip', size: args[0], data: args[1] }; assets.set(a.id, a); return { rows: [a] }; }
    if (sql.startsWith('UPDATE media_jobs')) {
      if (args[0] === receipt?.id) {
        if (sql.includes("status='completed'")) receipt.status = 'completed';
        if (sql.includes("status='failed'")) receipt.status = 'failed';
        if (sql.includes("status='running'")) receipt.status = 'running';
        if (args[1]) receipt.result = JSON.parse(args[1]);
      }
      return { rows: [] };
    }
    return { rows: [] };
  } };
  return { c, posts, jobs, assets, approved006, events, get receipt() { return receipt; }, get archives() { return archives; } };
}

test('command scope cannot be widened and approved or already-published content is protected', () => {
  assert.equal(EXPORT_CODES.length, 3); assert.equal(OLD_PACKAGE_CODES.length, 9);
  assert.ok(OLD_PACKAGE_CODES.every(c => !c.includes('N006')));
  assert.throws(() => previewExportCommandSchema.parse({ ...command, export_codes: ['MSC-B01-Q01-N006-S02'] }));
  assert.throws(() => previewExportCommandSchema.parse({ ...command, approved: false }));
  assert.equal(previewProtectedPost({ id: 'a', variants: { approved: true } }, []), true);
  assert.equal(previewProtectedPost({ id: 'a', variants: {} }, [{ post_id: 'a', status: 'published' }]), true);
  assert.equal(previewProtectedPost({ id: 'a', variants: {} }, [{ post_id: 'a', status: 'needs_review' }]), true);
  assert.equal(previewProtectedPost({ id: 'a', variants: {} }, []), false);
});

test('scoped cancellation precedes packaging; saved voice export has no provider calls, and receipt is idempotent', async () => {
  const db = mockDatabase(), approvedBefore = JSON.stringify(db.approved006);
  const beforeFetch = globalThis.fetch; let providerCalls = 0; let input: any;
  globalThis.fetch = (async () => { providerCalls++; throw Error('No provider may be contacted'); }) as any;
  try {
    const first = await executeMscPreviewExport(db.c, command, async value => {
      assert.ok(db.events.includes('COMMIT'), 'cancellation commits before the archive is created');
      input = value; return Buffer.from('test-zip');
    });
    assert.equal(first.duplicate, false); assert.equal(db.archives, 1); assert.equal(providerCalls, 0);
    assert.equal(db.jobs.find(j => j.id === id(100)).status, 'cancelled');
    assert.equal(db.jobs.find(j => j.id === id(101)).status, 'completed');
    assert.equal(db.jobs.find(j => j.id === id(102)).status, 'completed');
    assert.equal(db.jobs.find(j => j.id === id(103)).status, 'queued', 'explicitly approved N008 is protected');
    assert.equal(db.jobs.find(j => j.id === id(104)).status, 'queued', 'published N008 is protected');
    assert.equal(db.jobs.find(j => j.id === id(105)).status, 'cancelled');
    assert.equal(db.jobs.find(j => j.id === id(900)).status, 'queued', 'N006 is never targeted');
    assert.equal(db.jobs.find(j => j.id === id(901)).status, 'queued', 'unrelated campaign is unchanged');
    assert.equal(db.jobs.find(j => j.id === id(902)).status, 'cancelled');
    assert.equal(db.jobs.find(j => j.id === id(903)).status, 'queued');
    assert.equal(JSON.stringify(db.approved006), approvedBefore);
    assert.equal(input.manifest.lessons.length, 3);
    assert.equal(input.manifest.lessons[0].pending_scene, 0);
    assert.equal(input.manifest.lessons[0].original_job_status, 'failed');
    assert.ok(input.manifest.lessons[0].errors.includes('Ovoz so‘rovi natijasi noma’lum.'));
    assert.equal(input.manifest.lessons[0].scenes[0].audio_status, 'provider_result_unknown');
    assert.equal(input.manifest.lessons[1].source_voice.voice_id, 'Umidjon-clone-id');
    assert.equal(input.manifest.lessons[1].scenes[0].audio_path, 'imported/MSC-B01-Q01-N007-S02/audio/scene_00.mp3');
    assert.deepEqual(input.manifest.lessons[1].scenes[0].render_timing, { start: 0, duration: 10 });
    assert.equal(input.manifest.summary.saved_scene_audio, 38);
    assert.equal(input.manifest.summary.missing_scene_audio, 19);
    assert.ok(!JSON.stringify(input.manifest).includes('never-export-this-provider-secret'));
    assert.ok(!input.files.some((f: any) => f.path.includes('N006')));
    const second = await executeMscPreviewExport(db.c, command, async () => { throw Error('Do not package twice'); });
    assert.equal(second.duplicate, true); assert.equal(second.asset_id, first.asset_id); assert.equal(db.archives, 1);
  } finally { globalThis.fetch = beforeFetch; }
});

test('failed archive assembly preserves durable cancellation and existing audio assets', async () => {
  const db = mockDatabase(), savedAssetCount = db.assets.size;
  await assert.rejects(executeMscPreviewExport(db.c, command, async () => { throw Error('zip failed'); }), /zip failed/);
  assert.equal(db.receipt.status, 'failed');
  assert.equal(db.jobs.find(j => j.id === id(100)).status, 'cancelled');
  assert.equal(db.assets.size, savedAssetCount); assert.equal(db.archives, 0);
});

test('actual ZIP contains manifest, exact saved scene MP3 and sanitized plan with safe file paths', async () => {
  const db = mockDatabase(); const result = await executeMscPreviewExport(db.c, command);
  const dir = await mkdtemp(join(tmpdir(), 'msc-export-test-'));
  try {
    const path = join(dir, 'export.zip'); await writeFile(path, db.assets.get(result.asset_id).data);
    const run = promisify(execFile);
    await run('unzip', ['-t', path]);
    const listing = (await run('unzip', ['-Z1', path])).stdout.trim().split('\n');
    assert.ok(listing.includes('manifest.json')); assert.ok(listing.includes('imported/MSC-B01-Q01-N007-S02/audio/scene_00.mp3'));
    assert.ok(!listing.some(f => /N006|\.\.\//.test(f)));
    const manifest = JSON.parse((await run('unzip', ['-p', path, 'manifest.json'])).stdout);
    assert.equal(manifest.lessons[1].status, 'saved_audio_complete');
    const saved = (await run('unzip', ['-p', path, 'imported/MSC-B01-Q01-N007-S02/audio/scene_00.mp3'])).stdout;
    assert.equal(saved, 'saved-audio-1-0');
    await assert.rejects(packagePreviewExport({ manifest: {}, files: [{ path: '../escape.mp3', data: Buffer.from('x') }] }), /Invalid scoped export path/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('scoped archive URL expires in one hour and existing asset HMAC verifier accepts it', () => {
  const now = Date.now(), url = new URL(previewSignedUrl(id(990), now));
  assert.equal(Number(url.searchParams.get('expires')), now + 3600000);
  assert.equal(validAssetSignature(id(990), url.searchParams.get('expires')!, url.searchParams.get('sig')!), true);
  assert.equal(validAssetSignature(id(991), url.searchParams.get('expires')!, url.searchParams.get('sig')!), false);
});
