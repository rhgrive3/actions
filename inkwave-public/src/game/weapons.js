    emit('weapon:fire', { actor: a, weapon: w.id, muzzle: m.clone(), dir: dir.clone() });
    rumble(a, 0.18, 0.3, 90);
  }

  // head glob landing: visual/paint splash must not become a damage hit cache entry
  // when the current weapon profile intentionally has no landing opponent damage.
  _sloshSplash(p, at, direct) {
    const w = WEAPONS[p.wid] || WEAPONS.slosher;
    const canDamageActors = Number.isFinite(w.splashDamage) && w.splashDamage > 0;
    for (const e of G.actors) {
      if (e.team === p.team || !e.alive || e === direct || (p.vol && p.vol.hits.includes(e))) continue;
      _v3.copy(e.pos); _v3.y += 0.6;
      if (_v3.distanceTo(at) > w.splashRadius + 0.3) continue;
      if (!G.physics.los(_v2.copy(at).setY(at.y + 0.25), _v3)) continue;
      // Do not consume the volley slot for a visual-only landing splash. A later
      // valid glob collision must still be allowed to deal its own 70/50 damage.
      if (!canDamageActors) continue;
      if (p.vol) p.vol.hits.push(e);
      this.applyHit(p.owner, e, w.splashDamage, p.wid || 'slosher');
    }
    // boss mode: one splash per throw (a direct head hit already counted)
    if (G.boss && direct !== 'boss' && !(p.vol && p.vol.hits.includes(G.boss)) && canDamageActors) { G.boss.splash(p.owner, at, w.splashRadius + 0.3, w.splashDamage, w.splashDamage, p.wid || 'slosher'); }
    if (p.owner.isLocal || G.camera.position.distanceToSquared(at) < 26 * 26) {
      G.fx?.burst(at, UP, p.owner.color, { count: 16, speed: 4.2, size: 0.09 });
      G.fx?.ring(at, UP, p.owner.color, { radius: w.splashRadius, life: 0.32 });
      G.audio?.play('slosh_land', { pos: at, volume: p.owner.isLocal ? 0.75 : 0.6 });