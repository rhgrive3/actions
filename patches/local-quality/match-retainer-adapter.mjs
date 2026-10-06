// Page-lifetime owners (projectile pool, camera rig, attract director, boss HUD) must not keep a disposed match's
// Actor/Boss reachable. Every release below is an identity check against the retiring match's own roster/boss, so a
// newer match's references are never cleared, and every release is idempotent. Build-only; upstream stays intact.
// Anchors are kept verbatim (code is inserted before/after them) so other adapters that patch the same lines still
// compose.
export function adaptMatchRetainers(rel, code, once) {
  if (rel === 'src/game/match.js') {
    code = once(code,
      '    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot\n',
      '    if (G.rig?.spectate?.actor === a) G.rig.spectate.actor = null;   // a death cam watching them looks on at the spot\n' +
      '    G.projectiles?.releaseActor?.(a);\n',
      'match retainers removeActor sight');
    return once(code,
      '    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;',
      '    // Release page-lifetime references to this match before characters are torn down (identity-checked).\n' +
      '    { const hb = G.hud?.boss; if (hb && this.boss && hb.boss === this.boss) hb.setMode(false); }\n' +
      '    { const sp = G.rig?.spectate; if (sp && sp.actor && this.actors.includes(sp.actor)) sp.actor = null; }\n' +
      '    { const rig = G.rig, gm = G.game;\n' +
      '      if (rig && rig.target && this.actors.includes(rig.target)) rig.target = null;\n' +
      '      if (rig && rig._prevTarget && this.actors.includes(rig._prevTarget)) rig._prevTarget = null;\n' +
      '      if (gm && gm._attractFollow && this.actors.includes(gm._attractFollow)) gm._attractFollow = null; }\n' +
      '    this.bossMode?.dispose(); this.bossMode = null; this.boss = null;',
      'match retainers dispose');
  }
  if (rel === 'src/game/weapons.js') {
    code = once(code,
      '    this.sights.clear();\n',
      '    this.sights.clear();\n' +
      '    for (const v of this.vols) v.hits.length = 0;   // per-throw dedupe lists must not keep victims/bosses alive\n',
      'weapons retainers vols');
    return once(code,
      '  clear() {',
      '  // A removed actor (online leave) must not keep its charger sight drawing or stay reachable via dedupe lists.\n' +
      '  releaseActor(a) {\n' +
      '    const s = this.sights.get(a);\n' +
      '    if (s) { this.scene.remove(s); s.material.dispose(); this.sights.delete(a); }\n' +
      '    for (const v of this.vols) { const h = v.hits; for (let i = h.length - 1; i >= 0; i--) if (h[i] === a) h.splice(i, 1); }\n' +
      '  }\n\n' +
      '  clear() {',
      'weapons retainers releaseActor');
  }
  if (rel === 'src/game/cameraRig.js') {
    // spectate.pos/from stay so blends look unchanged; only the Actor reference is released.
    const drop = '    if (this.spectate) this.spectate.actor = null;\n';
    for (const sig of [
      '  follow(actor, snap = false) {\n',
      '  cinematic(from, to, lookFrom, lookTo, dur, onDone) {\n',
      '  orbit(center, radius, height, speed = 0.05, phase = 0) {\n',
      '  overview() {\n',
    ]) code = once(code, sig, sig + drop, 'camera retainers ' + sig.trim().split('(')[0]);
  }
  return code;
}
