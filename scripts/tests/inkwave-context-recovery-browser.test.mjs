import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nativeContextRecoveryProof, validateContextRecoveryReceipt, validateContextStartupReceipt, recoveryInputPath } from '../check-inkwave-context-recovery-browser.mjs';
const proof = () => {
  const state = { time: 170, gameTime: 10, ticks: 600, frame: 602, paused: true, paintVersion: 7, counts: [20, 30], gridLength: 100, gridHash: 42, actors: [{ nid: 1, pos: [0, 0, 0], hp: 100, alive: true, respawnTimer: 0 }] };
  return { stages: ['paint-seeded', 'ordinary-pause-resume', 'context-lost', 'context-restored', 'terminal-restart-rejected'].map(stage => ({ stage })), realGPUEvents: true,
    lostEvent: { type: 'webglcontextlost', trusted: true }, restoredEvent: { type: 'webglcontextrestored', trusted: true }, seed: { area: 1 },
    lost: state, afterResumeAttempts: { ...state, counts: [...state.counts], actors: structuredClone(state.actors) },
    identities: { match: true, paint: true, grid: true, counts: true, overlay: true, everyGridByte: true },
    dialog: { count: 1, role: 'alertdialog', connected: true, buttons: 1 },
    terminal: { contextLost: true, glRestored: true, frozen: false, startResult: false, attractResult: false, observedRAF: 120, directFrames: 60 },
    ordinary: { before: { time: 171, gameTime: 9 }, paused: { time: 171, gameTime: 9, paused: true }, resumed: { time: 170, gameTime: 10, paused: false } } };
};
test('complete native receipt accepts ordinary progression and terminal stasis', () => assert.doesNotThrow(() => validateContextRecoveryReceipt(proof())));
test('real RAF proof retains 120 callbacks and allows software renderer scheduling latency', () => {
  const body=nativeContextRecoveryProof.toString();
  assert.match(body,/observation\.callbacks === 120/);
  assert.match(body,/\}, 45000\)/);
});
for (const key of ['time', 'gameTime', 'ticks', 'frame', 'paintVersion', 'gridLength', 'gridHash']) test(`receipt rejects terminal drift in ${key}`, () => {
  const r = proof(); r.afterResumeAttempts[key]++; assert.throws(() => validateContextRecoveryReceipt(r));
});
for (const key of ['match', 'paint', 'grid', 'counts', 'overlay', 'everyGridByte']) test(`receipt rejects replaced or changed ${key}`, () => {
  const r = proof(); r.identities[key] = false; assert.throws(() => validateContextRecoveryReceipt(r));
});
test('receipt rejects synthetic event, missing restoration, duplicate UI and frozen-only false pass', () => {
  for (const mutate of [r => r.lostEvent.trusted = false, r => r.restoredEvent.trusted = false, r => r.terminal.glRestored = false,
    r => r.dialog.count = 2, r => r.dialog.connected = false, r => r.terminal.frozen = true, r => r.stages.pop(),
    r => r.ordinary.resumed.time++, r => r.afterResumeAttempts.counts[0]++, r => r.terminal.startResult = true,
    r => r.terminal.observedRAF = 119, r => r.seed.area = 0, r => r.afterResumeAttempts.actors[0].pos[0] = 1]) {
    const r = proof(); mutate(r); assert.throws(() => validateContextRecoveryReceipt(r));
  }
});
test('source identity namespaces fail closed and keep exact required input mapping', () => {
  assert.equal(recoveryInputPath('upstream/src/main.js'), 'inkwave-public/src/main.js');
  assert.equal(recoveryInputPath('patch/runtime/clock.mjs'), 'patches/splatoon3/runtime/clock.mjs');
  assert.equal(recoveryInputPath('native-stages/runtime/engine.mjs'), 'patches/native-stages/runtime/engine.mjs');
  assert.throws(() => recoveryInputPath('unknown/test')); assert.throws(() => recoveryInputPath('patch/../test'));
});
test('native lane calls actual extension and emitted namespace, without synthesizing events or retrying', () => {
  const body = nativeContextRecoveryProof.toString();
  assert.match(body, /import\(new URL\('src\/core\/ctx.js', document.baseURI\)/);
  assert.match(body, /getExtension\('WEBGL_lose_context'\)/); assert.match(body, /extension\.loseContext\(\)/); assert.match(body, /extension\.restoreContext\(\)/);
  assert.doesNotMatch(body, /dispatchEvent|new Event\(/);
  assert.match(body, /g\.api\.startMatch/); assert.match(body, /pressStart\(\); g\.resume\(\)/);
  const script = fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /route\.fetch|retries\s*:|retry\(/);
  assert.match(script, /startupDeadline = Date.now\(\) \+ 180000/); assert.match(script, /timeout: 30000/);
});

test('startup requires one trusted native START and actual recorded audio admission', () => {
  const startup = () => ({ route: 'native-menu-start', gestures: [{ type: 'click', trusted: true, selector: '.iw-setup [data-id="start"].iw-btn--start' }],
    events: [{ event: 'native-start-clicked', attempt: 1 }], admission: { mode: 'match', state: 'playing', attract: false, local: true, sameMatch: true, audioState: 'running', recordedShooterFire: true } });
  assert.doesNotThrow(() => validateContextStartupReceipt(startup()));
  for (const change of [r => r.gestures[0].trusted = false, r => r.gestures.push(r.gestures[0]), r => r.events[0].attempt = 2,
    r => r.admission.state = 'intro', r => r.admission.audioState = 'suspended', r => r.admission.recordedShooterFire = false,
    r => r.admission.sameMatch = false, r => r.admission.attract = true]) {
    const r = startup(); change(r); assert.throws(() => validateContextStartupReceipt(r));
  }
});
test('startup uses shipped trusted menu helper, not a direct match/audio bypass', () => {
  const script = fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs', import.meta.url), 'utf8');
  const startup = script.slice(script.indexOf("await page.goto('http"), script.indexOf('const proof = await page.evaluate(nativeContextRecoveryProof)'));
  assert.match(startup, /startProjectileThroughMenu\(page/); assert.match(startup, /rangeMenuControlReady/);
  assert.match(startup, /trusted: event\.isTrusted/); assert.match(startup, /recordedShooterFire:/);
  assert.doesNotMatch(startup, /\.startMatch\(|requireRecordedMainShot\(|\.resume\(|\.init\(|wipe\.cancel/);
});
