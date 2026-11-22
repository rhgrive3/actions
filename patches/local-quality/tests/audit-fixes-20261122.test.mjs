import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { qualityIdentity } from '../adapter.mjs';
import { avatarSVG } from '../../../account/client/src/art.js';
import { verifyGameGateCookie, mintGameGateCookie } from '../../../account/worker/bot-gate.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const readUpstream = (rel) => fs.readFileSync(path.join(ROOT, 'inkwave-public', rel), 'utf8');

test('audit-fixes-20261122-adapter is build-only and identity-tracked', () => {
  assert.equal(BUILD_ONLY_PATCH_MODULES.has('patches/local-quality/audit-fixes-20261122-adapter.mjs'), true);
  const identity = qualityIdentity();
  assert.equal(typeof identity['audit-fixes-20261122-adapter.mjs'], 'string');
});

test('composed sources include all audit-fixes-20261122 guards without duplicate edits', () => {
  const main = adaptBuildSource('src/main.js', readUpstream('src/main.js'));
  assert.match(main, /!Array\.isArray\(v\)/);
  assert.match(main, /_iwBaseEmissive/);

  const shadow = adaptBuildSource('src/core/shadowcache.js', readUpstream('src/core/shadowcache.js'));
  assert.match(shadow, /this\.cache\?\.depthTexture\?\.dispose\(\)/);

  const gyro = adaptBuildSource('src/core/gyro.js', readUpstream('src/core/gyro.js'));
  assert.match(gyro, /DME && typeof DME\.requestPermission === 'function'/);
  assert.match(gyro, /this\.dYaw = this\.dPitch = 0;/);
  assert.match(gyro, /if \(this\._hasQ && dt0 <= 0\.25\)/);

  const actor = adaptBuildSource('src/game/actor.js', readUpstream('src/game/actor.js'));
  assert.match(actor, /const nx = d > 1e-4 \? dx \/ d : 1/);

  const physics = adaptBuildSource('src/game/physics.js', readUpstream('src/game/physics.js'));
  assert.equal((physics.match(/capTop = Math\.max\(height, top \+ radius\)/g) || []).length, 2);

  const cam = adaptBuildSource('src/game/cameraRig.js', readUpstream('src/game/cameraRig.js'));
  assert.match(cam, /_v2\.y \+= 0\.15 \+ this\.lensLift\.x;/);

  const weapons = adaptBuildSource('src/game/weapons.js', readUpstream('src/game/weapons.js'));
  assert.match(weapons, /if \(!p\.ghost && G\.boss && direct !== 'boss'/);

  const paint = adaptBuildSource('src/world/paint.js', readUpstream('src/world/paint.js'));
  assert.match(paint, /abs\(p\.x\) \+ abs\(p\.y\) > 1e-5/);
  assert.match(paint, /if \(!f \|\| !f\.atlas\) return 0;/);
  assert.match(paint, /return t > 0 \? \[this\.counts\[0\] \/ t, this\.counts\[1\] \/ t\] : \[0, 0\];/);

  const env = adaptBuildSource('src/world/environment.js', readUpstream('src/world/environment.js'));
  assert.match(env, /EXT_color_buffer_half_float/);
  assert.match(env, /this\.sun\.dispose\?\.\(\);/);

  const lvlMat = adaptBuildSource('src/world/levelMaterial.js', readUpstream('src/world/levelMaterial.js'));
  assert.match(lvlMat, /clamp\(int\(pattern \+ 0\.5\), 0, TL_SLOTS - 1\)/);
  assert.match(lvlMat, /clamp\(int\(vFaceFlags\.z \+ 0\.5\), 0, 11\)/);

  const track = adaptBuildSource('src/audio/streamedTrack.js', readUpstream('src/audio/streamedTrack.js'));
  assert.match(track, /error\?\.name === 'AbortError'/);

  const net = adaptBuildSource('src/net/netmatch.js', readUpstream('src/net/netmatch.js'));
  assert.match(net, /if \(!Number\.isFinite\(d\.ts\)\) return;/);
  assert.match(net, /case 'bm': if \(from === this\.s\.hostId\)/);
  assert.match(net, /case 'bc': \{ const b = this\.match\?\.boss; if \(from === this\.s\.hostId && b && !b\.sim\)/);
});

test('avatarSVG rejects untrusted avatarColor injection and falls back to allowlisted ink', () => {
  const svg = avatarSVG({ loginId: 'inkling', avatarIcon: 'squid', avatarColor: '" onload="alert(1)' });
  assert.equal(svg.includes('onload='), false);
  assert.match(svg, /fill="#[0-9a-f]{6}"/i);
});

test('bot-gate allows small clock skew up to 60s but rejects larger future expiry', async () => {
  if (typeof globalThis.crypto?.subtle === 'undefined') return;
  const secret = 's'.repeat(32);
  const now = 1_700_000_000_000;
  const cookie = await mintGameGateCookie('inkwave.example', secret, now);
  assert.equal(await verifyGameGateCookie(cookie, 'inkwave.example', secret, now - 30_000), true);
  assert.equal(await verifyGameGateCookie(cookie, 'inkwave.example', secret, now - 120_000), false);
});
