import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BLASTER_RETICLE_PROFILES, BLASTER_RETICLE_CALIBRATION, BLASTER_RETICLE_SBLAST_SHORT, BLASTER_RETICLE_CSS,
  blasterReticleProfile, blasterReticleScale, blasterReticleSpread720,
  blasterReticleView, blasterReticleMarkup, bindBlasterReticle, updateBlasterReticle,
} from '../runtime/blaster-reticle-presentation.mjs';

const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance,
  `${actual} != ${expected} (+/- ${tolerance})`);

test('original 720p and 1080p Hot capture extents agree without DPR scaling', () => {
  const a = blasterReticleView({ weapon: 'blaster', viewportWidth: 1280, viewportHeight: 720, inRange: false });
  const b = blasterReticleView({ weapon: 'blaster', viewportWidth: 1920, viewportHeight: 1080, devicePixelRatio: 3 });
  close(a.halfX, 24.2);
  close(b.halfX * b.scale, 36.3, .5);
  const m = BLASTER_RETICLE_CALIBRATION.metrics;
  // Butt-cap 45-degree line: endpoint offset + half-width perpendicular to line.
  const extent = 2 * (a.halfX + (m.tickLength + m.tickWidth) / (2 * Math.SQRT2));
  close(extent, 60, 1);
  close(extent * b.scale, 90, 1.5);
  assert.equal(BLASTER_RETICLE_CALIBRATION.nativeLayoutConstantsVerified, false);
});

test('catalog records, native Hot and source kit IDs resolve to the right measured family', () => {
  assert.equal(blasterReticleProfile('blaster').id, 'hot');
  assert.equal(blasterReticleProfile({ sourceMainActor: 'WeaponBlasterMiddle' }).id, 'hot');
  assert.equal(blasterReticleProfile({ catalogRecord: { sourceActor: 'WeaponBlasterLightShort' } }).id, 'clash');
  assert.equal(blasterReticleProfile({ id: 's3-blaster-long' }).id, 'range');
  assert.equal(blasterReticleProfile('Blaster_Short_01').id, 'luna');
  assert.equal(blasterReticleProfile('Blaster_Precision_00').id, 'sblast');
  assert.equal(blasterReticleProfile('unrecognized').id, 'hot');
  assert.notEqual(BLASTER_RETICLE_PROFILES.luna.halfExtent, BLASTER_RETICLE_PROFILES.rapid.halfExtent);
});

test('unknown weapons and Elite are labelled as unmeasured fallbacks', () => {
  const unknown = blasterReticleView({ weapon: 'unrecognized' });
  assert.equal(unknown.baselineMeasured, false);
  assert.equal(unknown.baselineFallback, 'hot');
  const elite = blasterReticleView({ weapon: 's3-blaster-lightlong' });
  assert.equal(elite.baselineMeasured, false);
  assert.equal(elite.baselineFallback, 'rapid');
});

test('S-BLAST short mode matches both original AP10 comparison captures', () => {
  const before = blasterReticleView({ weapon: 's3-blaster-precision', mode: 'short', spreadDeg: 5.576 });
  const after = blasterReticleView({ weapon: 's3-blaster-precision', mode: 'air', spreadDeg: 4.43982945952324 });
  close(before.halfX, 50.46, .1);
  close(after.halfX, 45.87, .1);
  close(after.halfY, 28.1);
  close(after.cameraRingRadius, 23);
  close(after.idleDotRadius, 3);
  assert.equal(after.baselineMeasured, true);
  assert.equal(after.baselineFallback, null);
  assert.equal(after.referenceVersion, '5.1.0');
  assert.equal(BLASTER_RETICLE_SBLAST_SHORT.currentVersionPixelParityVerified, false);
  const ground = blasterReticleView({ weapon: 's3-blaster-precision', spreadDeg: 0 });
  close(ground.halfY, 19.1);
  close(ground.cameraRingRadius, 13);
});

test('jump widens horizontal positions only and preserves segment dimensions', () => {
  const ground = blasterReticleView({ weapon: 'blaster', spreadDeg: 0 });
  const jump = blasterReticleView({ weapon: 'blaster', spreadDeg: 10 });
  close(jump.halfX, 44.8);
  close(jump.halfY, ground.halfY);
  assert.equal(BLASTER_RETICLE_CALIBRATION.metrics.tickLength, 14);
  assert.equal(BLASTER_RETICLE_CALIBRATION.metrics.tickWidth, 3);
  close(blasterReticleSpread720(-1), 0);
  assert.ok(blasterReticleSpread720(5) < blasterReticleSpread720(10));
  assert.equal(BLASTER_RETICLE_CALIBRATION.jumpCurveVerified, false);
});

test('live recovered spread controls the display, not grounded state or a second clock', () => {
  const ledge = blasterReticleView({ spreadDeg: 0, grounded: false });
  const recovered = blasterReticleView({ spreadDeg: 0, grounded: false, time: 3 });
  const stillRecoveringAfterLanding = blasterReticleView({ spreadDeg: 5, grounded: true });
  close(ledge.halfX, recovered.halfX);
  close(ledge.halfX, ledge.halfY);
  assert.ok(stillRecoveringAfterLanding.halfX > ledge.halfX);
});

test('camera and muzzle impact stay distinct when an existing guide translates the root', () => {
  const guide = { x: 1000, y: 650 };
  const view = blasterReticleView({ viewportWidth: 1920, viewportHeight: 1080,
    guide, anchor: guide, camera: { x: 960, y: 540 }, inRange: true });
  close(view.cameraX * view.scale + guide.x, 960);
  close(view.cameraY * view.scale + guide.y, 540);
  close(view.impactX, 0);
  close(view.impactY, 0);
  assert.equal(view.showImpact, true);
  assert.equal(view.showTicks, true);
  assert.equal(view.showDirect, false);
});

test('direct hits replace tangent marks with a radial X; out-of-range enemies do not', () => {
  const direct = blasterReticleView({ onTarget: 'enemy', inRange: true });
  assert.equal(direct.showDirect, true);
  assert.equal(direct.showTicks, false);
  assert.equal(direct.showImpact, true);
  assert.equal(direct.showIdleDot, false);
  const distant = blasterReticleView({ onTarget: 'enemy', inRange: false });
  assert.equal(distant.showDirect, false);
  assert.equal(distant.showTicks, true);
  assert.equal(distant.showImpact, false);
  assert.equal(distant.showIdleDot, true);
});

test('viewport aspect fit is finite, uncapped at 4K, and ignores drawing-buffer DPR', () => {
  close(blasterReticleScale(3840, 2160), 3);
  close(blasterReticleScale(2560, 1080), 1.5);
  close(blasterReticleScale(640, 720), .5);
  close(blasterReticleScale(NaN, 0), 1);
  const bad = blasterReticleView({ viewportWidth: NaN, viewportHeight: 0,
    spreadDeg: Infinity, guide: { x: NaN, y: Infinity }, halfExtent720: -3 });
  for (const k of ['scale', 'halfX', 'halfY', 'cameraX', 'cameraY', 'impactX', 'impactY'])
    assert.ok(Number.isFinite(bad[k]), k);
});

test('a measured projected extent can replace the provisional family/spread calibration', () => {
  const out = {}, input = Object.freeze({ weapon: 's3-blaster-light', halfExtent720: 22,
    spreadDeg: 10, spreadHalfWidth720: 12 });
  assert.equal(blasterReticleView(input, out), out);
  close(out.halfX, 34);
  close(out.halfY, 22);
  blasterReticleView({ weapon: 'blaster', spreadDeg: 0 }, out);
  close(out.halfX, 24.2);
});

function fakeReticle() {
  let writes = 0, queries = 0;
  const keys = ['camera', 'camera-ring', 'idle', 'ticks', 'nw', 'ne', 'sw', 'se', 'impact', 'direct'];
  const makeNode = () => ({ attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; writes++; } });
  const elements = Object.fromEntries(keys.map(k => [k, makeNode()]));
  const properties = {};
  const root = {
    style: { setProperty(name, value) { properties[name] = value; writes++; } },
    querySelector(selector) { queries++; return elements[/data-blaster="([^"]+)"/.exec(selector)[1]]; },
    contains(node) { return Object.values(elements).includes(node); },
  };
  return { root, elements, properties, rebuild() { for (const k of keys) elements[k] = makeNode(); },
    clear() { for (const k of keys) delete elements[k]; },
    get writes() { return writes; }, get queries() { return queries; } };
}

test('stable HUD frames do not rescan DOM or rewrite unchanged attributes', () => {
  const dom = fakeReticle();
  assert.ok(bindBlasterReticle(dom.root));
  const input = { weapon: 'blaster', inRange: false, spreadDeg: 0 };
  updateBlasterReticle(dom.root, input);
  const writes = dom.writes, queries = dom.queries;
  updateBlasterReticle(dom.root, input);
  assert.equal(dom.writes, writes);
  assert.equal(dom.queries, queries);
  updateBlasterReticle(dom.root, { ...input, spreadDeg: 10 });
  assert.equal(dom.writes, writes + 4, 'only four short-stroke positions change');
  assert.equal(dom.elements.nw.attributes.transform, 'translate(-44.8 -24.2)');
});

test('fresh markup can be rebound and unrelated reticles are not mutated', () => {
  const dom = fakeReticle();
  updateBlasterReticle(dom.root, { inRange: false });
  const writes = dom.writes;
  bindBlasterReticle(dom.root);
  updateBlasterReticle(dom.root, { inRange: false });
  assert.ok(dom.writes > writes);
  assert.equal(updateBlasterReticle({ querySelector: () => null }, {}), null);
  assert.equal(updateBlasterReticle(null, {}), null);
});

test('a rebuilt or removed blaster never writes into cached detached SVG nodes', () => {
  const dom = fakeReticle();
  updateBlasterReticle(dom.root, { spreadDeg: 0 });
  const oldTick = dom.elements.nw;
  dom.rebuild();
  updateBlasterReticle(dom.root, { spreadDeg: 10 });
  assert.equal(dom.elements.nw.attributes.transform, 'translate(-44.8 -24.2)');
  assert.equal(oldTick.attributes.transform, 'translate(-24.2 -24.2)');
  dom.clear();
  assert.equal(bindBlasterReticle(dom.root), null);
  assert.equal(updateBlasterReticle(dom.root, {}), null);
});

test('fractional viewport scale keeps full precision for guide coordinate cancellation', () => {
  const dom = fakeReticle();
  const view = updateBlasterReticle(dom.root, { viewportWidth: 844, viewportHeight: 390,
    anchor: { x: 700, y: 300 }, guide: { x: 700, y: 300 } });
  assert.equal(dom.properties['--iw-blaster-scale'], String(390 / 720));
  close(view.cameraX * Number(dom.properties['--iw-blaster-scale']) + 700, 422);
  close(view.cameraY * Number(dom.properties['--iw-blaster-scale']) + 300, 195);
});

test('static markup uses straight tangents and self-colored impact without legacy circle scaling', () => {
  const markup = blasterReticleMarkup();
  assert.match(markup, /data-blaster="nw" d="M-4\.9497,4\.9497L4\.9497,-4\.9497"/);
  assert.match(markup, /r="12\.5" stroke="#fff" stroke-width="2"/);
  assert.match(markup, /stroke="var\(--self,/);
  assert.doesNotMatch(markup, /stroke-dasharray|iw-ret__svg|--enemy|\bA\d/);
  assert.match(BLASTER_RETICLE_CSS, /scale: 1; rotate: none; animation: none; transition: none/);
  assert.match(BLASTER_RETICLE_CSS, /opacity: 1/);
  assert.match(BLASTER_RETICLE_CSS, /transform: scale\(var\(--iw-blaster-scale, 1\)\)/);
});
