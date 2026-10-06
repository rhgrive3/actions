// Fabricated gate records challenge acceptance logic only. They are never
// renderer, native rig, IK, motion, Nintendo, or GPU evidence. The executable
// catalog separately uses the actual built production installer/Actor/Runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CATALOG_MODULES, CATALOG_SCENARIOS, catalogRenderFrames, validateCatalogResult, validateCatalogReceipts, validateDeathCameraInstallSources, catalogStoragePath, catalogInputPath, validateCatalogInputReceipts, catalogFootLayout } from '../../../scripts/check-inkwave-motion-catalog.mjs';

const hash = 'a'.repeat(64), pixel = { pixels: 960 * 720, changedPixels: 30, totalRgbDifference: 1000, maxChannelDifference: 100 };
function gateFixture() {
  const files = [...CATALOG_MODULES.map(([id]) => 'patches/splatoon3/runtime/' + id + '-motion.mjs'), 'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/render.mjs', 'patches/splatoon3/runtime/death-camera.mjs', 'patches/splatoon3/runtime/walk.mjs', 'src/game/actor.js', 'src/game/character.js', 'src/game/weapons.js', 'src/game/physics.js'];
  const sourceHashes = new Map(['patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/render.mjs'].map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(process.cwd(), file))).digest('hex')]));
  const artifacts = Object.fromEntries(files.map(file => ['_versions/fixture/' + file, sourceHashes.get(file) || hash]));
  const data = CATALOG_SCENARIOS.map(scenario => {
    const samples = Array.from({ length: scenario.frames }, (_, frame) => ({ frame, visible: true, grounded: true, visualGameplayInvariant: true, root: [0, 0, 0], velocity: [0, 0, 0], hp: 90, kidScale: 1, walkActive: true, pose: { length: 150, minimum: -1, maximum: 1, l1: 50 }, ik: [0, 0, 0, 0], hands: { left: [0, 1, 0], right: [0, 1, 0] }, grip: { left: { held: true, gap: .001, weight: 1, explicitTarget: 0, swapped: 0 }, right: { held: true, gap: .001, weight: 1, explicitTarget: 0, swapped: 0 } }, feet: [0, 1].map(() => ({ planted: true, contactEpoch: 1, contactWeight: 1, actual: [0, .1, 0], expected: [0, .1, 0], contact: [0, 0, 0], normal: [0, 1, 0], error: 0, drift: 0 })), snapshots: Object.fromEntries(CATALOG_MODULES.map(([id]) => [id, null])) }));
    const renders = catalogRenderFrames(scenario).map(frame => ({ frame, tick: scenario.hz ? Math.min(scenario.frames - 1, Math.floor((frame + 1) * 60 / scenario.hz) - 1) : frame, visible: true, shaderErrors: 0, programs: [{ linked: true, vertexCompiled: true, fragmentCompiled: true }], materials: [{ type: 'fabricated gate material', linked: true, vertexCompiled: true, fragmentCompiled: true }], rig: { ...pixel }, image: 'fixture.png', hiddenImage: 'fixture-hidden.png', geometry: { indexedVertices: 300, triangles: 100, skinnedVertices: 300, meshes: 1, min: [0, 0, 0], max: [1, 1, 1] } }));
    // FixedClock's first selected 120Hz display is index 1, after tick 0.
    for (const r of renders) r.tick = Math.max(0, r.tick);
    const row = { name: scenario.name, kind: scenario.kind, frames: scenario.frames, hz: scenario.hz || 60, driver: 'fabricated acceptance-logic fixture only', samples, renders, contactSheet: 'fixture-sheet.png', events: [], transitions: [], cleanup: { detached: true, ownedMaterials: 8, disposedMaterials: 8, glints: 0, disposedGlints: 0, cleanStates: true, secondDisposeStable: true }, pause: { unchangedClocks: true, unchangedRig: true, nativeVertexShaders: true, measurement: 'native-vertex-flat-colour', vertexPrograms: 1, vertexSources: [{ nativeSHA256: hash, controlledSHA256: hash }], image: 'fixture.png', repeatedImage: 'fixture.png', movedImage: 'fixture.png', beautyImage: 'fixture.png', repeatedBeautyImage: 'fixture.png', wholeSceneRgb: {...pixel}, movedRigRgb: scenario.name === 'swim-turn-brake' ? { ...pixel, changedPixels: 0, totalRgbDifference: 0, maxChannelDifference: 0 } : {...pixel}, sameRgb: { ...pixel, changedPixels: 0, totalRgbDifference: 0, maxChannelDifference: 0 } }, zeroDt: { unchangedClocks: true, gameplayInvariant: true, poseDelta: 0 }, traceHash: hash, displayFrames: scenario.hz || scenario.frames, clockTicks: scenario.frames };
    const fill = (id, v, start = 0, end = samples.length) => { for (const s of samples.slice(start, end)) s.snapshots[id] = structuredClone(v); };
    fill('carry', { active: true });
    switch (scenario.name) {
      case 'ordinary-aimed-jump': fill('jump', { active: true, phase: 'rise', weight: .5 }, 0, 10); fill('jump', { active: true, phase: 'apex', weight: .5 }, 10, 20); fill('jump', { active: true, phase: 'fall', weight: .5 }, 20, 30); fill('landing', { phase: 'recover' }, 30, 35); fill('jump', { active: false }, 30); break;
      case 'hard-landing-recovery': fill('landing', { phase: 'absorb', drop: .04, compression: .5 }, 0, 5); fill('landing', { phase: 'recover', drop: .04, compression: .5 }, 5, 10); fill('landing', { compression: 0 }, 10); break;
      case 'swim-turn-brake': fill('swim', { active: true, bank: .1, power: .5 }, 0, 100); fill('swim', { active: true, bank: 0, power: 0 }, 100); break;
      case 'wall-surge-ready-crest': fill('wall', { phase: 'charge', ready: true, glow: .5 }, 0, 30); fill('wall', { phase: 'launch' }, 30, 40); fill('wall', { phase: 'crest' }, 40, 50); renders[0].glint = { ...pixel }; break;
      case 'form-both-directions-interrupt': fill('form', { phase: 'dive', reversing: true, actionBlocked: false }, 0, 10); fill('form', { phase: 'emerge', reversing: false, actionBlocked: true }, 10, 20); break;
      case 'dualies-roll-lock-interrupt': fill('dualies', { phase: 'roll' }, 0, 10); fill('dualies', { phase: 'plant', blockedRoll: true }, 10, 30); row.events.push({ name: 'fireDualies', frame: 20 }); break;
      case 'roller-horizontal-push': case 'roller-vertical-land': fill('roller-detail', { phase: 'startup', vertical: true }, 0, 15); fill('roller-detail', { phase: 'swing', vertical: true }, 15, 23); fill('roller-detail', { phase: 'recovery', vertical: true }, 23, 40); for (const s of samples.slice(40, 60)) s.rolling = true; row.events.push({ name: 'fireFlick', frame: 23 }); break;
      case 'squidroll-finish': case 'squidroll-interrupt': fill('squidroll', { phase: 'roll' }, 0, 10); fill('squidroll', { phase: null }, 10); break;
      case 'hit-spawn-reset': fill('hit-spawn', { phase: 'entry', coating: .9 }, 0, 5); fill('hit-spawn', { phase: 'protected', coating: .9 }, 5, 20); fill('hit-spawn', { phase: 'expiry', coating: .5 }, 20, 25); fill('hit-spawn', { coating: 0 }, 25); renders[0].coating = { ...pixel }; break;
      case 'quiet-idle-held-sub': fill('idle', { quiet: true }); for (const s of samples.slice(40, 80)) { s.heldBomb = true; s.grip.left.held = false; } row.events.push({ name: 'throwBomb', frame: 80 }); break;
      case 'native-slam-phases': for (const [i, phase] of ['rise', 'hang', 'fall', 'slam-recovery'].entries()) fill('special', { phase }, i * 10, (i + 1) * 10); fill('special', { phase: null }, 40); for (const s of samples.slice(40)) s.velocity[2] = 2.4; break;
      case 'native-storm-deploy': fill('special', { phase: 'storm-deploy' }, 0, 10); fill('special', { phase: 'storm-recovery' }, 10, 20); fill('special', { phase: null }, 20); row.events.push({ name: 'throwStorm', frame: 0 }); break;
      case 'gaze-face-actions': for (const [i, mode] of ['fire', 'sub-aim', 'throw'].entries()) fill('face', { mode, blink: [.8, .8] }, i * 20, (i + 1) * 20); renders[0].face = { ...pixel }; break;
      case 'lifecycle-interruptions': row.transitions = ['form', 'sub', 'dance', 'reset', 'death', 'hide', 'weapon']; samples[135].visible = false; break;
    }
    if (scenario.name.startsWith('superjump-')) { for (const [i, phase] of ['charge', 'takeoff', 'flight', 'descent', 'touchdown'].entries()) fill('superjump', { phase }, i * 15, (i + 1) * 15); fill('superjump', { phase: null }, 75); }
    if (scenario.name.startsWith('victory-')) { fill('emotes', { phase: 'action' }, 0, 240); fill('emotes', { phase: 'hold' }, 240, 280); for (const s of samples) { s.dance = s.frame < 280 ? 'victory' : s.frame < 310 ? null : 'lobby_pose'; s.danceWeight = s.frame >= 280 && s.frame < 310 ? .5 : 1; } }
    // Hidden native frames must have exactly zero RGB contribution.
    for (const r of renders) if (!samples[r.tick].visible) { r.visible = false; r.rig.changedPixels = r.rig.totalRgbDifference = r.rig.maxChannelDifference = 0; }
    return row;
  });
  const loaded = Object.entries(artifacts).filter(([file]) => !file.endsWith('/patches/splatoon3/runtime/death-camera.mjs')).map(([file, sha256]) => ({ file, sha256, bytes: 100 }));
  return { schema: 1, source: 'built-production-native', installCalls: 1, contentHash: crypto.createHash('sha256').update(JSON.stringify(artifacts)).digest('hex'), artifacts, loaded, images: ['fixture.png', 'fixture-hidden.png', 'fixture-sheet.png'].map(file => ({ file, sha256: hash, bytes: 100 })), errors: [], gpu: { renderer: 'fabricated gate string, never GPU evidence', contextLost: false, pixelControls: {dither:false,samples:0,target:'explicit-srgb-rgba8'} }, duplicateRealm: { modules: CATALOG_MODULES.length, unchanged: true }, data, previewRates: [30, 60, 120].map(hz => ({ hz, frames: hz, finite: true })), cleanup: { rendererDisposed: true, domRemoved: true, geometries: 0, textures: 0, fixtureTextureDisposals:[{labels:['compiled-uniform.dfgLUT'],wasLive:true,remainsLive:false}] } };
}
test('synthetic gate schema can exercise every acceptance branch; this proves no motion or GPU output', () => assert.equal(validateCatalogResult(gateFixture()).length, CATALOG_SCENARIOS.length));
test('installed death-camera catalog edge uses render implementation and install call', () => {
  const result = gateFixture();
  const manifest = { contentHash: result.contentHash, artifacts: result.artifacts };
  const renderFile = Object.keys(result.artifacts).find(file => file.endsWith('/patches/splatoon3/runtime/render.mjs'));
  const facadeFile = Object.keys(result.artifacts).find(file => file.endsWith('/patches/splatoon3/runtime/death-camera.mjs'));
  assert.ok(result.loaded.some(receipt => receipt.file === renderFile));
  assert.ok(result.loaded.some(receipt => receipt.file.endsWith('/patches/splatoon3/runtime/install.mjs')));
  assert.equal(result.loaded.some(receipt => receipt.file === facadeFile), false);
  assert.doesNotThrow(() => validateCatalogReceipts(manifest, result.loaded));

  const renderSource = fs.readFileSync(path.join(process.cwd(), 'patches/splatoon3/runtime/render.mjs'), 'utf8');
  const installSource = fs.readFileSync(path.join(process.cwd(), 'patches/splatoon3/runtime/install.mjs'), 'utf8');
  assert.doesNotThrow(() => validateDeathCameraInstallSources(renderSource, installSource));
  assert.throws(() => validateDeathCameraInstallSources(renderSource, installSource.replace('installDeathCamera(api);', '')), /death-camera install call/);

  const missingRender = { ...manifest, artifacts: { ...manifest.artifacts } };
  delete missingRender.artifacts[renderFile];
  missingRender.contentHash = crypto.createHash('sha256').update(JSON.stringify(missingRender.artifacts)).digest('hex');
  assert.throws(() => validateCatalogReceipts(missingRender, result.loaded.filter(receipt => receipt.file !== renderFile)), /missing-module manifest patches\/splatoon3\/runtime\/render\.mjs/);
});
for (const [name, mutate, pattern] of [
  ['missing scenario', r => r.data.pop(), /scenario denominator/],
  ['missing frame', r => r.data[0].samples.pop(), /frame denominator/],
  ['duplicate render frame', r => r.data[0].renders[1].frame = r.data[0].renders[0].frame, /render frame denominator/],
  ['NaN native IK', r => r.data[0].samples[0].ik[0] = NaN, /non-finite/],
  ['NaN actual posed vertex aggregate', r => r.data[0].renders[0].geometry.min[1] = NaN, /non-finite/],
  ['JSON null replacing nonfinite native output', r => r.data[0].samples[0].ik[0] = null, /non-finite/],
  ['missing shader compilation', r => r.data[0].renders[0].programs = [], /shader compiled denominator/],
  ['missing actually drawn native material', r => r.data[0].renders[0].materials = [], /native material shader denominator/],
  ['missing screenshot receipt', r => r.images.pop(), /contact-sheet denominator/],
  ['phase has no RGB sample', r => { for (const x of r.data.find(x => x.name === 'ordinary-aimed-jump').renders) { const s = r.data.find(x => x.name === 'ordinary-aimed-jump').samples[x.tick]; if (s.snapshots.jump.phase === 'apex') s.snapshots.jump.phase = 'rise'; } }, /phase RGB sample apex/],
  ['unlinked native material shader', r => r.data[0].renders[0].programs[0].linked = false, /shader compiled denominator/],
  ['not rendered', r => r.data[0].renders[0].rig.changedPixels = 0, /not rendered/],
  ['missing installed module', r => r.loaded = r.loaded.filter(x => !x.file.endsWith('form-motion.mjs')), /missing-module loaded/],
  ['tampered loaded bytes', r => r.loaded[0].sha256 = 'b'.repeat(64), /missing-module loaded/],
  ['unclean native disposal', r => r.data[0].cleanup.disposedMaterials--, /unclean-disposal/],
  ['unclean glint disposal', r => { r.data[0].cleanup.glints = 1; }, /unclean-disposal/],
  ['unclean renderer disposal', r => r.cleanup.textures = 1, /unclean-disposal renderer/],
  ['held support detached', r => r.data[0].samples[0].grip.left.gap = .2, /native held grip/],
  ['explicit action hand called held', r => r.data[0].samples[0].grip.left.explicitTarget = 1, /native grip owner mismatch/],
  ['planted ankle missed', r => r.data[0].samples[0].feet[0].error = .01, /planted native walking contact/],
  ['missing native foot ownership', r => delete r.data[0].samples[0].feet[0].contactWeight, /non-finite/],
  ['pause advances clock', r => r.data[0].pause.unchangedClocks = false, /pause denominator/],
  ['pause native rig moves', r => r.data[0].pause.unchangedRig = false, /pause denominator/],
  ['pause controlled RGB moves', r => r.data[0].pause.sameRgb.changedPixels = 1, /pause denominator/],
  ['pause replaces native vertex shader', r => r.data[0].pause.vertexSources[0].controlledSHA256 = 'b'.repeat(64), /pause native vertex shader identity/],
  ['pause insensitive to real rig motion', r => r.data[0].pause.movedRigRgb.changedPixels = 0, /not rendered/],
  ['braked squid drawn above its own ink', r => Object.assign(r.data.find(x => x.name === 'swim-turn-brake').pause.movedRigRgb, pixel), /not rendered \/ hidden pixels swim-turn-brake/],
  ['pause lacks raw beauty image', r => delete r.data[0].pause.beautyImage, /pause screenshot denominator/],
  ['zero dt advances native clock', r => r.data[0].zeroDt.unchangedClocks = false, /zero-dt/],
  ['walking remains suppressed after authoritative special recovery', r => r.data.find(x => x.name === 'native-slam-phases').samples[80].walkActive = false, /post-special native walking owner/],
  ['native roller release duplicated', r => r.data.find(x => x.name === 'roller-horizontal-push').events.push({ name: 'fireFlick', frame: 23 }), /native roller/],
  ['native held sub release duplicated', r => r.data.find(x => x.name === 'quiet-idle-held-sub').events.push({ name: 'throwBomb', frame: 100 }), /idle\/sub/],
  ['30Hz diverges', r => r.data.find(x => x.name === 'cadence-30').traceHash = 'b'.repeat(64), /30\/60\/120Hz/],
  ['gameplay touched by pose', r => r.data[0].samples[0].visualGameplayInvariant = false, /native frame identity/],
  ['duplicate realm adds wrapper', r => r.duplicateRealm.unchanged = false, /cross-realm/],
]) test('rejects ' + name + ' (acceptance logic only)', () => { const result = gateFixture(); mutate(result); assert.throws(() => validateCatalogResult(result), pattern); });

test('one native contact failure does not hide another scenario failure (acceptance logic only)', () => {
  const result = gateFixture(); result.data[0].samples[0].feet[0].error = .02; result.data[1].renders[0].rig.changedPixels = 0;
  assert.throws(() => validateCatalogResult(result), e => /planted native walking contact/.test(e.message) && /not rendered/.test(e.message));
});
test('a pose explicitly detached by native contact weight is measured but not called planted contact (acceptance logic only)', () => {
  const result = gateFixture(); const foot = result.data[0].samples[0].feet[0]; foot.contactWeight = 0; foot.error = .2;
  assert.equal(validateCatalogResult(result).length, CATALOG_SCENARIOS.length);
});
test('native explicit hand target is measured without claiming foregrip attachment (acceptance logic only)', () => {
  const result = gateFixture(); const hand = result.data[0].samples[0].grip.left;
  Object.assign(hand, { held: false, explicitTarget: 1, gap: .2 });
  assert.equal(validateCatalogResult(result).length, CATALOG_SCENARIOS.length);
});
test('no held hands has an explicit zero denominator, not an infinite grip summary (acceptance logic only)', () => {
  const result = gateFixture();
  for (const s of result.data.find(r => r.name === 'swim-turn-brake').samples) for (const g of Object.values(s.grip)) g.held = false;
  const summary = validateCatalogResult(result).find(r => r.name === 'swim-turn-brake');
  assert.equal(summary.heldHandSamples, 0); assert.equal(summary.maximumHeldGrip, null);
});

test('physical checkout storage accepts CI ownership and rejects temporary paths and escaping links', () => {
  const localWorkspace = fs.realpathSync(process.cwd()).startsWith('/mnt/workspace/');
  const scratch = catalogStoragePath(localWorkspace ? '/mnt/workspace/.dev-state/agent-work/scratch/inkwave-motion-detail-20261002/review-render-normal' : path.join(process.cwd(), '.motion-catalog-test-scratch'));
  const scratchExisted = fs.existsSync(scratch);
  fs.mkdirSync(scratch, { recursive: true });
  const fixture = fs.mkdtempSync(path.join(scratch, 'storage-gate-'));
  try {
    // Explicit roots exercise checkout ownership independently of /mnt/workspace.
    assert.equal(catalogStoragePath(path.join(fixture, 'new/profile'), [fixture]), path.join(fixture, 'new/profile'));
    assert.throws(() => catalogStoragePath(fixture + '-sibling', [fixture]), /persistent workspace/);
    for (const dir of ['/tmp', '/var/tmp', '/dev/shm']) assert.throws(() => catalogStoragePath(dir, [dir]), /persistent workspace/);
    fs.symlinkSync('/etc', path.join(fixture, 'escape'));
    assert.throws(() => catalogStoragePath(path.join(fixture, 'escape/new/profile'), [fixture]), /persistent workspace/);
    fs.symlinkSync(path.join(fixture, 'missing'), path.join(fixture, 'dangling'));
    assert.throws(() => catalogStoragePath(path.join(fixture, 'dangling/profile'), [fixture]), /ENOENT/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    if (!scratchExisted) fs.rmdirSync(scratch);
  }
});

test('all declared original input namespaces retain exact committed byte identity (acceptance logic only)', () => {
  const keys = ['upstream/src/game/character.js', 'patch/runtime/walk.mjs', 'touch-layout/runtime/install.mjs', 'reliability/runtime/install.mjs', 'network-replication/adapter.mjs'];
  const files = Object.fromEntries(keys.map(key => [key, hash]));
  const manifest = { files, inputHash: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') };
  const receipts = keys.map(key => ({ key, file: catalogInputPath(key), sha256: hash, committedSHA256: hash, bytes: 100 }));
  assert.equal(receipts[3].file, 'patches/reliability/runtime/install.mjs');
  assert.equal(receipts[4].file, 'patches/network-replication/adapter.mjs');
  assert.throws(() => validateCatalogInputReceipts(manifest, receipts.map(r => r.key.startsWith('network-replication/') ? { ...r, committedSHA256: 'b'.repeat(64) } : r)), /committed source input identity network-replication/);
  assert.doesNotThrow(() => validateCatalogInputReceipts(manifest, receipts));
  assert.throws(() => validateCatalogInputReceipts(manifest, receipts.slice(0, -1)), /source input denominator/);
  assert.throws(() => validateCatalogInputReceipts(manifest, receipts.map(r => r.key.startsWith('reliability/') ? { ...r, committedSHA256: 'b'.repeat(64) } : r)), /committed source input identity reliability/);
  assert.throws(() => validateCatalogInputReceipts({ ...manifest, inputHash: 'b'.repeat(64) }, receipts), /source input hash/);
  const emptyHash = crypto.createHash('sha256').update('').digest('hex'), emptyFiles = { 'reliability/.keep': emptyHash };
  assert.doesNotThrow(() => validateCatalogInputReceipts({ files: emptyFiles, inputHash: crypto.createHash('sha256').update(JSON.stringify(emptyFiles)).digest('hex') }, [{ key: 'reliability/.keep', file: 'patches/reliability/.keep', sha256: emptyHash, committedSHA256: emptyHash, bytes: 0 }]));
  for (const key of ['foreign/file.mjs', 'patch/../file.mjs', 'patch//file.mjs', 'patch/./file.mjs']) assert.throws(() => catalogInputPath(key), /input namespace\/path/);
});

test('named native foot channels bypass adjacent layout inference; old builds require verified contact use', () => {
  assert.equal(catalogFootLayout('Object.freeze({WPL:L,WPR:R})', 'fixture').named, true);
  const old = 'L=k(),R=k(),S=k();Object.freeze({STAB:S});(i===0?p[L]:p[R])*w*(this.feetValid?1:0)';
  assert.equal(catalogFootLayout(old, 'fixture').named, false);
  assert.throws(() => catalogFootLayout(old.replace('p[R]', 'p[S]'), 'fixture'), /native foot contact binding/);
  assert.throws(() => catalogFootLayout('Object.freeze({WPL:L})', 'fixture'), /native foot contact binding/);
});

// Opt-in validation of a retained actual browser recording. Absence is never
// interpreted as GPU success; ordinary node:test runs are gate logic only.
if (process.env.INKWAVE_CATALOG_RECORDING) test('retained actual production browser result meets the same catalog contract', () => {
  const file = fs.realpathSync(process.env.INKWAVE_CATALOG_RECORDING);
  assert.equal(catalogStoragePath(file), file);
  const result = JSON.parse(fs.readFileSync(file));
  assert.equal(result.status, 'passed');
  assert.equal(validateCatalogResult(result).length, CATALOG_SCENARIOS.length);
});


test('catalog rejects uncontrolled framebuffer and unproved compiled texture disposal', () => {
  for (const field of ['dither', 'samples', 'target']) {
    const r = gateFixture(); r.gpu.pixelControls[field] = field === 'dither' ? true : field === 'samples' ? 4 : 'canvas';
    assert.throws(() => validateCatalogResult(r), /controlled pixel framebuffer/);
  }
  const r = gateFixture(); r.cleanup.fixtureTextureDisposals[0].remainsLive = true;
  assert.throws(() => validateCatalogResult(r), /compiled texture disposal proof/);
});
