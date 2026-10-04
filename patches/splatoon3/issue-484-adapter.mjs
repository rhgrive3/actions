// Issue #484: Online HUD loses Special Charge Up readiness on remote clients
// because gear-adjusted special cost is not replicated.
//
// Root Cause:
// `patches/splatoon3/runtime/gear.mjs` lowers the actor's effective special threshold:
// `a.weapon.specialCost /= m.specialCharge ?? 1;` (e.g. 180p -> 165p with 10 AP).
// However, network actor snapshot (`packActor`) only serialized absolute points `Math.round(a.special)`
// and did not synchronize the effective special threshold or replicate authoritative `specialReady` state.
// The remote proxy actor retained the base weapon cost (180p) and evaluated `specialReady()` as
// `a.special >= 180`, which was never satisfied while the owner capped its gauge at 165p.
// Consequently, the remote HUD roster icon never displayed the special-ready state for teammates/opponents.
//
// Resolution:
// 1. In `netmatch.js`:
//    - Allocate net flag `F.specialReady = 1048576` (1 << 20)
//    - In `packActor`, replicate `F.specialReady` and append authoritative effective `specialCost` as s[21]
//    - In `unpackActor`, parse `spCost: s[21]`
//    - In `blankSample`, default `spCost: 180`
//    - In `hermite`, propagate `spCost`
//    - In `applyRemote`, apply synchronized `spCost` to `a.weapon.specialCost` and set `a.s3SpecialReady = !!(f & F.specialReady)`
//    - In `_adopt`, clean up `s3SpecialReady`
//    - In `_remoteSplat`, reset `victim.s3SpecialReady = false`
//    - Export `packActor` and `unpackActor` for native verification
// 2. In `actor.js`:
//    - Update `specialCost()` to use `this.s3SpecialCost ?? this.weapon.specialCost`
//    - Update `specialReady()` to require `this.alive` and respect authoritative `this.s3SpecialReady` on remote proxies
//    - Tolerate gear curve division float precision (-0.01) so integer turf points at threshold (e.g. 165p) trigger ready

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

  // 3. Append effective specialCost to packActor return tuple
  code = replaceOnce(
    code,
    'Math.round(a.hp), Math.round(a.ink), Math.round(a.special), r2(wr.streaming ? wr.burstFrac : wr.charge), Math.round(a.stats.turf), a.netTp || 0,\n    n ? r2(n.x) : 0, n ? r2(n.y) : 0, n ? r2(n.z) : 0, r2(wr.lockT || 0)];',
    'Math.round(a.hp), Math.round(a.ink), Math.round(a.special), r2(wr.streaming ? wr.burstFrac : wr.charge), Math.round(a.stats.turf), a.netTp || 0,\n    n ? r2(n.x) : 0, n ? r2(n.y) : 0, n ? r2(n.z) : 0, r2(wr.lockT || 0), Math.round(a.specialCost ? a.specialCost() : (a.weapon?.specialCost || 180))];',
    'netmatch packActor specialCost payload'
  );

  // 4. Parse spCost in unpackActor
  code = replaceOnce(
    code,
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20] };\n}',
    'function unpackActor(s, ts) {\n  return { t: ts, x: s[1], y: s[2], z: s[3], vx: s[4], vy: s[5], vz: s[6], yaw: s[7], aimYaw: s[8], aimPitch: s[9], f: s[10], hp: s[11], ink: s[12], sp: s[13], ch: s[14], turf: s[15], tp: s[16], wx: s[17], wy: s[18], wz: s[19], lock: s[20], spCost: s[21] };\n}',
    'netmatch unpackActor spCost'
  );

  // 5. Default spCost in blankSample
  code = replaceOnce(
    code,
    'function blankSample() { return { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0, f: 0, hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, tp: 0, wx: 0, wy: 0, wz: 1, lock: 0 }; }',
    'function blankSample() { return { t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, aimYaw: 0, aimPitch: 0, f: 0, hp: 100, ink: 100, sp: 0, ch: 0, turf: 0, tp: 0, wx: 0, wy: 0, wz: 1, lock: 0, spCost: 180 }; }',
    'netmatch blankSample spCost'
  );

  // 6. Propagate spCost in hermite
  code = replaceOnce(
    code,
    '  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  return o;',
    '  o.hp = u < 0.5 ? a.hp : b.hp; o.ink = a.ink + (b.ink - a.ink) * u;\n  if (b.spCost !== undefined) o.spCost = b.spCost;\n  return o;',
    'netmatch hermite spCost'
  );

  // 7. Apply spCost and s3SpecialReady in applyRemote
  code = replaceOnce(
    code,
    '    a.hp = S.hp; a.ink = S.ink; a.special = S.sp;\n    a.invuln = f & F.invuln ? 0.1 : 0;',
    '    a.hp = S.hp; a.ink = S.ink; a.special = S.sp;\n    if (S.spCost !== undefined && S.spCost > 0) {\n      a.s3SpecialCost = S.spCost;\n      if (a.weapon) a.weapon.specialCost = S.spCost;\n    }\n    a.s3SpecialReady = !!(f & F.specialReady);\n    a.invuln = f & F.invuln ? 0.1 : 0;',
    'netmatch applyRemote spCost and specialReady'
  );

  // 8. Clean up s3SpecialReady in _adopt
  code = replaceOnce(
    code,
    '    a.weaponRunner.reset();\n    a.superJumpState = null; a.specialActive = null;',
    '    a.weaponRunner.reset();\n    delete a.s3SpecialReady;\n    a.superJumpState = null; a.specialActive = null;',
    'netmatch adopt s3SpecialReady cleanup'
  );

  // 9. Reset s3SpecialReady in _remoteSplat
  code = replaceOnce(
    code,
    '    victim.specialActive = null; victim.superJumpState = null;',
    '    victim.specialActive = null; victim.superJumpState = null; victim.s3SpecialReady = false;',
    'netmatch remoteSplat s3SpecialReady reset'
  );

  // 10. Export packActor and unpackActor for native verification
  code = replaceOnce(
    code,
    'export { F as NET_FLAGS, WEAPONS as _W };',
    'export { F as NET_FLAGS, WEAPONS as _W, packActor, unpackActor };',
    'netmatch export packing helpers'
  );

  return code;
}

export function adaptIssue484Actor(code) {
  // Update specialCost and specialReady on Actor
  code = replaceOnce(
    code,
    '  specialCost() { return this.weapon.specialCost; }\n  specialFrac() { return clamp(this.special / this.specialCost(), 0, 1); }\n  specialReady() { return this.special >= this.specialCost() && !this.specialActive; }',
    '  specialCost() { return this.s3SpecialCost ?? this.weapon.specialCost; }\n  specialFrac() { return clamp(this.special / this.specialCost(), 0, 1); }\n  specialReady() {\n    if (!this.alive) return false;\n    if (this.remote && this.s3SpecialReady !== undefined) {\n      return this.s3SpecialReady && !this.specialActive;\n    }\n    return (this.special >= this.specialCost() - 0.01) && !this.specialActive;\n  }',
    'actor specialCost and specialReady sync'
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
