// Issue #460 narrow build-only adapter (visible Super Jump arrival countdown
// gauge: real arc geometry + name/countdown label rendered every frame at the
// committed landing destination, owner/remote parity). Composed after the
// shared splatoon3 / touch-layout / reliability / local-quality adapters;
// never edits the shared dispatcher adapter.mjs or profile.json in place.
// Presentation-only: no wire protocol, flight timing, speed, collision, paint
// or damage change — only the existing flight state/event is read.
import { ownerJumpProgress, remoteJumpProgress, jumpMarkerSnapshot, liveJumpMarker } from './issue-460-marker.mjs';

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-460 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue460Source(rel, code) {
  if (rel === 'src/game/actor.js') code = adaptIssue460Actor(code);
  if (rel === 'src/net/netmatch.js') code = adaptIssue460Net(code);
  return code;
}

function adaptIssue460Actor(code) {
  code = replaceOnce(code,
    `import { WeaponRunner } from './weapons.js';`,
    `import { WeaponRunner } from './weapons.js';\nimport { ownerJumpProgress, jumpMarkerSnapshot, liveJumpMarker } from '../../patches/splatoon3/issue-460-marker.mjs';\nimport { renderJumpGauge460, clearJumpGauge460 } from '../../patches/splatoon3/issue-460-gauge.mjs';`,
    'issue-460 marker + gauge helpers');
  code = replaceOnce(code,
    `emit('superjump', { actor: this, phase: 'flight', to: s.to.clone() });`,
    `emit('superjump', { actor: this, phase: 'flight', to: s.to.clone(), dur: s.dur });`,
    'issue-460 flight event duration');
  // every flight frame: snapshot + actual gauge geometry/label at s.to
  code = replaceOnce(code,
    `    if (s.phase === 'flight') {`,
    `    if (s.phase === 'flight') {\n      { const m460 = liveJumpMarker(true, jumpMarkerSnapshot({ progress: ownerJumpProgress(s), dur: s.dur, jumper: this.name })); this.s3 ||= {}; this.s3.jumpMarker460 = m460; renderJumpGauge460(G, this, m460, s.to, this.color, THREE); }`,
    'issue-460 owner gauge render');
  code = replaceOnce(code,
    `      if (k >= 1) {`,
    `      if (k >= 1) {\n        if (this.s3) this.s3.jumpMarker460 = null;\n        clearJumpGauge460(this);`,
    'issue-460 owner gauge clear on land');
  const cancelAnchor = `        if (isActor && !tgt.alive) { this.superJumpState = null; return; }`;
  if (code.includes(cancelAnchor)) code = replaceOnce(code,
    cancelAnchor,
    `        if (isActor && !tgt.alive) { if (this.s3) this.s3.jumpMarker460 = null; clearJumpGauge460(this); this.superJumpState = null; return; }`,
    'issue-460 owner gauge clear on cancel');
  else if (!code.includes('Destination was committed at admission; target motion/death cannot retarget it.'))
    throw new Error('INKWAVE issue-460 patch conflict (issue-460 owner gauge clear on cancel): no legacy cancel or committed-destination owner');
  code = replaceOnce(code,
    `    this.character.setVisible(false);\n    if (this.isLocal) rumble(this, 0.8, 0.6, 260);`,
    `    if (this.s3) this.s3.jumpMarker460 = null;\n    clearJumpGauge460(this);\n    this.character.setVisible(false);\n    if (this.isLocal) rumble(this, 0.8, 0.6, 260);`,
    'issue-460 owner gauge clear on splat');
  const plainResetJump = `    this.superJumpState = null;\n    this.yawVel = 0; this._faceTarget = null;`;
  const composedResetJump = `    this.superJumpState = null; this.superJumpGround = null;\n    clearPendingLethal(this);\n    this.yawVel = 0; this._faceTarget = null;`;
  const resetJumpAnchor = code.includes(composedResetJump) ? composedResetJump : plainResetJump;
  const resetJumpTarget = `    if (this.s3) this.s3.jumpMarker460 = null;\n    clearJumpGauge460(this);\n` + resetJumpAnchor;
  code = replaceOnce(code, resetJumpAnchor, resetJumpTarget, 'issue-460 owner gauge clear on reset/respawn');
  return code;
}

function adaptIssue460Net(code) {
  code = replaceOnce(code,
    `import { BotBrain } from '../game/bots.js';`,
    `import { BotBrain } from '../game/bots.js';\nimport { remoteJumpProgress, jumpMarkerSnapshot, liveJumpMarker } from '../../patches/splatoon3/issue-460-marker.mjs';\nimport { renderJumpGauge460, clearJumpGauge460 } from '../../patches/splatoon3/issue-460-gauge.mjs';`,
    'issue-460 remote marker + gauge helpers');
  code = replaceOnce(code,
    `    if (!a.net) a.net = { buf: [], err: new THREE.Vector3(), tp: -1, lastRaw: null, rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0, loops: {}, sjTo: null, sjRing: 0 };`,
    `    if (!a.net) a.net = { buf: [], err: new THREE.Vector3(), tp: -1, lastRaw: null, rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0, loops: {}, sjTo: null, sjRing: 0, sjDur460: 0, sjT460: 0, sjMarker460: null };`,
    'issue-460 remote gauge clock fields');
  // off flight (charge/land/respawn flag clear): collapse clock + marker + gauge
  code = replaceOnce(code,
    `    if (a.superJumpState) a.superJumpState.phase = f & F.sjFlight ? 'flight' : 'charge';`,
    `    if (a.superJumpState) a.superJumpState.phase = f & F.sjFlight ? 'flight' : 'charge';\n    if (!a.superJumpState || a.superJumpState.phase !== 'flight') { n.sjT460 = 0; n.sjDur460 = 0; n.sjMarker460 = null; clearJumpGauge460(a); }`,
    'issue-460 remote gauge clear off flight');
  // every flight frame: snapshot from the event-seeded clock + gauge at n.sjTo
  code = replaceOnce(code,
    `    if (a.superJumpState?.phase === 'flight' && n.sjTo) {\n      n.sjRing += dt;`,
    `    if (a.superJumpState?.phase !== 'flight' && n.sjMarker460) { n.sjMarker460 = null; n.sjTo = null; n.sjDur460 = 0; n.sjT460 = 0; clearJumpGauge460(a); }\n    if (a.superJumpState?.phase === 'flight' && n.sjTo) {\n      n.sjT460 = (Number(n.sjT460) || 0) + dt;\n      n.sjMarker460 = liveJumpMarker(true, jumpMarkerSnapshot({ progress: remoteJumpProgress(n.sjT460, n.sjDur460), dur: n.sjDur460, jumper: a.name }));\n      renderJumpGauge460(G, a, n.sjMarker460, n.sjTo, a.color, THREE);\n      n.sjRing += dt;`,
    'issue-460 remote gauge render');
  code = replaceOnce(code,
    `        if (e.phase === 'flight') { a.net.sjTo = e.to ? e.to.clone() : null; G.fx?.burst(`,
    `        if (e.phase === 'flight') { const sameFlight460 = a.net.sjTo && e.to && a.net.sjTo.equals(e.to); a.net.sjTo = e.to ? e.to.clone() : null; if (!sameFlight460) { a.net.sjDur460 = Number(e.dur) > 0 ? Number(e.dur) : 0; a.net.sjT460 = 0; a.net.sjMarker460 = null; clearJumpGauge460(a); } G.fx?.burst(`,
    'issue-460 remote flight duration seed');
  code = replaceOnce(code,
    `      case 'superjump:land': a.net.sjTo = null; G.fx?.burst(`,
    `      case 'superjump:land': a.net.sjTo = null; a.net.sjDur460 = 0; a.net.sjT460 = 0; a.net.sjMarker460 = null; clearJumpGauge460(a); G.fx?.burst(`,
    'issue-460 remote gauge clear on land');
  const plainRemoteSplat = `    victim.specialActive = null; victim.superJumpState = null;`;
  const syncedRemoteSplat = `    victim.specialActive = null; victim.superJumpState = null;\n    delete victim.s3SpecialCost;\n    victim.s3SpecialReady = false;`;
  const remoteSplatAnchor = code.includes(syncedRemoteSplat) ? syncedRemoteSplat : plainRemoteSplat;
  const remoteSplatTarget = remoteSplatAnchor + `\n    if (victim.net) { victim.net.sjTo = null; victim.net.sjDur460 = 0; victim.net.sjT460 = 0; victim.net.sjMarker460 = null; } clearJumpGauge460(victim);`;
  code = replaceOnce(code, remoteSplatAnchor, remoteSplatTarget, 'issue-460 remote gauge clear on splat');
  return code;
}

