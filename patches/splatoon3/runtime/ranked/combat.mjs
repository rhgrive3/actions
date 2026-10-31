import { validRainmakerShotOrigin, rainmakerShotOwnerMatches } from './rainmaker-shot-origin.mjs';
import { beginRainmakerDeviceShot, bindRainmakerDeviceSource, recordRainmakerDeviceContact, recordRainmakerDeviceBurst } from './rainmaker-device-contact.mjs';
import { actorId } from './network.mjs';
import { toxicMistScale } from '../toxic-mist.mjs';
import { rainmakerWallBlast, rainmakerWallsBlockBlast, rainmakerDomeBlast } from './rainmaker-defense.mjs';
import { withObjectDamageCause } from '../sub-resistance.mjs';
import { BIG_BUBBLER_RAW } from '../kit-big-bubbler.mjs';
import { createRainmakerAttackVisuals } from './rainmaker-visuals.mjs';

export function sphereEntry(start, end, center, radius) {
  const d = end.map((v, i) => v - start[i]), o = start.map((v, i) => v - center[i]);
  const aa = d.reduce((s, v) => s + v * v, 0), bb = o.reduce((s, v, i) => s + v * d[i], 0), cc = o.reduce((s, v) => s + v * v, 0) - radius * radius;
  if (cc <= 0) return 0;
  const det = bb * bb - aa * cc;
  if (aa <= 1e-12 || det < 0) return null;
  const t = (-bb - Math.sqrt(det)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}

// Same left-to-right reductions as sphereEntry's Array.reduce, without temporary arrays.
export function sphereEntryComponents(sx, sy, sz, ex, ey, ez, cx, cy, cz, radius) {
  const dx = ex - sx, dy = ey - sy, dz = ez - sz, ox = sx - cx, oy = sy - cy, oz = sz - cz;
  const aa = ((0 + dx * dx) + dy * dy) + dz * dz;
  const bb = ((0 + ox * dx) + oy * dy) + oz * dz;
  const cc = ((0 + ox * ox) + oy * oy) + oz * oz - radius * radius;
  if (cc <= 0) return 0;
  const det = bb * bb - aa * cc;
  if (aa <= 1e-12 || det < 0) return null;
  const t = (-bb - Math.sqrt(det)) / aa;
  return t >= 0 && t <= 1 ? t : null;
}

function impactDomeShelters(dome, start, end, Vector3) {
  if (!dome) return false;
  const enters = (center, radius) => start.distanceToSquared(center) > radius * radius
    && (start instanceof Vector3 && end instanceof Vector3 && center instanceof Vector3 &&
      start.toArray === Vector3.prototype.toArray && end.toArray === Vector3.prototype.toArray && center.toArray === Vector3.prototype.toArray
      ? sphereEntryComponents(start.x,start.y,start.z,end.x,end.y,end.z,center.x,center.y,center.z,radius)
      : sphereEntry(start.toArray(), end.toArray(), center.toArray(), radius)) !== null;
  const field = dome.center.clone(); field.y += dome.emitterY;
  return enters(dome.center, dome.radius) || dome.ignited && enters(field, BIG_BUBBLER_RAW.fieldCollisionRadius);
}

export function installRankedCombat(api) {
  const { G, Projectiles, THREE, Hit, Actor, WeaponRunner, PLAYER } = api;
  const P = Projectiles.prototype, candidate = P.kitDefenseCandidate;
  P.rankedBarrierCandidate = function (p) {
    const m = G.match, s = m?.ranked?.rule.state;
    if (m?.mode !== 'rainmaker' || !s?.barrier?.active || !p?.prev || !p?.pos) return null;
    const scalar = p.prev instanceof THREE.Vector3 && p.pos instanceof THREE.Vector3 &&
      p.prev.toArray === THREE.Vector3.prototype.toArray && p.pos.toArray === THREE.Vector3.prototype.toArray;
    const center = scalar ? null : [...s.pos];
    if (center) center[1] += 1;
    const cx = scalar ? s.pos[0] : center[0], cy = scalar ? s.pos[1] + 1 : center[1], cz = scalar ? s.pos[2] : center[2];
    const radius = 1.5 + 1.2 * Math.abs(s.barrier.balance || 0) / (s.barrier.max || 1000);
    const t = scalar ? sphereEntryComponents(p.prev.x,p.prev.y,p.prev.z,p.pos.x,p.pos.y,p.pos.z,cx,cy,cz,radius + (p.size || 0))
      : sphereEntry(p.prev.toArray(), p.pos.toArray(), center, radius + (p.size || 0));
    if (t === null) return null;
    const distance = t * p.prev.distanceTo(p.pos);
    const point = p.prev.clone().lerp(p.pos, t);
    return { distance, point, normal: point.clone().sub(new THREE.Vector3(cx,cy,cz)).normalize(),
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
      ? .6 * 60 * .02 * (this.a.s3?.modifiers?.runSpeedFiring ?? 1) * toxicMistScale(this.a)
      : moveSpeed.call(this) * .8;
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
  const shots = [];
  let visuals = null;
  // Headless rule/timeout consumers can run before a scene is installed.
  // Bind on the first rendered event, rather than capturing a null boot scene.
  const attackVisuals = () => visuals || (G.scene?.add ? (visuals = createRainmakerAttackVisuals(THREE, G.scene)) : null);
  const hit = new Hit();
  function damage(victim, attacker, amount, cause = 'Gachihoko_Bullet') {
    if (!victim.alive || victim.team === attacker?.team) return;
    const nm = G.netm;
    if (nm && victim.remote) {
      nm._sendNow({ k: 'rkdamage', match: nm.cfg.id, seq: nm.rankedDamageNext = (nm.rankedDamageNext || 0) + 1,
        victim: actorId(victim), attacker: attacker ? actorId(attacker) : null, damage: amount, cause, life: victim.remote ? victim.net?.lastLife ?? victim.netLife ?? 0 : victim.netLife ?? 0 });
    } else {
      const killed = withObjectDamageCause(attacker, () => victim.damage(amount, attacker || null, 'rainmaker'), cause);
      api.emit('hit', { attacker, victim, damage: amount, killed, weaponId: 'rainmaker' });
    }
  }
  const _blastUp = new THREE.Vector3(0, 1, 0), _blastLift = new THREE.Vector3(0, .05, 0), _blastFrames = [];
  let _blastDepth = 0;
  function explode(pos, team, radius, amount, attacker, visualOnly = false, paintRadius = radius, outerDamage = amount, nearRadius = radius * .45, noSpecial = false, shot = null) {
    // Hit listeners may synchronously emit another blast. Lease one scratch
    // frame per active call so an inner event cannot move the outer LOS origin.
    const depth = _blastDepth++;
    try {
    const scratch = _blastFrames[depth] || (_blastFrames[depth] = { body: new THREE.Vector3(), from: null });
    const p = new THREE.Vector3(...pos); // Owned by this event; FX/audio may retain it.
    G.fx?.ring?.(p, _blastUp, G.teamColors[team], { radius, life: .6 });
    attackVisuals()?.splash(p, G.teamColors[team], radius);
    G.audio?.play?.('bomb_explode', { pos: p, volume: .7 });
    const blastFrom = shot?.from || (scratch.from || (scratch.from = new THREE.Vector3())).copy(p).add(_blastLift);
    const domeSheltered = shot && !visualOnly ? new Set() : null;
    if (shot && !visualOnly) for (const a of match.actors) if (a.alive && a.team !== team) {
      const body = scratch.body.set(a.pos.x, a.pos.y + 0.7, a.pos.z);
      if (Math.sqrt(body.distanceToSquared(p)) <= radius && (impactDomeShelters(shot.dome, blastFrom, body, THREE.Vector3)
          || G.projectiles?.kitBarrierShelter?.({ owner: attacker, team, ghost: true }, blastFrom, body))) domeSheltered.add(a);
    }
    const walls = shot ? rainmakerWallBlast(api, p, attacker, team, radius, nearRadius, amount, outerDamage, shot.impactWall, shot.deviceShot) : [];
    if (shot?.deviceShot) recordRainmakerDeviceBurst(shot.deviceShot, G.projectiles, { owner:attacker, team }, p, radius, nearRadius, amount, outerDamage);
    if (shot) rainmakerDomeBlast(api, p, blastFrom, attacker, team, radius, nearRadius, amount, outerDamage, walls);
    if (visualOnly) return;
    G.paint?.splat?.(p, paintRadius, team, { seed: match.ranked.revision % 65536, claimOwner: attacker, ...(noSpecial ? { claimMode: 'no-special' } : {}) });
    for (const a of match.actors) if (amount > 0 && a.alive && a.team !== team) {
      const body = scratch.body.set(a.pos.x, a.pos.y + 0.7, a.pos.z);
      const d2 = body.distanceToSquared(p);
      if (Math.sqrt(d2) <= radius && G.physics.los(blastFrom, body) && !rainmakerWallsBlockBlast(blastFrom, body, walls) && !domeSheltered?.has(a)) {
        const distance = Math.sqrt(d2);
        damage(a, attacker, distance <= nearRadius ? amount : outerDamage, shot ? 'Gachihoko_BombCore' : 'GachihokoTimeUpBurst');
      }
    }
    } finally { _blastDepth = depth; }
  }
  function event(e, visualOnly = false) {
    if (e.kind === 'rainmaker-charged') G.audio?.play?.('charger_full', { pos: new THREE.Vector3(...e.pos), volume: .7 });
    else if (e.kind === 'rainmaker-shot' && Array.isArray(e.pos) && Array.isArray(e.aim)) {
      const a = match.actors.find(a => actorId(a) === String(e.actorId ?? e.carrier ?? e.id));
      if (!a || !a.alive || !validRainmakerShotOrigin(e.shotOrigin, e) || !rainmakerShotOwnerMatches(e.shotOrigin, a)) return;
      if (!attackVisuals()) return;
      const deviceShot = beginRainmakerDeviceShot(G.netm, match, e);
      const mesh = visuals.shot(G.teamColors[e.team], e.charge, e.shotOrigin.muzzle);
      shots.push({ releaseStart: new THREE.Vector3(...e.shotOrigin.body), pos: mesh.position, previous: mesh.position.clone(), vel: new THREE.Vector3(...e.aim).normalize().multiplyScalar(e.speed || 90), age: 0, team: e.team,
        actor: a, mesh, deviceShot, origin: mesh.position.clone(), maxRange: e.directRange ?? e.effectiveRange ?? 22, trailRadius: e.trailRadius ?? 2.4, landed: false, wait: 0, damage: e.blastDamage ?? e.splashDamage ?? 180, directDamage: e.damage || 60, outerDamage: e.outerDamage ?? 40, paintRadius: e.paintRadius || e.radius || 5, nearRadius: e.nearRadius ?? 4.6, radius: e.radius ?? 7, visualOnly });
      shots.at(-1).vel.y += e.launchY ?? (e.charge >= 1 ? 16.8 : 8.4);
      visuals.updateShot(mesh, shots.at(-1).vel, 0);
      if (!a.remote && a.vel) {
        const recoil = e.recoil ?? (e.charge >= 1 ? 7.2 : 3.6);
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
            victim: actorId(a), attacker: null, damage: 2000, deathReason: 'rainmaker-timeout', life: a.remote ? a.net?.lastLife ?? a.netLife ?? 0 : a.netLife ?? 0 });
          else a.splat(null, 'rainmaker-timeout');
        }
      }
      explode(e.pos, 1 - e.team, 4, 180, null, visualOnly);
    }
  }
  const ownsDefense = s => s.actor?.remote !== true;
  function retire(s) {
    G.scene.remove(s.mesh);
    s.mesh.getObjectByName('rainmaker-shot-droplets')?.dispose();
  }
  function advanceShot(s, dt, release = false) {
    if (!release) s.previous.copy(s.pos);
    // Native defaults for gravity/drag are not exposed in the pinned dump.
    // These stage-unit trajectories and 0.2s fuse remain local calibration.
    if (!release) { s.pos.addScaledVector(s.vel, dt); s.pos.y -= 30 * dt * dt; s.vel.y -= 60 * dt; s.age += dt; }
    const horizontal = Math.hypot(s.pos.x - s.origin.x, s.pos.z - s.origin.z);
    if (horizontal > s.maxRange) {
      const k = s.maxRange / horizontal;
      s.pos.x = s.origin.x + (s.pos.x - s.origin.x) * k;
      s.pos.z = s.origin.z + (s.pos.z - s.origin.z) * k;
      s.vel.x = s.vel.z = 0;
    }
    const wall = G.physics.segment(s.previous, s.pos, hit, true);
    const sweepLength=s.previous.distanceTo(s.pos);
    let nearest = wall.hit ? wall.dist / Math.max(1e-9, sweepLength) : 1;
    const worldPoint = wall.hit ? wall.point.clone() : null;
    const probe = { owner: s.actor, team: s.team, prev: s.previous, pos: s.pos,
      vel: s.vel, damage: s.directDamage, type: 'rainmaker', wid: 'rainmaker', subId: 'Gachihoko_Bullet', s3BubblerRow: 'Gachihoko_Bullet', size: .16, ghost: !ownsDefense(s) };
    if (s.deviceShot) bindRainmakerDeviceSource(s.deviceShot, probe);
    const defense = G.projectiles?.kitDefenseCandidate?.(probe);
    let blocked = defense && defense.distance <= nearest * sweepLength ? defense : null;
    if (blocked) nearest = blocked.distance / Math.max(1e-9, sweepLength);
    let target = null;
    for (const a of match.actors) if (a.alive && a.team !== s.team) {
      const t = sphereEntryComponents(s.previous.x, s.previous.y, s.previous.z, s.pos.x, s.pos.y, s.pos.z,
        a.pos.x, a.pos.y + .7, a.pos.z, .85);
      if (t !== null && t < nearest) { nearest = t; target = a; blocked = null; }
    }
    let terminal = !!worldPoint || !!blocked || !!target;
    if (target || blocked) s.pos.copy(s.previous.clone().lerp(s.pos, nearest));
    else if (worldPoint) s.pos.copy(worldPoint);
    const floor = match.rankedWorld?.floorAt?.(s.pos.x, s.pos.z, s.pos.y);
    const water = floor === null && s.pos.y <= (api.PLAYER?.waterY ?? -1);
    if (water || s.age > 3 || blocked?.kind === 'ultra-stamp-guard' || blocked?.kind === 'ink-vac') {
      if (blocked && ownsDefense(s)) blocked.onHit(probe);
      retire(s); return true;
    }
    if (blocked?.object?.subId === 'splashWall') s.impactWall = blocked.object;
    if (blocked?.dome) s.impactDome = { center: blocked.dome.pos.clone(), radius: blocked.dome.radius,
      ignited: blocked.dome.ignited, emitterY: blocked.dome.emitterY };
    if (terminal && s.damage > 0) s.blastStart = s.pos.clone().addScaledVector(s.previous.clone().sub(s.pos).normalize(), .01);
    if (blocked && s.deviceShot) recordRainmakerDeviceContact(s.deviceShot, blocked.object || blocked.damageTarget, s.directDamage, 'Gachihoko_Bullet');
    if (blocked && ownsDefense(s)) blocked.onHit(probe);
    if (target && !s.visualOnly) damage(target, s.actor, s.directDamage);
    if (!s.visualOnly && (!release || terminal)) {
      // Falling ink paints the first surface below the swept head; it does
      // not stamp through a ceiling or grant carrier special points.
      const steps = Math.max(1, Math.min(64, Math.ceil(s.previous.distanceTo(s.pos) / .3)));
      // Physics consumes its endpoints synchronously. Keep separate leases for
      // nested shot updates; the paint point remains an independently owned copy.
      const depth = s.trailRayDepth || 0, rays = s.trailRays || (s.trailRays = []);
      const ray = rays[depth] || (rays[depth] = { start: new THREE.Vector3(), end: new THREE.Vector3() });
      s.trailRayDepth = depth + 1;
      try {
        for (let n = 1; n <= steps; n++) {
          const p = ray.start.copy(s.previous).lerp(s.pos, n / steps);
          const ground = G.physics.segment(p, ray.end.set(p.x + 0, p.y - 30, p.z + 0), hit, true);
          if (ground.hit) G.paint?.splat?.(ground.point.clone(), s.trailRadius, s.team,
            { seed: match.ranked.revision % 65536, claimOwner: s.actor, claimMode: 'no-special' });
        }
      } finally { s.trailRayDepth = depth; }
    }
    if (!terminal) return false;
    visuals.splash(s.pos, G.teamColors[s.team], Math.max(.5, s.trailRadius * 2), 'impact');
    if (!(s.damage > 0)) {
      if (!s.visualOnly) G.paint?.splat?.(s.pos.clone(), s.paintRadius, s.team, { claimOwner: s.actor, claimMode: 'no-special' });
      retire(s); return true;
    }
    // Defensive surfaces and Crab Tank skip the ground-impact fuse.
    if (blocked || target?.specialActive?.id === 'crabTank') {
      explode(s.pos.toArray(), s.team, s.radius, s.damage, s.actor, s.visualOnly, s.paintRadius, s.outerDamage, s.nearRadius, true, { from: s.blastStart, impactWall: s.impactWall, dome: s.impactDome, deviceShot:s.deviceShot });
      retire(s); return true;
    } else { s.landed = true; s.wait = .2; }
    return false;
  }
  return {
    event,
    update(dt) {
      if (match.state !== 'playing') return;
      visuals?.update(dt);
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
          if (s.wait > 1e-9) { visuals.updateShot(s.mesh, s.vel, s.age, true, s.wait); continue; }
          explode(s.pos.toArray(), s.team, s.radius, s.damage, s.actor, s.visualOnly, s.paintRadius, s.outerDamage, s.nearRadius, true, { from: s.blastStart, impactWall: s.impactWall, deviceShot:s.deviceShot });
          retire(s); shots.splice(i, 1); continue;
        }
        if (s.releaseStart) {
          s.previous.copy(s.releaseStart); s.releaseStart = null;
          if (advanceShot(s, 0, true)) { shots.splice(i, 1); continue; }
          if (s.landed) { visuals.updateShot(s.mesh, s.vel, s.age, true, s.wait); continue; }
        }
        if (advanceShot(s, dt)) shots.splice(i, 1);
        else visuals.updateShot(s.mesh, s.vel, s.age, s.landed, s.wait);

      }
    },
    dispose() { for (const s of shots) retire(s); shots.length = 0; visuals?.dispose(); },
  };
}
