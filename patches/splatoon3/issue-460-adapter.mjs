// Issue #460 narrow build-only adapter (presentation-only Super Jump
// arrival countdown gauge). Composed after the shared splatoon3 /
// touch-layout / reliability / local-quality adapters; never edits the
// shared dispatcher adapter.mjs or profile.json in place.
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
    `import { WeaponRunner } from './weapons.js';\nimport { ownerJumpProgress, jumpMarkerSnapshot, liveJumpMarker } from '../../patches/splatoon3/issue-460-marker.mjs';`,
    'issue-460 marker helpers');
  code = replaceOnce(code,
    `emit('superjump', { actor: this, phase: 'flight', to: s.to.clone() });`,
    `emit('superjump', { actor: this, phase: 'flight', to: s.to.clone(), dur: s.dur });`,
    'issue-460 flight event duration');
  code = replaceOnce(code,
    `if (s.marker > 0.12) { s.marker = 0; G.fx?.ring(_v2.copy(s.to).setY(s.to.y + 0.05), _v.set(0, 1, 0), this.color, { radius: 1.6, life: 0.5 }); }`,
    `if (s.marker > 0.12) { s.marker = 0; const p460 = ownerJumpProgress(s); const m460 = liveJumpMarker(s.phase === 'flight', jumpMarkerSnapshot({ progress: p460, dur: s.dur, jumper: this.name })); this.s3 ||= {}; this.s3.jumpMarker460 = m460; G.fx?.ring(_v2.copy(s.to).setY(s.to.y + 0.05), _v.set(0, 1, 0), this.color, { radius: 1.6, life: 0.5, marker: m460 }); }`,
    'issue-460 owner marker snapshot');
  code = replaceOnce(code,
    `      if (k >= 1) {\n        this.superJumpState = null;`,
    `      if (k >= 1) {\n        if (this.s3) this.s3.jumpMarker460 = null;\n        this.superJumpState = null;`,
    'issue-460 owner marker clear on land');
  code = replaceOnce(code,
    `    this.superJumpState = null;\n    this.yawVel`,
    `    if (this.s3) this.s3.jumpMarker460 = null;\n    this.superJumpState = null;\n    this.yawVel`,
    'issue-460 owner marker clear on reset');
  return code;
}

function adaptIssue460Net(code) {
  code = replaceOnce(code,
    `import { BotBrain } from '../game/bots.js';`,
    `import { BotBrain } from '../game/bots.js';\nimport { remoteJumpProgress, jumpMarkerSnapshot, liveJumpMarker } from '../../patches/splatoon3/issue-460-marker.mjs';`,
    'issue-460 remote marker helpers');
  code = replaceOnce(code,
    `    if (!a.net) a.net = { buf: [], err: new THREE.Vector3(), tp: -1, lastRaw: null, rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0, loops: {}, sjTo: null, sjRing: 0 };`,
    `    if (!a.net) a.net = { buf: [], err: new THREE.Vector3(), tp: -1, lastRaw: null, rendered: new THREE.Vector3(), has: false, prevGrounded: true, prevVy: 0, yawPrev: 0, loops: {}, sjTo: null, sjRing: 0, sjDur460: 0, sjT460: 0, sjMarker460: null };`,
    'issue-460 remote marker clock fields');
  code = replaceOnce(code,
    `    if (a.superJumpState) a.superJumpState.phase = f & F.sjFlight ? 'flight' : 'charge';`,
    `    if (a.superJumpState) a.superJumpState.phase = f & F.sjFlight ? 'flight' : 'charge';\n    if (!a.superJumpState || a.superJumpState.phase !== 'flight') { n.sjT460 = 0; n.sjMarker460 = null; }`,
    'issue-460 remote marker clear off flight');
  code = replaceOnce(code,
    `    if (a.superJumpState?.phase === 'flight' && n.sjTo) {\n      n.sjRing += dt;`,
    `    if (a.superJumpState?.phase === 'flight' && n.sjTo) {\n      n.sjT460 = (Number(n.sjT460) || 0) + dt;\n      n.sjRing += dt;`,
    'issue-460 remote marker clock advance');
  code = replaceOnce(code,
    `      if (n.sjRing > 0.12) { n.sjRing = 0; G.fx?.ring(_v2.copy(n.sjTo).setY(n.sjTo.y + 0.05), UPV, a.color, { radius: 1.6, life: 0.5 }); }`,
    `      const p460 = remoteJumpProgress(n.sjT460, n.sjDur460); n.sjMarker460 = liveJumpMarker(true, jumpMarkerSnapshot({ progress: p460, dur: n.sjDur460, jumper: a.name }));\n      if (n.sjRing > 0.12) { n.sjRing = 0; G.fx?.ring(_v2.copy(n.sjTo).setY(n.sjTo.y + 0.05), UPV, a.color, { radius: 1.6, life: 0.5, marker: n.sjMarker460 }); }`,
    'issue-460 remote marker progress');
  code = replaceOnce(code,
    `        if (e.phase === 'flight') { a.net.sjTo = e.to ? e.to.clone() : null; G.fx?.burst(_v2.copy(a.pos), UPV, a.color, { count: 16, speed: 6, size: 0.1 }); }`,
    `        if (e.phase === 'flight') { a.net.sjTo = e.to ? e.to.clone() : null; a.net.sjDur460 = Number(e.dur) > 0 ? Number(e.dur) : 0; a.net.sjT460 = 0; a.net.sjMarker460 = null; G.fx?.burst(_v2.copy(a.pos), UPV, a.color, { count: 16, speed: 6, size: 0.1 }); }`,
    'issue-460 remote flight duration seed');
  code = replaceOnce(code,
    `      case 'superjump:land': a.net.sjTo = null; G.fx?.burst(e.pos || a.pos, UPV, a.color, { count: 14, speed: 5, size: 0.09 }); break;`,
    `      case 'superjump:land': a.net.sjTo = null; a.net.sjDur460 = 0; a.net.sjT460 = 0; a.net.sjMarker460 = null; G.fx?.burst(e.pos || a.pos, UPV, a.color, { count: 14, speed: 5, size: 0.09 }); break;`,
    'issue-460 remote marker clear on land');
  code = replaceOnce(code,
    `    victim.specialActive = null; victim.superJumpState = null;`,
    `    victim.specialActive = null; victim.superJumpState = null; if (victim.net) { victim.net.sjTo = null; victim.net.sjDur460 = 0; victim.net.sjT460 = 0; victim.net.sjMarker460 = null; }`,
    'issue-460 remote marker clear on splat');
  return code;
}

