import { actorId } from './network.mjs';
import { rainmakerWallBlast, rainmakerWallsBlockBlast } from './rainmaker-defense.mjs';

export function sphereEntry(start, end, center, radius) {
  const d = end.map((v, i) => v - start[i]), o = start.map((v, i) => v - center[i]);
  const aa = d.reduce((s, v) => s + v * v, 0), bb = o.reduce((s, v, i) => s + v * d[i], 0), cc = o.reduce((s, v) => s + v * v, 0) - radius * radius;
  if (cc <= 0) return 0;
  const det = bb * bb - aa * cc;
  if (aa <= 1e-12 || det < 0) return null;
  const t = (-bb - Math.sqrt(det)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}

export function installRankedCombat(api) {
  const { G, Projectiles, THREE, Hit, Actor, WeaponRunner, PLAYER } = api;
  const P = Projectiles.prototype, candidate = P.kitDefenseCandidate;
  P.rankedBarrierCandidate = function (p) {
    const m = G.match, s = m?.ranked?.rule.state;
    if (m?.mode !== 'rainmaker' || !s?.barrier?.active || !p?.prev || !p?.pos) return null;
    const center = [...s.pos]; center[1] += 1;
    const radius = 1.5 + 1.2 * Math.abs(s.barrier.balance || 0) / (s.barrier.max || 1000);
    const t = sphereEntry(p.prev.toArray(), p.pos.toArray(), center, radius + (p.size || 0));
    if (t === null) return null;
    const distance = t * p.prev.distanceTo(p.pos);
    const point = p.prev.clone().lerp(p.pos, t);
    return { distance, point, normal: point.clone().sub(new THREE.Vector3(...center)).normalize(),
      onHit: actualDamage => {
        // Keep remote and paint-only ghost projectiles in the same visual
        // collision ordering, but only the authoritative local owner may
        // change shield state. Ghost InkFlight heads never call onHit.
        if (p.ghost || !p.owner || p.owner.remote) return;
        const damage = Number.isFinite(actualDamage) ? actualDamage : Number.isFinite(actualDamage?.damage) ? actualDamage.damage : p.catalog?.descriptor?.damage ?? p.damage ?? 0;
        barrierDamage(m, p.owner, damage, p.wid || p.type, point.toArray(), api);
      } };
  };
  // The existing swept-world/capsule arbitration also queries this lane for
  // shooter, charger, roller, slosher and catalogue weapons. No duplicate flight.
  P.kitDefenseCandidate = function (p) {
    let best = candidate?.call(this, p) || null;
    const barrier = this.rankedBarrierCandidate?.(p);
    if (!barrier || barrier.distance >= (best?.distance ?? Infinity)) return best;
    return barrier;
  };
  // Explosions must hit a shield even if there is no enemy actor inside it.
  for (const method of ['_explodeBomb', '_blastBurst', '_sloshSplash']) {
    const original = P[method];
    if (!original) continue;
    P[method] = function (object, at, ...args) {
      const m = G.match, s = m?.ranked?.rule.state, pos = method === '_explodeBomb' ? object.pos : at;
      if (m?.mode === 'rainmaker' && s?.barrier?.active && pos && !object.ghost && object.owner && !object.owner.remote) {
        const w = object.s3SpecialWeapon || object.s3Weapon || object.owner.weapon;
        const radius = method === '_explodeBomb' ? 5 : w.splashRadius || 3;
        const damage = method === '_explodeBomb' ? object.s3Sub?.damageMax ?? 180 : w.splashDamageMax || w.splashDamage || object.damage || 0;
        const distance = Math.hypot(pos.x - s.pos[0], pos.y - s.pos[1] - 1, pos.z - s.pos[2]);
        if (distance <= radius + 2) barrierDamage(m, object.owner, damage, method === '_explodeBomb' ? 'bomb' : 'blast', pos.toArray(), api);
      }
      return original.call(this, object, at, ...args);
    };
  }
  const updateRunner = WeaponRunner.prototype.update;
  WeaponRunner.prototype.update = function (dt, input) {
    if (isCarrier(G.match, this.a)) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      return;
    }
    return updateRunner.call(this, dt, input);
  };
  const moveSpeed = WeaponRunner.prototype.moveSpeed;
  WeaponRunner.prototype.moveSpeed = function () {
    if (!isCarrier(G.match, this.a)) return moveSpeed.call(this);
    const c = G.match.ranked.rule.state.charge;
    return this.a.intent.fire || c.firing || c.pending || c.recovery > 0
      ? .6 * 60 * .02 * (this.a.s3?.modifiers?.runSpeedFiring ?? 1) : moveSpeed.call(this) * .8;
  };
  const horizontal = Actor.prototype._horizontal;
  Actor.prototype._horizontal = function (...args) {
    if (!isCarrier(G.match, this)) return horizontal.apply(this, args);
    const swim = PLAYER.swimSpeed, dry = PLAYER.squidDrySpeed;
    PLAYER.swimSpeed *= .8; PLAYER.squidDrySpeed *= .8;
    try { return horizontal.apply(this, args); } finally { PLAYER.swimSpeed = swim; PLAYER.squidDrySpeed = dry; }
  };
  const addTurf = Actor.prototype.addTurf;
  Actor.prototype.addTurf = function (area, ...args) {
    if (isCarrier(G.match, this)) return this.addTurfNoSpecial(area);
    return addTurf.call(this, area, ...args);
  };
  const canJump = Actor.prototype.canSuperJump;
  Actor.prototype.canSuperJump = function (...args) { return !isCarrier(G.match, this) && canJump.apply(this, args); };
  const useSpecial = Actor.prototype.useSpecial;
  if (useSpecial) Actor.prototype.useSpecial = function (...args) { if (!isCarrier(G.match, this)) return useSpecial.apply(this, args); };
}
export function isCarrier(match, actor) { return match?.mode === 'rainmaker' && actor && match.ranked?.rule.state.carrier === actorId(actor); }

function barrierDamage(m, actor, amount, kind, pos, api) {
  if (!(amount > 0) || m.state !== 'playing') return;
  // Effective damage and world-space radius require retail calibration. The
  // original attack identity is retained for sourced per-attack multipliers.
  const hit = { id: actorId(actor), team: actor.team, damage: amount, kind };
  const nm = api.G.netm;
  if (nm && !nm.isHost) nm.s.tr?.sendTo(nm.s.hostId, { k: 'rkhit', match: nm.cfg.id, id: hit.id, damage: amount, kind, pos, seq: nm.rankedHitNext = (nm.rankedHitNext || 0) + 1 });
  else m.rankedBarrierHits.push(hit);
}

export function createRankedEffects(api, match) {
  const { THREE, G, Hit } = api;
  const shots = [], geometries = [], materials = [];
  const hit = new Hit();
  function damage(victim, attacker, amount) {
    if (!victim.alive || victim.team === attacker?.team) return;
    const nm = G.netm;
    if (nm && victim.remote) {
      nm._sendNow({ k: 'rkdamage', match: nm.cfg.id, seq: nm.rankedDamageNext = (nm.rankedDamageNext || 0) + 1,
        victim: actorId(victim), attacker: attacker ? actorId(attacker) : null, damage: amount, life: victim.remote ? victim.net?.lastLife ?? victim.netLife ?? 0 : victim.netLife ?? 0 });
    } else {
      const killed = victim.damage(amount, attacker || null, 'rainmaker');
      api.emit('hit', { attacker, victim, damage: amount, killed, weaponId: 'rainmaker' });
    }
  }
  function explode(pos, team, radius, amount, attacker, visualOnly = false, paintRadius = radius, outerDamage = amount, nearRadius = radius * .45, noSpecial = false, shot = null) {
    const p = new THREE.Vector3(...pos);
    G.fx?.ring?.(p, new THREE.Vector3(0, 1, 0), G.teamColors[team], { radius, life: .6 });
    G.audio?.play?.('bomb_explode', { pos: p, volume: .7 });
    const blastFrom = shot?.from || p.clone().add(new THREE.Vector3(0, .05, 0));
    const walls = shot ? rainmakerWallBlast(api, p, attacker, team, radius, nearRadius, amount, outerDamage, shot.impactWall) : [];
    if (visualOnly) return;
    G.paint?.splat?.(p, paintRadius, team, { seed: match.ranked.revision % 65536, claimOwner: attacker, ...(noSpecial ? { claimMode: 'no-special' } : {}) });
    for (const a of match.actors) if (amount > 0 && a.alive && a.team !== team) {
      const body = a.pos.clone().add(new THREE.Vector3(0, .7, 0));
      const distance = body.distanceTo(p);
      if (distance <= radius && G.physics.los(blastFrom, body) && !rainmakerWallsBlockBlast(blastFrom, body, walls))
        damage(a, attacker, distance <= nearRadius ? amount : outerDamage);
    }
  }
  function event(e, visualOnly = false) {
    if (e.kind === 'rainmaker-charged') G.audio?.play?.('charger_full', { pos: new THREE.Vector3(...e.pos), volume: .7 });
    else if (e.kind === 'rainmaker-shot' && Array.isArray(e.pos) && Array.isArray(e.aim)) {
      const a = match.actors.find(a => actorId(a) === String(e.actorId ?? e.carrier ?? e.id));
      if (!a) return;
      const geometry = new THREE.SphereGeometry(.32, 10, 8), material = new THREE.MeshBasicMaterial({ color: G.teamColors[e.team] });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(e.pos); mesh.position.y += 1;
      G.scene.add(mesh); geometries.push(geometry); materials.push(material);
      shots.push({ pos: mesh.position, previous: mesh.position.clone(), vel: new THREE.Vector3(...e.aim).normalize().multiplyScalar(e.speed || 22), age: 0, team: e.team,
        actor: a, mesh, geometry, material, origin: mesh.position.clone(), maxRange: e.directRange ?? e.effectiveRange ?? 4.4, trailRadius: e.trailRadius ?? .48, landed: false, wait: 0, damage: e.blastDamage ?? e.splashDamage ?? 180, directDamage: e.damage || 60, outerDamage: e.outerDamage ?? 40, paintRadius: e.paintRadius || e.radius || 3.5, nearRadius: e.nearRadius ?? .92, radius: e.radius ?? 1.4, visualOnly });
      shots.at(-1).vel.y += e.launchY ?? (e.charge >= 1 ? 3.36 : 1.68);
      if (!a.remote && a.vel) {
        const recoil = e.recoil ?? (e.charge >= 1 ? 1.44 : .72);
        a.vel.x -= e.aim[0] * recoil; a.vel.z -= e.aim[2] * recoil;
      }
      G.audio?.play?.('shoot_charger', { pos: mesh.position });
    } else if (e.kind === 'rainmaker-pop') explode(e.pos, e.team, e.radius || 5, e.damage || 180, match.actors.find(a => actorId(a) === e.id), visualOnly);
    else if (e.kind === 'clam-paint' && !visualOnly) G.paint?.splat?.(new THREE.Vector3(...e.pos), e.radius, e.team, { seed: match.ranked.revision % 65536, kind: 'blast', instant: true, claimMode: 'no-special' });
    else if (e.kind === 'rainmaker-timeout') {
      if (!visualOnly) {
        const a = match.actors.find(a => actorId(a) === e.id);
        if (a?.alive) {
          const nm = G.netm;
          if (a.remote && nm) nm._sendNow({ k: 'rkdamage', match: nm.cfg.id, seq: nm.rankedDamageNext = (nm.rankedDamageNext || 0) + 1,
            victim: actorId(a), attacker: null, damage: 2000, life: a.remote ? a.net?.lastLife ?? a.netLife ?? 0 : a.netLife ?? 0 });
          else a.splat(null, 'rainmaker');
        }
      }
      explode(e.pos, 1 - e.team, 4, 180, null, visualOnly);
    }
  }
  const ownsDefense = s => s.actor?.remote !== true;
  function retire(s) {
    G.scene.remove(s.mesh); s.geometry.dispose(); s.material.dispose();
    geometries.splice(geometries.indexOf(s.geometry), 1); materials.splice(materials.indexOf(s.material), 1);
  }
  return {
    event,
    update(dt) {
      if (match.state !== 'playing') return;
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        if (s.landed) {
          // An armed ground shot can still be inhaled before detonation.
          const p = { owner: s.actor, team: s.team, prev: s.pos, pos: s.pos.clone().add(new THREE.Vector3(0, .001, 0)),
            vel: new THREE.Vector3(), damage: s.damage, ghost: !ownsDefense(s), type: 'rainmaker' };
          const intake = G.projectiles?.kitDefenseCandidate?.(p);
          if (intake?.kind === 'ink-vac') {
            if (ownsDefense(s)) intake.onHit(p);
            retire(s); shots.splice(i, 1); continue;
          }
          s.wait -= dt;
          if (s.wait > 1e-9) continue;
          explode(s.pos.toArray(), s.team, s.radius, s.damage, s.actor, s.visualOnly, s.paintRadius, s.outerDamage, s.nearRadius, true, { from: s.blastStart, impactWall: s.impactWall });
          retire(s); shots.splice(i, 1); continue;
        }
        s.previous.copy(s.pos);
        // Native defaults for gravity/drag are not exposed in the pinned dump.
        // These stage-unit trajectories and 0.2s fuse remain local calibration.
        s.pos.addScaledVector(s.vel, dt); s.pos.y -= 30 * dt * dt; s.vel.y -= 60 * dt; s.age += dt;
        const horizontal = Math.hypot(s.pos.x - s.origin.x, s.pos.z - s.origin.z);
        if (horizontal > s.maxRange) {
          const k = s.maxRange / horizontal;
          s.pos.x = s.origin.x + (s.pos.x - s.origin.x) * k;
          s.pos.z = s.origin.z + (s.pos.z - s.origin.z) * k;
          s.vel.x = s.vel.z = 0;
        }
        const wall = G.physics.segment(s.previous, s.pos, hit, true);
        let nearest = wall.hit ? wall.dist / Math.max(1e-9, s.previous.distanceTo(s.pos)) : 1;
        const worldPoint = wall.hit ? wall.point.clone() : null;
        const probe = { owner: s.actor, team: s.team, prev: s.previous, pos: s.pos,
          vel: s.vel, damage: s.directDamage, type: 'rainmaker', wid: 'rainmaker', subId: 'Gachihoko_Bullet', size: .16, ghost: !ownsDefense(s) };
        const defense = G.projectiles?.kitDefenseCandidate?.(probe);
        let blocked = defense && defense.distance <= nearest * s.previous.distanceTo(s.pos) ? defense : null;
        if (blocked) nearest = blocked.distance / Math.max(1e-9, s.previous.distanceTo(s.pos));
        let target = null;
        for (const a of match.actors) if (a.alive && a.team !== s.team) {
          const center = a.pos.toArray(); center[1] += .7;
          const t = sphereEntry(s.previous.toArray(), s.pos.toArray(), center, .85);
          if (t !== null && t < nearest) { nearest = t; target = a; blocked = null; }
        }
        let terminal = !!worldPoint || !!blocked || !!target;
        if (target || blocked) s.pos.copy(s.previous.clone().lerp(s.pos, nearest));
        else if (worldPoint) s.pos.copy(worldPoint);
        const floor = match.rankedWorld?.floorAt?.(s.pos.x, s.pos.z);
        const water = floor === null && s.pos.y <= (api.PLAYER?.waterY ?? -1);
        if (water || s.age > 3 || blocked?.kind === 'ultra-stamp-guard' || blocked?.kind === 'ink-vac') {
          if (blocked && ownsDefense(s)) blocked.onHit(probe);
          retire(s); shots.splice(i, 1); continue;
        }
        if (blocked?.object?.subId === 'splashWall') s.impactWall = blocked.object;
        s.blastStart = s.pos.clone().addScaledVector(s.previous.clone().sub(s.pos).normalize(), .01);
        if (blocked && ownsDefense(s)) blocked.onHit(probe);
        if (target && !s.visualOnly) damage(target, s.actor, s.directDamage);
        if (!s.visualOnly) {
          // Falling ink paints the first surface below the swept head; it does
          // not stamp through a ceiling or grant carrier special points.
          const steps = Math.max(1, Math.min(64, Math.ceil(s.previous.distanceTo(s.pos) / .3)));
          for (let n = 1; n <= steps; n++) {
            const p = s.previous.clone().lerp(s.pos, n / steps);
            const ground = G.physics.segment(p, p.clone().add(new THREE.Vector3(0, -30, 0)), hit, true);
            if (ground.hit) G.paint?.splat?.(ground.point.clone(), s.trailRadius, s.team,
              { seed: match.ranked.revision % 65536, claimOwner: s.actor, claimMode: 'no-special' });
          }
        }
        if (!terminal) continue;
        if (!(s.damage > 0)) {
          if (!s.visualOnly) G.paint?.splat?.(s.pos.clone(), s.paintRadius, s.team, { claimOwner: s.actor, claimMode: 'no-special' });
          retire(s); shots.splice(i, 1); continue;
        }
        // Defensive surfaces and Crab Tank skip the ground-impact fuse.
        if (blocked || target?.specialActive?.id === 'crabTank') {
          explode(s.pos.toArray(), s.team, s.radius, s.damage, s.actor, s.visualOnly, s.paintRadius, s.outerDamage, s.nearRadius, true, { from: s.blastStart, impactWall: s.impactWall });
          retire(s); shots.splice(i, 1);
        } else { s.landed = true; s.wait = .2; s.mesh.visible = false; }

      }
    },
    dispose() { for (const s of shots) retire(s); shots.length = 0; },
  };
}
