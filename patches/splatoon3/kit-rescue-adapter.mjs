// Current-main bridge for the residual verified kit work from PR #186.
// Runs before the generic adapters for non-projectile files and after the
// #587 Weapons Fidelity transform for src/game/weapons.js.
export function adaptKitRescue(rel, code, replaceOnce) {
  const patch=(before,after,label)=>{code=replaceOnce(code,before,after,'kit rescue: '+label);};
  if(rel==='src/ui/menus.js'){
    patch('  _sub() { return this.api.sub || SUB.bomb; }',
      '  _sub() { const w = this._weapons()[this._loadout().weapon], subs = this.api.subs || SUB; return (w.sub && subs[w.sub]) || this.api.sub || SUB.bomb; }','lobby sub');
    patch("h('span', { class: 'iw-chip' }, h('i', { html: SUB_ICONS.bomb }), sub.name)",
      "h('span', { class: 'iw-chip' }, h('i', { html: SUB_ICONS[sub.id] || SUB_ICONS.bomb }), sub.name)",'lobby sub icon');
  } else if(rel==='src/ui/hud.js'){
    patch('    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)\n    const a = this._local();',
      "    // spawn shield + bomb aim (read straight off the local actor; absent in the lab unless mocked)\n    const a = this._local();\n    if (a) { const sub = selectedSub(a, SUB), cost = Math.round(selectedSubCost(a, SUB)); if (L.kitSub !== sub.id || L.kitSubCost !== cost) { L.kitSub = sub.id; L.kitSubCost = cost; this.subChip.querySelector('i').innerHTML = SUB_ICONS[sub.id] || SUB_ICONS.bomb; this.subChip.querySelector('b').textContent = cost + '%'; this.subChip.title = sub.name; } }",
      'HUD sub identity');
    code="import { selectedSub, selectedSubCost } from '../../patches/splatoon3/runtime/kit-composition.mjs';\n"+code;
  } else if(rel==='src/game/bots.js'){
    patch('a.ink > SUB.bomb.inkCost + 8','a.ink > selectedSubCost(a, SUB) + 8','bot sub turf');
    patch('a.ink > SUB.bomb.inkCost + 10','a.ink > selectedSubCost(a, SUB) + 10','bot sub boss');
    for(const [anchor,label] of [["          if (w.special === 'storm' && dist < 16) it.special = true;",'turf'],["        if (w.special === 'storm' && dist < 13 && T.los) it.special = true;",'boss']])
      patch(anchor,anchor+"\n        if ((w.special === 'trizooka' && dist < 24) || (w.special === 'inkVac' && dist < 15) || (w.special === 'bubbler' && dist < 12)) it.special = true;",'bot special '+label);
    code="import { selectedSubCost } from '../../patches/splatoon3/runtime/kit-composition.mjs';\n"+code;
  } else if(rel==='src/game/actor.js'){
    patch('    this.respawnTimer = PLAYER.respawnTime;','    setRespawnTimer(this, cause);','death-cause respawn');
    code="import { setRespawnTimer } from '../../patches/splatoon3/runtime/resources.mjs';\n"+code;
  } else if(rel==='src/main.js'){
    patch('subCost: SUB.bomb.inkCost / PLAYER.inkMax,','subCost: selectedSubCost(a, SUB) / PLAYER.inkMax,','frame sub cost');
    code="import { selectedSubCost } from '../patches/splatoon3/runtime/kit-composition.mjs';\n"+code;
  } else if(rel==='src/net/netmatch.js'){
    patch("'splatted', 'respawn'];","'splatted', 'respawn', ...KIT_FORWARD];",'kit event forward');
    patch("case 'ev': this._playEvent(e[2], e[3]); break;","case 'ev': this._playEvent(e[2], e[3], from); break;",'event sender');
    patch('  _playEvent(name, d) {','  _playEvent(name, d, from) {','event signature');
    patch('    if (!e) return;\n    const a = e.actor || e.victim;','    if (!e) return;\n    if (this.replayKitEvent?.(name, e, from)) return;\n    const a = e.actor || e.victim;','typed kit replay');
    patch('    victim.respawnTimer = PLAYER.respawnTime;','    setRespawnTimer(victim, cause);','remote respawn cause');
    const plainBombRecord = "    this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z)]);";
    const stormBombRecord = "    this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z), b.kind === 'storm' ? { stormDuration: b.s3StormDuration } : null]);";
    if (code.includes(stormBombRecord)) patch(stormBombRecord,
      "    const s3kit = kitBombPacket(b); if (!s3kit) return; this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z), b.kind === 'storm' ? { stormDuration: b.s3StormDuration } : null, s3kit[0], s3kit[1]]);",'bomb identity');
    else patch(plainBombRecord,
      "    const s3kit = kitBombPacket(b); if (!s3kit) return; this._rec(['b', o.nid, b.kind, r2(b.pos.x), r2(b.pos.y), r2(b.pos.z), r2(b.vel.x), r2(b.vel.y), r2(b.vel.z), s3kit[0], s3kit[1]]);",'bomb identity');
    const plainBombReplay = "      case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9]); break; }";
    const stormBombReplay = "      case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10]); break; }";
    if (code.includes(stormBombReplay)) patch(stormBombReplay,
      "      case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11], e[12]); break; }",'bomb replay identity');
    else patch(plainBombReplay,
      "      case 'b': { const a = this.byNid.get(e[2]); if (a) G.projectiles?.ghostBomb(a, e[3], e[4], e[5], e[6], e[7], e[8], e[9], e[10], e[11]); break; }",'bomb replay identity');
    patch('      r3(p.vis ?? 0.1), p.tail0 ?? 0.8, p.tailK ?? 1.3, p.wob ?? 0.035, p.wobF ?? 26, p.nose ?? 0.3, p.sats ?? 3]);',
      '      r3(p.vis ?? 0.1), p.tail0 ?? 0.8, p.tailK ?? 1.3, p.wob ?? 0.035, p.wobF ?? 26, p.nose ?? 0.3, p.sats ?? 3, kitVolleyPacketIndex(p.s3VolleyIndex), kitVolleyPacketIndex(p.s3ActionIndex)]);','trizooka packet identity');
    code="import { KIT_FORWARD } from '../../patches/splatoon3/runtime/kit-network.mjs';\nimport { kitVolleyPacketIndex } from '../../patches/splatoon3/runtime/trizooka-collision.mjs';\nimport { kitBombPacket } from '../../patches/splatoon3/runtime/kit-subs.mjs';\nimport { setRespawnTimer } from '../../patches/splatoon3/runtime/resources.mjs';\n"+code;
  } else if(rel==='src/game/weapons.js'){
    const plainSubRelease = '    // ---- sub weapon (splat bomb)\n    const bomb = SUB.bomb;';
    const gearedSubRelease = '    // ---- sub weapon (splat bomb)\n    const bomb = subInkSpec(a, SUB.bomb);';
    const subReleaseAnchor = code.includes(gearedSubRelease) ? gearedSubRelease : plainSubRelease;
    patch(subReleaseAnchor,'    // ---- sub weapon (selected kit sub)\n    const bomb = kitSubRelease(SUB, this, dt, inp);','selected sub release');
    patch("    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);\n    if (a.isLocal || a._nearCamera())",
      "    kitBombAttach(SUB, this, a, a.weaponRunner?.s3Release);\n    if (G.netm && !a.remote) G.netm.recBomb(this.bombs[this.bombs.length - 1]);\n    if (a.isLocal || a._nearCamera())",'attach bomb identity');
    patch("      if (hit.hit) {\n        if (b.kind === 'storm') {","      if (hit.hit) {\n        const s3Took = kitBombContact(SUB, b, hit, dt);\n        if (b.kind === 'storm') {",'sub contact');
    patch("        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);\n        if (b.kind === 'bomb') {\n          if (!b.s3FuseNormal) b.s3FuseNormal = new THREE.Vector3();\n          b.s3FuseNormal.copy(hit.normal);\n        }\n        const vn = b.vel.dot(hit.normal);\n        b.vel.addScaledVector(hit.normal, -vn * 1.35);\n        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);\n        if (b.fuse < 0) {\n          b.fuse = SUB.bomb.fuse;\n          G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 });\n          emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius });\n        }",
      "        if (!s3Took) {\n        b.pos.copy(hit.point).addScaledVector(hit.normal, 0.21);\n        if (b.kind === 'bomb') {\n          if (!b.s3FuseNormal) b.s3FuseNormal = new THREE.Vector3();\n          b.s3FuseNormal.copy(hit.normal);\n        }\n        const vn = b.vel.dot(hit.normal);\n        b.vel.addScaledVector(hit.normal, -vn * 1.35);\n        b.vel.multiplyScalar(hit.normal.y > 0.6 ? 0.45 : 0.6);\n        if (b.fuse < 0) { b.fuse = SUB.bomb.fuse; G.audio?.play('bomb_beep', { pos: b.pos, volume: 0.6 }); emit('bomb:arm', { actor: b.owner, pos: b.pos.clone(), team: b.team, radius: SUB.bomb.radius }); }\n        }",'native bounce guard');
    const legacyStormAge = "      if (b.kind === 'storm' && b.age > 1.1)";
    const guardedStormAge = "      if (b.kind === 'storm' && b.age > 30)";
    const stormAgeAnchor = code.includes(guardedStormAge) ? guardedStormAge : legacyStormAge;
    patch(stormAgeAnchor,"      kitBombTrail(SUB, b, G.paint, this);\n" + stormAgeAnchor,'curling trail');
    patch("      b.vel.y -= (b.kind === 'bomb' ? SUB.bomb.gravity : 24) * dt;","      b.vel.y -= kitBombGravity(SUB, b) * dt;",'kit bomb gravity');
    patch('distanceDamage(s.damageBands, d, false)','distanceDamage(kitBombDamageBands(SUB, b, s.damageBands), d, false)','kit bomb bands');
    patch('      if (d > s.radius) continue;','      if (d > kitBombRadius(SUB, b, s.radius)) continue;','kit bomb radius');
    patch('        const k = 1 - b.fuse / SUB.bomb.fuse;','        const k = 1 - b.fuse / kitBombFuseTotal(SUB, b);','kit fuse');
    patch("    G.boss?.splash(b.owner, c, s.radius, s.damageMax, s.damageMin, 'bomb');",
      "    G.boss?.splash(b.owner, c, kitBombRadius(SUB, b, s.radius), kitBombDamageMax(SUB, b, s.damageMax), kitBombDamageMin(SUB, b, s.damageMin), 'bomb');",'kit boss splash');
    patch('G.fx?.explosion(c, G.teamColors[b.team], s.radius);','G.fx?.explosion(c, G.teamColors[b.team], kitBombFxRadius(SUB, b, s.radius));','kit bomb FX');
    const plainGhostHead = "  ghostBomb(a, kind, px, py, pz, vx, vy, vz) {\n    const s = this.bombs.length;\n    if (kind === 'storm') this.throwStorm(a); else this.throwBomb(a);";
    const metaGhostHead = "  ghostBomb(a, kind, px, py, pz, vx, vy, vz, metadata) {\n    const s = this.bombs.length;\n    if (kind === 'storm') this.throwStorm(a); else this.throwBomb(a);";
    if (code.includes(metaGhostHead)) patch(metaGhostHead,
      "  ghostBomb(a, kind, px, py, pz, vx, vy, vz, metadata, s3kit, s3charge) {\n    const s = this.bombs.length;\n    withGhostBombSpawn(() => { if (kind === 'storm') this.throwStorm(a); else this.throwBomb(a); });",'ghost bomb scope');
    else patch(plainGhostHead,
      "  ghostBomb(a, kind, px, py, pz, vx, vy, vz, s3kit, s3charge) {\n    const s = this.bombs.length;\n    withGhostBombSpawn(() => { if (kind === 'storm') this.throwStorm(a); else this.throwBomb(a); });",'ghost bomb scope');
    const plainGhostBody = "    if (!b) return;\n    b.ghost = true;\n    b.pos.set(px, py, pz);";
    const metaGhostBody = "    if (!b) return;\n    b.ghost = true;\n    if (kind === 'storm' && Number.isFinite(metadata?.stormDuration)) b.s3StormDuration = Math.max(8, Math.min(10, metadata.stormDuration));\n    b.pos.set(px, py, pz);";
    if (code.includes(metaGhostBody)) patch(metaGhostBody,
      "    if (!b) return;\n    b.ghost = true;\n    if (kind === 'storm' && Number.isFinite(metadata?.stormDuration)) b.s3StormDuration = Math.max(8, Math.min(10, metadata.stormDuration));\n    kitGhostBombAttach(SUB, this, b, s3kit, s3charge);\n    b.pos.set(px, py, pz);",'ghost bomb kit');
    else patch(plainGhostBody,
      "    if (!b) return;\n    b.ghost = true; kitGhostBombAttach(SUB, this, b, s3kit, s3charge);\n    b.pos.set(px, py, pz);",'ghost bomb kit');
    patch('    const w = WEAPONS.blaster;','    const w = p.s3SpecialWeapon || WEAPONS.blaster;','special blast descriptor');
    patch("      this.applyHit(p.owner, e, blasterBurstDamage(p, w, d, distanceDamage), 'blaster');",
      "      this.applyHit(p.owner, e, p.s3SpecialWeapon ? distanceDamage(w.splashBands || w.damageBands, d, !kitTrizookaSteppedBands(p)) : blasterBurstDamage(p, w, d, distanceDamage), p.wid || 'blaster');",'special blast bands');
    patch("G.boss?.splash(p.owner, c, w.splashRadius, w.splashDamageMax, w.splashDamageMin, 'blaster');",
      "G.boss?.splash(p.owner, c, w.splashRadius, w.splashDamageMax, w.splashDamageMin, p.wid || 'blaster');",'special blast cause');
    patch('    // paint under the burst','    if (p.ghost) return; // owner packets carry authoritative paint/damage\n    // paint under the burst','ghost blast authority');
    patch('  _impact(p, hit) {\n    _v.copy(hit.point)','  _impact(p, hit) {\n    if (!kitPaintAuthority(p)) { if (p.type === \'blast\') this._blastBurst(p, hit.point, null); return; }\n    _v.copy(hit.point)','kit impact paint authority');
    patch('      if (!dead && !p.ghost && p.trailEvery) {','      if (!dead && !p.ghost && kitPaintAuthority(p) && p.trailEvery) {','kit trail authority');
    const plainImpact = '        if (hit.hit) {\n          this._impact(p, hit);';
    const fidelityImpact = '        if (hit.hit) {\n          if (beginFidelityWallDrop(this, p, hit)) return false;\n          this._impact(p, hit);';
    const impactAnchor = code.includes(fidelityImpact) ? fidelityImpact : plainImpact;
    const impactTarget = impactAnchor.replace(
      '          this._impact(p, hit);',
      '          if (hit.kitDefense) hit.kitDefense.onHit(); else this._impact(p, hit);'
    );
    patch(impactAnchor, impactTarget, 'kit defense world contact');
    patch('nose, sats] = e;','nose, sats, s3Volley, s3Action] = e;','trizooka ghost identity');
    patch("    this.list.push(p);\n  }","    kitTrizookaGhost(p, a, SPECIALS, { volleyIndex: s3Volley, actionIndex: s3Action });\n    this.list.push(p);\n  }",'trizooka ghost reconstruction');
    code="import { kitPaintAuthority, kitTrizookaGhost, kitTrizookaSteppedBands } from '../../patches/splatoon3/runtime/trizooka-collision.mjs';\nimport { kitSubRelease, kitBombAttach, kitBombGravity, kitBombContact, kitBombTrail, kitBombFuseTotal, kitBombRadius, kitBombFxRadius, kitBombDamageBands, kitBombDamageMax, kitBombDamageMin, kitGhostBombAttach, withGhostBombSpawn } from '../../patches/splatoon3/runtime/kit-subs.mjs';\n"+code;
  }
  return code;
}
