#!/usr/bin/env node
// Installed production Actor/Runner/Character in one browser realm. CPU indexed
// skinning and native IK are separate from the WebGL RGB proofs below. Neither
// is Nintendo joint-curve, console, iOS, or complete-match gameplay evidence.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { pixelDifference } from './check-inkwave-motion-detail.mjs';

export const CATALOG_MODULES = Object.freeze([
  ['jump', 'jumpMotionSnapshot', 'installJumpMotion'],
  ['landing', 'landingMotionSnapshot', 'installLandingMotion'],
  ['swim', 'swimMotionSnapshot', 'installSwimMotion'],
  ['wall', 'wallMotionSnapshot', 'installWallMotion'],
  ['form', 'formMotionSnapshot', 'installFormMotion'],
  ['dualies', 'dualiesMotionSnapshot', 'installDualiesMotion'],
  ['roller-detail', 'rollerDetailMotionSnapshot', 'installRollerDetailMotion'],
  ['superjump', 'superjumpMotionSnapshot', 'installSuperjumpMotion'],
  ['squidroll', 'squidrollMotionSnapshot', 'installSquidrollMotion'],
  ['hit-spawn', 'hitSpawnMotionSnapshot', 'installHitSpawnMotion'],
  ['idle', 'idleMotionSnapshot', 'installIdleMotion'],
  ['emotes', 'emotesMotionSnapshot', 'installEmotesMotion'],
  ['special', 'specialMotionSnapshot', 'installSpecialMotion'],
  ['face', 'faceMotionSnapshot', 'installFaceMotion'],
  ['carry', 'carryMotionSnapshot', 'installCarryMotion'],
]);
// Fixed named denominators; shortening an action cannot silently skip its tail.
export const CATALOG_SCENARIOS = Object.freeze([
  { name: 'carry-walk-fire-return', kind: 'shooter', frames: 240 },
  { name: 'ordinary-aimed-jump', kind: 'shooter', frames: 180, probes: [23, 38] },
  { name: 'hard-landing-recovery', kind: 'shooter', frames: 120 },
  { name: 'swim-turn-brake', kind: 'shooter', frames: 180 },
  { name: 'wall-surge-ready-crest', kind: 'shooter', frames: 180, probes: [64, 65, 74, 75, 80, 100] },
  { name: 'form-both-directions-interrupt', kind: 'shooter', frames: 180, probes: [76, 82, 100, 145] },
  { name: 'dualies-roll-lock-interrupt', kind: 'dualies', frames: 180, probes: [110, 115, 132, 155] },
  { name: 'roller-horizontal-push', kind: 'roller', frames: 180, probes: [17, 125] },
  { name: 'roller-vertical-land', kind: 'roller', frames: 180 },
  // Native preparation + flight + .8s visual touchdown must all expire.
  ...['short', 'vertical', 'long'].map(distance => ({ name: 'superjump-' + distance, kind: 'shooter', frames: 300, probes: [79, 80, 200, 217, 265] })),
  { name: 'squidroll-finish', kind: 'shooter', frames: 120 },
  { name: 'squidroll-interrupt', kind: 'shooter', frames: 120 },
  { name: 'hit-spawn-reset', kind: 'shooter', frames: 180, probes: [20, 110, 150] },
  { name: 'quiet-idle-held-sub', kind: 'shooter', frames: 180, probes: [55, 100] },
  ...[0, 1, 2].map(variant => ({ name: 'victory-fade-lobby-' + variant, kind: 'shooter', frames: 360, variant, probes: [240, 279, 280, 290, 310] })),
  { name: 'native-slam-phases', kind: 'shooter', frames: 180, probes: [33, 49, 54, 79, 133] },
  { name: 'native-storm-deploy', kind: 'charger', frames: 120 },
  { name: 'gaze-face-actions', kind: 'shooter', frames: 180 },
  { name: 'lifecycle-interruptions', kind: 'shooter', frames: 180, probes: [105, 119, 135, 140, 145, 150, 165] },
  { name: 'nullable-preview', kind: 'shooter', frames: 90 },
  ...[30, 60, 120].map(hz => ({ name: 'cadence-' + hz, kind: 'shooter', frames: 60, hz })),
]);
export function catalogRenderFrames(s) {
  if (s.hz) return [s.hz === 120 ? 1 : 0, Math.floor(s.hz / 2), s.hz - 1];
  return [...new Set([0, 6, 12, 21, 26, 30, 45, 60, 90, 120, 179, s.frames - 1, ...(s.probes || [])].filter(f => f < s.frames))].sort((a, b) => a - b);
}
const fail = message => { throw Error('Catalog ' + message); };
const finite = (value, label) => { if (typeof value !== 'number' || !Number.isFinite(value)) fail('non-finite ' + label); };
function numericTree(value, label) {
  if (typeof value === 'number') finite(value, label);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) numericTree(v, label + '.' + k);
}
function vector(v, length, label) {
  if (!Array.isArray(v) || v.length !== length) fail('vector denominator ' + label);
  v.forEach(x => finite(x, label));
}
function pixels(p, label, visible) {
  for (const k of ['pixels', 'changedPixels', 'totalRgbDifference', 'maxChannelDifference']) finite(p?.[k], label + '.' + k);
  if (p.pixels !== 960 * 720 || !Number.isInteger(p.changedPixels) || p.changedPixels < 0 || p.changedPixels > p.pixels || p.totalRgbDifference < 0 || p.maxChannelDifference < 0 || p.maxChannelDifference > 255) fail('pixel denominator ' + label);
  if (visible ? p.changedPixels < 16 : p.changedPixels !== 0) fail('not rendered / hidden pixels ' + label);
}
export function validateCatalogReceipts(manifest, receipts) {
  if (!/^[a-f0-9]{64}$/.test(manifest?.contentHash || '') || !manifest.artifacts || !Array.isArray(receipts)) fail('manifest/loaded denominator');
  if (crypto.createHash('sha256').update(JSON.stringify(manifest.artifacts)).digest('hex') !== manifest.contentHash) fail('immutable manifest content hash');
  const required = [...CATALOG_MODULES.map(([id]) => 'patches/splatoon3/runtime/' + id + '-motion.mjs'),
    'patches/splatoon3/runtime/install.mjs', 'patches/splatoon3/runtime/walk.mjs',
    'src/game/actor.js', 'src/game/character.js', 'src/game/weapons.js', 'src/game/physics.js'];
  for (const suffix of required) {
    const keys = Object.keys(manifest.artifacts).filter(k => k.endsWith('/' + suffix));
    if (keys.length !== 1) fail('missing-module manifest ' + suffix);
    if (!receipts.some(r => r.file === keys[0] && r.sha256 === manifest.artifacts[keys[0]] && r.bytes > 0)) fail('missing-module loaded ' + suffix);
  }
  for (const r of receipts) if (!manifest.artifacts[r.file] || r.sha256 !== manifest.artifacts[r.file] || !Number.isInteger(r.bytes) || r.bytes <= 0) fail('loaded-byte identity ' + r.file);
  for (const file of Object.keys(manifest.artifacts).filter(k => k.startsWith('_versions/') && /\/patches\/splatoon3\/runtime\/.*\.mjs$/.test(k)))
    if (!receipts.some(r => r.file === file && r.sha256 === manifest.artifacts[file])) fail('missing-module installed graph ' + file);
}
export function validateCatalogResult(result) {
  if (result?.schema !== 1 || result.installCalls !== 1 || result.source !== 'built-production-native' || result.gpu?.contextLost !== false || !result.gpu?.renderer || result.errors?.length !== 0) fail('runtime identity / shader errors');
  validateCatalogReceipts({ contentHash: result.contentHash, artifacts: result.artifacts }, result.loaded);
  if (result.duplicateRealm?.modules !== CATALOG_MODULES.length || result.duplicateRealm?.unchanged !== true) fail('cross-realm install');
  if (!Array.isArray(result.data) || result.data.length !== CATALOG_SCENARIOS.length || new Set(result.data.map(r => r.name)).size !== CATALOG_SCENARIOS.length) fail('scenario denominator');
  if (!Array.isArray(result.images) || new Set(result.images.map(r => r.file)).size !== result.images.length || result.images.some(r => !/^[a-z0-9-]+\.png$/.test(r.file) || !/^[a-f0-9]{64}$/.test(r.sha256) || !Number.isInteger(r.bytes) || r.bytes <= 0)) fail('screenshot receipt denominator');
  const imageFiles = new Set(result.images.map(r => r.file));
  const summaries = [], failures = [];
  const checkScenario = scenario => {
    const row = result.data.find(r => r.name === scenario.name), label = scenario.name;
    if (!row || row.kind !== scenario.kind || row.frames !== scenario.frames || row.hz !== (scenario.hz || 60) || typeof row.driver !== 'string' || !row.driver || !Array.isArray(row.samples) || row.samples.length !== scenario.frames) fail('frame denominator ' + label);
    numericTree(row, label);
    for (const [i, s] of row.samples.entries()) {
      if (s.frame !== i || typeof s.visible !== 'boolean' || s.visualGameplayInvariant !== true || !s.snapshots || CATALOG_MODULES.some(([id]) => !Object.hasOwn(s.snapshots, id))) fail('native frame identity ' + label);
      vector(s.ik, 4, label + '.IK'); vector(s.root, 3, label + '.root'); vector(s.velocity, 3, label + '.velocity');
      for (const k of ['length', 'minimum', 'maximum', 'l1']) finite(s.pose?.[k], label + '.pose.' + k);
      if (s.pose.length < 100 || s.pose.l1 <= 0) fail('empty native pose ' + label);
      for (const side of ['left', 'right']) {
        vector(s.hands?.[side], 3, label + '.hand');
        const g = s.grip?.[side];
        if (typeof g?.held !== 'boolean') fail('grip owner ' + label);
        finite(g.gap, label + '.grip'); finite(g.weight, label + '.gripWeight');
        finite(g.explicitTarget, label + '.nativeExplicitHandTarget'); finite(g.swapped, label + '.nativeSubSwap');
        if (g.held && (g.weight <= .999 || g.explicitTarget > .001 || g.swapped > .001)) fail('native grip owner mismatch ' + label);
        // Detachment is decided by native pose weights, never by a scenario
        // label invented to excuse a held-hand/contact failure.
        if (s.visible && s.kidScale > .999 && g.held && (g.gap >= .025 || s.ik[side === 'left' ? 0 : 1] >= .025)) fail('native held grip / reach ' + label + ' frame ' + i + ' ' + side);
      }
      if (!Array.isArray(s.feet) || s.feet.length !== 2) fail('native foot denominator ' + label);
      for (const f of s.feet) {
        if (typeof f.planted !== 'boolean') fail('foot identity ' + label);
        for (const k of ['actual', 'expected', 'contact', 'normal']) vector(f[k], 3, label + '.ankle.' + k);
        finite(f.error, label + '.ankleError'); finite(f.drift, label + '.plantDrift');
        finite(f.contactWeight, label + '.nativeContactWeight');
        if (!Number.isInteger(f.contactEpoch) || f.contactEpoch < 0) fail('native contact epoch ' + label);
        if (s.visible && s.kidScale > .999 && s.walkActive && f.planted && f.contactWeight > .999 && (f.error >= .001 || f.drift > 1e-8)) fail('planted native walking contact ' + label + ' frame ' + i);
      }
    }
    const expected = catalogRenderFrames(scenario);
    if (!Array.isArray(row.renders) || row.renders.length !== expected.length || new Set(row.renders.map(r => r.frame)).size !== expected.length || expected.some(f => !row.renders.some(r => r.frame === f))) fail('render frame denominator ' + label);
    for (const r of row.renders) {
      const sample = row.samples[r.tick];
      if (!sample || r.visible !== sample.visible || r.shaderErrors !== 0 || !Array.isArray(r.programs) || !r.programs.length || r.programs.some(p => p.linked !== true || p.vertexCompiled !== true || p.fragmentCompiled !== true)) fail('shader compiled denominator ' + label);
      if (!Array.isArray(r.materials) || sample.visible && !r.materials.length || r.materials.some(m => typeof m.type !== 'string' || m.linked !== true || m.vertexCompiled !== true || m.fragmentCompiled !== true)) fail('native material shader denominator ' + label);
      pixels(r.rig, label, sample.visible);
      for (const k of ['indexedVertices', 'triangles', 'skinnedVertices', 'meshes']) finite(r.geometry?.[k], label + '.geometry.' + k);
      vector(r.geometry?.min, 3, label + '.geometry.min'); vector(r.geometry?.max, 3, label + '.geometry.max');
      if (r.geometry.indexedVertices < 100 || r.geometry.triangles < 30 || r.geometry.meshes < 1 || sample.kidScale > .999 && r.geometry.skinnedVertices < 100) fail('actual indexed geometry denominator ' + label);
      if (!imageFiles.has(r.image) || !imageFiles.has(r.hiddenImage)) fail('screenshot denominator ' + label);
    }
    if (!imageFiles.has(row.contactSheet)) fail('contact-sheet denominator ' + label);
    if (!row.cleanup || row.cleanup.detached !== true || row.cleanup.ownedMaterials < 5 || row.cleanup.disposedMaterials !== row.cleanup.ownedMaterials || row.cleanup.glints !== row.cleanup.disposedGlints || row.cleanup.cleanStates !== true || row.cleanup.secondDisposeStable !== true) fail('unclean-disposal ' + label);
    const count = fn => row.samples.filter(fn).length;
    const phase = (id, p) => count(s => s.snapshots[id]?.phase === p);
    const need = (condition, message) => { if (!condition) fail(message + ' ' + label); };
    const renderPhase = (id, p) => row.renders.some(r => r.visible && row.samples[r.tick].snapshots[id]?.phase === p);
    const requiredPhases = label === 'ordinary-aimed-jump' ? ['jump', ['rise', 'apex', 'fall']]
      : label === 'hard-landing-recovery' ? ['landing', ['absorb', 'recover']]
      : label === 'wall-surge-ready-crest' ? ['wall', ['charge', 'launch', 'crest']]
      : label === 'form-both-directions-interrupt' ? ['form', ['dive', 'emerge']]
      : label === 'dualies-roll-lock-interrupt' ? ['dualies', ['roll', 'plant']]
      : label.startsWith('roller-') ? ['roller-detail', ['startup', 'swing', 'recovery']]
      : label.startsWith('superjump-') ? ['superjump', ['charge', 'takeoff', 'flight', 'descent', 'touchdown']]
      : label.startsWith('squidroll-') ? ['squidroll', ['roll']]
      : label === 'hit-spawn-reset' ? ['hit-spawn', ['entry', 'protected', 'expiry']]
      : label.startsWith('victory-') ? ['emotes', ['action', 'hold']]
      : label === 'native-slam-phases' ? ['special', ['rise', 'hang', 'fall', 'slam-recovery']]
      : label === 'native-storm-deploy' ? ['special', ['storm-deploy', 'storm-recovery']] : null;
    if (requiredPhases) for (const p of requiredPhases[1]) need(renderPhase(requiredPhases[0], p), 'phase RGB sample ' + p);
    if (label === 'carry-walk-fire-return' || scenario.hz) {
      need(count(s => s.snapshots.carry?.active && s.grip.left.held) >= (scenario.hz ? 40 : 200), 'supported carry denominator');
      need(count(s => s.walkActive && s.feet.some(f => f.planted && f.contactWeight > .999)) >= 20, 'walking contact denominator');
    }
    if (label === 'ordinary-aimed-jump') {
      for (const p of ['rise', 'apex', 'fall']) need(phase('jump', p) >= 1, 'ordinary jump phase ' + p);
      need(count(s => s.snapshots.jump?.weight > .1) >= 5 && phase('landing', 'recover') >= 1 && row.samples.at(-1).snapshots.jump?.active === false, 'jump/landing completion');
    }
    if (label === 'hard-landing-recovery') need(phase('landing', 'recover') >= 3 && count(s => s.snapshots.landing?.drop > .02) >= 2 && row.samples.at(-1).snapshots.landing?.compression === 0, 'landing absorb/recovery');
    if (label === 'swim-turn-brake') need(count(s => s.snapshots.swim?.active) >= 90 && Math.max(...row.samples.map(s => Math.abs(s.snapshots.swim?.bank || 0))) > .05 && row.samples.at(-1).snapshots.swim?.power < .01, 'swim turn/brake');
    if (label === 'wall-surge-ready-crest') need(phase('wall', 'charge') >= 20 && count(s => s.snapshots.wall?.ready && s.snapshots.wall?.glow > 0) >= 1 && phase('wall', 'launch') >= 1 && phase('wall', 'crest') >= 1 && row.renders.some(r => r.glint?.changedPixels > 0), 'native surge readiness/launch/crest');
    if (label === 'form-both-directions-interrupt') need(phase('form', 'dive') >= 5 && phase('form', 'emerge') >= 5 && count(s => s.snapshots.form?.reversing) >= 1 && count(s => s.snapshots.form?.actionBlocked) >= 1, 'form directions/reversal/interruption');
    if (label === 'dualies-roll-lock-interrupt') need(phase('dualies', 'roll') >= 5 && phase('dualies', 'plant') >= 10 && count(s => s.snapshots.dualies?.blockedRoll) >= 1 && row.events.some(e => e.name === 'fireDualies'), 'actual dualies roll/lock/interruption');
    if (label.startsWith('roller-')) need(phase('roller-detail', 'startup') >= 1 && phase('roller-detail', 'recovery') >= 2 && row.events.some(e => e.name === 'fireFlick') && (label.includes('horizontal') ? count(s => s.rolling) >= 10 : count(s => s.snapshots['roller-detail']?.vertical) >= 10), 'native roller startup/release/recovery/push');
    if (label.startsWith('superjump-')) need(phase('superjump', 'charge') >= 10 && phase('superjump', 'flight') >= 10 && phase('superjump', 'descent') >= 1 && phase('superjump', 'touchdown') >= 1 && row.samples.at(-1).snapshots.superjump?.phase === null, 'native superjump flight/landing');
    if (label.startsWith('squidroll-')) need(phase('squidroll', 'roll') >= 5 && row.samples.at(-1).snapshots.squidroll?.phase === null && (label.endsWith('finish') || row.samples[13].snapshots.squidroll?.phase === null), 'roll finish/interruption');
    if (label === 'hit-spawn-reset') need(count(s => s.hp < 100) >= 1 && phase('hit-spawn', 'protected') >= 5 && row.samples.at(-1).snapshots['hit-spawn']?.coating === 0 && row.renders.some(r => r.coating?.changedPixels > 0), 'native damage/spawn coating/reset');
    if (label === 'quiet-idle-held-sub') need(count(s => s.snapshots.idle?.quiet) >= 10 && count(s => s.heldBomb && !s.grip.left.held) >= 10 && row.events.some(e => e.name === 'throwBomb') && row.samples.at(-1).snapshots.carry?.active, 'idle/sub detachment/return');
    if (label.startsWith('victory-')) need(phase('emotes', 'action') >= 20 && phase('emotes', 'hold') >= 10 && count(s => s.dance === 'lobby_pose') >= 20 && row.renders.some(r => row.samples[r.tick].dance === null && row.samples[r.tick].danceWeight > .01) && row.renders.some(r => row.samples[r.tick].dance === 'lobby_pose'), 'victory hold/fade/lobby');
    if (label === 'native-slam-phases') { for (const p of ['rise', 'hang', 'fall', 'slam-recovery']) need(phase('special', p) >= 1, 'native special ' + p); need(row.samples.at(-1).snapshots.special?.phase === null, 'special expiry'); }
    if (label === 'native-storm-deploy') need(row.events.filter(e => e.name === 'throwStorm').length === 1 && phase('special', 'storm-deploy') >= 5 && phase('special', 'storm-recovery') >= 1 && row.samples.at(-1).snapshots.special?.phase === null, 'native Storm deploy/recovery');
    if (label === 'gaze-face-actions') { for (const mode of ['fire', 'sub-aim', 'throw']) need(count(s => s.snapshots.face?.mode === mode) >= 2, 'native face ' + mode); need(count(s => s.snapshots.face?.blink.some(x => x > .5)) >= 1 && row.renders.some(r => r.face?.changedPixels > 0), 'native face/blink RGB'); }
    if (label === 'lifecycle-interruptions') need(['form', 'sub', 'dance', 'reset', 'death', 'hide', 'weapon'].every(name => row.transitions.includes(name)) && row.renders.some(r => !r.visible) && row.samples.at(-1).visible, 'lifecycle interruption denominator');
    if (!row.pause || row.pause.unchangedClocks !== true || row.pause.sameRgb.changedPixels !== 0) fail('pause denominator ' + label);
    if (!row.zeroDt || row.zeroDt.unchangedClocks !== true || row.zeroDt.gameplayInvariant !== true) fail('zero-dt native clock/physics invariant ' + label);
    finite(row.zeroDt.poseDelta, label + '.zeroDt.poseDelta');
    summaries.push({ name: label, frames: row.samples.length, renderPairs: row.renders.length, visibleFrames: count(s => s.visible), maximumHeldGrip: Math.max(...row.samples.flatMap(s => Object.values(s.grip).filter(g => g.held).map(g => g.gap))), nativeIKMaximum: Math.max(...row.samples.flatMap(s => s.ik)) });
  };
  // A real candidate can have multiple composition failures. Audit every case
  // before failing publication, so the first walking error hides no other gate.
  for (const scenario of CATALOG_SCENARIOS) try { checkScenario(scenario); } catch (e) { failures.push(e.message); }
  const cadence = result.data.filter(r => r.name.startsWith('cadence-'));
  if (cadence.some(r => r.displayFrames !== r.hz || r.clockTicks !== 60) || new Set(cadence.map(r => r.traceHash)).size !== 1) failures.push('30/60/120Hz native output equality');
  if (result.previewRates?.length !== 3 || result.previewRates.some((r, i) => r.hz !== [30, 60, 120][i] || r.frames !== r.hz || r.finite !== true)) failures.push('direct variable-dt preview denominator');
  if (result.cleanup?.rendererDisposed !== true || result.cleanup.domRemoved !== true || result.cleanup.geometries !== 0 || result.cleanup.textures !== 0) failures.push('unclean-disposal renderer');
  if (failures.length) fail('gate failures:\n' + failures.join('\n'));
  return summaries;
}

// This function is serialized into the browser; all classes below are imported
// from the immutable built graph, with no surrogate Actor, Runner or IK.
async function runCatalog({ prefix, scenarios, modules, contentHash, footLayout }) {
  const THREE = await import('three');
  const profile = await fetch(prefix + 'patches/splatoon3/profile.json').then(r => r.json());
  const { install } = await import(prefix + 'patches/splatoon3/runtime/install.mjs');
  const api = install(profile), { Actor, Character, Projectiles, Physics, G, CHARACTER_CHANNELS: C, CHARACTER_FOOT_METRICS: F } = api;
  // The adapter exports STAB but not WPL/WPR. main verifies the adjacent native
  // slots and their actual contact-blend use against immutable compiled bytes.
  // Prefer named exports when the parent adds the requested diagnostic hooks.
  const contactChannels = [C.WPL ?? C.STAB - footLayout.leftBeforeStab, C.WPR ?? C.STAB - footLayout.rightBeforeStab];
  const snapshots = {};
  for (const [id, snapshot] of modules) snapshots[id] = (await import(prefix + 'patches/splatoon3/runtime/' + id + '-motion.mjs'))[snapshot];
  const { walkActive } = await import(prefix + 'patches/splatoon3/runtime/walk.mjs');
  const { beforeActions } = await import(prefix + 'patches/splatoon3/runtime/movement.mjs');
  const { FixedClock } = await import(prefix + 'patches/splatoon3/runtime/clock.mjs');
  const methods = [Character, Actor, api.WeaponRunner].flatMap(Type => Reflect.ownKeys(Type.prototype).filter(k => typeof Object.getOwnPropertyDescriptor(Type.prototype, k).value === 'function').map(key => [Type.prototype, key, Type.prototype[key]]));
  const iframe = document.createElement('iframe'); iframe.src = '/motion-catalog'; document.body.appendChild(iframe);
  await new Promise((resolve, reject) => { iframe.onload = resolve; iframe.onerror = reject; });
  for (const [id, , installer] of modules) {
    const duplicate = await iframe.contentWindow.eval('import(' + JSON.stringify(prefix + 'patches/splatoon3/runtime/' + id + '-motion.mjs') + ')');
    duplicate[installer](api, profile);
  }
  const duplicateRealm = { modules: modules.length, unchanged: methods.every(([p, k, fn]) => p[k] === fn) }; iframe.remove();
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#dfe7e9');
  const camera = new THREE.OrthographicCamera(-1.4, 1.4, 1.05, -1.05, .01, 300);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(960, 720); renderer.setPixelRatio(1); document.body.appendChild(renderer.domElement);
  const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
  const gpu = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), contextLost: gl.isContextLost() };
  const ownedGeometries = new Set(), allMaterials = new Set();
  const floor = { id: 0, solid: true, center: new THREE.Vector3(0, -.5, 0), half: new THREE.Vector3(200, .5, 200), faces: [-1, -1, -1, -1, -1, -1], axes: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)], aabbMin: new THREE.Vector3(-200, -1, -200), aabbMax: new THREE.Vector3(200, 0, 200) };
  const wall = { id: 1, solid: true, center: new THREE.Vector3(0, 1.5, -.7), half: new THREE.Vector3(3, 1.5, .2), faces: [0, 0, 0, 0, 0, 0], axes: floor.axes, aabbMin: new THREE.Vector3(-3, 0, -.9), aabbMax: new THREE.Vector3(3, 3, -.5) };
  const level = { blocks: [floor], faces: [{ origin: new THREE.Vector3(), u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) }], groundHeight: () => 0, spawnPads: [new THREE.Vector3(), new THREE.Vector3(0, 0, 20)], pointInside: () => false, queryBlocks: (_a, _b, _c, _d, out) => { out.length = 0; out.push(...level.blocks.map(b => b.id)); return out; } };
  Object.assign(G, { scene, camera, renderer, settings: { quality: 'high', shadows: false }, mode: 'match', actors: [], time: 0, teamColors: [new THREE.Color('#ff8a14'), new THREE.Color('#2f5bff')], level, paint: { sample: () => 1, splat: () => 0 }, match: { playing: () => true, canRespawn: () => false }, physics: new Physics(level) });
  scene.add(new THREE.HemisphereLight(0xffffff, 0x667477, 2.2));
  const light = new THREE.DirectionalLight(0xffffff, 2.5); light.position.set(3, 5, 4); scene.add(light);
  const groundMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0xbfcbd0, roughness: 1 }));
  groundMesh.rotation.x = -Math.PI / 2; groundMesh.position.y = -.004; scene.add(groundMesh);
  const projectiles = G.projectiles = new Projectiles(scene), data = [], images = [], previewRates = [];
  const digest = async v => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(v))))).map(x => x.toString(16).padStart(2, '0')).join('');
  const pixels = () => { const p = new Uint8Array(960 * 720 * 4); gl.readPixels(0, 0, 960, 720, gl.RGBA, gl.UNSIGNED_BYTE, p); return p; };
  const save = async (name, image) => { const receipt = await globalThis.catalogSaveImage(name, image); images.push(receipt); return receipt.file; };
  async function contactSheet(row) {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = Math.ceil(row.renders.length / 2) * 204;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#e5ebed'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [i, render] of row.renders.entries()) {
      const x = i % 2 * 480, y = Math.floor(i / 2) * 204;
      for (const [j, file] of [render.image, render.hiddenImage].entries()) {
        const img = new Image(); img.src = await globalThis.catalogReadImage(file); await img.decode(); ctx.drawImage(img, x + j * 240, y + 24, 240, 180);
      }
      ctx.fillStyle = '#182b35'; ctx.font = '12px sans-serif'; ctx.fillText('frame ' + render.frame + ' / visible · hidden / RGB pixels ' + render.rig.changedPixels, x + 4, y + 16);
    }
    return save(row.name + '-contact-sheet', canvas.toDataURL('image/png'));
  }
  const snap = ch => Object.fromEntries(Object.entries(snapshots).map(([id, fn]) => [id, fn(ch)]));
  const gameState = a => a ? JSON.stringify({ pos: a.pos.toArray(), vel: a.vel.toArray(), ink: a.ink, hp: a.hp, alive: a.alive, invuln: a.invuln, special: a.special, active: a.specialActive, form: a.form, jump: a.superJumpState && { phase: a.superJumpState.phase, t: a.superJumpState.t }, input: a.intent, runner: Object.fromEntries(Object.entries(a.weaponRunner).filter(([, v]) => v === null || ['number', 'string', 'boolean'].includes(typeof v))), actions: a.s3?.actions, time: G.time, bombs: projectiles.bombs.map(b => [b.fuse, b.pos.toArray(), b.vel.toArray()]) }) : null;
  function collect(root) { root.traverse(node => { if (node.geometry) ownedGeometries.add(node.geometry); for (const m of (Array.isArray(node.material) ? node.material : [node.material])) if (m) allMaterials.add(m); }); }
  function geometry(ch) {
    // getVertexPosition executes real native skinning, but custom vertex-shader
    // squid/eye/lid deformation is evidenced by the compiled RGB render only.
    ch.root.updateMatrixWorld(true); ch.skeleton.update();
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    let indexedVertices = 0, triangles = 0, skinnedVertices = 0, meshes = 0;
    const p = new THREE.Vector3();
    const visit = mesh => {
      if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.geometry?.index) return;
      const g = mesh.geometry, index = g.index, start = Math.max(0, g.drawRange.start), end = Math.min(index.count, start + g.drawRange.count);
      const positions = new Map(); // Evaluate each indexed vertex once per mesh/frame.
      let count = 0;
      const groups = g.groups.length ? g.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
      for (const group of groups) {
        const mat = Array.isArray(mesh.material) ? mesh.material[group.materialIndex] : mesh.material;
        if (!mat?.visible) continue;
        for (let i = Math.max(start, group.start); i < Math.min(end, group.start + group.count); i++) {
          const vertex = index.getX(i);
          if (!Number.isInteger(vertex) || vertex < 0 || vertex >= g.attributes.position.count) throw Error('Native index out of bounds');
          if (positions.has(vertex)) p.fromArray(positions.get(vertex));
          else { mesh.getVertexPosition(vertex, p); p.applyMatrix4(mesh.matrixWorld); positions.set(vertex, p.toArray()); }
          if (!p.toArray().every(Number.isFinite)) throw Error('Non-finite actual indexed posed vertex ' + mesh.name);
          for (let j = 0; j < 3; j++) { const v = p.getComponent(j); min[j] = Math.min(min[j], v); max[j] = Math.max(max[j], v); }
          count++;
        }
      }
      if (count) { indexedVertices += count; triangles += Math.floor(count / 3); meshes++; if (mesh.isSkinnedMesh) skinnedVertices += count; }
    };
    // A deliberately hidden rig still has measurable native geometry; its RGB
    // proof is required to be zero, never accepted as visible motion.
    const shown = ch.root.visible; ch.root.visible = true;
    try { ch.root.traverseVisible(visit); } finally { ch.root.visible = shown; }
    return { indexedVertices, triangles, skinnedVertices, meshes, min, max };
  }
  function grip(ch, side) {
    const left = side === 'left', w = left && ch.dual ? ch.weapon.left : ch.weapon;
    const target = w.off.localToWorld(w.def[left ? 'handL' : 'handR'].pos.clone());
    const hand = ch.bones[left ? 'handL' : 'handR'].getWorldPosition(new THREE.Vector3());
    const weight = ch.P[left ? C.IKL : C.IKR];
    const explicitTarget = left ? ch.P[C.LTW] : 0, swapped = left && ch.dual ? ch.bombSwap : 0;
    return { gap: target.distanceTo(hand), weight, explicitTarget, swapped, held: weight > .999 && explicitTarget <= .001 && swapped <= .001 && ch.kidForm };
  }
  function record(ch, a, frame, last, invariant, contactEpoch) {
    const feet = ch.feet.map((f, i) => {
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), f.cn).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.cyaw));
      const bone = ch.bones[i ? 'footR' : 'footL'], applied = bone.getWorldQuaternion(new THREE.Quaternion());
      // Native application adds idle shift and TIPTOE to the controller pitch.
      // Use the actual applied rotation; do not mistake a rolling heel for slip.
      const p = new THREE.Euler().setFromQuaternion(q.clone().invert().multiply(applied), 'YXZ').x;
      const ay = F.ANKLE_H * Math.cos(p) + (p >= 0 ? F.BALL_Z : -F.HEEL_Z) * Math.sin(p), az = p >= 0 ? F.BALL_Z + F.ANKLE_H * Math.sin(p) - F.BALL_Z * Math.cos(p) : -F.HEEL_Z + F.ANKLE_H * Math.sin(p) + F.HEEL_Z * Math.cos(p);
      const expected = f.cw.clone().add(new THREE.Vector3(0, ay, az).applyQuaternion(q)), actual = bone.getWorldPosition(new THREE.Vector3());
      const drift = f.planted && last[i]?.planted && last[i].epoch === contactEpoch[i] ? f.cw.distanceTo(last[i].cw) : 0;
      last[i] = { planted: f.planted, cw: f.cw.clone(), epoch: contactEpoch[i] };
      return { planted: f.planted, contactEpoch: contactEpoch[i], contactWeight: ch.P[contactChannels[i]] * ch.plantW * (ch.feetValid ? 1 : 0), error: actual.distanceTo(expected), actual: actual.toArray(), expected: expected.toArray(), contact: f.cw.toArray(), normal: f.cn.toArray(), pitch: f.pitch, appliedPitch: p, mode: f.mode, swingProgress: f.su, stanceProgress: f.stU, drift };
    });
    const pose = Array.from(ch.P);
    if (!pose.every(Number.isFinite)) throw Error('Non-finite native pose');
    return { frame, time: ch.t, timers: Object.fromEntries(Object.entries(api.CHARACTER_TIMERS).map(([k, i]) => [k, ch.tr[i]])), alive: a?.alive ?? true, grounded: ch.grounded, specialActive: a?.specialActive ? { id: a.specialActive.id, phase: a.specialActive.phase, time: a.specialActive.t } : null, visible: ch.root.visible, root: ch.root.position.toArray(), velocity: a?.vel.toArray() || [0, 0, 0], input: a?.intent.move.toArray() || [0, 0, 0], hp: a?.hp ?? 100, ink: a?.ink ?? 100, plantWeight: ch.plantW, hipDrop: ch.hipDrop, kidScale: ch.kidScale, squidScale: ch.sqScale, walkActive: walkActive(ch), pose: { length: pose.length, minimum: Math.min(...pose), maximum: Math.max(...pose), l1: pose.reduce((sum, x) => sum + Math.abs(x), 0) }, ik: Array.from(ch.ikErr), hands: { left: ch.bones.handL.getWorldPosition(new THREE.Vector3()).toArray(), right: ch.bones.handR.getWorldPosition(new THREE.Vector3()).toArray() }, grip: { left: grip(ch, 'left'), right: grip(ch, 'right') }, feet, rolling: !!a?.weaponRunner.rolling, heldBomb: ch.bomb.group.visible, dance: ch.dance, danceWeight: ch.wDance, snapshots: snap(ch), visualGameplayInvariant: invariant };
  }
  async function capture(ch, scenario, frame, tick) {
    projectiles._draw();
    camera.position.copy(ch.root.position).add(new THREE.Vector3(2.6, 1.3, 3.4)); camera.lookAt(ch.root.position.clone().add(new THREE.Vector3(0, .62, 0))); camera.updateMatrixWorld();
    const drawn = new Map(), observers = [];
    ch.root.traverse(n => {
      if (!n.isMesh) return;
      const original = n.onAfterRender; observers.push([n, original]);
      n.onAfterRender = function (...args) { original.apply(this, args); const m = args[4]; drawn.set(m.uuid, { material: m, mesh: n.name || n.type, program: renderer.properties.get(m).currentProgram }); };
    });
    try { renderer.render(scene, camera); gl.finish(); }
    finally { for (const [n, original] of observers) n.onAfterRender = original; }
    const actual = pixels(), name = scenario.name + '-' + String(frame).padStart(3, '0');
    const image = await save(name, renderer.domElement.toDataURL('image/png')), visible = ch.root.visible;
    let rig, hiddenImage;
    try { ch.root.visible = false; renderer.render(scene, camera); rig = globalThis.catalogPixelDifference(actual, pixels()); hiddenImage = await save(name + '-hidden', renderer.domElement.toDataURL('image/png')); }
    finally { ch.root.visible = visible; }
    const effect = mutation => { const undo = mutation(); try { renderer.render(scene, camera); return globalThis.catalogPixelDifference(actual, pixels()); } finally { undo(); } };
    let glint = null, coating = null, face = null;
    const star = ch.root.getObjectByName('s3-wall-ready-glint');
    if (star?.visible) glint = effect(() => { star.visible = false; return () => { star.visible = true; }; });
    const coatingState = ch[Symbol.for('inkwave.s3.hit-spawn-motion.install.v1')]?.states.get(ch);
    if (coatingState?.level.value > 0) coating = effect(() => { const v = coatingState.level.value; coatingState.level.value = 0; return () => { coatingState.level.value = v; }; });
    if (scenario.name === 'gaze-face-actions') face = effect(() => { const v = ch.u.uGaze.value.clone(); ch.u.uGaze.value.set(0, 0, 0, 0); return () => ch.u.uGaze.value.copy(v); });
    renderer.render(scene, camera);
    const compiled = p => ({ linked: !!p && !!gl.getProgramParameter(p.program, gl.LINK_STATUS), vertexCompiled: !!p && !!gl.getShaderParameter(p.vertexShader, gl.COMPILE_STATUS), fragmentCompiled: !!p && !!gl.getShaderParameter(p.fragmentShader, gl.COMPILE_STATUS) });
    const programs = renderer.info.programs.map(compiled), materials = [...drawn.values()].map(d => ({ type: d.material.type, mesh: d.mesh, ...compiled(d.program) }));
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw Error('Native WebGL error/context loss');
    collect(ch.root);
    return { frame, tick, visible, rig, image, hiddenImage, glint, coating, face, geometry: geometry(ch), programs, materials, shaderErrors: programs.filter(p => !p.linked || !p.vertexCompiled || !p.fragmentCompiled).length };
  }
  const drivers = {
    default: 'Diagnostic kinematic root/velocity conditions; actual WeaponRunner.update and Actor._finishFrame; not a complete gameplay/input or Nintendo parity test',
    physics: 'Diagnostic initial launch/drop; actual Actor._integrate + native Physics floor + Runner + _finishFrame; no whole-game update',
    special: 'Native Actor._startSpecial/_updateSpecial, real native Physics/Projectiles, then _finishFrame; isolated arena services; no whole-game update',
    superjump: 'Native Actor.superJump/_updateSuperJump, real native Physics floor, then _finishFrame; isolated arena services',
    wall: 'Native wall raycast/attachment + beforeActions surge charge/burst + _integrate/_ledgePop on an own-ink fixture wall; paint service reports own ink',
  };
  try {
    for (const scenario of scenarios) {
      G.time = 0; level.blocks = [floor]; projectiles.clear();
      const a = scenario.name === 'nullable-preview' ? null : new Actor({ team: 0, name: scenario.hz ? 'catalog cadence' : scenario.name, weapon: scenario.kind, isLocal: true, CharacterClass: Character, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      const ch = a?.character || new Character({ name: scenario.name, weapon: scenario.kind, style: { hair: 0, skin: 2, outfit: 0, eyes: 0 } });
      ch.setLod('hero'); // Native supported audit tier, disclosed in fixture.
      if (a) { ch.actor = a; G.actors = [a]; a.grounded = a.ground.hit = true; a.ground.block = 0; a.groundN.set(0, 1, 0); } else G.actors = [];
      scene.add(ch.root);
      const samples = [], renders = [], events = [], transitions = [], last = [null, null], trace = [], originalMethods = new Map();
      let frame = -1, invariant = true, zeroDt = null;
      const update = ch.update;
      ch.update = function (...args) { const before = gameState(a), value = update.apply(this, args); invariant = before === gameState(a); if (!invariant) throw Error('Visual update changed gameplay: ' + scenario.name); return value; };
      // A new native touchdown/replant starts a new contact. Observe those
      // actual hooks so a legal stance replant is not mislabeled sliding.
      const contactEpoch = [0, 0], touchdown = ch._touchDown, feetUpdate = ch._updateFeet;
      ch._touchDown = function (f, ...args) { contactEpoch[this.feet.indexOf(f)]++; return touchdown.call(this, f, ...args); };
      ch._updateFeet = function (...args) { if (this.replant || !this.feetValid) { contactEpoch[0]++; contactEpoch[1]++; } return feetUpdate.apply(this, args); };
      // Observe actual projectile calls; delegate their native effects once.
      for (const name of ['fireShooter', 'fireDualies', 'fireFlick', 'throwBomb', 'throwStorm']) {
        const original = projectiles[name]; originalMethods.set(name, original);
        projectiles[name] = function (...args) { const value = original.apply(this, args); if (args[0] === a && frame >= 0) events.push({ name, frame }); return value; };
      }
      function step(dt = 1 / 60, input = {}) {
        if (a) { a.intent.fire = !!input.fire; a.intent.sub = !!input.sub; G.time += dt; a.weaponRunner.update(dt, input); a._finishFrame(dt); }
        else ch.update(dt, null);
        ch.root.updateMatrixWorld(true); ch.skeleton.update();
      }
      function move(speed, x = 0, z = 1) { a.vel.set(x * speed, 0, z * speed); a.pos.addScaledVector(a.vel, 1 / 60); }
      function horizontal(speed, x = 0, z = 1, squid = false) {
        const top = squid ? api.PLAYER.swimSpeed : a.weaponRunner.moveSpeed();
        a.intent.move.set(x * speed / top, 0, z * speed / top);
        a._horizontal(1 / 60, squid, false); a._integrate(1 / 60, squid, false);
      }
      let driver = drivers.default;
      const ownedMats = new Set(), glints = new Set(), disposedMats = new Set(), disposedGlints = new Set();
      function watchDisposal() {
        // mats.dark is a native global cache. The eight named base materials,
        // native per-character clones and the wall-owned glint have owners.
        for (const m of [...['skin', 'cloth', 'hair', 'eye', 'fill', 'squid', 'squidGhost', 'glow'].map(k => ch.mats[k]), ...ch.matsD.flatMap(Object.values), ...ch._ownMats]) if (m?.isMaterial && !ownedMats.has(m)) { ownedMats.add(m); m.addEventListener('dispose', () => disposedMats.add(m)); }
        ch.root.traverse(n => { if (n.name === 's3-wall-ready-glint' && !glints.has(n.geometry)) { glints.add(n.geometry); n.geometry.addEventListener('dispose', () => disposedGlints.add(n.geometry)); if (!ownedMats.has(n.material)) { ownedMats.add(n.material); n.material.addEventListener('dispose', () => disposedMats.add(n.material)); } } });
      }
      let row;
      try {
        for (let i = 0; i < 100; i++) step();
        if (scenario.name === 'ordinary-aimed-jump') { for (let i = 0; i < 25; i++) step(1 / 60, { fire: true }); a.vel.set(0, api.PLAYER.jumpVel, 0); a.grounded = false; ch.trigger('jump'); driver = drivers.physics; }
        if (scenario.name === 'hard-landing-recovery') { a.pos.y = 4; a.vel.y = -15.5; a.grounded = false; driver = drivers.physics; }
        if (scenario.name === 'swim-turn-brake') { a.form = 'squid'; a.submerged = true; for (let i = 0; i < 40; i++) step(); }
        if (scenario.name === 'wall-surge-ready-crest') { level.blocks = [floor, wall]; a.form = 'squid'; a.submerged = false; a.pos.set(0, .5, -.05); a.intent.move.set(0, 0, -1); a._updateClimb(1 / 60, true); for (let i = 0; i < 40; i++) step(); driver = drivers.wall; }
        if (scenario.name.startsWith('superjump-')) { const d = scenario.name.slice(10), target = d === 'short' ? new THREE.Vector3(1, 0, 0) : d === 'vertical' ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(40, 0, 15); if (!a.superJump(target)) throw Error('Native superjump refused'); driver = drivers.superjump; }
        if (scenario.name.startsWith('squidroll-')) { a.form = 'squid'; a.submerged = true; for (let i = 0; i < 35; i++) step(); a.vel.set(0, 0, 11); a.intent.move.set(0, 0, -1); if (!beforeActions(a, 0, true)) throw Error('Native roll refused'); }
        if (scenario.name.startsWith('victory-')) { ch.setDance('victory'); ch.danceVar = scenario.variant; }
        if (scenario.name.startsWith('native-')) { frame = 0; a.special = a.specialCost(); a._startSpecial(); driver = drivers.special; }
        if (scenario.name === 'roller-vertical-land') { a.grounded = false; a.pos.y = .4; a.vel.y = 7; driver = drivers.physics; }
        const runFrame = () => {
          const n = scenario.name, input = {};
          if (n === 'carry-walk-fire-return') { const speed = frame < 25 ? .15 : frame < 65 ? 1.2 : frame < 105 ? 5.76 : frame < 165 ? 2.4 : 0; horizontal(speed, frame >= 70 && frame < 90 ? 1 : 0, frame >= 70 && frame < 90 ? 0 : frame >= 90 && frame < 105 ? -1 : 1); input.fire = frame >= 105 && frame < 145; driver = 'Native Actor._horizontal input slew and _integrate/native floor, real Runner fire/release and _finishFrame; isolated arena, no whole-game update'; }
          if (n === 'ordinary-aimed-jump' || n === 'hard-landing-recovery') { if (!a.grounded) a._integrate(1 / 60, false, false); input.fire = n.includes('aimed') && frame < 100; }
          if (n === 'swim-turn-brake') { horizontal(frame < 115 ? 11 : 0, frame >= 45 && frame < 80 ? 1 : 0, frame >= 45 && frame < 80 ? 0 : frame >= 80 ? -1 : 1, true); driver = 'Native Actor._horizontal swim acceleration/turn/brake and _integrate/native own-ink floor; squid form/submerged diagnostic assignment; no full match'; }
          if (n === 'wall-surge-ready-crest') { a.intent.jump = frame >= 20 && frame < 75; a._updateClimb(1 / 60, true); beforeActions(a, 1 / 60, false); a._integrate(1 / 60, true, false); }
          if (n === 'form-both-directions-interrupt') { if ([0, 70, 82].includes(frame)) { a.form = 'squid'; a.submerged = true; } if ([40, 76, 100].includes(frame)) { a.form = 'kid'; a.submerged = false; } input.fire = frame >= 100 && frame < 120; input.sub = frame >= 140 && frame < 155; }
          if (n === 'dualies-roll-lock-interrupt') { input.fire = frame < 145; if (frame === 0 || frame === 110) { a.intent.fire = true; if (!a.weaponRunner.tryDodge(new THREE.Vector3(1, 0, 0))) throw Error('Native dodge refused'); } if (a.weaponRunner.dodgeVel(a.vel)) a.pos.addScaledVector(a.vel, 1 / 60); else a.vel.set(0, 0, 0); input.sub = frame >= 115 && frame < 132; }
          if (n === 'roller-horizontal-push') { input.fire = frame < 125; input.firePressed = frame === 0; move(frame >= 45 && frame < 125 ? a.weapon.rollSpeed : 0); }
          if (n === 'roller-vertical-land') { input.fire = frame < 60; input.firePressed = frame === 0; if (!a.grounded) a._integrate(1 / 60, false, false); }
          if (n.startsWith('superjump-') && a.superJumpState) a._updateSuperJump(1 / 60);
          if (n.startsWith('squidroll-')) { beforeActions(a, 1 / 60, false); if (frame === 12 && n.endsWith('interrupt')) { a.form = 'kid'; a.submerged = false; a.s3.actions.roll = null; ch.trigger('movement_cancel'); } if (frame === 40) { a.form = 'kid'; a.grounded = true; a.submerged = false; ch.trigger('land', 8); } if (!a.grounded) { a.pos.addScaledVector(a.vel, 1 / 60); a.vel.y -= api.PLAYER.gravity / 60; } else a.vel.set(0, 0, 0); }
          if (n === 'hit-spawn-reset') { if (frame === 0) a.damage(30, null); if (frame === 20) a.respawn(); if (frame >= 20 && !a.grounded) a._integrate(1 / 60, false, false); if (frame >= 20) a.invuln = Math.max(0, a.invuln - 1 / 60); if (frame === 150) { a.reset(); a.grounded = true; } }
          if (n === 'quiet-idle-held-sub') { input.sub = frame >= 40 && frame < 100; input.subReleased = frame === 100; if (frame === 55) { ch.fidget = 4; ch.fidgetT = 0; } }
          if (n.startsWith('victory-')) { if (frame === 280) ch.setDance(null); if (frame === 310) ch.setDance('lobby_pose'); }
          if (n.startsWith('native-')) { if (a.specialActive) a._updateSpecial(1 / 60); else if (n === 'native-slam-phases') move(2.4); }
          if (n === 'gaze-face-actions') { input.fire = frame < 40; input.sub = frame >= 55 && frame < 85; input.subReleased = frame === 85; a.aimDir.set(.08, .05, 1).normalize(); a.aimPoint.copy(a.pos).add(new THREE.Vector3(.5, 1.3, 8)); if (frame === 100) { a.damage(10, null); ch._blink(true); } if (frame === 140) ch.trigger('wink'); }
          if (n === 'lifecycle-interruptions') { input.fire = frame < 15; if (frame === 20) { a.form = 'squid'; transitions.push('form'); } if (frame === 40) a.form = 'kid'; input.sub = frame >= 50 && frame < 65; if (frame === 50) transitions.push('sub'); if (frame === 75) { ch.setDance('victory'); transitions.push('dance'); } if (frame === 90) { a.reset(); a.grounded = true; transitions.push('reset'); } if (frame === 105) { a.splat(); transitions.push('death'); } if (frame === 120) { a.spawnAt(new THREE.Vector3(), 0); } if (frame === 135) { ch.setVisible(false); transitions.push('hide'); } if (frame === 145) ch.setVisible(true); if (frame === 150) { a.setWeapon('charger'); transitions.push('weapon'); } if (frame === 165) a.setWeapon('shooter'); }
          if (scenario.hz) { move(frame < 40 ? 2.4 : 0); input.fire = frame >= 20 && frame < 35; }
          step(1 / 60, input);
          if (frame === 6) {
            const clocks = JSON.stringify([ch.t, Array.from(ch.tr), ch.lastShot, ch.lastRelease, ch.danceT]), pose = Array.from(ch.P), before = gameState(a);
            const beforeState = snap(ch); ch.update(0, a?.anim || null); ch.root.updateMatrixWorld(true); ch.skeleton.update();
            zeroDt = { unchangedClocks: clocks === JSON.stringify([ch.t, Array.from(ch.tr), ch.lastShot, ch.lastRelease, ch.danceT]), gameplayInvariant: before === gameState(a), poseDelta: Math.max(...Array.from(ch.P, (v, i) => Math.abs(v - pose[i]))), before: beforeState, after: snap(ch) };
          }
          const s = record(ch, a, frame, last, invariant, contactEpoch); samples.push(s);
          if (scenario.hz) trace.push({ pose: Array.from(ch.P), ik: s.ik, hands: s.hands, grip: s.grip, feet: s.feet, root: s.root, clock: ch.t });
          watchDisposal();
          globalThis.catalogProgress = { scenario: n, frame, finished: data.length, sample: s };
        };
        const renderFrames = globalThis.catalogRenderFrames(scenario);
        let displayFrames = scenario.frames, clockTicks = scenario.frames;
        if (scenario.hz) {
          const clock = new FixedClock(); frame = 0;
          for (let display = 0; display < scenario.hz; display++) { clock.advance(1 / scenario.hz, () => { runFrame(); frame++; }); if (renderFrames.includes(display)) renders.push(await capture(ch, scenario, display, frame - 1)); else renderer.render(scene, camera); }
          displayFrames = scenario.hz; clockTicks = clock.ticks;
        } else for (frame = 0; frame < scenario.frames; frame++) { runFrame(); if (renderFrames.includes(frame)) renders.push(await capture(ch, scenario, frame, frame)); }
        renderer.render(scene, camera); const paused = pixels(), clocks = JSON.stringify([ch.t, Array.from(ch.tr), ch.danceT, gameState(a)]);
        // A paused production loop performs no simulation/update. Also exercise
        // the native dt=0 nullable preview separately below.
        renderer.render(scene, camera);
        const pause = { unchangedClocks: clocks === JSON.stringify([ch.t, Array.from(ch.tr), ch.danceT, gameState(a)]), sameRgb: globalThis.catalogPixelDifference(paused, pixels()) };
        row = { name: scenario.name, kind: scenario.kind, frames: scenario.frames, hz: scenario.hz || 60, driver, diagnostics: ['kinematic initial/root conditions except explicit native Physics/Super Jump/special/wall drivers', 'invulnerability countdown and fidget id in hit/idle cases assigned manually; not full gameplay', 'one explicit diagnostic Character.update(0) at tick 6; delta recorded, clocks/gameplay must remain stable'], samples, renders, events, transitions, pause, zeroDt, displayFrames, clockTicks, traceHash: scenario.hz ? await digest(trace) : null };
        data.push(row); globalThis.catalogPartial = { data, gpu, duplicateRealm, images };
      } finally {
        for (const [name, original] of originalMethods) projectiles[name] = original;
        ch._touchDown = touchdown; ch._updateFeet = feetUpdate;
        collect(ch.root); watchDisposal(); scene.remove(ch.root); ch.dispose();
        const after = snap(ch), beforeSecond = JSON.stringify(after); ch.dispose();
        const cleanStates = modules.every(([id]) => { const s = after[id]; if (!s) return true; if (id === 'hit-spawn') return s.disposed && s.materials === 0 && s.coating === 0; if (id === 'idle') return s.disposed && !s.quiet; if (id === 'superjump') return s.disposed && !s.applied && s.phase === null; if (id === 'swim') return !s.active; return false; });
        if (row) row.cleanup = { detached: ch.root.parent === null, ownedMaterials: ownedMats.size, disposedMaterials: disposedMats.size, glints: glints.size, disposedGlints: disposedGlints.size, cleanStates, secondDisposeStable: JSON.stringify(snap(ch)) === beforeSecond, snapshots: after };
      }
      if (row) { row.contactSheet = await contactSheet(row); await globalThis.catalogSaveCase(row); }
    }
    for (const hz of [30, 60, 120]) {
      G.actors = []; const ch = new Character({ name: 'catalog variable dt', weapon: 'shooter' });
      try { ch.update(0, null); const time = ch.t; for (let i = 0; i < hz; i++) ch.update(1 / hz, null); previewRates.push({ hz, frames: hz, finite: Array.from(ch.P).every(Number.isFinite) && Array.from(ch.ikErr).every(Number.isFinite), elapsed: ch.t - time }); }
      finally { collect(ch.root); ch.dispose(); }
    }
    const result = { schema: 1, source: 'built-production-native', installCalls: 1, contentHash, duplicateRealm, gpu, data, images, previewRates, fixture: { render: 'actual Chromium WebGL (software ANGLE SwiftShader); native shaders compiled; same-frame RGB visibility pairs; native hero audit LOD', geometry: 'actual native indexed/skinned CPU output; does not include custom GPU vertex deformation', gameplay: 'native isolated methods; case driver and diagnostic assignments disclosed', parity: 'Nintendo executable version/gear/input/joint curves remain unknown; no console/iOS/full-match parity claim' } };
    globalThis.catalogPartial = result; return result;
  } finally {
    projectiles.clear(); collect(scene);
    for (const key of ['bombGeo', 'bombCapGeo', 'ribbonGeo', 'arcGeo', 'cloudGeo']) if (projectiles[key]) ownedGeometries.add(projectiles[key]);
    for (const m of projectiles.bombMatCache.values()) allMaterials.add(m);
    for (const geometry of ownedGeometries) geometry.dispose(); for (const material of allMaterials) material.dispose();
    renderer.dispose(); renderer.domElement.remove();
    const cleanup = { rendererDisposed: true, domRemoved: !renderer.domElement.isConnected, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
    if (globalThis.catalogPartial) globalThis.catalogPartial.cleanup = cleanup;
  }
}

async function main() {
  const option = name => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw Error('Required ' + name); return path.resolve(process.argv[i + 1]); };
  let site = option('--site'); const output = option('--evidence-dir'), profileDir = option('--profile-dir');
  const physical = p => fs.existsSync(p) ? fs.realpathSync(p) : path.join(physical(path.dirname(p)), path.basename(p));
  // Reject persistent-looking symlinks too. Profiles and evidence must resolve
  // under persistent workspace storage, not merely outside the three temp dirs.
  for (const dir of [output, profileDir]) { if (!physical(dir).startsWith('/mnt/workspace/')) throw Error('Persistent workspace storage required'); fs.mkdirSync(dir, { recursive: true }); }
  const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  const publish = (name, value) => { const file = path.join(output, name); fs.writeFileSync(file + '.writing', JSON.stringify(value, null, 2) + '\n'); fs.renameSync(file + '.writing', file); };
  const errors = [], loaded = new Map(); let manifest, server, browser, page, result, failure;
  const error = value => { if (errors.length < 30) errors.push(String(value).slice(0, 1800)); };
  publish('motion-catalog-result.json', { status: 'running', startedAt: new Date().toISOString() });
  try {
    site = fs.realpathSync(site); manifest = JSON.parse(fs.readFileSync(path.join(site, 'inkwave-build.json')));
    if (hash(JSON.stringify(manifest.artifacts)) !== manifest.contentHash) throw Error('Build identity mismatch');
    for (const [file, digest] of Object.entries(manifest.artifacts)) if (hash(fs.readFileSync(path.join(site, file))) !== digest) throw Error('Artifact mismatch ' + file);
    const prefix = '/_versions/' + manifest.build.revision + '/';
    const nativeCharacter = fs.readFileSync(path.join(site, prefix.slice(1), 'src/game/character.js'), 'utf8');
    const stab = nativeCharacter.match(/STAB:([\w$]+)/)?.[1];
    const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const adjacent = stab && nativeCharacter.match(new RegExp('([\\w$]+)=([\\w$]+)\\(\\),([\\w$]+)=\\2\\(\\),' + escape(stab) + '=\\2\\(\\)'));
    if (!adjacent || !new RegExp('\\([\\w$]+===0\\?[\\w$]+\\[' + escape(adjacent[1]) + '\\]:[\\w$]+\\[' + escape(adjacent[3]) + '\\]\\)\\*[\\w$]+\\*\\(this.feetValid\\?1:0\\)').test(nativeCharacter)) throw Error('Native foot contact binding changed; export WPL/WPR or review compiled layout');
    const footLayout = { leftBeforeStab: 2, rightBeforeStab: 1, source: prefix.slice(1) + 'src/game/character.js', sha256: hash(nativeCharacter), verified: 'adjacent scalar allocation plus actual native feetValid/plantW blend expression' };
    server = http.createServer((req, res) => {
      if (req.url === '/motion-catalog') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(`<html><head><script type="importmap">{"imports":{"three":"${prefix}vendor/three/build/three.module.js","three/addons/":"${prefix}vendor/three/jsm/"}}</script></head><body style="margin:0"></body></html>`); return; }
      const file = path.resolve(site, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
      if (!file.startsWith(site + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.json') ? 'application/json' : /\.m?js$/.test(file) ? 'text/javascript' : 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
    browser = await chromium.launchPersistentContext(profileDir, { headless: true, viewport: { width: 960, height: 720 }, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    page = await browser.newPage(); page.on('pageerror', e => error(e.message)); page.on('crash', () => error('Catalog renderer process crashed')); page.on('console', m => { if (m.type() === 'error') error(m.text()); });
    const safeName = name => { if (!/^[a-z0-9-]+$/.test(name)) throw Error('Unsafe catalog evidence name'); return name; };
    await page.exposeFunction('catalogSaveImage', (name, image) => {
      safeName(name); if (!image.startsWith('data:image/png;base64,')) throw Error('Invalid screenshot encoding');
      const bytes = Buffer.from(image.split(',')[1], 'base64'), file = name + '.png', target = path.join(output, file);
      fs.writeFileSync(target + '.writing', bytes); fs.renameSync(target + '.writing', target);
      return { file, sha256: hash(bytes), bytes: bytes.length };
    });
    await page.exposeFunction('catalogReadImage', file => { safeName(file.replace(/\.png$/, '')); return 'data:image/png;base64,' + fs.readFileSync(path.join(output, file)).toString('base64'); });
    await page.exposeFunction('catalogSaveCase', row => { safeName(row.name); publish(row.name + '-native.json', row); console.log(JSON.stringify({ scenario: row.name, frames: row.frames, renderPairs: row.renders.length, cleanup: row.cleanup.cleanStates })); });
    await page.route('http://127.0.0.1:' + server.address().port + '/**', async route => {
      try { const response = await route.fetch(), body = await response.body(), file = decodeURIComponent(new URL(response.url()).pathname).slice(1); if (file !== 'motion-catalog') { if (!manifest.artifacts[file] || hash(body) !== manifest.artifacts[file]) throw Error('Active immutable artifact mismatch ' + file); loaded.set(file, { file, sha256: hash(body), bytes: body.length }); } await route.fulfill({ response, body }); }
      catch (e) { error(e.message); await route.abort(); }
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/motion-catalog');
    await page.addScriptTag({ content: 'globalThis.catalogPixelDifference=' + pixelDifference.toString() + ';globalThis.catalogRenderFrames=' + catalogRenderFrames.toString() + ';' });
    result = await page.evaluate(runCatalog, { prefix, contentHash: manifest.contentHash, scenarios: CATALOG_SCENARIOS, modules: CATALOG_MODULES, footLayout });
    // finally executes after the returned object was built; fetch its cleanup
    // snapshot explicitly so a missing cleanup cannot pass as a successful run.
    result.cleanup = await page.evaluate(() => globalThis.catalogPartial?.cleanup || null);
    Object.assign(result, { errors, loaded: [...loaded.values()], artifacts: manifest.artifacts, build: manifest.build, footLayout });
    // Retain real images and full native traces even on a failed validation;
    // only the separately validated result may be published as passed.
    publish('motion-catalog-diagnostic.json', result);
    for (const receipt of result.images) {
      const file = path.join(output, receipt.file);
      if (!/^[a-z0-9-]+\.png$/.test(receipt.file) || !fs.existsSync(file) || fs.statSync(file).size !== receipt.bytes || hash(fs.readFileSync(file)) !== receipt.sha256) throw Error('Screenshot byte identity ' + receipt.file);
    }
    result.summary = validateCatalogResult(result);
  } catch (e) {
    failure = e;
    try { if (page) { const partial = await page.evaluate(() => ({ progress: globalThis.catalogProgress || null, partial: globalThis.catalogPartial || null })); result ||= partial.partial; publish('motion-catalog-progress.json', partial); } } catch {}
    try { await page?.screenshot({ path: path.join(output, 'motion-catalog-failed.png'), timeout: 10000 }); } catch {}
  } finally {
    for (const close of [() => browser?.close(), () => server?.listening ? new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve())) : null]) try { await close(); } catch (e) { failure ||= e; }
  }
  if (failure) { publish('motion-catalog-result.json', { status: 'failed', contentHash: manifest?.contentHash || null, build: manifest?.build || null, message: String(failure.message || failure), errors, loaded: [...loaded.values()], casesFinished: result?.data?.length || 0 }); console.error(JSON.stringify({ status: 'failed', message: failure.message, evidence: path.join(output, 'motion-catalog-result.json') })); process.exitCode = 1; return; }
  result.status = 'passed'; publish('motion-catalog-result.json', result);
  console.log(JSON.stringify({ status: 'passed', contentHash: result.contentHash, cases: result.data.length, frames: result.data.reduce((n, r) => n + r.frames, 0), renderPairs: result.data.reduce((n, r) => n + r.renders.length, 0), verifiedModules: loaded.size, evidence: path.join(output, 'motion-catalog-result.json') }));
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
