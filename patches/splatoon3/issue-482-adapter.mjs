// Issue #482 — Separate attacker recency tracking from enemy-ink HP recovery suppression.
// Splatoon 3 Ver. 11.3.0 invariant: enemy-ground-ink contact is not an attributable hit
// and must never revive an expired attacker (>4s) into kill/assist credit for a later water death.
//
// In unpatched INKWAVE, `a.lastDamage` represents both:
// 1) elapsed time since last attributable damage event, and
// 2) elapsed/suppressed time for HP recovery delay while touching enemy ink.
// When an actor touches enemy ink, `resources.mjs` resets/clamps `a.lastDamage` (to 0.4s or 0s),
// while leaving `a.lastAttacker` unchanged. If the actor falls into water, the water-death check
// `this.lastDamage < 4 ? this.lastAttacker : null` treated the expired attacker as recent again.
//
// This build-only adapter introduces a dedicated `lastAttackerHitAge` clock:
// - initialized to 99 (expired)
// - reset to 0 ONLY on attributable damage (`damage(amount, attacker)`)
// - advanced by `dt` in `Actor.update(dt)` and `NetMatch.applyRemote(actor, dt)`
// - cleared on respawn (`lastAttacker = null`, `lastAttackerHitAge = 99`)
// - water death checks `(this.lastAttacker && (this.lastAttackerHitAge ?? this.lastDamage) < 4) ? this.lastAttacker : null`
// - HP recovery suppression continues to use `lastDamage` without regression.

export function replaceOnce(code, before, after, label) {
  const at = code.indexOf(before);
  if (at < 0 || code.indexOf(before, at + before.length) !== -1) {
    throw new Error(`INKWAVE issue-482 patch conflict (${label}): expected exactly one connection`);
  }
  return code.slice(0, at) + after + code.slice(at + before.length);
}

export function adaptIssue482Actor(code) {
  // 1. Initialize dedicated lastAttackerHitAge in native reset()
  code = replaceOnce(
    code,
    'this.lastAttacker = null;',
    'this.lastAttacker = null; this.lastAttackerHitAge = 99;',
    'actor lastAttackerHitAge init'
  );

  // 2. Refresh lastAttackerHitAge ONLY on attributable damage
  code = replaceOnce(
    code,
    'if (attacker) this.lastAttacker = attacker;',
    'if (attacker) { this.lastAttacker = attacker; this.lastAttackerHitAge = 0; }',
    'actor attributable damage hit age reset'
  );

  // 3. Advance lastAttackerHitAge with dt in Actor.update(dt)
  code = replaceOnce(
    code,
    'this.lastDamage += dt; this.lastFire += dt; this.landT += dt; this.kidT += dt;',
    'this.lastDamage += dt; this.lastFire += dt; this.landT += dt; this.kidT += dt;\n    this.lastAttackerHitAge = (this.lastAttackerHitAge ?? 99) + dt;',
    'actor lastAttackerHitAge advance'
  );

  // 4. Reset lastAttacker and lastAttackerHitAge on respawn
  code = replaceOnce(
    code,
    'this.spawnAt(p, yaw);\n    this.netTp = (this.netTp || 0) + 1;',
    'this.spawnAt(p, yaw);\n    this.lastAttacker = null; this.lastAttackerHitAge = 99;\n    this.netTp = (this.netTp || 0) + 1;',
    'actor respawn attacker clear'
  );

  // 5. Water death attribution checks attributable hit age rather than recovery-timer lastDamage
  code = replaceOnce(
    code,
    "this.splat(this.lastDamage < 4 ? this.lastAttacker : null, 'water');",
    "this.splat((this.lastAttacker && (this.lastAttackerHitAge ?? this.lastDamage) < 4) ? this.lastAttacker : null, 'water');",
    'actor water death attribution'
  );

  return code;
}

export function adaptIssue482Net(code) {
  // Advance lastAttackerHitAge on remote proxies
  code = replaceOnce(
    code,
    'n.prevGrounded = a.grounded; n.prevVy = a.vel.y;\n    a.landT += dt; a.lastDamage += dt;',
    'n.prevGrounded = a.grounded; n.prevVy = a.vel.y;\n    a.landT += dt; a.lastDamage += dt; a.lastAttackerHitAge = (a.lastAttackerHitAge ?? 99) + dt;',
    'netmatch remote lastAttackerHitAge advance'
  );

  // Extend the unique respawn tail, preserving Super Jump and network-auth resets.
  // Do not replace the complete method: other owners prepend their retirement.
  code = replaceOnce(
    code,
    '    a.net.spawnPending = true;\n  }',
    '    a.net.spawnPending = true;\n    a.lastAttacker = null; a.lastAttackerHitAge = 99;\n  }',
    'netmatch remote respawn attacker clear'
  );

  return code;
}

export function adaptIssue482(rel, code) {
  if (rel === 'src/game/actor.js') return adaptIssue482Actor(code);
  if (rel === 'src/net/netmatch.js') return adaptIssue482Net(code);
  return code;
}
