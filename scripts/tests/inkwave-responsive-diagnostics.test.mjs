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


import os from 'node:os';
import { createResponsiveProgressWriter } from '../lib/inkwave-responsive-diagnostics.mjs';

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'responsive-progress-'));
  t.after(() => fs.rmSync(dir, {recursive: true, force: true}));
  const file = path.join(dir, 'progress.json');
  const diagnostics = createResponsiveDiagnostics({onChange: createResponsiveProgressWriter(file, {engine:'webkit',name:'small-phone'})});
  return { diagnostics, file, read: () => JSON.parse(fs.readFileSync(file, 'utf8')) };
}

test('successful stages persist incremental diagnostics without asserting acceptance', async t => {
  const {diagnostics:d,read,file} = fixture(t);
  d.record('case-start');
  assert.equal(read().diagnostics.lastCompletedStage, null);
  d.stage('settings');
  assert.equal(read().diagnostics.lastCompletedStage, 'settings');
  d.stage('loadout');
  d.record('context-close-start');
  await d.close(async () => {});
  const result = read();
  assert.equal(result.kind, 'responsive-diagnostic-progress');
  assert.equal(result.engine, 'webkit');
  assert.equal(result.name, 'small-phone');
  assert.equal(result.diagnostics.lastCompletedStage, 'loadout');
  assert.equal(result.diagnostics.firstError, null);
  assert.equal(result.diagnostics.events.at(-1).type, 'context-close-complete');
  assert.equal('status' in result, false);
  assert.equal(fs.existsSync(file+'.pending'), false);
});

test('first error is on disk before a never-resolving optional failure inspection', t => {
  const {diagnostics:d,read} = fixture(t);
  const original = new Error('original assertion');
  d.stage('setup-stage:umami');
  let inspected = false;
  void collectResponsiveFailure({entry:{},error:original,diagnostics:d,page:{isClosed:()=>false},
    readInteraction: () => { inspected = true; assert.equal(read().diagnostics.firstError.message, original.message); return new Promise(()=>{}); },
    captureFailure: () => { throw new Error('must not run'); }});
  assert.equal(inspected, true);
  assert.equal(read().diagnostics.lastCompletedStage, 'setup-stage:umami');
  assert.equal(read().diagnostics.firstError.message, original.message);
});

test('completed failure receipt survives never-resolving context cleanup', async t => {
  const {diagnostics:d,read} = fixture(t);
  const entry = {};
  await collectResponsiveFailure({entry,error:new Error('assertion failed'),diagnostics:d,page:{isClosed:()=>false},
    readInteraction:async()=>({screen:'lobby'}),captureFailure:async()=>{}});
  d.record('context-close-start');
  void d.close(() => new Promise(()=>{}));
  const result = read();
  assert.equal(entry.status, 'failed');
  assert.equal(result.diagnostics.firstError.message, 'assertion failed');
  assert.equal(result.diagnostics.events.at(-1).type, 'context-close-start');
});

test('cleanup failure persists but cannot replace the original error', async t => {
  const {diagnostics:d,read} = fixture(t);
  d.fail(new Error('first assertion'));
  await d.close(async()=>{throw new Error('cleanup failed');});
  assert.equal(read().diagnostics.firstError.message, 'first assertion');
  assert.equal(read().diagnostics.events.at(-1).type, 'context-close-error');
});

test('sole cleanup failure remains rejecting and is persisted', async t => {
  const {diagnostics:d,read} = fixture(t);
  await assert.rejects(d.close(async()=>{throw new Error('cleanup only');}), /cleanup only/);
  assert.equal(read().diagnostics.firstError.message, 'cleanup only');
});

test('progress write failure is visible but cannot replace original acceptance errors', async t => {
  const warnings = [];
  t.mock.method(console, 'error', message => warnings.push(JSON.parse(message)));
  const d = createResponsiveDiagnostics({onChange:()=>{throw Error('disk full');}});
  const original = Error('actual assertion');
  d.fail(original);
  await d.close(async()=>{throw Error('secondary cleanup');});
  assert.equal(d.snapshot().firstError.message, original.message);
  assert(warnings.length >= 2);
  assert(warnings.every(row => row.event === 'responsive-progress-write-error' && row.error === 'disk full'));
});

import { createResponsiveFatalPageError } from '../lib/inkwave-responsive-diagnostics.mjs';
import { EventEmitter } from 'node:events';

test('actual pageerror wiring interrupts a pending operation and preserves original fatal evidence', async t => {
  const {diagnostics,read} = fixture(t), page = new EventEmitter(), errors = [];
  let closeCalls = 0, rejectPending;
  const pending = new Promise((_, reject) => { rejectPending = reject; });
  const interrupted = assert.rejects(pending, /context closed/);
  const context = { close: async () => {
    closeCalls++;
    assert.equal(read().diagnostics.firstError.message, "Cannot read properties of undefined (reading '_wid')");
    rejectPending(Error('context closed'));
  } };
  const start = source.indexOf('      const fatalPageError =');
  const end = source.indexOf('      try {', start);
  assert(start >= 0 && end > start);
  const wire = new Function('createResponsiveFatalPageError', 'diagnostics', 'context', 'result', 'engineName', 'name', 'page',
    source.slice(start, end) + '\nreturn fatalPageError;');
  const fatal = wire(createResponsiveFatalPageError, diagnostics, context, {errors}, 'chromium', 'tablet-landscape', page);
  const original = new TypeError("Cannot read properties of undefined (reading '_wid')");
  page.emit('pageerror', original);
  page.emit('pageerror', Error('second uncaught error'));
  await interrupted;
  await diagnostics.close(() => fatal.close());
  assert.equal(fatal.error, original); assert.equal(closeCalls, 1);
  assert.equal(errors.length, 2);
  assert.equal(read().diagnostics.firstError.name, 'TypeError');
  assert.match(read().diagnostics.firstError.stack, /_wid/);
  assert.match(source, /error = fatalPageError.error \|\| error;/);
  assert.match(source, /await diagnostics.close\(\(\) => fatalPageError.close\(\)\);/);
});

test('handled application errors and console diagnostics do not abort a case', async () => {
  const diagnostics = createResponsiveDiagnostics(); let closes = 0;
  const fatal = createResponsiveFatalPageError({diagnostics, closeContext:async()=>{closes++;}, recordError:()=>assert.fail()});
  diagnostics.record('console-error', 'expected offline room not found');
  const handledState = 'error'; assert.equal(handledState, 'error');
  await Promise.resolve(); assert.equal(closes, 0); assert.equal(fatal.error, null);
  await diagnostics.close(() => fatal.close()); assert.equal(closes, 1);
  assert.equal(diagnostics.snapshot().firstError, null);
});

test('fatal cleanup rejection is observed and original error survives; clean cleanup still rejects', async () => {
  const diagnostics = createResponsiveDiagnostics(), original = Error('fatal runtime'); let closes = 0;
  const fatal = createResponsiveFatalPageError({diagnostics, closeContext:()=>{closes++; throw Error('close failed');}, recordError:()=>{}});
  fatal.handle(original); await new Promise(resolve => setImmediate(resolve));
  await diagnostics.close(() => fatal.close()); assert.equal(closes, 1);
  assert.equal(diagnostics.snapshot().firstError.message, original.message);
  assert(diagnostics.snapshot().events.some(event=>event.type==='context-close-error'));
  const clean = createResponsiveFatalPageError({diagnostics:createResponsiveDiagnostics(), closeContext:async()=>{throw Error('sole cleanup');}, recordError:()=>{}});
  await assert.rejects(clean.close(), /sole cleanup/);
});

test('fatal close retains existing failure inspection policy rather than hanging on closed target', async () => {
  const diagnostics = createResponsiveDiagnostics(), error = Error('runtime fatal');
  const fatal = createResponsiveFatalPageError({diagnostics,closeContext:async()=>{},recordError:()=>{}});
  fatal.handle(error); const entry = {}; let calls = 0;
  await collectResponsiveFailure({entry,error,diagnostics,page:{isClosed:()=>false},
    readInteraction:()=>{calls++;},captureFailure:()=>{calls++;}});
  assert.equal(calls,0); assert.equal(entry.status,'failed');
  assert.equal(entry.diagnostics.events.filter(x=>x.type==='diagnostic-skipped').length,2);
  await fatal.close();
});


test('late uncaught error cannot overwrite an already recorded assertion failure', async () => {
  const diagnostics = createResponsiveDiagnostics(), original = Error('first assertion');
  diagnostics.fail(original);
  const fatalPageError = createResponsiveFatalPageError({diagnostics,closeContext:async()=>{},recordError:()=>{}});
  fatalPageError.handle(Error('later runtime failure'));
  const entry = {status:'failed',error:original.message};
  const start = source.indexOf("          if (fatalPageError.error)");
  const end = source.indexOf('          entry.diagnostics =',start);
  assert(start>=0 && end>start);
  new Function('entry','fatalPageError',source.slice(start,end))(entry,fatalPageError);
  assert.equal(entry.error,original.message);
  assert.equal(diagnostics.snapshot().firstError.message,original.message);
  await fatalPageError.close();
});

for (const cleanupRejects of [false, true]) test(`actual setup interruption finalizes fatal evidence (cleanup rejects=${cleanupRejects})`, async t => {
  const {diagnostics,read} = fixture(t), entry = {}, result = {errors:[]}, page = new EventEmitter();
  const original = new TypeError('setup fatal _wid'), targetClosed = Error('setup target closed');
  let rejectInit, closes = 0;
  page.addInitScript = () => new Promise((_, reject) => {
    rejectInit = reject;
    queueMicrotask(() => page.emit('pageerror', original));
  });
  page.isClosed = () => false;
  page.evaluate = () => assert.fail('closing target must not be inspected');
  page.screenshot = () => assert.fail('closing target must not be captured');
  const context = {close:async()=>{
    closes++;
    assert.equal(read().diagnostics.firstError.message, original.message);
    rejectInit(targetClosed);
    if (cleanupRejects) throw Error('secondary close rejection');
  }};
  const start = source.indexOf('      const fatalPageError =');
  const setupEnd = source.indexOf('        await page.goto(address);',start);
  const catchStart = source.indexOf('      } catch (error) {',setupEnd);
  const finallyEnd = source.indexOf('\n    }\n  }\n  assert',catchStart);
  assert(start>=0 && setupEnd>start && catchStart>setupEnd && finallyEnd>catchStart);
  const actualSetupAndFinalization = new (Object.getPrototypeOf(async function(){}).constructor)(
    'page','result','engineName','name','diagnostics','context','createResponsiveFatalPageError',
    'collectResponsiveFailure','entry','path','evidence','audit',
    source.slice(start,setupEnd)+source.slice(catchStart,finallyEnd));
  await assert.rejects(actualSetupAndFinalization(page,result,'chromium','tablet',diagnostics,context,
    createResponsiveFatalPageError,collectResponsiveFailure,entry,path,'/unused',false),error=>error===original);
  assert.equal(closes,1); assert.equal(result.errors.length,1);
  assert.equal(entry.status,'failed'); assert.equal(entry.error,original.message);
  assert.equal(entry.diagnostics.firstError.stack,original.stack);
  assert.equal(read().diagnostics.firstError.stack,original.stack);
  assert(entry.diagnostics.events.some(x=>x.type===(cleanupRejects?'context-close-error':'context-close-complete')));
});

test('actual continuation keeps pending operation through rejection and failure reporting', async () => {
  const { checkResultContinuation } = await import('../check-inkwave-result-continuation.mjs');
  const d = createResponsiveDiagnostics({ maxEvents: 3 });
  let rejectAction, reached;
  const entered = new Promise(resolve => { reached = resolve; });
  const page = { evaluate: async () => undefined, waitForFunction: async () => {},
    locator: () => ({ scrollIntoViewIfNeeded: async () => {}, evaluate: async () => true }) };
  const original = Error('original action rejected');
  const action = checkResultContinuation({ page, entry: {}, settle: async () => {}, capture: async () => {},
    onOperation: (id, boundary) => d.operation(id, boundary),
    tap: async (_page, selector) => {
      if (selector === '[data-id="change-gear-continue"]') {
        reached(); return new Promise((_resolve, reject) => { rejectAction = reject; });
      }
    } });
  const rejected = assert.rejects(action, error => error === original);
  await entered;
  assert.equal(d.snapshot().pendingOperation, 'continuation-tap-change');
  assert.equal(d.snapshot().events.at(-1).type, 'operation-before');
  rejectAction(original); await rejected;
  await collectResponsiveFailure({ entry: {}, error: original, diagnostics: d,
    page: { isClosed: () => true }, readInteraction: () => assert.fail(), captureFailure: () => assert.fail() });
  assert.equal(d.snapshot().pendingOperation, 'continuation-tap-change');
  assert.equal(d.snapshot().firstError.message, original.message);
  assert(!d.snapshot().events.some(x => x.type === 'operation-after' && x.detail === 'continuation-tap-change'));
});

test('operation boundary matching and unknown text never clear or leak pending ID', () => {
  const d = createResponsiveDiagnostics();
  d.operation('continuation-wait-loadout', 'before');
  d.operation('PRIVATE-selector', 'before');
  d.operation('continuation-wait-loadout', 'PRIVATE-boundary');
  d.operation('continuation-read-weapon', 'after');
  assert.equal(d.snapshot().pendingOperation, 'continuation-wait-loadout');
  assert(!JSON.stringify(d.snapshot()).includes('PRIVATE'));
  d.operation('continuation-wait-loadout', 'after');
  assert.equal(d.snapshot().pendingOperation, null);
});

import vm from 'node:vm';
import { settleResponsiveAnimationsInPage, parseResponsiveAnimations, sanitizeResponsiveAnimations,
  RESPONSIVE_ANIMATION_PREFIX, MAX_ANIMATION_MESSAGE } from '../lib/inkwave-responsive-animation-diagnostics.mjs';

function deferredAnimation(extra = {}) {
  let resolve, reject, reads = 0;
  const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
  const animation = { effect: { getTiming: () => ({ iterations: 1, duration: 400, delay: 0, endDelay: 0 }) },
    playState: 'running', pending: false, currentTime: 10, startTime: 20, playbackRate: 1,
    timeline: { currentTime: 30 } };
  Object.defineProperties(animation, Object.getOwnPropertyDescriptors(extra));
  Object.defineProperty(animation, 'finished', { get() { reads++; return finished; } });
  return { animation, resolve, reject, reads: () => reads };
}
function animationHarness(animations, { emitFails = false, listFails = null, timerFails = false, clearFails = false, onStyleProbe = () => assert.fail('style probe') } = {}) {
  const messages = [], timers = new Map(); let serial = 0, clears = 0;
  const context = { getComputedStyle: onStyleProbe, document: { getAnimations: () => { if (listFails) throw listFails; return animations; } },
    console: { info: text => { if (emitFails) throw Error('PRIVATE console failure'); messages.push(text); } },
    setTimeout: (action, ms) => { if (timerFails) throw Error('timer unavailable'); assert.equal(ms, 1000); timers.set(++serial, action); return serial; },
    clearTimeout: id => { clears++; timers.delete(id); if (clearFails) throw Error('cleanup observer failure'); } };
  const run = vm.runInNewContext('(' + settleResponsiveAnimationsInPage.toString() + ')', context);
  return { run, messages, timers, clears: () => clears,
    watchdog() { for (const [id, action] of [...timers]) { timers.delete(id); action(); } } };
}

test('actual serialized settle watches same original promises and cannot pass a pending finite animation', async () => {
  const first = deferredAnimation(), second = deferredAnimation();
  const h = animationHarness([first.animation, second.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  assert.equal(first.reads(), 1); assert.equal(second.reads(), 1);
  assert.equal(parseResponsiveAnimations(h.messages[0]).phase, 'before-await');
  first.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  h.watchdog(); h.watchdog();
  const after = parseResponsiveAnimations(h.messages[1]);
  assert.equal(h.messages.length, 2); assert.equal(after.phase, 'watchdog');
  assert.equal(after.pendingCount, 1); assert.deepEqual(after.rows.map(row => row.index), [1]);
  assert.equal(passed, false, 'watchdog is not acceptance or timeout fallback');
  second.resolve(); await waiting;
  assert.equal(passed, true); assert.equal(h.timers.size, 0); assert.equal(h.clears(), 2);
});

for (const reject of [false, true]) test('resolution/cancellation keeps old behavior and removes watchdog: ' + reject, async () => {
  const item = deferredAnimation(), h = animationHarness([item.animation]);
  const waiting = h.run(true);
  reject ? item.reject(Error('original cancellation')) : item.resolve();
  await waiting; h.watchdog();
  assert.equal(h.messages.length, 1); assert.equal(h.timers.size, 0); assert.equal(h.clears(), 2);
});

test('infinite animations never have finished read and unobserved settles add no diagnostics', async () => {
  const infinite = { effect: { getTiming: () => ({ iterations: Infinity }) },
    get finished() { assert.fail('original infinity filter must remain'); } };
  const h = animationHarness([infinite]); await h.run(false);
  assert.equal(h.messages.length, 0); assert.equal(h.timers.size, 0);
});

test('original enumeration, timing and finished getter failures are not hidden', async () => {
  const original = Error('original source error');
  for (const [animations, options] of [[[], { listFails: original }],
    [[{ effect: { getTiming() { throw original; } } }], {}],
    [[{ effect: { getTiming: () => ({ iterations: 1 }) }, get finished() { throw original; } }], {}]]) {
    const h = animationHarness(animations, options);
    await assert.rejects(h.run(true), error => error === original);
    assert.equal(h.messages.length, 0); assert.equal(h.timers.size, 0);
  }
});

for (const options of [{ emitFails: true }, { timerFails: true }, { clearFails: true }]) test('observer setup/transport failure never changes settlement: ' + JSON.stringify(options), async () => {
  const item = deferredAnimation(), h = animationHarness([item.animation], options);
  const waiting = h.run(true); h.watchdog(); item.resolve(); await waiting;
  assert.equal(h.timers.size, 0);
});

test('snapshot metadata errors stay unavailable without changing original settle', async () => {
  let forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; throw Error('not passive'); };
  const target = { isConnected: true, closest: () => null, matches: () => false,
    getBoundingClientRect: forbidden, checkVisibility: forbidden,
    get textContent() { return forbidden(); }, get className() { return forbidden(); } };
  const item = deferredAnimation({ effect: { getTiming: () => ({ iterations: 1 }), target },
    get currentTime() { throw Error('PRIVATE snapshot'); } });
  const h = animationHarness([item.animation]); const waiting = h.run(true);
  const row = parseResponsiveAnimations(h.messages[0]).rows[0];
  assert.deepEqual(row, { index: 0, unavailable: true });
  assert(!h.messages.join('').includes('PRIVATE')); item.resolve(); await waiting;
  assert.equal(forbiddenCalls, 0);
});

test('successful initial and watchdog snapshots never probe geometry, styles, visibility or DOM text', async () => {
  let forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; throw Error('not passive'); };
  const target = { isConnected: true, closest: () => null, matches: () => false,
    getBoundingClientRect: forbidden, getClientRects: forbidden, checkVisibility: forbidden,
    get textContent() { return forbidden(); }, get className() { return forbidden(); } };
  const item = deferredAnimation({ effect: { getTiming: () => ({ iterations: 1, duration: 400 }), target } });
  const h = animationHarness([item.animation], { onStyleProbe: forbidden });
  const waiting = h.run(true); h.watchdog();
  assert.equal(h.messages.length, 2);
  for (const message of h.messages) assert.equal(parseResponsiveAnimations(message).rows[0].unavailable, undefined);
  assert.equal(forbiddenCalls, 0);
  item.resolve(); await waiting;
});

test('page snapshots cap rows and redact arbitrary animation and target payload', async () => {
  const secret = 'TOKEN_COOKIE_PASSWORD_SECRET';
  const items = Array.from({ length: 100 }, () => deferredAnimation({ animationName: secret, transitionProperty: secret,
    currentTime: Number.MAX_VALUE, playbackRate: Infinity, playState: secret,
    effect: { getTiming: () => ({ iterations: 1, duration: secret, delay: Infinity }),
      target: { isConnected: true, closest: () => null, matches: () => false, textContent: secret, id: secret } } }));
  const h = animationHarness(items.map(item => item.animation)); const waiting = h.run(true);
  const value = parseResponsiveAnimations(h.messages[0]);
  assert.equal(value.rows.length, 8); assert.equal(value.pendingCount, 100); assert.equal(value.omittedCount, 92);
  assert.equal(value.rows[0].currentTime, 2147483647); assert.equal(value.rows[0].playbackRate, null);
  assert.equal(value.rows[0].delay, 'infinite'); assert.equal(value.rows[0].duration, null);
  assert(h.messages[0].length < MAX_ANIMATION_MESSAGE); assert(!h.messages[0].includes(secret));
  for (const item of items) item.resolve(); await waiting;
});

test('receipt sanitizer rejects malformed, oversized and freeform values and bounds stored phases', () => {
  const secret = 'TOKEN_COOKIE_PASSWORD_SECRET';
  assert.equal(parseResponsiveAnimations(secret), null);
  assert.equal(parseResponsiveAnimations(RESPONSIVE_ANIMATION_PREFIX + '{bad'), null);
  assert.equal(parseResponsiveAnimations(RESPONSIVE_ANIMATION_PREFIX + ' '.repeat(MAX_ANIMATION_MESSAGE)), null);
  assert.equal(sanitizeResponsiveAnimations({ phase: secret, rows: [] }), null);
  const value = { phase: 'watchdog', finiteCount: Number.MAX_SAFE_INTEGER, pendingCount: secret,
    omittedCount: 0, payload: secret, rows: Array.from({ length: 100 }, () => ({ index: 1,
      kind: secret, name: secret, property: secret, playState: secret, targetKind: secret, currentTime: secret, payload: secret })) };
  const safe = sanitizeResponsiveAnimations(value); assert.equal(safe.rows.length, 8);
  assert.equal(safe.finiteCount, 2147483647); assert.equal(safe.pendingCount, null);
  assert(!JSON.stringify(safe).includes(secret));
  const d = createResponsiveDiagnostics(); d.animations(RESPONSIVE_ANIMATION_PREFIX + JSON.stringify(safe));
  assert.equal(d.snapshot().animationSnapshots, undefined, 'ignore outside exact operation');
  d.operation('continuation-settle-action', 'before');
  for (let i = 0; i < 10; i++) d.animations(RESPONSIVE_ANIMATION_PREFIX + JSON.stringify(safe));
  assert.equal(d.snapshot().animationSnapshots.length, 1); assert(!JSON.stringify(d.snapshot()).includes(secret));
});

test('runner wires diagnostics only to exact settle while retaining original await and runner identity', () => {
  assert.match(source, /page\.evaluate\(settleResponsiveAnimationsInPage, observe\)/);
  assert.match(source, /lib\/inkwave-responsive-animation-diagnostics\.mjs/);
  assert.match(source, /message\.type\(\) === 'info'\) diagnostics\.animations\(message\.text\(\)\)/);
  const continuation = fs.readFileSync(new URL('../check-inkwave-result-continuation.mjs', import.meta.url), 'utf8');
  assert.match(continuation, /continuation-settle-action',\(\)=>settle\(page,name==='loadout-continue'\)/);
});

test('two full diagnostic snapshots fit with max-length ASCII event and error receipts', () => {
  const d = createResponsiveDiagnostics(); d.operation('continuation-settle-action', 'before');
  const row = { index: 2147483647, kind: 'css-animation', name: 'iw-ticket-pick', property: 'background-color',
    playState: 'finished', pending: true, currentTime: 2147483647, startTime: 2147483647,
    playbackRate: 2147483647, timelineTime: 2147483647, duration: '-infinite', delay: '-infinite',
    endDelay: '-infinite', iterations: '-infinite', targetKind: 'weapon-card-descendant', connected: true, artDeferred: true };
  for (const phase of ['before-await', 'watchdog']) d.animations(RESPONSIVE_ANIMATION_PREFIX + JSON.stringify({
    phase, finiteCount: 2147483647, pendingCount: 2147483647, omittedCount: 2147483647, rows: Array(16).fill(row) }));
  d.fail({ name: 'x'.repeat(80), message: 'x'.repeat(4096), stack: 'x'.repeat(8192) });
  for (let i = 0; i < 32; i++) d.record('x'.repeat(80), 'x'.repeat(1024));
  const receipt = { kind: 'responsive-diagnostic-progress', engine: 'chromium', name: 'phone-portrait', diagnostics: d.snapshot() };
  assert.equal(receipt.diagnostics.animationSnapshots.length, 2);
  assert(receipt.diagnostics.animationSnapshots.every(value => value.rows.length === 8));
  // Existing free-form event/error limits count characters, not UTF-8 bytes.
  // Non-ASCII or escaped text may still exceed the unchanged fail-closed reader.
  assert(Buffer.byteLength(JSON.stringify(receipt, null, 2) + '\n') < 65536, 'keep ASCII worst-case below unchanged progress read bound');
});


const flushAnimationMicrotasks = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('unresolved original promise requires asynchronous whole-cohort finished confirmation', async () => {
  const item = deferredAnimation({ playState: 'finished' });
  const h = animationHarness([item.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  assert.equal(item.reads(), 1); assert.equal(h.timers.size, 2);
  await flushAnimationMicrotasks(); assert.equal(passed, false, 'time or initial state is not enough');
  h.watchdog(); assert.equal(passed, false, 'first finished read cannot synchronously complete');
  await flushAnimationMicrotasks();
  assert.equal(passed, true, 'confirmed native finished state must release the stale promise');
  await waiting;
  assert.equal(passed, true); assert.equal(item.reads(), 1);
  assert.equal(h.messages.length, 2); assert.equal(h.timers.size, 0);
});

for (const extra of [
  { playState: 'running' }, { playState: 'paused' }, { playState: 'idle' },
  { playState: 'running', playbackRate: 0 }, { playState: 'finished', pending: true },
  { playState: 'finished', pending: undefined }, { playState: 'unknown' },
]) test('timer ticks never accept active or unconfirmed native state: ' + JSON.stringify(extra), async () => {
  const item = deferredAnimation(extra), h = animationHarness([item.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  for (let i = 0; i < 5; i++) {
    h.watchdog(); await flushAnimationMicrotasks();
    assert.equal(passed, false); assert.equal(h.timers.size, 1, 'at most one state timer');
  }
  assert.equal(item.reads(), 1, 'never substitute a newer finished promise');
  item.reject(Error('original cancellation')); await waiting;
  assert.equal(h.timers.size, 0);
});

for (const property of ['playState', 'pending']) test('unavailable ' + property + ' is never completion evidence', async () => {
  const extra = { playState: 'finished' };
  Object.defineProperty(extra, property, { get() { throw Error('unavailable state'); } });
  const item = deferredAnimation(extra), h = animationHarness([item.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  h.watchdog(); await flushAnimationMicrotasks();
  assert.equal(passed, false); assert.equal(h.timers.size, 1);
  item.resolve(); await waiting; assert.equal(h.timers.size, 0);
});

for (const reversal of [{ playState: 'running' }, { playState: 'paused' }, { pending: true }])
  test('finished state reversal before asynchronous confirmation keeps waiting: ' + JSON.stringify(reversal), async () => {
    const item = deferredAnimation({ playState: 'finished' });
    const h = animationHarness([item.animation]); let passed = false;
    const waiting = h.run(true).then(() => { passed = true; });
    h.watchdog(); Object.assign(item.animation, reversal);
    await flushAnimationMicrotasks();
    assert.equal(passed, false); assert.equal(h.timers.size, 1);
    Object.assign(item.animation, { playState: 'finished', pending: false });
    h.watchdog(); await waiting;
    assert.equal(passed, true); assert.equal(h.timers.size, 0);
  });

test('whole unresolved cohort is rechecked without individually latching finished objects', async () => {
  const first = deferredAnimation({ playState: 'finished' }), second = deferredAnimation();
  const h = animationHarness([first.animation, second.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  h.watchdog(); await flushAnimationMicrotasks(); assert.equal(passed, false);
  first.animation.playState = 'running'; second.animation.playState = 'finished';
  h.watchdog(); await flushAnimationMicrotasks(); assert.equal(passed, false, 'first object restarted');
  first.animation.playState = 'finished';
  h.watchdog(); second.animation.pending = true;
  await flushAnimationMicrotasks(); assert.equal(passed, false, 'second object has a pending play');
  second.animation.pending = false;
  h.watchdog(); await waiting;
  assert.equal(first.reads(), 1); assert.equal(second.reads(), 1); assert.equal(h.timers.size, 0);
});

for (const reject of [false, true]) test('original promise completion remains authoritative within a mixed cohort: ' + reject, async () => {
  const native = deferredAnimation(), stale = deferredAnimation({ playState: 'finished' });
  const h = animationHarness([native.animation, stale.animation]); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  h.watchdog(); await flushAnimationMicrotasks(); assert.equal(passed, false);
  reject ? native.reject(Error('native cancellation')) : native.resolve();
  await flushAnimationMicrotasks(); assert.equal(passed, false, 'stale promise remains pending');
  h.watchdog(); await waiting;
  assert.equal(h.timers.size, 0); assert.equal(native.reads(), 1); assert.equal(stale.reads(), 1);
});

test('state confirmation is passive and includes the entire original cohort, not only eight diagnostic rows', async () => {
  let forbiddenCalls = 0;
  const forbidden = () => { forbiddenCalls++; throw Error('animation or rendering mutation'); };
  const target = { getBoundingClientRect: forbidden, getClientRects: forbidden, checkVisibility: forbidden };
  const items = Array.from({ length: 9 }, () => deferredAnimation({ playState: 'finished',
    effect: { getTiming: () => ({ iterations: 1 }), target }, finish: forbidden, cancel: forbidden,
    play: forbidden, pause: forbidden }));
  items[8].animation.playState = 'running';
  const h = animationHarness(items.map(item => item.animation), { onStyleProbe: forbidden }); let passed = false;
  const waiting = h.run(true).then(() => { passed = true; });
  h.watchdog(); await flushAnimationMicrotasks(); assert.equal(passed, false);
  items[8].animation.playState = 'finished'; h.watchdog(); await waiting;
  assert.equal(forbiddenCalls, 0); assert.equal(h.timers.size, 0);
  assert(items.every(item => item.reads() === 1));
});

test('native fast path clears both timers and a late state callback cannot reschedule', async () => {
  const item = deferredAnimation(), h = animationHarness([item.animation]);
  const waiting = h.run(true); const callbacks = [...h.timers.values()];
  assert.equal(callbacks.length, 2);
  item.resolve(); await waiting;
  assert.equal(h.timers.size, 0); assert.equal(h.clears(), 2);
  callbacks[1](); await flushAnimationMicrotasks();
  assert.equal(h.timers.size, 0, 'completion prevents a late callback from installing another timer');
});

test('state path cleanup removes the observational watchdog without turning it into acceptance', async () => {
  const item = deferredAnimation({ playState: 'finished' }), h = animationHarness([item.animation]);
  const waiting = h.run(true); h.watchdog(); await waiting;
  assert.equal(h.timers.size, 0); assert.equal(h.messages.length, 2);
  const snapshot = parseResponsiveAnimations(h.messages[1]);
  assert.equal(snapshot.phase, 'watchdog'); assert.equal(snapshot.pendingCount, 1, 'native promise is still unresolved');
  assert.equal(snapshot.rows[0].playState, 'finished');
});


test('unobserved callers retain the original promise-only gate even for finished native state', async () => {
  const item = deferredAnimation({ playState: 'finished' }), h = animationHarness([item.animation]); let passed = false;
  const waiting = h.run(false).then(() => { passed = true; });
  h.watchdog(); await flushAnimationMicrotasks();
  assert.equal(passed, false); assert.equal(h.timers.size, 0); assert.equal(h.messages.length, 0);
  item.resolve(); await waiting; assert.equal(item.reads(), 1);
});

for (const reversal of [{ playState: 'running' }, { pending: true }])
  test('reversal after state confirmation but before helper return cannot pass: ' + JSON.stringify(reversal), async () => {
    const item = deferredAnimation({ playState: 'finished' }), h = animationHarness([item.animation]); let passed = false;
    const waiting = h.run(true).then(() => { passed = true; });
    h.watchdog();
    // The confirmation continuation is already queued; this runs after it
    // resolves the state promise but before Promise.race resumes the helper.
    Promise.resolve().then(() => Object.assign(item.animation, reversal));
    await flushAnimationMicrotasks();
    assert.equal(passed, false); assert.equal(h.timers.size, 1);
    Object.assign(item.animation, { playState: 'finished', pending: false });
    h.watchdog(); await waiting; assert.equal(h.timers.size, 0);
  });

// Execute the committed capture -> geometry -> serialized settle bodies together.
function continuationCaptureHarness(items, { width = 100, right = 100, hidden = false, leaving = false, screenshotError = null } = {}) {
  const animations = items.map(item => item.animation), browser = animationHarness(animations);
  const calls = [], entry = { name: 'phone-portrait', screens: {} }, controls = '.iw-continuation-actions button';
  const element = { className: 'iw-btn', getClientRects: () => [{}],
    closest: () => leaving ? {} : null,
    getBoundingClientRect: () => ({ width, height: 48, left: 0, right }) };
  const page = {
    evaluate: (fn, observe) => {
      assert.equal(fn, settleResponsiveAnimationsInPage); calls.push('settle:' + observe);
      return browser.run(observe);
    },
    waitForFunction: async () => { calls.push('retired-owner'); },
    locator: selector => ({ evaluateAll: async fn => {
      calls.push(selector === controls ? 'measure' : 'panels');
      return vm.runInNewContext('(' + fn.toString() + ')', {
        getComputedStyle: () => ({ visibility: hidden ? 'hidden' : 'visible' }), innerWidth: 390,
      })(selector === controls ? [element] : []);
    } }),
    screenshot: async () => { calls.push('png'); if (screenshotError) throw screenshotError; },
  };
  const start = source.indexOf('const geometry = async'), end = source.indexOf('const tap = async', start);
  assert(start >= 0 && end > start);
  const geometry = new Function('settle', 'assert', 'audit', source.slice(start, end) + '\nreturn geometry;')(
    (target, observe = false) => target.evaluate(settleResponsiveAnimationsInPage, observe), assert, false);
  const core = fs.readFileSync(new URL('../check-inkwave-responsive-core.mjs', import.meta.url), 'utf8');
  const first = core.indexOf('  const capture = async'), last = core.indexOf("  await show(page, 'loading');", first);
  assert(first >= 0 && last > first);
  const capture = new Function('page', 'entry', 'geometry', 'audit', 'path', 'evidence', 'engineName', 'onStageComplete', 'assert',
    core.slice(first, last) + '\nreturn capture;')(page, entry, geometry, false, path, '/unused', 'chromium', name => calls.push('stage:' + name), assert);
  return { calls, animations, entry, observe: () => page.evaluate(settleResponsiveAnimationsInPage, true),
    capture: (name = 'loadout-continue') => capture(name, controls),
    tick: async () => { browser.watchdog(); await flushAnimationMicrotasks(); await flushAnimationMicrotasks(); } };
}

test('capture geometry recovers the same stale finished promise after the observed action settle', async () => {
  const item = deferredAnimation({ playState: 'finished' }), h = continuationCaptureHarness([item]);
  const observed = h.observe(); await h.tick(); await observed;
  let completed = false; const capture = h.capture().then(() => { completed = true; });
  try {
    await flushAnimationMicrotasks(); assert.equal(completed, false); assert(!h.calls.includes('measure'));
    await h.tick(); assert.equal(completed, true, 'the second geometry settle must also confirm native finished state');
    assert.deepEqual(h.calls, ['settle:true', 'retired-owner', 'settle:true', 'measure', 'panels', 'png', 'stage:loadout-continue']);
    assert.equal(item.reads(), 2, 'each settle captures the original native promise once');
  } finally { item.resolve(); await capture; }
});

for (const state of [{ playState: 'running' }, { playState: 'paused' }, { playState: 'idle' }, { playState: 'finished', pending: true }])
  test('capture geometry never accepts unfinished native state: ' + JSON.stringify(state), async () => {
    const item = deferredAnimation(state), h = continuationCaptureHarness([item]);
    const capture = h.capture();
    try {
      await flushAnimationMicrotasks();
      for (let i = 0; i < 3; i++) { await h.tick(); assert(!h.calls.includes('measure')); assert(!h.calls.includes('png')); }
      Object.assign(item.animation, { playState: 'finished', pending: false }); await h.tick(); await capture;
      assert(h.calls.includes('stage:loadout-continue'));
    } finally { item.resolve(); await capture; }
  });

test('capture state belongs to the original cohort, not a replacement finished animation', async () => {
  const original = deferredAnimation(), other = deferredAnimation({ playState: 'finished' });
  const h = continuationCaptureHarness([original]), capture = h.capture();
  try {
    await flushAnimationMicrotasks(); h.animations.splice(0, 1, other.animation);
    await h.tick(); await h.tick(); assert(!h.calls.includes('measure'));
    original.animation.playState = 'finished'; await h.tick(); await capture;
    assert.equal(other.reads(), 0);
  } finally { original.resolve(); other.resolve(); await capture; }
});

test('other capture labels retain their unobserved promise-only gate', async () => {
  const item = deferredAnimation({ playState: 'finished' }), h = continuationCaptureHarness([item]);
  const capture = h.capture('loadout'); await flushAnimationMicrotasks(); await h.tick();
  assert.deepEqual(h.calls, ['retired-owner', 'settle:false']);
  item.resolve(); await capture; assert(h.calls.includes('stage:loadout'));
});

for (const invalid of [{ width: 42 }, { right: 392 }, { hidden: true }, { leaving: true }])
  test('continuation capture retains real geometry and visible-owner rejection: ' + JSON.stringify(invalid), async () => {
    const item = deferredAnimation(), h = continuationCaptureHarness([item], invalid); item.resolve();
    await assert.rejects(h.capture(), /small touch target|horizontal overflow|no controls rendered/);
    assert(!h.calls.includes('png')); assert(!h.calls.includes('stage:loadout-continue'));
  });

test('required screenshot failure cannot publish a completed continuation stage', async () => {
  const item = deferredAnimation(), error = Error('required PNG failed'), h = continuationCaptureHarness([item], { screenshotError: error });
  item.resolve(); await assert.rejects(h.capture(), value => value === error);
  assert(h.calls.includes('png')); assert(!h.calls.includes('stage:loadout-continue'));
});
