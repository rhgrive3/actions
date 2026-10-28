import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MAX_PROGRESS_BYTES, responsiveProgressSummary, emitFailedResponsiveProgress } from '../lib/inkwave-responsive-progress-summary.mjs';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'responsive-progress-tests-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));
let serial = 0;
function fixture(value) {
  const shardDir = path.join(root, String(serial++)); fs.mkdirSync(shardDir);
  const file = path.join(shardDir, 'webkit-tablet-landscape-diagnostic-progress.json');
  if (value !== undefined) fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return { file, identity: { shardDir, engine: 'webkit', name: 'tablet-landscape', startedAt: 0 } };
}
const receipt = () => ({ kind: 'responsive-diagnostic-progress', engine: 'webkit', name: 'tablet-landscape',
  diagnostics: { firstError: null, lastCompletedStage: 'setup', pageUnavailable: false, droppedEvents: 0,
    events: [{ type: 'case-start', ms: 0 }, { type: 'stage-complete', detail: 'setup', ms: 120 }] } });
for (const [name, value, status] of [ ['absent', undefined, 'missing'], ['malformed', '{bad', 'malformed'],
  ['oversized', 'x'.repeat(MAX_PROGRESS_BYTES + 1), 'oversized'], ['null', 'null', 'invalid-schema'],
  ['wrong schema', {}, 'invalid-schema'] ]) {
  test(name, () => assert.equal(responsiveProgressSummary(fixture(value).identity).status, status));
}
test('valid deterministic allowlisted summary', () => {
  const { identity } = fixture(receipt());
  assert.deepEqual(responsiveProgressSummary(identity), { event: 'responsive-child-progress', engine: 'webkit',
    name: 'tablet-landscape', status: 'available', lastCompletedStage: 'setup', pendingOperation: null, pageUnavailable: false,
    droppedEvents: 0, errorSummary: null, events: [{ type: 'case-start', ms: 0 }, { type: 'stage-complete', ms: 120, phase: 'setup' }] });
  assert.deepEqual(responsiveProgressSummary(identity), responsiveProgressSummary(identity));
});
test('identity mismatch cannot leak data', () => {
  const value = receipt(); value.name = 'desktop';
  assert.equal(responsiveProgressSummary(fixture(value).identity).status, 'invalid-schema');
});
test('stale progress rejected', () => {
  const { file, identity } = fixture(receipt()); fs.utimesSync(file, 1, 1);
  assert.equal(responsiveProgressSummary({ ...identity, startedAt: 2000 }).status, 'stale');
});
test('symlink not followed', () => {
  const source = fixture(receipt()), target = fixture(); fs.symlinkSync(source.file, target.file);
  assert.equal(responsiveProgressSummary(target.identity).status, 'unreadable');
});
test('directory not read', () => {
  const { file, identity } = fixture(); fs.mkdirSync(file);
  assert.equal(responsiveProgressSummary(identity).status, 'not-regular');
});
test('freeform secrets omitted and event/time counts bounded', () => {
  const value = receipt(), secret = 'TOKEN_COOKIE_PASSWORD_SECRET';
  Object.assign(value.diagnostics, { lastCompletedStage: secret, droppedEvents: Number.MAX_SAFE_INTEGER,
    firstError: { name: secret, message: secret, stack: secret },
    events: Array.from({ length: 100 }, () => ({ type: 'stage-complete', ms: Number.MAX_SAFE_INTEGER, detail: 'setup-stage:' + secret })) });
  const summary = responsiveProgressSummary(fixture(value).identity), text = JSON.stringify(summary);
  assert.equal(summary.events.length, 32); assert(text.length < 4096); assert(!text.includes(secret));
  assert.equal(summary.events[0].phase, 'setup-stage'); assert.equal(summary.events[0].ms, 2147483647);
});
test('unknown types and malformed timing are not echoed', () => {
  const value = receipt(); value.diagnostics.events = [{ type: 'SECRET', ms: 1 }, { type: 'first-error', ms: 'SECRET', detail: 'SECRET' }];
  assert.deepEqual(responsiveProgressSummary(fixture(value).identity).events, [{ type: 'first-error', ms: null }]);
});
test('success is silent and does not read identity', () => {
  let reads = 0, writes = 0;
  const identity = new Proxy({}, { get() { reads++; throw Error('must not read'); } });
  emitFailedResponsiveProgress(true, identity, () => writes++);
  assert.equal(reads, 0); assert.equal(writes, 0);
});
test('failure outputs one deterministic bounded JSON line', () => {
  const { identity } = fixture(receipt()), lines = [];
  emitFailedResponsiveProgress(false, identity, text => lines.push(text));
  emitFailedResponsiveProgress(false, identity, text => lines.push(text));
  assert.equal(lines[0], lines[1]); assert.equal(lines[0].split('\n').length, 2);
});
test('stdout failure does not replace original error', () => {
  const original = new Error('original assertion'); let retained;
  try { throw original; } catch (error) {
    emitFailedResponsiveProgress(false, fixture(receipt()).identity, () => { throw Error('stdout broken'); });
    retained = error;
  }
  assert.equal(retained, original);
});

test('isolated runner retains all 14 cases, stderr, acceptance failures and success output', async () => {
  const { spawnSync } = await import('node:child_process');
  const candidate = fs.readFileSync(new URL('../check-inkwave-responsive-isolated.mjs', import.meta.url), 'utf8');
  const baseline = candidate.replace("import { emitFailedResponsiveProgress } from './lib/inkwave-responsive-progress-summary.mjs';\n", '')
    .replace('  emitFailedResponsiveProgress(row.ok, { shardDir: resultDir, engine, name, startedAt });\n', '');
  const dir = path.join(root, 'integration'), scripts = path.join(dir, 'scripts');
  fs.mkdirSync(path.join(scripts, 'lib'), { recursive: true });
  fs.mkdirSync(path.join(scripts, 'ci'), { recursive: true });
  fs.copyFileSync(new URL('../ci/inkwave-responsive-child-pool.mjs', import.meta.url), path.join(scripts, 'ci/inkwave-responsive-child-pool.mjs'));
  fs.copyFileSync(new URL('../lib/inkwave-responsive-progress-summary.mjs', import.meta.url), path.join(scripts, 'lib/inkwave-responsive-progress-summary.mjs'));
  fs.copyFileSync(new URL('../lib/inkwave-responsive-session-retry.mjs', import.meta.url), path.join(scripts, 'lib/inkwave-responsive-session-retry.mjs'));
  fs.copyFileSync(new URL('../lib/inkwave-responsive-animation-diagnostics.mjs', import.meta.url), path.join(scripts, 'lib/inkwave-responsive-animation-diagnostics.mjs'));
  fs.copyFileSync(new URL('../lib/inkwave-responsive-diagnostics.mjs', import.meta.url), path.join(scripts, 'lib/inkwave-responsive-diagnostics.mjs'));
  fs.writeFileSync(path.join(scripts, 'fake-child.mjs'), `
    import fs from 'node:fs'; import path from 'node:path';
    export function spawnSync(command, args, options) {
      if(options.timeout!==20*60*1000)throw Error('deadline changed');
      const get = key => args[args.indexOf(key)+1];
      const engine=get('--engine'), name=get('--cases'), dir=get('--evidence-dir');
      const failed=process.env.PROBE_FAILURE==='1';
      fs.writeFileSync(path.join(dir,'responsive-result.json'),JSON.stringify({status:failed?'failed':'passed',
        cases:[{engine,name,status:failed?'failed':'passed'}], errors:[],sourceHashes:{a:'same'},runnerHashes:{a:'same'},runtimeInstalled:true}));
      fs.writeFileSync(path.join(dir,engine+'-'+name+'-diagnostic-progress.json'),JSON.stringify({kind:'responsive-diagnostic-progress',engine,name,
        diagnostics:{events:[{type:'case-start',ms:0}],lastCompletedStage:null,firstError:{name:'TypeError',message:'PRIVATE'},droppedEvents:0,pageUnavailable:false}}));
      return {status:failed?null:0,signal:failed?'SIGTERM':null,error:failed?new Error('original ETIMEDOUT'):null,
        stdout:'original child stdout\\n',stderr:'original child stderr\\n'};
    }`);
  const runner = path.join(scripts, 'check-inkwave-responsive-isolated.mjs');
  const execute = (source, failed) => {
    fs.writeFileSync(runner, source.replace("from 'node:child_process'", "from './fake-child.mjs'"));
    const output = spawnSync(process.execPath, [runner, '--source', dir, '--evidence-dir', path.join(dir, 'evidence'), '--profile-dir', path.join(dir, 'profiles')],
      { encoding: 'utf8', env: { ...process.env, PROBE_FAILURE: String(failed), NODE_NO_WARNINGS: '1' } });
    assert.equal(output.error, undefined, `isolated runner launch failed: ${output.error}`);
    assert.ok(fs.existsSync(path.join(dir, 'evidence/responsive-result.json')), `isolated runner produced no receipt: ${output.stderr}`);
    return { ...output, report: JSON.parse(fs.readFileSync(path.join(dir, 'evidence/responsive-result.json'))) };
  };
  const normalize = text => text.split('\n').filter(line => !line.includes('"event":"responsive-child-progress"'))
    .map(line => line.replace(/"elapsedMs":\d+/, '"elapsedMs":0').replace(/isolated\.mjs:\d+:\d+/g, 'isolated.mjs:LINE')).join('\n');
  for (const failed of [0, 1]) {
    const before = execute(baseline, failed), after = execute(candidate, failed);
    assert.equal(after.status, before.status); assert.equal(after.status, failed ? 1 : 0);
    assert.equal(after.stderr, before.stderr); assert.equal(JSON.stringify(after.report).replace(/isolated\.mjs:\d+:\d+/g, 'isolated.mjs:LINE'), JSON.stringify(before.report).replace(/isolated\.mjs:\d+:\d+/g, 'isolated.mjs:LINE'));
    assert.equal(normalize(after.stdout), normalize(before.stdout));
    assert.equal(after.report.shards.length, 14);
    assert.equal(after.stdout.split('\n').filter(line => line.includes('"event":"responsive-child-progress"')).length, failed ? 14 : 0);
    if (failed) {
      assert(after.report.shards.every(row => row.processError==='original ETIMEDOUT' && row.error.includes('AssertionError')));
      assert(!after.stdout.includes('PRIVATE'));
    }
  }
});

for (const label of ['results', 'boss-results', 'results-change-gear', 'loadout-continue']) {
  test('preserves existing completed result phase: ' + label, () => {
    const value = receipt();
    value.diagnostics.lastCompletedStage = label;
    value.diagnostics.events = [{ type: 'stage-complete', ms: 1234, detail: label }];
    const summary = responsiveProgressSummary(fixture(value).identity);
    assert.equal(summary.lastCompletedStage, label);
    assert.deepEqual(summary.events, [{ type: 'stage-complete', ms: 1234, phase: label }]);
  });
}
test('result-like freeform labels stay redacted', () => {
  for (const label of ['results-PRIVATE', 'boss-results:PRIVATE', 'results-change-gear/PRIVATE', 'loadout-continue PRIVATE']) {
    const value = receipt();
    value.diagnostics.lastCompletedStage = label;
    value.diagnostics.events = [{ type: 'stage-complete', ms: 1234, detail: label }];
    const summary = responsiveProgressSummary(fixture(value).identity);
    assert.equal(summary.lastCompletedStage, null);
    assert.equal(summary.events[0].phase, null);
    assert(!JSON.stringify(summary).includes('PRIVATE'));
  }
});

test('fixed pending operation and boundaries survive bounded summary; arbitrary text is redacted', () => {
  const value = receipt();
  value.diagnostics.pendingOperation = 'continuation-wait-loadout';
  value.diagnostics.events = [
    { type: 'operation-before', ms: 1, detail: 'continuation-wait-loadout', selector: 'PRIVATE' },
    { type: 'operation-after', ms: 2, detail: 'PRIVATE-operation' }
  ];
  const summary = responsiveProgressSummary(fixture(value).identity);
  assert.equal(summary.pendingOperation, 'continuation-wait-loadout');
  assert.deepEqual(summary.events, [
    { type: 'operation-before', ms: 1, operation: 'continuation-wait-loadout' },
    { type: 'operation-after', ms: 2, operation: null }
  ]);
  assert(!JSON.stringify(summary).includes('PRIVATE'));
  value.diagnostics.pendingOperation = 'PRIVATE-pending';
  assert.equal(responsiveProgressSummary(fixture(value).identity).pendingOperation, null);
});

test('official log summary revalidates at most two bounded animation observations', () => {
  const secret = 'TOKEN_COOKIE_PASSWORD_SECRET';
  const value = receipt(); value.diagnostics.pendingOperation = 'continuation-settle-action';
  const observation = phase => ({ phase, finiteCount: 1, pendingCount: 1, omittedCount: 0,
    rows: [{ index: 0, kind: 'css-transition', playState: 'running', currentTime: 1,
      targetKind: 'weapon-card-descendant', property: 'opacity', name: secret, payload: secret }] });
  value.diagnostics.animationSnapshots = Array.from({ length: 100 }, (_, i) => observation(i % 2 ? 'watchdog' : 'before-await'));
  const summary = responsiveProgressSummary(fixture(value).identity);
  assert.equal(summary.animationSnapshots.length, 2);
  assert.deepEqual(summary.animationSnapshots.map(row => row.phase), ['before-await', 'watchdog']);
  assert.equal(summary.animationSnapshots[1].rows[0].targetKind, 'weapon-card-descendant');
  assert.equal(summary.animationSnapshots[1].rows[0].property, 'opacity');
  assert(!JSON.stringify(summary).includes(secret));
  value.diagnostics.animationSnapshots = [observation(secret)];
  assert.equal(responsiveProgressSummary(fixture(value).identity).animationSnapshots, undefined);
});

test('session-loss retry classifier is mandatory and unfiltered in the verifier registry',()=>{
 const registry=JSON.parse(fs.readFileSync(new URL('../ci/inkwave-test-suites.json',import.meta.url),'utf8'));
 const verify=suites=>{const steps=suites.verifier?.steps||[],name='scripts/tests/inkwave-responsive-session-retry.test.mjs';const matches=steps.filter(x=>Array.isArray(x.args)&&x.args.includes(name));assert.equal(matches.length,1);const s=matches[0];assert.equal(s.program,'node');assert.ok(s.args.includes('--test'));assert.equal(s.args.filter(x=>x===name).length,1);assert.ok(!s.args.some(x=>/^(?:--test-name-pattern|--test-skip-pattern|--test-only)/.test(x)));};
 verify(registry);
 for(const mutate of [s=>s.args=s.args.filter(x=>x!=='scripts/tests/inkwave-responsive-session-retry.test.mjs'),s=>s.program='echo',s=>s.args.push('--test-name-pattern=none'),s=>s.args.push('--test-skip-pattern=all'),s=>s.args.push('--test-only')]){const broken=structuredClone(registry),step=broken.verifier.steps.find(x=>x.args?.includes('scripts/tests/inkwave-responsive-session-retry.test.mjs'));mutate(step);assert.throws(()=>verify(broken));}
});
