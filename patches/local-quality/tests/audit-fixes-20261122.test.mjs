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
  assert.match(main, /_stopLocalLoops\(\)/);

  const shadow = adaptBuildSource('src/core/shadowcache.js', readUpstream('src/core/shadowcache.js'));
  assert.match(shadow, /this\.cache\?\.depthTexture\?\.dispose\(\)/);

  const gyro = adaptBuildSource('src/core/gyro.js', readUpstream('src/core/gyro.js'));
  assert.match(gyro, /DME && typeof DME\.requestPermission === 'function'/);
  assert.match(gyro, /this\.dYaw = this\.dPitch = 0;/);
  assert.match(gyro, /if \(this\._hasQ && dt0 <= 0\.25\)/);

  const mobile = adaptBuildSource('src/core/mobile.js', readUpstream('src/core/mobile.js'));
  assert.match(mobile, /pending\.subId = subId;/);

  const actor = adaptBuildSource('src/game/actor.js', readUpstream('src/game/actor.js'));
  assert.match(actor, /const nx = d > 1e-4 \? dx \/ d : 1/);

  const match = adaptBuildSource('src/game/match.js', readUpstream('src/game/match.js'));
  assert.match(match, /if \(G\.rig\?\.target === a\) G\.rig\.target = null;/);
  assert.match(match, /const nx = d > 1e-4 \? dx \/ d : 1, nz = d > 1e-4 \? dz \/ d : 0;/);

  const physics = adaptBuildSource('src/game/physics.js', readUpstream('src/game/physics.js'));
  assert.equal((physics.match(/capTop = Math\.max\(height, top \+ radius\)/g) || []).length, 2);

  const cam = adaptBuildSource('src/game/cameraRig.js', readUpstream('src/game/cameraRig.js'));
  assert.match(cam, /battleHorizontalFov\(this\.mode, this\.target, this\.spectate\?\.actor\)/);
  assert.match(cam, /_v2\.y \+= 0\.15 \+ this\.lensLift\.x;/);

  const player = adaptBuildSource('src/game/player.js', readUpstream('src/game/player.js'));
  assert.match(player, /if \(!mapUp && as && as\.prevValid/);
  assert.match(player, /this\.rig\?\.gameCam \|\| G\.camera/);

  const bots = adaptBuildSource('src/game/bots.js', readUpstream('src/game/bots.js'));
  assert.match(bots, /const pencil = w\.sourceMainActor === 'WeaponChargerPencil';/);
  assert.match(bots, /if \(evading && \(this\.evadeT <= 0 \|\| !this\._wasEvading\)\)/);

  const boss = adaptBuildSource('src/boss/boss.js', readUpstream('src/boss/boss.js'));
  assert.match(boss, /st\.params = ph \? m\.p : null;/);

  const character = adaptBuildSource('src/game/character.js', readUpstream('src/game/character.js'));
  assert.match(character, /if \(originalDistance < 1e-6\) _pD\.set\(0, -1, 0\);/);

  const showcase = adaptBuildSource('src/game/showcase.js', readUpstream('src/game/showcase.js'));
  assert.match(showcase, /this\._prt8\.width !== \(this\._pq\[0\]\.req\?\.size \|\| 256\)/);

  const weapons = adaptBuildSource('src/game/weapons.js', readUpstream('src/game/weapons.js'));
  assert.match(weapons, /if \(!p\.ghost && G\.boss && direct !== 'boss'/);

  const paint = adaptBuildSource('src/world/paint.js', readUpstream('src/world/paint.js'));
  assert.match(paint, /abs\(p\.x\) \+ abs\(p\.y\) > 1e-5/);
  assert.match(paint, /if \(!f \|\| !f\.atlas\) return 0;/);
  assert.match(paint, /return t > 0 \? \[this\.counts\[0\] \/ t, this\.counts\[1\] \/ t\] : \[0, 0\];/);

  const env = adaptBuildSource('src/world/environment.js', readUpstream('src/world/environment.js'));
  assert.match(env, /EXT_color_buffer_half_float/);
  assert.match(env, /this\.sun\.dispose\?\.\(\);/);
  assert.match(env, /dUpL > 1e-8/);
  assert.match(env, /abs\(R\.x\) \+ abs\(R\.z\) > 1e-5/);

  const lvlMat = adaptBuildSource('src/world/levelMaterial.js', readUpstream('src/world/levelMaterial.js'));
  assert.match(lvlMat, /clamp\(int\(pattern \+ 0\.5\), 0, TL_SLOTS - 1\)/);
  assert.match(lvlMat, /clamp\(int\(vFaceFlags\.z \+ 0\.5\), 0, 11\)/);
  assert.match(lvlMat, /TL > 1e-6/);

  const inkShade = adaptBuildSource('src/world/inkShading.js', readUpstream('src/world/inkShading.js'));
  assert.match(inkShade, /TfL > 1e-6/);

  const screenfx = adaptBuildSource('src/fx/screenfx.js', readUpstream('src/fx/screenfx.js'));
  assert.match(screenfx, /pow\(max\(1\.0 - clamp\(n\.z, 0\.0, 1\.0\), 1e-5\), 1\.6\)/);
  assert.match(screenfx, /this\._pendingTrails/);

  const fx = adaptBuildSource('src/fx/fx.js', readUpstream('src/fx/fx.js'));
  assert.match(fx, /p\._netSource\?\.fill\(null\);/);

  const bossAudio = adaptBuildSource('src/audio/bossAudio.js', readUpstream('src/audio/bossAudio.js'));
  assert.match(bossAudio, /!h\._sfxDeferred/);

  const audio = adaptBuildSource('src/audio/audio.js', readUpstream('src/audio/audio.js'));
  assert.match(audio, /victim\._sfxReqOwner/);
  assert.match(audio, /this\.conv\.buffer = null/);

  const track = adaptBuildSource('src/audio/streamedTrack.js', readUpstream('src/audio/streamedTrack.js'));
  assert.match(track, /error\?\.name === 'AbortError'/);

  const net = adaptBuildSource('src/net/netmatch.js', readUpstream('src/net/netmatch.js'));
  assert.match(net, /if \(!Number\.isFinite\(d\.ts\)\) return;/);
  assert.match(net, /case 'bm': if \(from === this\.s\.hostId\)/);
  assert.match(net, /case 'bc': \{ const b = this\.match\?\.boss; if \(from === this\.s\.hostId && b && !b\.sim\)/);
  assert.match(net, /typeof d === 'object' && !Array\.isArray\(d\)/);

  const session = adaptBuildSource('src/net/session.js', readUpstream('src/net/session.js'));
  assert.match(session, /else if \(this\.isHost && this\.state === 'starting' && this\._setupReady && this\._startCfg\)/);

  const diorama = adaptBuildSource('src/ui/diorama.js', readUpstream('src/ui/diorama.js'));
  assert.match(diorama, /if \(was \|\| this\._targetMatch \|\| this\._pinTaps\?\.size\)/);

  const hud = adaptBuildSource('src/ui/hud.js', readUpstream('src/ui/hud.js'));
  assert.match(hud, /Object\.hasOwn\(this, '_tankBox'\)/);
  assert.match(hud, /this\.beacons\[i\]\._key !== 'x'/);
  assert.match(hud, /L\.chargerReachKey !== rk/);

  const menuArt = adaptBuildSource('src/ui/menu-art.js', readUpstream('src/ui/menu-art.js'));
  assert.match(menuArt, /const wrapped = !trailD \|\| next >= 1;/);

  const icons = adaptBuildSource('src/ui/ui-icons.js', readUpstream('src/ui/ui-icons.js'));
  assert.equal((icons.match(/^\s*hand:\s*svg\(/gm) || []).length, 1);
  assert.equal((icons.match(/^\s*wave:\s*svg\(/gm) || []).length, 1);

  const menus = adaptBuildSource('src/ui/menus.js', readUpstream('src/ui/menus.js'));
  assert.match(menus, /id: 'wave', label: 'HEY!', icon: 'wave'/);
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
