import { battleVerticalFov, BATTLE_HUMANOID_VERTICAL_FOV } from './battle-framing.mjs';
import { beginIntroPresentation, advanceIntroPresentation } from './intro-presentation.mjs';

// Observed source-video frames, zero-based, 60 fps. This is the official
// nawabari_pc.mp4 clip, NOT recovered Nintendo camera data or a version-11.3
// measurement. Camera distances/angles below are local visual calibration.
export const TURF_INTRO_FRAMES = Object.freeze({ opponent: 209, spawn: 399, ready: 436, settle: 456, go: 578 });
export function turfIntroAiming(match) {
  return match?.state === 'intro' && !match.bossMode && match.local?.alive &&
    match.local.s3?.squidSpawn?.initial && match.local.s3.squidSpawn.phase === 'aim' &&
    match.stateT * 60 + 1e-8 >= TURF_INTRO_FRAMES.settle;
}
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

export function turfIntroShot(seconds, localTeam = 0) {
  const frame = Math.max(0, seconds * 60 + 1e-8);
  if (frame < TURF_INTRO_FRAMES.opponent) return { name: 'friendly', team: localTeam, progress: frame / TURF_INTRO_FRAMES.opponent };
  if (frame < TURF_INTRO_FRAMES.spawn) return { name: 'opponent', team: 1 - localTeam,
    progress: (frame - TURF_INTRO_FRAMES.opponent) / (TURF_INTRO_FRAMES.spawn - TURF_INTRO_FRAMES.opponent) };
  return { name: 'spawn', team: localTeam, progress: clamp((frame - TURF_INTRO_FRAMES.spawn) / (TURF_INTRO_FRAMES.settle - TURF_INTRO_FRAMES.spawn)) };
}

export function beginTurfIntro(game, G, THREE) {
  const match = game.match, rig = game.rig, team = match.local?.team === 1 ? 1 : 0;
  rig._turfIntro = { game, match, flow: game._matchFlow, team, shown: false, ready: false,
    center: new THREE.Vector3(), look: new THREE.Vector3(), start: new THREE.Vector3(), finish: new THREE.Vector3() };
  beginIntroPresentation(game, match, [[TURF_INTRO_FRAMES.spawn / 60, 'show'], [TURF_INTRO_FRAMES.ready / 60, 'ready']]);
  rig._s3AimFrame = null;
  rig.mode = 'turfIntro'; rig.path = null;
  if (rig.blend) rig.blend.active = false;
  rig.mapOpen = false; rig.mapK = 0; rig.fovKick = 0; rig.zoom = 0;
  const axis = forward(G.level, team);
  rig.yaw = Math.atan2(axis.x, axis.z); rig.pitch = -0.45;
  rig.dioFlip = team === 1;
  game.hud?.setVisible(false);
  game._playMusic('opening');
  updateTurfIntroCamera(rig, G, THREE);
}

function forward(level, team) {
  const a = level.spawnPads[team], b = level.spawnPads[1 - team];
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz);
  return length > 1e-6 ? { x: dx / length, z: dz / length } : { x: 0, z: team ? -1 : 1 };
}

function publish(rig, fov, battle) {
  for (const camera of [rig.camera, rig.gameCam]) {
    if (!camera) continue;
    if (camera !== rig.camera) {
      camera.position.copy(rig.camera.position); camera.quaternion.copy(rig.camera.quaternion);
      camera.aspect = rig.camera.aspect; camera.near = rig.camera.near; camera.far = rig.camera.far;
    }
    camera.userData.s3BattleFrame = battle;
    camera.userData.s3ReferenceVerticalFov = fov;
    camera.fov = battleVerticalFov(fov, camera.aspect);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  }
}

export function updateTurfIntroCamera(rig, G, THREE, recordAimPose) {
  const r = rig._turfIntro;
  if (!r) return false;
  const { game, match, team } = r, local = match.local;
  const openingAim = match.state === 'playing' && local?.alive && local.s3?.squidSpawn?.initial && local.s3.squidSpawn.phase === 'aim';
  if (game.match !== match || G.match !== match || game._matchFlow !== r.flow ||
      (match.state !== 'intro' && !openingAim)) {
    if (game.hud?._turfIntroLineup?.match === match) {
      game.hud._turfIntroLineup.el.remove(); game.hud._turfIntroLineup = null;
    }
    rig._turfIntro = null;
    if (game.match === match && match.state === 'playing' && local?.alive && rig.mode === 'follow') rig._startBlend(0.35);
    return false;
  }
  // Map controls retain the ordinary CameraRig/diorama owner during spawn aim.
  if (openingAim && (r.mapUsed || rig.mapOpen || rig.mapK > 1e-4)) { r.mapUsed = true; return false; }
  advanceIntroPresentation(game);
  // The cinematic is sampled from Match.stateT, never integrated with render dt.
  // Pausing, repeated frames and 30/60/120-Hz rendering therefore share one pose.
  const shot = openingAim ? { name: 'spawn', team, progress: 1 } : turfIntroShot(match.stateT, team);
  const aim = openingAim || turfIntroAiming(match);
  const tags = game.hud?._turfIntroLineup;
  if (tags?.match === match) {
    if (shot.name === 'spawn') { tags.el.remove(); game.hud._turfIntroLineup = null; }
    else tags.el.dataset.team = String(shot.team);
  }
  const cam = rig.camera, axis = forward(G.level, shot.team), right = { x: -axis.z, z: axis.x };
  cam.up.set(0, 1, 0);
  if (shot.name !== 'spawn') {
    const actors = match.actors.filter(a => a.team === shot.team && a.alive !== false);
    r.center.set(0, 0, 0);
    for (const actor of actors) r.center.add(actor.pos);
    if (actors.length) r.center.multiplyScalar(1 / actors.length);
    else r.center.copy(G.level.spawnPads[shot.team]);
    let radius = 1.8;
    for (const actor of actors) radius = Math.max(radius, actor.pos.distanceTo(r.center) + 1.1);
    const pan = (1 - smooth(shot.progress)) * 0.65;
    const distance = Math.max(6.8, radius * 2.8) + (1 - smooth(shot.progress)) * 0.55;
    // Front three-quarter team portrait, gently dollying in. Each team gets a
    // separate hard cut; there is no traversal across the stage between them.
    r.look.copy(r.center); r.look.y += 1.0;
    cam.position.set(r.center.x + axis.x * distance + right.x * (distance * 0.24 + pan),
      r.center.y + 0.55, r.center.z + axis.z * distance + right.z * (distance * 0.24 + pan));
    cam.lookAt(r.look); publish(rig, 35, false);
  } else {
    const p = local?.pos || G.level.spawnPads[team], own = forward(G.level, team), e = smooth(shot.progress);
    // Move in front of the whole pod group, as in the reference's POV reveal;
    // leaving the lens behind the local pod keeps heads across the aim view.
    r.finish.set(p.x + own.x * 2.5, p.y + 2.2, p.z + own.z * 2.5);
    r.start.set(p.x - own.x * 5.5, p.y + 3.4, p.z - own.z * 5.5);
    cam.position.lerpVectors(r.start, r.finish, e);
    const yaw = aim ? rig.yaw : Math.atan2(own.x, own.z), pitch = aim ? rig.pitch : -0.45;
    const cp = Math.cos(pitch);
    r.look.set(cam.position.x + Math.sin(yaw) * cp * 10, cam.position.y + Math.sin(pitch) * 10, cam.position.z + Math.cos(yaw) * cp * 10);
    cam.lookAt(r.look); publish(rig, BATTLE_HUMANOID_VERTICAL_FOV, true);
    if (aim) {
      // Same-tick input rotates this spawn POV in place. Reuse the normal aim
      // snapshot rather than retaining an attract/portrait pivot for the ray.
      rig.pivot.copy(cam.position); recordAimPose?.(rig);
    }
    if (!r.ready && match.stateT * 60 + 1e-8 >= TURF_INTRO_FRAMES.ready && match.state === 'intro') {
      r.ready = true; G.audio?.play('ready');
    }
  }
  rig._prevMode = rig.mode; rig._prevTarget = rig.target;
  return true;
}
