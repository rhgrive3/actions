import test from 'node:test';
import assert from 'node:assert/strict';
import { S3_RETICLE, S3_RETICLE_CSS, hitFlashPath, installS3ReticleLook } from '../runtime/s3-reticle-look.mjs';

test('shooter strokes use the official 24 px base plus 0.347 of the projected spread', () => {
  assert.equal(S3_RETICLE.tickBaseX, 24);
  assert.equal(S3_RETICLE.spreadScale, 0.347);
  // Splattershot ground 6 deg / jump 12 deg through INKWAVE's projection (~691 px per tangent at fov 55)
  const half = (deg) => S3_RETICLE.tickBaseX + 691 * Math.tan(deg * Math.PI / 180) * S3_RETICLE.spreadScale;
  assert.ok(Math.abs(half(6) - 48.7) < 1.5, `ground ${half(6)}`);
  assert.ok(Math.abs(half(12) - 76.7) < 2, `jump ${half(12)}`);
  assert.match(S3_RETICLE_CSS, /--iw-corner-x: calc\(24px \+ var\(--sp, 0\) \* 0\.347px\)/);
});

test('on-target shows the X and hides the strokes; the centre hit X yields to the world flash', () => {
  assert.match(S3_RETICLE_CSS, /\.iw-xh\.is-target \.iw-ret g\.s3-x \{ opacity: 1; \}/);
  assert.match(S3_RETICLE_CSS, /\.iw-xh\.is-target \.iw-ret--shooter \.iw-ret__tick/);
  assert.match(S3_RETICLE_CSS, /\.iw-xh\.s3-world-hit \.iw-hit \{ visibility: hidden; \}/);
});

test('dualies: the moving guide marks are the bright ones; the fixed camera rings use the Blaster camera ring', () => {
  assert.match(S3_RETICLE_CSS, /\.iw-ret__hand circle\.s3-ring \{ stroke: #fff;/);
  // owner request 2026-11-09: the fixed pair was nearly invisible (opacity .22, 1 px); now the Blaster's grey ring
  assert.match(S3_RETICLE_CSS, /\.iw-ret--dualies \.iw-ret__dual-camera circle \{ stroke: #b7b7b7; stroke-width: 1\.5; opacity: 0\.75;/);
});

test('splatling: both stages on one ring in white shades, the second solid', () => {
  assert.match(S3_RETICLE_CSS, /\.iw-ret__charge\.iw-ret__charge-second \{ stroke: #fff; opacity: 1; \}/);
  assert.doesNotMatch(S3_RETICLE_CSS.split('\n').filter((l) => l.includes('splatling')).join('\n'), /--self/);
});

test('charger: no reach markers drawn at the reticle centre', () => {
  assert.match(S3_RETICLE_CSS, /\.iw-ret--charger::before, \.iw-xh \.iw-ret--charger::after \{ display: none; \}/);
});

test('hit flash is an eight-point star', () => {
  const d = hitFlashPath();
  assert.equal(d.split('L').length, 16);
  assert.ok(d.startsWith('M0.00 -23.00'));
});

test('hit flash: only the local player hitting a real victim, not in boss or attract', () => {
  const handlers = {};
  const G = { match: { local: { id: 'me' }, mode: 'turf' }, camera: {} };
  function HUD() {}
  let projected = 0;
  HUD.prototype.update = function () { return 'ok'; };
  HUD.prototype._buildReticle = function () {};
  HUD.prototype._project = function () { projected++; return { x: 0, y: 0, z: 0.5 }; };
  installS3ReticleLook({ G, HUD, on: (name, fn) => { handlers[name] = fn; } });
  const hud = new HUD(); hud.xh = { classList: { toggle() {} } }; hud.downLayer = {};
  const victim = { pos: { x: 1, y: 0, z: 2 }, form: 'kid' };
  handlers.hit({ attacker: { id: 'other' }, victim, damage: 30 });
  handlers.hit({ attacker: G.match.local, victim, damage: 0 });
  handlers.hit({ attacker: G.match.local, victim: G.match.local, damage: 30 });
  assert.equal(hud.update(), 'ok');
  assert.equal(projected, 0);
  G.match.mode = 'boss';
  handlers.hit({ attacker: G.match.local, victim, damage: 30 });
  hud.update();
  assert.equal(projected, 0);
  G.match.mode = 'turf';
  handlers.hit({ attacker: G.match.local, victim, damage: 30 });
  hud.update();
  assert.equal(projected, 1);
});

test('floor-paint drops: Shooter, Dualies and the Slosher bucket are drawn at 20%; others unchanged', async () => {
  const { smallFloorDropScale } = await import('../runtime/projectile-presentation.mjs');
  const owner = (kind, family) => ({ owner: { weapon: kind === 'catalog' ? { kind, catalogRecord: { family } } : { kind } } });
  assert.equal(smallFloorDropScale(owner('catalog', 'shooter')), 0.2);
  assert.equal(smallFloorDropScale(owner('catalog', 'dualies')), 0.2);
  assert.equal(smallFloorDropScale(owner('shooter')), 0.2);
  assert.equal(smallFloorDropScale(owner('dualies')), 0.2);
  assert.equal(smallFloorDropScale(owner('slosher')), 0.2);
  assert.equal(smallFloorDropScale({ sourceActor: 'WeaponSlosherStrong' }), 0.2);
  assert.equal(smallFloorDropScale({ ...owner('catalog', 'slosher'), sourceActor: 'WeaponSlosherDiffusion' }), 1);
  assert.equal(smallFloorDropScale(owner('catalog', 'blaster')), 1);
  assert.equal(smallFloorDropScale(owner('catalog', 'brella')), 1);
  assert.equal(smallFloorDropScale(owner('catalog', 'splatling')), 1);
});

test('bot paint pitch: Shooter and Dualies aim -0.1 rad, Brella and others keep theirs', async () => {
  const { adaptBotPaintPitch, BOT_PAINT_PITCH_SHOOTER } = await import('../bot-paint-pitch-adapter.mjs');
  assert.equal(BOT_PAINT_PITCH_SHOOTER, -0.1);
  const once = (code, a, b) => { assert.equal(code.split(a).length, 2, a); return code.replace(a, b); };
  const src = "x = family === 'splatling' ? -0.08 : -0.42;\n" +
    "if (this.mode !== 'fight') { wantYaw = aheadYaw + (family === 'roller' ? 0 : Math.sin(this.sweep) * 0.5); wantPitch = family === 'charger' ? -0.12 : family === 'blaster' ? -0.28 : -0.42; }";
  const out = adaptBotPaintPitch('src/game/bots.js', src, once);
  const pitch = (family, catalogFamily) => {
    const a = { weapon: { catalogRecord: { family: catalogFamily } } };
    return [...out.matchAll(/(?:x|wantPitch) = ([^;]+);/g)].map((m) => new Function('family', 'a', 'return ' + m[1])(family, a));
  };
  assert.deepEqual(pitch('shooter', 'shooter'), [-0.1, -0.1]);
  assert.deepEqual(pitch('dualies', 'dualies'), [-0.1, -0.1]);
  assert.deepEqual(pitch('shooter', 'brella'), [-0.42, -0.42]);
  assert.deepEqual(pitch('roller', 'roller'), [-0.42, -0.42]);
  assert.deepEqual(pitch('splatling', 'splatling'), [-0.08, -0.42]);
  assert.equal(adaptBotPaintPitch('src/game/other.js', src, once), src);
});
