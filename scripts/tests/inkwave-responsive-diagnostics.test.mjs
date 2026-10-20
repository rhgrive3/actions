import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createResponsiveDiagnostics, collectResponsiveFailure, boundedChildStderr } from '../lib/inkwave-responsive-diagnostics.mjs';

// Execute the actual required failure block, including its original throw gate.
const source = fs.readFileSync(new URL('../check-inkwave-responsive.mjs', import.meta.url), 'utf8');
const a = source.indexOf('        await collectResponsiveFailure({');
const b = source.indexOf('      } finally {', a);
assert(a >= 0 && b > a);
const failureBlock = new (Object.getPrototypeOf(async function(){}).constructor)(
  'entry', 'error', 'diagnostics', 'page', 'engineName', 'name', 'evidence', 'path', 'audit', 'collectResponsiveFailure', source.slice(a, b));
const runFailure = (entry, error, diagnostics, page) => failureBlock(entry, error, diagnostics, page, 'webkit', 'phone-landscape', '/unused', path, false, collectResponsiveFailure);

test('successful diagnostic actions preserve their value and completed stage', async () => {
  let tick = 10; const d = createResponsiveDiagnostics({ now: () => tick++ });
  d.stage('setup'); const value = { stage: 'setup' };
  assert.deepEqual(await d.optional('normal', async () => value), { ok: true, value });
  await d.close(async () => {});
  assert.equal(d.snapshot().firstError, null);
  assert.equal(d.snapshot().lastCompletedStage, 'setup');
  assert.equal(d.snapshot().events.at(-1).type, 'context-close-complete');
});

test('actual required catch rethrows first error despite secondary evaluate and screenshot errors', async () => {
  const original = new Error('original layout assertion'); const entry = {}, d = createResponsiveDiagnostics();
  d.stage('setup'); let evaluated = 0, captured = 0;
  const page = { isClosed: () => false, evaluate: async () => { evaluated++; throw Error('secondary target crashed'); },
    screenshot: async () => { captured++; throw Error('secondary screenshot failed'); } };
  await assert.rejects(runFailure(entry, original, d, page), error => error === original);
  assert.equal(entry.error, original.message); assert.equal(entry.status, 'failed');
  assert.equal(entry.diagnostics.firstError.message, original.message);
  assert.equal(entry.diagnostics.lastCompletedStage, 'setup');
  assert.equal(evaluated, 1); assert.equal(captured, 1);
  assert.equal(entry.diagnostics.events.filter(x => x.type === 'diagnostic-error').length, 2);
});

test('closed target is never evaluated or captured and retains its first failure', async () => {
  const original = new Error('first target closed'); const entry = {}, d = createResponsiveDiagnostics(); let calls = 0;
  const page = { isClosed: () => true, evaluate: async () => { calls++; }, screenshot: async () => { calls++; } };
  await assert.rejects(runFailure(entry, original, d, page), error => error === original);
  assert.equal(calls, 0); assert.equal(entry.diagnostics.firstError.message, original.message);
  assert.equal(entry.diagnostics.events.filter(x => x.type === 'diagnostic-skipped').length, 2);
});

test('crash event prevents post-crash evaluation even before isClosed becomes true', async () => {
  const original = Error('first crash'); const entry = {}, d = createResponsiveDiagnostics(); let calls = 0;
  d.unavailable('page-crash');
  const page = { isClosed: () => false, evaluate: async () => { calls++; }, screenshot: async () => { calls++; } };
  await assert.rejects(runFailure(entry, original, d, page), error => error === original);
  assert.equal(calls, 0); assert(d.snapshot().events.some(x => x.type === 'page-crash'));
});

test('diagnostic guard failures are secondary and cannot replace the first error', async () => {
  const original = Error('first application failure'); const entry = {}, d = createResponsiveDiagnostics();
  const page = { isClosed: () => { throw Error('closed state unavailable'); }, evaluate: async () => assert.fail(), screenshot: async () => assert.fail() };
  await assert.rejects(runFailure(entry, original, d, page), error => error === original);
  assert.equal(entry.diagnostics.firstError.message, original.message);
});

test('cleanup errors retain a previous first failure but still fail an otherwise successful run', async () => {
  const d = createResponsiveDiagnostics(), primary = Error('original'); d.fail(primary);
  await d.close(async () => { throw Error('cleanup'); });
  assert.equal(d.snapshot().firstError.message, 'original');
  assert(d.snapshot().events.some(x => x.type === 'context-close-error'));
  const clean = createResponsiveDiagnostics(), closeError = Error('only close failure');
  await assert.rejects(clean.close(async () => { throw closeError; }), error => error === closeError);
  assert.equal(clean.snapshot().firstError.message, closeError.message);
});

test('event, stack, console and captured child stderr receipts are bounded', () => {
  const d = createResponsiveDiagnostics({ maxEvents: 3 }); d.fail(Error('first'));
  for (let i = 0; i < 10; i++) d.record('console-error', 'x'.repeat(10000));
  const s = d.snapshot(); assert.equal(s.events.length, 3); assert.equal(s.droppedEvents, 8);
  assert.equal(s.firstError.message, 'first'); assert(s.events.every(x => x.detail.length <= 1024));
  const stderr = boundedChildStderr('prefix' + 'x'.repeat(70000) + 'last');
  assert.equal(stderr.retainedChars, 65536); assert.equal(stderr.text.length, 65536);
  assert.equal(stderr.truncated, true); assert(stderr.text.endsWith('last'));
  assert.deepEqual(boundedChildStderr(null), { text: '', totalChars: 0, retainedChars: 0, truncated: false });
});

test('required behavior remains: first throw, zero retries, original process limits and failure checks', () => {
  const isolated = fs.readFileSync(new URL('../check-inkwave-responsive-isolated.mjs', import.meta.url), 'utf8');
  assert.match(source.slice(a, b), /if \(!audit\) throw error;/);
  assert.match(isolated, /timeout:20\*60\*1000,maxBuffer:16\*1024\*1024/);
  assert.match(isolated, /assert.equal\(fragment.cases\[0\].status,'passed'\)/);
  assert.match(isolated, /row.ok=processResult.status===0 && !processResult.error && !row.error/);
  assert.equal((isolated.match(/spawnSync\(process.execPath/g)||[]).length, 1);
  assert.match(isolated, /writeFileSync\(path.join\(shardDir, 'child-stderr.txt'\)/);
  for (const event of ['page-crash','page-close','context-close','browser-disconnected']) assert(source.includes(event));
});

for (const screenshotFails of [false, true]) test(`completed-stage receipt follows successful capture only (screenshot failure=${screenshotFails})`, async () => {
  const { checkCoreMenus } = await import('../check-inkwave-responsive-core.mjs');
  const oldDocument = globalThis.document, oldWidth = globalThis.innerWidth;
  globalThis.document = { querySelector: () => null }; globalThis.innerWidth = 390;
  const next = Error('next screen'), captureError = Error('capture failed'), stages = [], actions = [];
  const page = { evaluate: async () => {}, waitForFunction: async predicate => assert.equal(predicate(), true),
    locator: () => ({ evaluateAll: async predicate => predicate([{ getBoundingClientRect: () => ({ left: 0, right: 390 }) }]) }),
    screenshot: async () => { actions.push('screenshot'); if (screenshotFails) throw captureError; } };
  try {
    await assert.rejects(checkCoreMenus({ page, entry: { name: 'phone-landscape', screens: {} }, config: {},
      engineName: 'webkit', evidence: '/unused', show: async (_page, name) => { if (name !== 'loading') throw next; },
      settle: async () => {}, geometry: async () => [], tap: async () => {}, audit: false,
      onStageComplete: name => { actions.push('stage'); stages.push(name); } }),
    error => error === (screenshotFails ? captureError : next));
    assert.deepEqual(stages, screenshotFails ? [] : ['loading']);
    assert.deepEqual(actions, screenshotFails ? ['screenshot'] : ['screenshot', 'stage']);
  } finally {
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldWidth === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = oldWidth;
  }
});


test('required CI explicitly includes diagnostic tests in its existing unit step', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/validate-inkwave-update.yml', import.meta.url), 'utf8');
  const step = workflow.match(/- name: Verify motion verifier regressions\n[ \t]+run: ([^\n]+)/);
  assert(step, 'existing required unit step remains present');
  assert.match(step[1], /^node --test /);
  assert(step[1].includes('scripts/tests/inkwave-responsive-fixture.test.mjs'));
  assert(step[1].includes('scripts/tests/inkwave-responsive-diagnostics.test.mjs'));
  assert.equal((workflow.match(/scripts\/tests\/inkwave-responsive-diagnostics\.test\.mjs/g) || []).length, 1);
});
