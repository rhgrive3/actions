import { adaptLobbySlotTransform } from './lobby-slot-transform-adapter.mjs';
import { adaptNavHeuristic } from './nav-heuristic-adapter.mjs';
import { adaptBotNavigation } from './bot-navigation-adapter.mjs';
import { adaptRootHairSpring } from './root-hair-spring-adapter.mjs';
import { adaptPoseRotation } from './pose-rotation-adapter.mjs';
import { adaptCameraFovCache } from './camera-fov-cache-adapter.mjs';
import { adaptMaterialHandoff } from './material-handoff-adapter.mjs';
import { adaptRetargetBranchUpdates } from './retarget-branch-update-adapter.mjs';
import { adaptMotionFkHotpath } from './motion-fk-hotpath-adapter.mjs';
import { adaptClothDerivativeFlow } from './cloth-derivative-adapter.mjs';
import { adaptInkVolumes } from './ink-volume-adapter.mjs';
import { adaptMenuNavigationTimer } from './menu-navigation-timer-adapter.mjs';
import { adaptMuralAtlas } from './mural-atlas-adapter.mjs';
import { adaptBotPaintObservation } from './bot-paint-observation-adapter.mjs';
import { adaptClothingGear } from '../splatoon3/clothing-gear-adapter.mjs';
import { adaptIssue465 } from '../splatoon3/issue-465-adapter.mjs';
import { adaptIssue479 } from '../splatoon3/issue-479-adapter.mjs';
import { adaptIssue481 } from '../splatoon3/issue-481-adapter.mjs';
import { adaptQualityIssue418 } from './issue-418-adapter.mjs';
import { adaptTexlibSource } from './texlib-adapter.mjs';
import { adaptIssue477Source } from '../splatoon3/issue-477-adapter.mjs';
import { adaptBossHit } from './boss-hit-adapter.mjs';
import { adaptTeamSpecialSignal } from './team-special-signal-adapter.mjs';
import { adaptIssue483 } from '../splatoon3/issue-483-adapter.mjs';
import { adaptSlosherEmergeGate } from '../splatoon3/issue-435-adapter.mjs';
import { patchLobbySetShowcase } from './lobby-quality-adapter.mjs';
import { adaptPaintMipmaps } from './issue-190-adapter.mjs';
import { adaptPropRetention } from './prop-retention-adapter.mjs';
import { adaptPropAtlas } from './prop-atlas-adapter.mjs';
import { adaptIssue482 } from '../splatoon3/issue-482-adapter.mjs';
import { adaptIssue405 } from '../splatoon3/issue-405-adapter.mjs';
import { adaptIssue484 } from '../splatoon3/issue-484-adapter.mjs';
import { adaptIssue460Source } from '../splatoon3/issue-460-adapter.mjs';
import { adaptIssue427 } from '../splatoon3/issue-427-adapter.mjs';
import { adaptIssue461Source } from './issue-461-sfx-mute.mjs';
import { adaptIssue480Source } from './issue-480-camera-shake-fidelity.mjs';
import { adaptTenacity } from './tenacity-adapter.mjs';
import { adaptFxActorLifetime } from './fx-actor-lifetime-adapter.mjs';
import { adaptHudSnapshots } from './hud-snapshots-adapter.mjs';
import { adaptResultContinuation } from './result-continuation-adapter.mjs';
import { adaptShowcaseShadow } from './showcase-shadow-adapter.mjs';
import { adaptShowcaseAlpha } from './showcase-alpha-adapter.mjs';
import { adaptTeamWipeout } from './team-wipeout-adapter.mjs';
import { adaptSplatlingReticle } from './splatling-reticle-adapter.mjs';
import { adaptPortraitGuard } from './portrait-guard-adapter.mjs';
import { adaptHudAuthority } from './hud-authority-adapter.mjs';
import { adaptS3HudLook } from './s3-hud-look-adapter.mjs';
import { adaptS3SquidLook } from './s3-squid-look-adapter.mjs';
import { adaptS3FaceLook } from './s3-face-look-adapter.mjs';
// Build-only quality corrections composed after the gameplay, touch-layout and
// reliability adapters. Upstream inkwave-public/ remains byte-for-byte intact.
import fs from 'node:fs';
import { adaptScreenfxDamageReset } from './screenfx-damage-reset-adapter.mjs';
import { adaptComposerFormat } from './composer-format-adapter.mjs';
import { adaptComposerTarget } from './composer-target-adapter.mjs';
import { adaptScreenfxLensRelease } from './screenfx-lens-release-adapter.mjs';
import { adaptActorWeaponInput } from './actor-weapon-input-adapter.mjs';
import { adaptBotRefillRelease } from './bot-refill-release-adapter.mjs';
import { adaptBotEdgeGuard } from './bot-edge-guard-adapter.mjs';
import { adaptFinalMinuteMusic } from './final-minute-music-adapter.mjs';
import { adaptFinalCount } from './final-count-adapter.mjs';
import { adaptTurfLead } from './turf-lead-adapter.mjs';
import { adaptScoreReticle } from './score-reticle-adapter.mjs';
import { adaptMapTeammateStatus } from './map-teammate-status-adapter.mjs';
import { adaptResourceSource } from './resource-adapter.mjs';
import { adaptMedalSource } from './medal-adapter.mjs';
import { adaptAimProfiles } from './aim-profile-adapter.mjs';
import { adaptUiActorLifetime } from './ui-actor-lifetime-adapter.mjs';
import { adaptIdleSource } from './idle-adapter.mjs';
import { adaptPlatformSource } from './platform-adapter.mjs';
import { adaptLandingRigidity } from './landing-rigidity-adapter.mjs';
import { adaptMatchRetainers } from './match-retainer-adapter.mjs';
import { adaptFirstTouch } from './first-touch-source-adapter.mjs';
import { adaptTouchRelayout } from './touch-relayout-adapter.mjs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { adaptMinimapResources } from './minimap-resource-adapter.mjs';
import { adaptLobbyResources } from './lobby-resource-adapter.mjs';
import { adaptFrameOrder } from './frame-order-adapter.mjs';
import { adaptRangeFramePacing } from './range-frame-pacing-adapter.mjs';
import { adaptPaintHotpath } from './paint-hotpath-adapter.mjs';
import { adaptDistanceHotpath } from './distance-hotpath-adapter.mjs';
import { adaptPerfReadout } from './perf-readout-adapter.mjs';
import { adaptFxEmptyPools } from './fx-empty-pools-adapter.mjs';
import { adaptCollisionHotpath } from './collision-hotpath-adapter.mjs';
import { adaptRuntimeFrameScratch } from './runtime-frame-scratch-adapter.mjs';
import { adaptReflSkip } from './refl-skip-adapter.mjs';
import { adaptFinishTape } from './finish-tape-adapter.mjs';
import { adaptAudioListener } from './audio-listener-adapter.mjs';

export const QUALITY_ROOT = fileURLToPath(new URL('./', import.meta.url));
const IDENTITY_FILES = [
  'view-settings.mjs',
  'material-handoff-adapter.mjs', 'material-handoff.mjs',
  'lobby-slot-transform-adapter.mjs',
  'camera-fov-cache-adapter.mjs',
  'cloth-derivative-adapter.mjs',
  'retarget-branch-update-adapter.mjs',
  'motion-fk-hotpath-adapter.mjs',
  'ink-volume-adapter.mjs', 'ink-volume/vtf.mjs', 'ink-volume/mesh.mjs', 'ink-volume/runtime.mjs', 'ink-volume/pack.mjs', 'ink-volume/roller.mjs', 'ink-volume/recipes.mjs',
  'ink-volume/assets/roller/manifest.json', 'ink-volume/assets/roller/volumes.bin.gz', 'ink-volume/assets/shooter/manifest.json', 'ink-volume/assets/shooter/volumes.bin.gz',
  'lobby-quality-adapter.mjs', 'first-touch-source-adapter.mjs', 'touch-relayout-adapter.mjs',
  'menu-navigation-timer-adapter.mjs',
  'mural-atlas-adapter.mjs',
  'bot-paint-observation-adapter.mjs',
  'issue-418-adapter.mjs','world-quality.mjs','quality-probe.mjs','texlib-adapter.mjs','texlib.mjs',
  'boss-hit-adapter.mjs',
  'team-special-signal-adapter.mjs',
  'issue-190-adapter.mjs', 'paint-mipmap-probe.mjs', 'issue-472-adapter.mjs',
  'screenfx-damage-reset-adapter.mjs', 'composer-format-adapter.mjs', 'composer-target-adapter.mjs', 'screenfx-lens-release-adapter.mjs', 'actor-weapon-input-adapter.mjs', 'bot-refill-release-adapter.mjs', 'bot-edge-guard-adapter.mjs',
  'fx-actor-lifetime-adapter.mjs',
  'hud-snapshots-adapter.mjs', 'hud-snapshots.mjs',
  'hud-authority-adapter.mjs', 's3-hud-look-adapter.mjs', 's3-squid-look-adapter.mjs', 's3-face-look-adapter.mjs', 'fonts/iw-s3-digits.woff2', 'fonts/iw-s3-jp.woff2', 'fonts/OFL-RoundedMplus1c.txt', 'hud/s3-squid-badge.svg',
  'result-continuation-adapter.mjs', 'result-continuation.mjs',
  'showcase-shadow.mjs', 'showcase-shadow-adapter.mjs', 'showcase-alpha-adapter.mjs',
  'team-wipeout.mjs', 'team-wipeout-adapter.mjs',
  'splatling-reticle.mjs', 'splatling-reticle-adapter.mjs',
  'portrait-guard.mjs', 'portrait-guard-adapter.mjs',
  'final-minute-music-adapter.mjs',
  'final-count-adapter.mjs',
  'turf-lead-adapter.mjs',
  'score-reticle-adapter.mjs', 'map-teammate-status-adapter.mjs',
  'prop-retention-adapter.mjs', 'prop-atlas-adapter.mjs',
  'issue-461-sfx-mute.mjs', 'issue-480-camera-shake-fidelity.mjs',
  'audio-listener-adapter.mjs', 'runtime/audio-listener.mjs',
  'resource-adapter.mjs', 'resource-budget.mjs', 'portrait-work.mjs', 'depth-cache.mjs',
  'aim-profile-adapter.mjs', 'aim-profile.mjs', 'medal-adapter.mjs',
  'resource-adapter.mjs', 'resource-budget.mjs', 'depth-cache.mjs',
  'hud-authority-adapter.mjs',
  'aim-profile-adapter.mjs', 'aim-profile.mjs', 'medal-adapter.mjs',
  'ui-actor-lifetime-adapter.mjs',
  'tenacity-adapter.mjs', 'tenacity.mjs',
  'idle-adapter.mjs', 'idle-resources.mjs', 'music-idle.mjs',
  'lobby-resource-adapter.mjs', 'minimap-resource-adapter.mjs', 'refl-skip-adapter.mjs', 'finish-tape-adapter.mjs',
  'adapter.mjs', 'gyro.mjs', 'install.mjs', 'menu-preview.mjs', 'menu.mjs',
  'offline-offscreen-budget.mjs',
  'roller-motion.mjs', 'roller-visual.mjs', 'surface.mjs', 'landing-rigidity-adapter.mjs', 'match-retainer-adapter.mjs', 'first-touch-adapter.mjs', 'touch-relayout.mjs',
  'offscreen-visual-budget.mjs',
  'platform-adapter.mjs', 'platform-lifecycle.mjs', 'platform-game.mjs',
  'platform-input.mjs', 'platform-audio.mjs', 'platform-transport.mjs',
  'mobile-platform.mjs', 'gyro-permission.mjs', 'gyro-startup.mjs',
  'screen-angle.mjs', 'frame-order-adapter.mjs', 'charger-sight.mjs',
  'paint-hotpath-adapter.mjs',
  'distance-hotpath-adapter.mjs',
  'nav-heuristic-adapter.mjs',
  'bot-navigation-adapter.mjs', 'bot-navigation.mjs',
  'root-hair-spring-adapter.mjs',
  'pose-rotation-adapter.mjs',
  'collision-hotpath-adapter.mjs',
  'runtime-frame-scratch-adapter.mjs',
  'range-frame-pacing.mjs', 'range-frame-profiler.mjs', 'range-hitch-tracer.mjs', 'range-frame-pacing-adapter.mjs',
];

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE quality patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

// Presentation-order corrections run last, on this layer's finished output.
export function adaptQualitySource(rel, code) {
  code = adaptNavHeuristic(rel, code, replaceOnce);
  code = adaptRootHairSpring(rel, code, replaceOnce);
  code = adaptPoseRotation(rel, code, replaceOnce);
  code = adaptLobbySlotTransform(rel, code);
  code = adaptMaterialHandoff(rel, code);
  code = adaptCameraFovCache(rel, code);
  if (rel === 'src/ui/hud.js') code = replaceOnce(code, "      d.el.style.transform = `rotate(${ang.toFixed(3)}rad)`;\n      d.el.style.opacity = o.toFixed(2);", "      const transform = `rotate(${ang.toFixed(3)}rad)`, opacity = o.toFixed(2);\n      if (d._transform !== transform) { d._transform = transform; d.el.style.transform = transform; }\n      if (d._opacity !== opacity) { d._opacity = opacity; d.el.style.opacity = opacity; }", 'damage-direction unchanged style writes');
  code = adaptMuralAtlas(rel, code, replaceOnce);
  code = adaptIssue482(rel, code);
  code = adaptIssue405(rel, code);
  code = adaptIssue484(rel, code);
  const framed = adaptFrameOrder(rel, adaptQualityLayer(rel, code));
  const paced = adaptRangeFramePacing(rel, framed);
  let broadphased = adaptCollisionHotpath(rel, paced, replaceOnce);
  if (rel === 'src/game/physics.js') {
    broadphased = replaceOnce(broadphased,
      '    const yLo = Math.min(origin.y, ey) - 1e-6;\n    const yHi = Math.max(origin.y, ey) + 1e-6;',
      '    const yLo = Math.min(origin.y, ey) - 1e-6;\n    const yHi = Math.max(origin.y, ey) + 1e-6;\n    const xLo = Math.min(origin.x, ex) - 1e-6, xHi = Math.max(origin.x, ex) + 1e-6;\n    const zLo = Math.min(origin.z, ez) - 1e-6, zHi = Math.max(origin.z, ez) + 1e-6;',
      'compute horizontal ray reach once per ray');
    broadphased = replaceOnce(broadphased,
      '      if (b.aabbMin?.y > yHi || b.aabbMax?.y < yLo) continue;',
      '      if (b.aabbMin?.y > yHi || b.aabbMax?.y < yLo) continue;\n      if (b.aabbMin && (b.aabbMin.x > xHi || b.aabbMax.x < xLo || b.aabbMin.z > zHi || b.aabbMax.z < zLo)) continue;',
      'discard horizontally disjoint raycast blocks');
  }
  const painted = adaptFxEmptyPools(rel, adaptPerfReadout(rel, adaptPaintHotpath(rel, broadphased, replaceOnce), replaceOnce), replaceOnce);
  const lazy = adaptComposerTarget(rel, adaptDistanceHotpath(rel, painted, replaceOnce), replaceOnce);
  const navigated = adaptMenuNavigationTimer(rel, adaptComposerFormat(rel, lazy, replaceOnce), replaceOnce);
  return adaptBotNavigation(rel, adaptInkVolumes(rel, adaptClothDerivativeFlow(rel, adaptRuntimeFrameScratch(rel, navigated, replaceOnce)), replaceOnce), replaceOnce);
}

function adaptQualityLayer(rel, code) {
  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code,
      '  _finishFrame(dt) {\n    rememberSuperJumpGround(this);\n    const a = this.anim;',
      '  _finishFrame(dt) {\n    rememberSuperJumpGround(this);\n    const a = this.anim;\n    a.isBot = this.isBot === true;',
      'carry bot identity to visual-only Character scheduling');
  }
  code = adaptBotPaintObservation(rel, code);
  code = adaptPropRetention(rel, code);
  code = adaptPropAtlas(rel, code);
  code = adaptScreenfxDamageReset(rel, code, replaceOnce);
  code = adaptScreenfxLensRelease(rel, code, replaceOnce);
  code = adaptActorWeaponInput(rel, code, replaceOnce);
  code = adaptBotRefillRelease(rel, code, replaceOnce);
  code = adaptBotEdgeGuard(rel, code, replaceOnce);
  code = adaptFinalMinuteMusic(rel, code, replaceOnce);
  code = adaptFinalCount(rel, code, replaceOnce);
  code = adaptTurfLead(rel, code, replaceOnce);
  code = adaptScoreReticle(rel, code, replaceOnce);
  code = adaptMapTeammateStatus(rel, code, replaceOnce);
  code = adaptIssue427(rel, code);
  code = adaptClothingGear(rel, code, replaceOnce);
  code = adaptBossHit(rel, code);
  code = adaptTeamSpecialSignal(rel, code, replaceOnce);
  code = adaptIssue460Source(rel, code);
  code = adaptIssue461Source(rel, code);
  code = adaptAudioListener(rel, code);
  code = adaptRetargetBranchUpdates(rel, code);
  code = adaptMotionFkHotpath(rel, code, replaceOnce);
  if (rel === 'src/game/inkCollision.js') {
    code = replaceOnce(code,
      '  let best = Infinity;\n  for (const id of candidates) {\n    const box = level.blocks[id]; if (!box.solid || skipGrates && box.grate) continue;',
      `  const xLo = Math.min(from.x, to.x) - radius - 1e-6, xHi = Math.max(from.x, to.x) + radius + 1e-6;
  const yLo = Math.min(from.y, to.y) - radius - 1e-6, yHi = Math.max(from.y, to.y) + radius + 1e-6;
  const zLo = Math.min(from.z, to.z) - radius - 1e-6, zHi = Math.max(from.z, to.z) + radius + 1e-6;
  let best = Infinity;
  for (const id of candidates) {
    const box = level.blocks[id]; if (!box.solid || skipGrates && box.grate) continue;
    if (box.aabbMin && (box.aabbMin.y > yHi || box.aabbMax.y < yLo || box.aabbMin.x > xHi || box.aabbMax.x < xLo || box.aabbMin.z > zHi || box.aabbMax.z < zLo)) continue;`,
      'skip 3D AABB-disjoint blocks in sweepLevelSphere');
    code = replaceOnce(code,
      'export function capsuleEntry(from, to, base, actorRadius, height, bulletRadius) {\n  const lo = base.y + Math.min(actorRadius, height * 0.5), hi = base.y + Math.max(height - actorRadius, height * 0.5);\n  const r = actorRadius + bulletRadius, ox = from.x - base.x, oz = from.z - base.z;',
      `export function capsuleEntry(from, to, base, actorRadius, height, bulletRadius) {
  const r = actorRadius + bulletRadius;
  if (Math.min(from.x, to.x) - base.x > r + 1e-7 || Math.max(from.x, to.x) - base.x < -r - 1e-7 ||
      Math.min(from.z, to.z) - base.z > r + 1e-7 || Math.max(from.z, to.z) - base.z < -r - 1e-7) return Infinity;
  const lo = base.y + Math.min(actorRadius, height * 0.5), hi = base.y + Math.max(height - actorRadius, height * 0.5);
  if (Math.min(from.y, to.y) > hi + r + 1e-7 || Math.max(from.y, to.y) < lo - r - 1e-7) return Infinity;
  const ox = from.x - base.x, oz = from.z - base.z;`,
      'skip 3D bounding-box disjoint segments in inkCollision capsuleEntry');
  }
  if (rel === 'src/game/motion/source-bank.js') {
    code = replaceOnce(code,
      `  fromRaw(mode) {
    for (let i = 0; i < this.bank.bones.length; i++) {
      const j = i * STRIDE, r = this.raw;
      this.s[i].set(r[j], r[j + 1], r[j + 2]); this.p[i].set(r[j + 3], r[j + 4], r[j + 5]);
      // BFRES applies X, then Y, then Z to COLUMN vectors => Rz*Ry*Rx, Three's ZYX.
      if (mode === 'eulerXYZ') {
        const e=this.euler.set(r[j+6],r[j+7],r[j+8],'ZYX'),x=e._x/2,y=e._y/2,z=e._z/2;
        const c1=x===0?1:Math.cos(x),c2=y===0?1:Math.cos(y),c3=z===0?1:Math.cos(z);
        const s1=x===0?x:Math.sin(x),s2=y===0?y:Math.sin(y),s3=z===0?z:Math.sin(z);
        this.q[i].set(s1*c2*c3-c1*s2*s3,c1*s2*c3+s1*c2*s3,c1*c2*s3-s1*s2*c3,c1*c2*c3+s1*s2*s3);
      }
      else if (mode === 'quaternion') this.q[i].set(r[j + 6], r[j + 7], r[j + 8], r[j + 9]).normalize();
      else throw new Error(\`Unsupported rotation mode \${mode}\`);
    }
    return this.fk();
  }`,
      `  fromRaw(mode, doFk = true) {
    const bones = this.bank.bones, n = bones.length, r = this.raw;
    for (let i = 0; i < n; i++) {
      const j = i * STRIDE;
      this.s[i].set(r[j], r[j + 1], r[j + 2]); this.p[i].set(r[j + 3], r[j + 4], r[j + 5]);
      // BFRES applies X, then Y, then Z to COLUMN vectors => Rz*Ry*Rx, Three's ZYX.
      if (mode === 'eulerXYZ') {
        const rx = r[j + 6], ry = r[j + 7], rz = r[j + 8], x = rx / 2, y = ry / 2, z = rz / 2;
        if (i === n - 1) { this.euler._x = rx; this.euler._y = ry; this.euler._z = rz; this.euler._order = 'ZYX'; }
        const c1=x===0?1:Math.cos(x),c2=y===0?1:Math.cos(y),c3=z===0?1:Math.cos(z);
        const s1=x===0?x:Math.sin(x),s2=y===0?y:Math.sin(y),s3=z===0?z:Math.sin(z);
        this.q[i].set(s1*c2*c3-c1*s2*s3,c1*s2*c3+s1*c2*s3,c1*c2*s3-s1*s2*c3,c1*c2*c3+s1*s2*s3);
      }
      else if (mode === 'quaternion') this.q[i].set(r[j + 6], r[j + 7], r[j + 8], r[j + 9]).normalize();
      else throw new Error(\`Unsupported rotation mode \${mode}\`);
    }
    return doFk ? this.fk() : this;
  }`,
      'skip intermediate Euler callback notifications and optional FK in fromRaw');
    code = replaceOnce(code,
      `      if (parent >= 0 && (this.flags[i] & (1 << 23))) {
        const ps = this.s[parent], e = m.elements;`,
      `      if (parent >= 0 && (this.flags[i] & (1 << 23)) && (this.s[parent].x !== 1 || this.s[parent].y !== 1 || this.s[parent].z !== 1)) {
        const ps = this.s[parent], e = m.elements;`,
      'skip unit parent-scale division in fk');
    code = replaceOnce(code,
      '  sample(name, frame, out, loop = undefined) {\n',
      '  sample(name, frame, out, loop = undefined, doFk = true) {\n',
      'optional doFk parameter in SourceBank.sample');
    code = replaceOnce(code,
      '    return out.fromRaw(c.rotationMode);\n',
      '    return out.fromRaw(c.rotationMode, doFk);\n',
      'pass doFk to out.fromRaw in SourceBank.sample');
  }
  if (rel === 'src/game/motion/retarget.js') {
    code = replaceOnce(code,
      '  this.accessories.push({bone,i,hairReady:false,hairQ:new THREE.Quaternion(),restSourceQ:this.bank.rest.wq[i].clone().invert(),...options});',
      '  this.accessories.push({bone,i,hairReady:false,hairQ:new THREE.Quaternion(),restSourceQ:this.bank.rest.wq[i].clone().invert(),restHeadRelQ:options.head!==undefined?this.bank.rest.wq[options.head].clone().invert().multiply(this.bank.rest.wq[i]).invert():null,...options});',
      'precompute static restHeadRelQ for hair accessories');
    code = replaceOnce(code,
      ` applyAccessories(pose,{hairTargets=null,shootBlend=0,dt=0}={}) {
  const c=this.character;
  for(const e of this.accessories){
   if(e.hair){
    // Express hair deformation in source HEAD space. This preserves arbitrary target hair rest directions.
    this.q.copy(pose.wq[e.head]).invert().multiply(pose.wq[e.i]);
    this.q3.copy(this.bank.rest.wq[e.head]).invert().multiply(this.bank.rest.wq[e.i]).invert();
    this.q.multiply(this.q3);
    if(hairTargets?.total>0){
     const gain=e.hairGain*(HOST_HAIR.amplitude+(HOST_HAIR.aimAmplitude-HOST_HAIR.amplitude)*clamp(shootBlend,0,1));
     this.q.identity().slerp(hairTargets.q[e.i],gain);
     // Continuous-time response in HEAD space: suppress residual curve/clip
     // cusps on long host strands without making hair lag behind head turns.
     if(!e.hairReady){e.hairQ.copy(this.q);e.hairReady=true;}
     else e.hairQ.slerp(this.q,-Math.expm1(-HOST_HAIR.response*Math.max(0,dt)));
     this.q.copy(e.hairQ);
    }
    c._kidXform(c.bones.head,this.p,this.q3);this.q.premultiply(this.q3);
   }else this.q.copy(pose.wq[e.i]).multiply(e.restSourceQ);
   c._kidXform(e.bone.parent,this.p,this.q2);this.q2.invert().multiply(this.q);e.bone.quaternion.copy(this.q2).normalize();
  }
 }`,
      ` applyAccessories(pose,{hairTargets=null,shootBlend=0,dt=0}={}) {
  const c=this.character;
  const headWorldQ=this._headWorldQ||(this._headWorldQ=new THREE.Quaternion());
  const poseHeadInvQ=this._poseHeadInvQ||(this._poseHeadInvQ=new THREE.Quaternion());
  let headWorldReady=false,lastHead=-1;
  const hasHairTargets=hairTargets?.total>0;
  const ampScale=hasHairTargets?(HOST_HAIR.amplitude+(HOST_HAIR.aimAmplitude-HOST_HAIR.amplitude)*clamp(shootBlend,0,1)):0;
  const hairAlpha=hasHairTargets?-Math.expm1(-HOST_HAIR.response*Math.max(0,dt)):0;
  for(const e of this.accessories){
   if(e.hair){
    // Express hair deformation in source HEAD space. This preserves arbitrary target hair rest directions.
    if(e.head!==lastHead){poseHeadInvQ.copy(pose.wq[e.head]).invert();lastHead=e.head;}
    this.q.copy(poseHeadInvQ).multiply(pose.wq[e.i]);
    if(e.restHeadRelQ)this.q.multiply(e.restHeadRelQ);
    else{this.q3.copy(this.bank.rest.wq[e.head]).invert().multiply(this.bank.rest.wq[e.i]).invert();this.q.multiply(this.q3);}
    if(hasHairTargets){
     const gain=e.hairGain*ampScale;
     this.q.identity().slerp(hairTargets.q[e.i],gain);
     // Continuous-time response in HEAD space: suppress residual curve/clip
     // cusps on long host strands without making hair lag behind head turns.
     if(!e.hairReady){e.hairQ.copy(this.q);e.hairReady=true;}
     else e.hairQ.slerp(this.q,hairAlpha);
     this.q.copy(e.hairQ);
    }
    if(!headWorldReady){c._kidXform(c.bones.head,this.p,headWorldQ);headWorldReady=true;}
    this.q.premultiply(headWorldQ);
   }else this.q.copy(pose.wq[e.i]).multiply(e.restSourceQ);
   if(e.bone.parent===c.bones.head&&headWorldReady)this.q2.copy(headWorldQ);
   else c._kidXform(e.bone.parent,this.p,this.q2);
   this.q2.invert().multiply(this.q);e.bone.quaternion.copy(this.q2).normalize();
  }
 }`,
      'hoist invariant head world transform and restHeadRelQ in applyAccessories');
  }
  if (rel === 'src/game/motion/source-controller.js') {
    code = replaceOnce(code,
      '     this.bank.sample(cl,mod(this.phase+p.feet[0].strike,1)*cl.frames,this.overlay);\n     this.mixUpper(this.overlay,weight/(upperTotal+weight));upperTotal+=weight;',
      '     this.bank.sample(cl,mod(this.phase+p.feet[0].strike,1)*cl.frames,this.overlay,undefined,false);\n     this.mixUpper(this.overlay,weight/(upperTotal+weight),false);upperTotal+=weight;',
      'skip intermediate FK on upper-body overlay sample and mix');
    code = replaceOnce(code,
      '   this.mixUpper(locomotionProfile(this.bank,name).centerPose,this.pivotWeight);',
      '   this.mixUpper(locomotionProfile(this.bank,name).centerPose,this.pivotWeight,false);',
      'skip intermediate FK on pivot upper-body mix');
    code = replaceOnce(code,
      '    if(f<=cl.frames){this.bank.sample(cl,f,this.overlay,false);const weight=SMOOTH(f/2)*SMOOTH((cl.frames-f)/3);if(moving)this.mixUpper(this.overlay,weight);else this.pose.mix(this.overlay,weight);this.currentClips.push({name:action,frame:f,weight,upperOnly:moving});}',
      '    if(f<=cl.frames){this.bank.sample(cl,f,this.overlay,false,false);const weight=SMOOTH(f/2)*SMOOTH((cl.frames-f)/3);if(moving)this.mixUpper(this.overlay,weight,false);else this.pose.mix(this.overlay,weight);this.currentClips.push({name:action,frame:f,weight,upperOnly:moving});}',
      'skip intermediate FK on action overlay sample and mix');
    code = replaceOnce(code,
      ' mixUpper(pose,weight){for(let i=0;i<this.upperMask.length;i++)if(this.upperMask[i]){this.pose.p[i].lerp(pose.p[i],weight);this.pose.q[i].slerp(pose.q[i],weight);this.pose.s[i].lerp(pose.s[i],weight);}this.pose.fk();}',
      ' mixUpper(pose,weight,doFk=true){for(let i=0;i<this.upperMask.length;i++)if(this.upperMask[i]){this.pose.p[i].lerp(pose.p[i],weight);this.pose.q[i].slerp(pose.q[i],weight);this.pose.s[i].lerp(pose.s[i],weight);}if(doFk)this.pose.fk();}',
      'optional doFk parameter in mixUpper');
    code = replaceOnce(code,
      `   const rr=(c.limbs.armR.a+c.limbs.armR.b)*0.995,rl=(c.limbs.armL.a+c.limbs.armL.b)*0.995;
   for(let k=0;k<16;k++){
    this.gripV2.subVectors(this.fitR,this.shoulderR);if(this.gripV2.length()>rr)this.fitR.copy(this.shoulderR).add(this.gripV2.setLength(rr));
    this.fitL.copy(this.fitR).add(this.gripV);this.gripV2.subVectors(this.fitL,this.shoulderL);
    if(this.gripV2.length()>rl)this.fitR.add(this.shoulderL).add(this.gripV2.setLength(rl)).sub(this.fitL);
   }`,
      `   const rr=(c.limbs.armR.a+c.limbs.armR.b)*0.995,rl=(c.limbs.armL.a+c.limbs.armL.b)*0.995,rr2=rr*rr,rl2=rl*rl;
   for(let k=0;k<16;k++){
    let changed=false;
    this.gripV2.subVectors(this.fitR,this.shoulderR);const dR2=this.gripV2.lengthSq();if(dR2>rr2){this.fitR.copy(this.shoulderR).addScaledVector(this.gripV2,rr/Math.sqrt(dR2));changed=true;}
    this.fitL.copy(this.fitR).add(this.gripV);this.gripV2.subVectors(this.fitL,this.shoulderL);const dL2=this.gripV2.lengthSq();
    if(dL2>rl2){this.fitR.add(this.shoulderL).addScaledVector(this.gripV2,rl/Math.sqrt(dL2)).sub(this.fitL);changed=true;}
    if(!changed)break;
   }`,
      'early-exit bimanual reach projection in alignWeapon when within arm reach spheres');
  }
  code = adaptAimProfiles(rel, code);
  code = adaptMedalSource(rel, code);
  code = adaptResourceSource(rel, code, replaceOnce);
  code = adaptFxActorLifetime(rel, code, replaceOnce);
  if (rel === 'src/main.js') {
    code = replaceOnce(code,
      "    // your team on the podium\n    const team = m.actors.filter((a) => a.team === myTeam);\n    this.showcase.showResults(myTeam, won, G.teamColors[myTeam], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));",
      "    // #565: showcase authority is independent of local rewards/audio.\n    const podiumTeam = m.result.winner;\n    const team = m.actors.filter((a) => a.team === podiumTeam);\n    if (podiumTeam === 0 || podiumTeam === 1) this.showcase.showResults(podiumTeam, true, G.teamColors[podiumTeam], team.map((a) => ({ weapon: a.weaponId, style: a.character.style || { hair: a.slot % 4, skin: (a.slot * 3) % 4 }, name: a.name })));",
      'winner-only Turf showcase');
  }
  if (rel === 'src/game/match.js') {
    code = replaceOnce(code,
      '    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;',
      "    emit('match:dispose', { match: this });\n    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;",
      'release match-owned boss audio before disposal');
  }
  if (rel === 'src/audio/bossAudio.js') {
    code = replaceOnce(code,
      'const end = () => { stopAll(0.4); st.active = false; st.boss = null; st.track = null; setRemap(false); };',
      'const end = () => { stopAll(0.4); if (followId) { clearInterval(followId); followId = 0; } st.active = false; st.boss = null; st.track = null; setRemap(false); };',
      'boss audio terminal interval owner');
    code = replaceOnce(code,
      "  on('match:state', ({ state, match }) => {",
      "  on('match:dispose', ({ match }) => { if (st.active && match?.boss && match.boss === st.boss) end(); });\n  on('match:state', ({ state, match }) => {",
      'boss audio follows its matching disposal');
    code = replaceOnce(code,
      "    if (state === 'results' || state === 'judge') { stopAll(0.3); setRemap(false); }",
      "    if ((state === 'results' || state === 'judge') && match.mode === 'boss' && match.boss === st.boss) end();",
      'boss audio terminal state releases retained graph');
  }
  if (rel === 'src/ui/hud.js') {
    code = replaceOnce(code,
      "      this._killCard(victim, 'kill');",
      "      this._killCard(victim, 'kill');\n      // #593: Turf uses ordinary splat confirmation and independent team WIPEOUT.\n      if (G.match?.mode === 'turf') return;",
      'Turf excludes arcade personal streak ribbons');
    code = replaceOnce(code,
      "      const kk = L.kind === 'blaster' ? 0 : this._kick * this._kick * (L.kind === 'splatling' ? 4 : 7);\n      const sp = clamp((+ch.spread || 0) + this._bloom * (L.kind === 'blaster' ? 5 : 2.5) + kk, 0, 90);",
      "      // #560: Game already projects the authoritative weapon cone.\n      const sp = clamp(+ch.spread || 0, 0, 90);\n      if (L.bl !== 0) { L.bl = 0; this.ret.style.setProperty('--bl', '0'); }",
      'authoritative HUD spread, no second recoil cone');
  }
  code = adaptHudSnapshots(rel, code, replaceOnce);
  code = adaptTenacity(rel, code, replaceOnce);
  if (rel !== 'src/ui/menus.js') code = adaptResultContinuation(rel, code, replaceOnce);
  code = adaptShowcaseShadow(rel, code, replaceOnce);
  code = adaptShowcaseAlpha(rel, code, replaceOnce);
  code = adaptTeamWipeout(rel, code, replaceOnce);
  code = adaptSplatlingReticle(rel, code, replaceOnce);
  code = adaptPortraitGuard(rel, code, replaceOnce);
  code = adaptIssue465(rel, code);
  code = adaptIssue481(rel, code);
  code = adaptIssue479(rel, code);
  code = adaptTexlibSource(rel, code);
  code = adaptIssue477Source(rel, code);
  code = adaptIdleSource(rel, code, replaceOnce);
  code = adaptIssue480Source(rel, code);
  code = adaptReflSkip(rel, code, replaceOnce);
  code = adaptLobbyResources(rel, code);
  code = adaptMinimapResources(rel, code);
  code = adaptUiActorLifetime(rel, code, replaceOnce);
  code = adaptLandingRigidity(rel, code);
  code = adaptMatchRetainers(rel, code, replaceOnce);
  code = adaptQualityIssue418(rel, code);
  if (rel === 'src/main.js') {
    code = "import { updateSplatGhosts } from '../patches/splatoon3/issue-284-adapter.mjs';\n" + code;
    code = replaceOnce(code, 'this.fxHooks?.update?.(worldDt);', '{ this.fxHooks?.update?.(worldDt); updateSplatGhosts(G, worldDt); }', 'ghost presentation in existing FX cadence');
  }
  code = adaptIssue483(rel, code);
  code = adaptPaintMipmaps(rel, code);
  code = patchLobbySetShowcase(rel, code);
  code = adaptSlosherEmergeGate(rel, code);
  // Issue #580 runs before the final HUD-authority pass so shared HUD anchors
  // are composed once on the finished presentation layer.
  code = adaptFinishTape(rel, code);
  code = adaptHudAuthority(rel, code);
  // Splatoon 3 HUD look composes on the finished gauge/roster markup.
  code = adaptS3HudLook(rel, code);
  code = adaptS3SquidLook(rel, code);
  code = adaptS3FaceLook(rel, code);
  if (rel === 'src/core/mobile.js') {
    code = adaptFirstTouch(rel, code);
    code = adaptTouchRelayout(rel, code);
  }
  code = adaptPlatformSource(rel, code);
  if (rel === 'src/main.js') {
    code = "import { normalizeViewSettings } from '../patches/local-quality/view-settings.mjs';\n" + code;
    code = replaceOnce(code,
      "migrateAimProfiles(loadJSON('inkwave.settings', initialGyroDefaults(DEFAULT_SETTINGS, this.mobile)), DEFAULT_SETTINGS)",
      "migrateAimProfiles(normalizeViewSettings(loadJSON('inkwave.settings', initialGyroDefaults(DEFAULT_SETTINGS, this.mobile)), DEFAULT_SETTINGS), DEFAULT_SETTINGS)",
      'finite persisted camera and mouse settings');
    code = replaceOnce(code,
      '    applyAimSettingsChange(this.settings, partial);',
      '    partial = normalizeViewSettings({ ...partial }, this.settings);\n    applyAimSettingsChange(this.settings, partial);',
      'finite live camera and mouse settings');
  }

  // #363/#367: Splatoon 3 holds the lens off the player's right even when the boom is
  // clear. The shipped term only reached that while the boom was forced short, because
  // closeK hits 0 at curDist >= 2.8, so normal follow stayed vertically centred behind the
  // crosshair. SH0 adds a persistent baseline and keeps the obstruction-driven shift at its
  // full current range at closeK = 1.
  // SH0 is deliberately modest and explicitly unquantified: Splatoon 3 publishes no shoulder
  // offset and none is pinned in this repository, so this is NOT a claimed Nintendo constant.
  // The shift stays a parallel lens+target offset, so the aim direction is unchanged; the
  // right-side wall probe, muzzle-to-target parallax, obstacle avoidance, input axes and the
  // Charger zoom profile are all untouched.
  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(code,
      "    if (this.mode !== this._prevMode || (this.mode === 'follow' && this.target !== this._prevTarget)) {\n",
      "    if (this.mode !== this._prevMode || (this.mode === 'follow' && this.target !== this._prevTarget)) {\n" +
      "      this._inkwaveCameraProbeCache = null;\n",
      'camera probe mode/target invalidation');
    code = replaceOnce(code,
      '    G.physics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe);',
      '    // #862: Physics.cameraProbe only queries the current level broadphase. Reuse its exact\n' +
      '    // result while the follow probe is effectively stationary (1 mm pivot/want-distance\n' +
      '    // tolerance and 0.001 unit-vector delta); keep a short bound for\n' +
      '    // geometry edits that preserve the Level/collection objects.\n' +
      '    const _qcPhysics = G.physics, _qcLevel = _qcPhysics.level;\n' +
      '    const _qcOld = this._inkwaveCameraProbeCache;\n' +
      '    const _qcAge = _qcOld ? _qcOld.age + (Number.isFinite(dt) ? Math.max(0, dt) : 0) : 0;\n' +
      '    const _qcPX = _qcOld ? this.pivot.x - _qcOld.px : Infinity;\n' +
      '    const _qcPY = _qcOld ? this.pivot.y - _qcOld.py : Infinity;\n' +
      '    const _qcPZ = _qcOld ? this.pivot.z - _qcOld.pz : Infinity;\n' +
      '    const _qcBX = _qcOld ? _back.x - _qcOld.bx : Infinity;\n' +
      '    const _qcBY = _qcOld ? _back.y - _qcOld.by : Infinity;\n' +
      '    const _qcBZ = _qcOld ? _back.z - _qcOld.bz : Infinity;\n' +
      '    const _qcChanged = !_qcOld || _qcOld.target !== a || _qcOld.mode !== this.mode ||\n' +
      '      _qcOld.level !== G.level || _qcOld.physics !== _qcPhysics ||\n' +
      '      _qcOld.probe !== _qcPhysics.cameraProbe || _qcOld.raycast !== _qcPhysics.raycast ||\n' +
      '      _qcOld.collisionLevel !== _qcLevel || _qcOld.blocks !== _qcLevel?.blocks ||\n' +
      '      _qcOld.hash !== _qcLevel?.hash || _qcOld.blockStamp !== _qcLevel?.blockStamp ||\n' +
      '      _qcPX * _qcPX + _qcPY * _qcPY + _qcPZ * _qcPZ > 0.000001 ||\n' +
      '      _qcBX * _qcBX + _qcBY * _qcBY + _qcBZ * _qcBZ > 0.000001 ||\n' +
      '      Math.abs(this.wantDist - _qcOld.want) > 0.001 ||\n' +
      '      (this.wantDist !== _qcOld.want &&\n' +
      '       (_qcOld.hard !== _qcOld.want || _qcOld.soft !== _qcOld.want));\n' +
      '    if (_qcChanged || _qcAge >= 0.25) {\n' +
      '      _qcPhysics.cameraProbe(this.pivot, _back, this.wantDist, 0.62, _probe);\n' +
      '      this._inkwaveCameraProbeCache = { target: a, mode: this.mode, level: G.level,\n' +
      '        physics: _qcPhysics, probe: _qcPhysics.cameraProbe, raycast: _qcPhysics.raycast,\n' +
      '        collisionLevel: _qcLevel, blocks: _qcLevel?.blocks, hash: _qcLevel?.hash,\n' +
      '        blockStamp: _qcLevel?.blockStamp, px: this.pivot.x, py: this.pivot.y, pz: this.pivot.z,\n' +
      '        bx: _back.x, by: _back.y, bz: _back.z, want: this.wantDist,\n' +
      '        hard: _probe.hard, soft: _probe.soft, floor: _probe.floor, age: 0 };\n' +
      '    } else {\n' +
      '      _qcOld.age = _qcAge;\n' +
      '      // A free probe is equal to its sampled request distance. Keep that\n' +
      '      // endpoint live when a sub-millimetre zoom step reuses the cache.\n' +
      '      _probe.hard = _qcOld.hard === _qcOld.want ? this.wantDist : _qcOld.hard;\n' +
      '      _probe.soft = _qcOld.soft === _qcOld.want ? this.wantDist : _qcOld.soft;\n' +
      '      _probe.floor = _qcOld.floor;\n' +
      '    }',
      'stationary follow-camera collision probe cache');
  }
  if (rel === 'src/core/mobile.js') return code;
  if (rel === 'src/ui/menus.js') {
    code = replaceOnce(code,
      "    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(this._refit).observe(this.el);",
      "    if (typeof ResizeObserver !== 'undefined') { this._qualityFitObserver = new ResizeObserver(this._refit); this._qualityFitObserver.observe(this.el); }",
      'menu fit observer owner');
    code = replaceOnce(code,
      '    this._refit = () => { if (!this._fitQ)',
      '    this._refit = () => { if (!this._qualityDisposed && !this._fitQ)',
      'retired menu fit guard');
    code = replaceOnce(code,
      '  dispose() {\n    cancelAnimationFrame(this._raf);\n    this.wipe.cancel();\n    this.el.remove();\n  }',
      '  dispose() {\n' +
      '    this._qualityDisposed = true;\n' +
      '    cancelAnimationFrame(this._raf); cancelAnimationFrame(this._fitQ); this._fitQ = 0;\n' +
      '    this._qualityFitObserver?.disconnect(); this._qualityFitObserver = null;\n' +
      "    window.removeEventListener('resize', this._refit);\n" +
      "    document.fonts?.removeEventListener?.('loadingdone', this._refit);\n" +
      '    safeCall(() => this._scr?.destroy?.()); this._scr = null; this._cur.targetEl = null;\n' +
      '    this.wipe.cancel();\n    this.el.remove();\n  }',
      'menu fit lifetime');
    // Keep the logical target current even when touch uses the row's own tint
    // or the screen entrance temporarily hides the floating ring.
    code = replaceOnce(code,
      '    if (!want) {\n      if (C.on)',
      '    if (!want) {\n' +
      '      if (f && f.isConnected && C.targetEl !== f) {\n' +
      '        const r = f.getBoundingClientRect(), pad = f.dataset.curPad != null ? +f.dataset.curPad : 7;\n' +
      '        C.targetEl = f;\n' +
      '        C.x.target = r.left - pad; C.y.target = r.top - pad;\n' +
      '        C.w.target = r.width + pad * 2; C.h.target = r.height + pad * 2;\n' +
      '      }\n      if (C.on)',
      'hidden cursor logical target');
    code = replaceOnce(code,
      '    C.x.target = tx; C.y.target = ty; C.w.target = tw; C.h.target = th;',
      '    C.targetEl = f;\n    C.x.target = tx; C.y.target = ty; C.w.target = tw; C.h.target = th;',
      'cursor target owner');
    return adaptResultContinuation(rel, code, replaceOnce);
  }
  if (rel === 'src/ui/menu-art.js') {
    code = replaceOnce(code,
      'export function createPreview(key, ctx = {}) {',
      'function createNativePreview(key, ctx = {}) {',
      'preview factory');
    return "import { guardPreview } from '../../patches/local-quality/menu-preview.mjs';\n" + code +
      '\nexport function createPreview(key, ctx = {}) { return guardPreview(createNativePreview(key, ctx)); }\n';
  }

  if (rel === 'patches/splatoon3/runtime/walk.mjs') {
    code = replaceOnce(code,
      'oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}',
      'oldTrack.call(this,dt,s);if(this.tread){w.vx=this.tvx;w.vz=this.tvz;}\n' +
      '    // Scalar travel speed cannot cancel when direction reverses. One owner, no second gait update.\n' +
      '    w.scalarSpeed=w.rootMotionKnown?damp(w.scalarSpeed??0,Math.hypot(w.vx,w.vz),18,dt):0;',
      'gait scalar speed');
    return replaceOnce(code,
      'const v=this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);',
      'const v=state(this).scalarSpeed??this.gv,rw=smooth(tuning.runStart,tuning.runFull,v);',
      'gait cadence source');
  }

  if (rel === 'src/world/inkShading.js') {
    return replaceOnce(code,
      '    vec3 team = mix(uTeamA, uTeamB, tm);',
      '    // Convert per-texel derivatives to the slope of a 4mm world-space film.\n' +
      '    gInkD *= uPpm * 0.004 / 1.9;\n    vec3 team = mix(uTeamA, uTeamB, tm);',
      'ink derivative units');
  }

  if (rel === 'src/world/levelMaterial.js') {
    code = replaceOnce(code,
      '    uSeeOn: { value: 0 },',
      '    uSeeOn: { value: 0 },\n    uSeeSupport: { value: new THREE.Vector4(0, 0, 0, 0) },',
      'support plane uniform');
    code = replaceOnce(code,
      '    const rt = renderer.getRenderTarget();',
      '    const n = loc?.grounded ? loc.groundN : null;\n' +
      '    if (n && Number.isFinite(n.x + n.y + n.z)) uniforms.uSeeSupport.value.set(n.x, n.y, n.z, n.dot(loc.pos));\n' +
      '    else uniforms.uSeeSupport.value.set(0, 0, 0, 0);\n' +
      '    const rt = renderer.getRenderTarget();',
      'support plane sample');
    code = replaceOnce(code,
      'uniform float uSeeFeet;',
      'uniform float uSeeFeet;\nuniform vec4 uSeeSupport;',
      'support GLSL declaration');
    code = replaceOnce(code,
      '      k *= smoothstep(dB - 0.2, dB - 0.75, dP);',
      '      k *= 1.0 - smoothstep(dB - 0.75, dB - 0.2, dP);',
      'defined depth smoothstep');
    code = replaceOnce(code,
      '      if (vWNorm.y > 0.6 && vWPos.y < feetTop) k = 0.0;',
      '      if (vWNorm.y > 0.6 && vWPos.y < feetTop) k = 0.0;\n' +
      '      // A supporting ramp is not a camera obstruction, even uphill of the feet.\n' +
      '      if (uSeeSupport.y > 0.6 && dot(vWNorm, uSeeSupport.xyz) > 0.995\n' +
      '          && abs(dot(vWPos, uSeeSupport.xyz) - uSeeSupport.w) < 0.03) k = 0.0;',
      'support ramp dithering');
    code = replaceOnce(code,
      'smoothstep(1.0, 0.8, a)',
      '(1.0 - smoothstep(0.8, 1.0, a))',
      'defined coverage smoothstep');
    return replaceOnce(code,
      'inkwave-level-v6',
      'inkwave-level-v6-quality1',
      'material program identity');
  }

  if (rel === 'src/fx/fxHooks.js') {
    code = replaceOnce(code,
      'this.fx.flickCurtain?.(_v, _dir, a.color, a.weapon?.flickSpreadDeg || 50);',
      'this.fx.flickCurtain?.(_v, _dir, a.color, a.weapon?.flickSpreadDeg || 50, rollerCurtainSources(this.G, a, this.fx));',
      'roller visual selection');
    return "import { rollerCurtainSources } from '../../patches/local-quality/roller-visual.mjs';\n" + code;
  }

  if (rel === 'src/fx/fx.js') {
    code = replaceOnce(code,
      '  flickCurtain(pos, dir, color, spreadDeg = 50) {',
      '  flickCurtain(pos, dir, color, spreadDeg = 50, sources = null) {',
      'roller curtain context');
    const before = '      this._spawnDrop(pos.x + Math.sin(a) * 0.4, pos.y + (rand() - 0.3) * 0.4, pos.z + Math.cos(a) * 0.4, Math.sin(a) * cu * sp, Math.sin(up) * sp, Math.cos(a) * cu * sp, col, sz, 1.4, 1, 1.2, sz > 0.055 ? paint : 0);';
    code = replaceOnce(code, before,
      before.replace('this._spawnDrop', 'const drop = this._spawnDrop') +
      '\n      if (sources?.length) bindRollerDrop(this, drop, sources[i % sources.length]);',
      'non-scoring spray follows real projectile');
    code = replaceOnce(code,
      '      const a = yaw + (i - 1) * spread * 0.35;',
      '      const a = yaw + (i - 1) * (sources?.length ? 0 : spread) * 0.35;',
      'vertical centre puff axis');
    const puff = 'Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB, 0.2, 0.7, 0.4, 0.3, 4);';
    code = replaceOnce(code, puff,
      'Math.sin(a) * 3, 1.0, Math.cos(a) * 3, this._colB, sources?.length ? 0.12 : 0.2, sources?.length ? 0.3 : 0.7, sources?.length ? 0.16 : 0.4, 0.3, 4);',
      'vertical puff silhouette');
    code = replaceOnce(code,
      '    const i3 = i * 3, i8 = i * 8;\n    this.dP[i3] = px;',
      '    if (this._qualityDropSource) this._qualityDropSource[i] = null;\n' +
      '    const i3 = i * 3, i8 = i * 8;\n    this.dP[i3] = px;',
      'drop recycle link reset');
    code = replaceOnce(code,
      '    const last = --this.dN;',
      '    const last = --this.dN;\n' +
      '    if (this._qualityDropSource) {\n' +
      '      this._qualityDropSource[i] = this._qualityDropSource[last];\n' +
      '      this._qualityDropGeneration[i] = this._qualityDropGeneration[last];\n' +
      '      this._qualityDropSource[last] = null;\n' +
      '    }',
      'drop compaction links');
    code = replaceOnce(code,
      '    const col = this.collider;\n    for (let i = 0; i < this.dN; i++) {\n      const i3 = i * 3, i8 = i * 8;\n      A[i8 + 1] += dt;\n      if (A[i8 + 1] >= A[i8 + 2]) { this._killDrop(i); i--; continue; }\n      const drag = 1 - 0.35 * dt;',
      '    const col = this.collider, drag = 1 - 0.35 * dt;\n    for (let i = 0; i < this.dN; i++) {\n      const i3 = i * 3, i8 = i * 8;\n      A[i8 + 1] += dt;\n      if (A[i8 + 1] >= A[i8 + 2]) { this._killDrop(i); i--; continue; }',
      'hoist droplet drag outside per-droplet loop');
    code = replaceOnce(code,
      '      const vx = Vv[i3], vy = Vv[i3 + 1], vz = Vv[i3 + 2];',
      '      const source = this._qualityDropSource?.[i];\n' +
      '      const linked = source && !source._qualityDead && source._qualityGeneration === this._qualityDropGeneration[i];\n' +
      '      const vx = linked ? source.vel.x : Vv[i3], vy = linked ? source.vel.y : Vv[i3 + 1], vz = linked ? source.vel.z : Vv[i3 + 2];',
      'roller render velocity');
    const positionLine = '      aP[i4] = P[i3]; aP[i4 + 1] = P[i3 + 1]; aP[i4 + 2] = P[i3 + 2]; aP[i4 + 3] = size * grow * fade;';
    code = replaceOnce(code, positionLine,
      '      if (linked) {\n' +
      '        const fraction = .25 + .75 * A[i8 + 5];\n' +
      '        aP[i4] = source.prev.x + (source.pos.x - source.prev.x) * fraction;\n' +
      '        aP[i4 + 1] = source.prev.y + (source.pos.y - source.prev.y) * fraction;\n' +
      '        aP[i4 + 2] = source.prev.z + (source.pos.z - source.prev.z) * fraction;\n' +
      '      } else { aP[i4] = P[i3]; aP[i4 + 1] = P[i3 + 1]; aP[i4 + 2] = P[i3 + 2]; }\n' +
      '      aP[i4 + 3] = source && !linked ? 0 : size * grow * fade;',
      'roller render position');
    code = replaceOnce(code,
      '    this.dN = 0; this.dGeo.instanceCount = 0;',
      '    this._qualityDropSource?.fill(null);\n' +
      '    if (this._qualityCurtainSources) this._qualityCurtainSources.length = 0;\n' +
      '    this.dN = 0; this.dGeo.instanceCount = 0;',
      'drop stage reset');
    return "import { bindRollerDrop } from '../../patches/local-quality/roller-visual.mjs';\n" + code;
  }

  // #678: the DeviceMotion/DeviceOrientation axis conversion was a *player-space* construction, not the
  // Splatoon 3 World Orientation mapping. Three separate defects lived in one block:
  //   1. the yaw projection dropped the screen-x gravity term gx*px, so real world yaw vanished in
  //      every rolled/landscape pose and pure roll was reported as yaw;
  //   2. the result was then scaled by a player-space 1.41 magnitude relax and capped against the
  //      local hypot(py, pz), so angular velocity ORTHOGONAL to world vertical still became camera yaw;
  //   3. pitch = px unconditionally, so pitch ignored gravity entirely and never reduced at bank.
  // The whole block becomes one world-orientation projection. The gx*px term is retained because it
  // falls out of the correct complete projection, not as a cherry-picked partial; the 1.41 relax and
  // the local magnitude cap are removed because they are precisely the player-space construction the
  // Issue rejects. Sensitivity (sens / gyroTurnDeg / _gain), inversion, every smoothing and filter
  // coefficient, _calibrate/_rrScale and the resync/dropout lifecycle below are untouched, and
  // inkwave-public/ is never edited.
  if (rel === 'src/core/gyro.js') {
    code = replaceOnce(code,
      "import { screenAngle } from './device.js';",
      "import { screenAngle as deviceScreenAngle } from './device.js';\n" +
      "import { sensorScreenAngle } from '../../patches/local-quality/screen-angle.mjs';\n" +
      'const screenAngle = () => sensorScreenAngle(globalThis, deviceScreenAngle);',
      'gyro sensor-frame screen angle');
    code = replaceOnce(code, `    const d = this._down;
    const gy = d[0] * s + d[1] * c, gz = d[2];
    const gl = Math.hypot(d[0] * c - d[1] * s, gy, gz) || 1;
    // player-space yaw: the part of the turn around real vertical, allowed to borrow from roll (±45° relax)
    const worldYaw = -(gy * py + gz * pz) / gl;
    const yawAxes = Math.hypot(py, pz);
    let yaw = Math.sign(worldYaw) * Math.min(Math.abs(worldYaw) * 1.41, yawAxes);
    let pitch = px;`, `    const d = this._down;
    const gx = d[0] * c - d[1] * s, gy = d[0] * s + d[1] * c, gz = d[2];
    const gl = Math.hypot(gx, gy, gz) || 1;
    const ux = gx / gl, uy = gy / gl, uz = gz / gl;              // unit earth-down, in screen space
    // World Orientation: one projection of the whole screen-space omega. yaw is the turn about real
    // vertical and nothing else - no player-space 1.41 magnitude borrow, no hypot(py, pz) cap, so
    // angular velocity orthogonal to gravity can no longer become camera yaw.
    let yaw = -(px * ux + py * uy + pz * uz);
    // pitch: the device pitch axis (screen-right) with its gravity component removed, i.e. the
    // world-horizontal direction nearest it. Exactly px while gravity is perpendicular to screen-right
    // (flat / upright portrait); reduced and mixed as the device banks.
    const hx = 1 - ux * ux, hy = -ux * uy, hz = -ux * uz;       // = e_x - (e_x . u) u
    const hl = Math.hypot(hx, hy, hz);
    let pitch;
    if (hl > 1e-6) pitch = (px * hx + py * hy + pz * hz) / hl;
    else {
      // Gravity lies along screen-right: the screen plane is vertical, so the device pitch axis has no
      // world-horizontal part and gravity alone cannot define the camera pitch axis. Deterministic
      // documented fallback: screen-up with gravity removed. Splatoon 3 does not publish its behaviour
      // in this band, so it stays explicitly UNQUANTIFIED and is not a Nintendo constant.
      const ex = -uy * ux, ey = 1 - uy * uy, ez = -uy * uz;
      pitch = (px * ex + py * ey + pz * ez) / (Math.hypot(ex, ey, ez) || 1);
    }`, 'gyro world-orientation axis mapping');
  }

  if (rel === 'src/core/gyro.js') {
    return "import { installGyroQuality } from '../../patches/local-quality/gyro.mjs';\n" + code +
      '\ninstallGyroQuality(Gyro, screenAngle);\n';
  }

  if (rel === 'src/game/cameraRig.js') {
    code = replaceOnce(code, `    const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);
    let shT = 0.55 * closeK * closeK * (3 - 2 * closeK);
    if (shT > 0.01 && G.physics) {
      const hr = G.physics.raycast(cam.position, _right, shT + 0.25, _hit, true);
      if (hr.hit) shT = Math.max(0, hr.dist - 0.25);
    }
    this.shoulder = damp(this.shoulder || 0, shT, 8, dt);
    if (this.shoulder > 1e-3) cam.position.addScaledVector(_right, this.shoulder);`, `    const closeK = clamp((2.8 - this.curDist) / 1.8, 0, 1);
    const SH0 = 0.28;   // persistent right-shoulder framing; not a pinned S3 value
    let shT = SH0 + (0.55 - SH0) * closeK * closeK * (3 - 2 * closeK);
    let shMax = Infinity;
    if (shT > 0.01 && G.physics) {
      const hr = G.physics.raycast(cam.position, _right, Math.max(shT, this.shoulder || 0) + 0.25, _hit, true);
      if (hr.hit) { shMax = Math.max(0, hr.dist - 0.25); shT = Math.min(shT, shMax); }
    }
    this.shoulder = damp(this.shoulder || 0, shT, 8, dt);
    if (this.shoulder > shMax) this.shoulder = shMax;
    if (this.shoulder > 1e-3) cam.position.addScaledVector(_right, this.shoulder);`, 'camera persistent shoulder framing and wall-transition clearance');
  }

  if (rel === 'src/game/actor.js') {
    code = replaceOnce(code, '    ch.update(dt, a);',
      '    a.remote = this.remote === true;\n    ch.update(dt, a);',
      'carry actor authority into Character presentation budget');
  }

  if (rel === 'src/game/character.js') {
    // Offline bot projectiles read weapon.muzzle from the live rig. Preserve
    // the pelvis/torso/arm/weapon transform path every simulation tick, but
    // skip leg joint IK and the decorative tail which cannot affect that rig.
    code = replaceOnce(code,
      '    const hyw = P[HIPS + 1];\n    for (let i = 0; i < 2; i++) {\n      const leg = i === 0 ? this.limbs.legL : this.limbs.legR, sd = i === 0 ? 1 : -1;',
      '    const hyw = P[HIPS + 1];\n    if (!this._oobPoseTailSkip || this.replant || !this.feetValid) for (let i = 0; i < 2; i++) {\n      const leg = i === 0 ? this.limbs.legL : this.limbs.legR, sd = i === 0 ? 1 : -1;',
      'skip stable offscreen leg-joint IK while retaining replant transitions');
    code = replaceOnce(code,
      '    const lv = this.lifeLv;\n    // ---- face',
      '    if (this._oobPoseTailSkip && !this.replant && this.feetValid) {\n      this._headQW.copy(B.head.quaternion); this._headSet = true;\n      for (const f of this.feet) f.dispOK = false;\n      this._oobPoseTailSkipped = true;\n      return; // weapon rig is current; rebuild display-only state before the next replant.\n    }\n    const lv = this.lifeLv;\n    // ---- face',
      'skip stable offscreen decorative pose tail after authoritative weapon rig');
  }

  return code;
}

export function qualityIdentity() {
  return Object.fromEntries(IDENTITY_FILES.map(file => [file,
    crypto.createHash('sha256').update(fs.readFileSync(new URL(file, import.meta.url))).digest('hex')]));
}
