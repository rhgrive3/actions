// Issue #484: Online HUD loses Special Charge Up readiness on remote clients
// because gear-adjusted special cost is not replicated.
//
// Architectural Constraints:
// 1. Effective cost and readiness are presentation data for remote proxies only.
//    Never overwrite authoritative `a.weapon.specialCost` in `applyRemote` (it feeds gameplay
//    and can survive host adoption).
// 2. Keep cost override strictly remote: local and adopted actors ignore presentation overrides.
//    Remove any local readiness -0.01 epsilon: exact native authority condition must remain.
// 3. Preserve finite owner cost exactly: do not Math.round effective cost (e.g. 180 / 1.3 = 138.4615
//    is legitimate; rounding changes the gauge fraction). Points tuple stays native-rounded.
// 4. Legacy 21-field samples without appended cost must fall back to native readiness, not force false.
// 5. Hermite sampling aligns discrete cost with earlier snapshot flags to prevent future cost leaking early.
// 6. No synthetic pack/unpack exports solely for tests: production exports remain untouched.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-484 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue484Net(code) {
  // 1. Add specialReady to network flags F
  code = replaceOnce(
    code,
    '  invuln: 262144, enemy: 524288,',
    '  invuln: 262144, enemy: 524288, specialReady: 1048576,',
    'netmatch F specialReady flag'
  );

  // 2. Replicate specialReady flag in packActor
  code = replaceOnce(
    code,
    '  if (a.invuln > 0) f |= F.invuln;\n  if (a.onEnemy) f |= F.enemy;',
    '  if (a.invuln > 0) f |= F.invuln;\n  if (a.onEnemy) f |= F.enemy;\n  if (a.specialReady?.()) f |= F.specialReady;',
    'netmatch packActor specialReady flag'
  );

  // 3. Append unrounded effective specialCost to packActor return tuple (preserves finite owner float)
  code = replaceOnce(
    code,
    'Math.round(a.hp), Math.round(a.ink), Math.round(a.special), r2(wr.streaming ? wr.burstFrac : wr.charge), Math.round(a.stats.turf), a.netTp || 0,\n    n ? r2(n.x) : 0, n ? r2(n.y) : 0, n ? r2(n.z) : 0, r2(wr.lockT || 0)];',
    'Math.round(a.hp), Math.round(a.ink), Math.round(a.special), r2(wr.streaming ? wr.burstFrac : wr.charge), Math.round(a.stats.turf), a.netTp || 0,\n    n ? r2(n.x) : 0, n ? r2(n.y) : 0, n ? r2(n.z) : 0, r2(wr.lockT || 0), (typeof a.specialCost === \'function\' ? a.specialCost() : (a.weapon?.specialCost || 180))];',
    'netmatch packActor specialCost payload'
  );

  // 4. Parse spCost in unpackActor (s[21] undefined for legacy 21-element packets)
  code = replaceOnce(
    code,
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20] };\n}',
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20], spCost: s[21] };\n}',
    'netmatch unpackActor spCost'
  );

  // 5. In hermite, align spCost with earlier snapshot to prevent future cost leaking early
  code = replaceOnce(
    code,
    '  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  return o;',
    '  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  o.spCost = a.spCost;\n  return o;',
    'netmatch hermite spCost alignment'
  );

  // 6. In applyRemote, strictly validate finite positive numeric spCost and presentation readiness.
  // Never mutate a.weapon.specialCost. On legacy or invalid samples, delete presentation overrides to fall back to native.
  code = replaceOnce(
    code,
    '    a.hp = S.hp; a.ink = S.ink; a.special = S.sp;\n    a.invuln = f & F.invuln ? 0.1 : 0;',
    '    a.hp = S.hp; a.ink = S.ink; a.special = S.sp;\n    if (typeof S.spCost === \'number\' && Number.isFinite(S.spCost) && S.spCost > 0) {\n      a.s3SpecialCost = S.spCost;\n      a.s3SpecialReady = !!(f & F.specialReady);\n    } else {\n      delete a.s3SpecialCost;\n      delete a.s3SpecialReady;\n    }\n    a.invuln = f & F.invuln ? 0.1 : 0;',
    'netmatch applyRemote spCost and specialReady'
  );

  // 7. Clean up presentation overrides on host adoption (_adopt)
  code = replaceOnce(
    code,
    '    a.weaponRunner.reset();\n    a.superJumpState = null; a.specialActive = null;',
    '    a.weaponRunner.reset();\n    delete a.s3SpecialCost;\n    delete a.s3SpecialReady;\n    a.superJumpState = null; a.specialActive = null;',
    'netmatch adopt s3SpecialReady cleanup'
  );

  // 8. Reset s3SpecialReady in _remoteSplat
  code = replaceOnce(
    code,
    '    victim.specialActive = null; victim.superJumpState = null;',
    '    victim.specialActive = null; victim.superJumpState = null;\n    delete victim.s3SpecialReady;',
    'netmatch remoteSplat s3SpecialReady reset'
  );

  return code;
}

export function adaptIssue484Actor(code) {
  // 1. In reset(), clear presentation overrides
  code = replaceOnce(
    code,
    '  reset() {\n    this.alive = true;\n    this.hp = PLAYER.hp;',
    '  reset() {\n    this.alive = true;\n    delete this.s3SpecialCost;\n    delete this.s3SpecialReady;\n    this.hp = PLAYER.hp;',
    'actor reset cleanup'
  );

  // 2. In splat(), clear presentation readiness
  code = replaceOnce(
    code,
    '    this.special *= 0.5;\n    this.specialActive = null;\n    this.climbing = false;',
    '    this.special *= 0.5;\n    this.specialActive = null;\n    delete this.s3SpecialReady;\n    this.climbing = false;',
    'actor splat cleanup'
  );

  // 3. Update specialCost and specialReady:
  // Presentation overrides apply ONLY to remote actors with valid data.
  // Local and adopted actors always use weapon.specialCost.
  // Exact native readiness condition (no -0.01 epsilon) preserved.
  // Absence of valid remote readiness falls back to native readiness.
  code = replaceOnce(
    code,
    '  specialCost() { return this.weapon.specialCost; }\n  specialFrac() { return clamp(this.special / this.specialCost(), 0, 1); }\n  specialReady() { return this.special >= this.specialCost() && !this.specialActive; }',
    '  specialCost() {\n    if (this.remote && typeof this.s3SpecialCost === \'number\' && Number.isFinite(this.s3SpecialCost) && this.s3SpecialCost > 0) {\n      return this.s3SpecialCost;\n    }\n    return this.weapon.specialCost;\n  }\n  specialFrac() { return clamp(this.special / this.specialCost(), 0, 1); }\n  specialReady() {\n    if (!this.alive) return false;\n    if (this.remote && this.s3SpecialReady !== undefined) {\n      return this.s3SpecialReady && !this.specialActive;\n    }\n    return this.special >= this.specialCost() && !this.specialActive;\n  }',
    'actor specialCost and specialReady presentation sync'
  );

  return code;
}

export function adaptIssue484(rel, code) {
  const normalized = rel.replace(/^inkwave-public\//, '');
  if (normalized === 'src/game/actor.js') return adaptIssue484Actor(code);
  if (normalized === 'src/net/netmatch.js') return adaptIssue484Net(code);
  return code;
}

export const adaptIssue484Source = adaptIssue484;
