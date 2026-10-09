// Respawn-only state ownership. Fresh match/spawnAt still clears the gauge;
// teammate Super Jump and its invulnerability keep their existing owners.
const EPS = 1e-10, KEYS = ['fire', 'jump', 'sub', 'special', 'squid'];
const INSTALL = Symbol.for('inkwave.s3.respawn-lifecycle.v1');
let beginInitialImpl = null;
export function beginInitialSquidSpawn(actor) { return beginInitialImpl?.(actor) ?? false; }
export function squidSpawnState(actor) { return actor?.s3?.squidSpawn || null; }
export const SPAWN_ARMOR_FLAG = 8388608;
export const SQUID_SPAWN_FLIGHT_DURATION = 60 / 60;
export const SQUID_SPAWN_FLIGHT_INVULNERABILITY = SQUID_SPAWN_FLIGHT_DURATION + 1e-6;
export function spawnProtectionRemaining(actor) {
  if (actor?.remote && actor.s3?.spawnArmorManaged) return actor.s3.spawnArmorRemote ? .1 : 0;
  if (!actor?.s3?.spawnArmorManaged) return actor?.invuln || 0; // legacy non-respawn preview/spawnAt
  const s = actor.s3.spawnArmor;
  return s ? Math.max(0, Math.min(s.remaining, s.breakRemaining ?? Infinity)) : 0;
}
export function advanceSpawnProtection(actor, dt) {
  const s = actor.s3?.spawnArmor;
  if (!s || !actor.alive || !Number.isFinite(dt) || dt <= 0) return;
  s.remaining = Math.max(0, s.remaining - dt);
  if (s.breakRemaining !== null) s.breakRemaining = Math.max(0, s.breakRemaining - dt);
  if (s.remaining <= EPS || s.breakRemaining !== null && s.breakRemaining <= EPS) actor.s3.spawnArmor = null;
}
export function absorbSpawnDamage(actor, amount, source, tuning, attacker = null) {
  const s = actor.s3?.spawnArmor;
  if (!s || source === 'ink' || spawnProtectionRemaining(actor) <= EPS) return amount;
  let penetration = Math.max(0, amount - tuning.maxAbsorb);
  // #999: Roller flicks use cumulative damage groups, but are delivered as
  // incremental contributions. The 100 HP penetration threshold applies ONCE
  // to the whole logical swing, not once per incoming 90 + 60 delta.
  const id = actor.s3PendingHitGroup;
  if (source === 'roller' && attacker && typeof attacker === 'object' && Number.isSafeInteger(id) && id > 0 && amount > 0) {
    const all = s.groupPenetration || (s.groupPenetration = new WeakMap());
    let groups = all.get(attacker);
    if (!groups) { groups = new Map(); all.set(attacker, groups); }
    let prev = groups.get(id) || 0;
    if (groups.size >= 128 && !groups.has(id)) groups.delete(groups.keys().next().value);
    const next = prev + amount;
    penetration = Math.max(0, next - tuning.maxAbsorb) - Math.max(0, prev - tuning.maxAbsorb);
    groups.set(id, next);
  }
  s.hp = Math.max(0, s.hp - amount);
  if (s.hp <= EPS && s.breakRemaining === null) s.breakRemaining = Math.min(s.remaining, tuning.breakDelay);
  return penetration;
}
export function sampleRespawnCountdown(state, fxTime) {
  if (!state.actor) return state.end - fxTime;
  const remaining = state.actor.alive ? 0 : Math.max(0, state.actor.respawnTimer || 0);
  state.total = Math.max(state.total || 0, remaining);
  if (state.ring) {
    state.ring.style.animation = 'none';
    state.ring.style.strokeDashoffset = String(state.circumference * (state.total > 0 ? remaining / state.total : 0));
  }
  return remaining;
}
function physicalHolds(input = {}) {
  const touch = input.mobile?.active && input.mobile.root ? input.mobile : null;
  const down = key => !!input.down?.(key), button = key => !!input.padButton?.(key), value = key => input.padValue?.(key) || 0;
  return {
    fire: !!input.mouse?.left || value(7) > .3 || !!touch?.down('fire'),
    jump: down('Space') || button(0) || !!touch?.down('jump'),
    sub: !!input.mouse?.right || down('KeyE') || button(5) || !!touch?.down('sub'),
    special: down('KeyF') || down('KeyQ') || button(3) || button(11) || !!touch?.down('special'),
    squid: down('ShiftLeft') || down('ShiftRight') || value(6) > .3 || !!touch?.down('squid'),
  };
}
export function installRespawnLifecycle(api, profile) {
  const { Actor, PlayerController, G, emit } = api;
  const A = Actor.prototype;
  if (Object.hasOwn(A, INSTALL)) return;
  Object.defineProperty(A, INSTALL, { value: true });
  const cfg = profile.spawnArmor, reset = A.reset, spawnAt = A.spawnAt, respawn = A.respawn, update = A.update, splat = A.splat;
  const flightDuration = SQUID_SPAWN_FLIGHT_DURATION, steerSpeed = 4.5, minRange = 2.5, maxRange = 12;
  const slotPoint = actor => {
    const pad = G.level.spawnPads[actor.team], count = G.match?.mode === 'boss' ? (G.match?.bossCfg?.squad || 4) : 4;
    const ang = (actor.slot / count) * Math.PI * 2 + 0.6;
    return { pad, x: pad.x + Math.cos(ang) * 1.1, y: pad.y + 4.5, z: pad.z + Math.sin(ang) * 1.1 };
  };
  const supportedTarget = (actor, x, z) => {
    const y = G.level.groundHeight?.(x, z);
    if (!Number.isFinite(y) || typeof actor?._resolve !== 'function' || typeof G.physics?.collideBody !== 'function') return null;
    // groundHeight includes steep top faces which Actor._resolve rejects. Probe
    // a detached actor snapshot through the native body/feet resolver so aim
    // validation cannot mutate the live actor or emit a landing event.
    const probe = Object.assign(Object.create(Object.getPrototypeOf(actor)), actor);
    probe.pos = actor.pos.clone().set(x, y, z);
    probe.vel = actor.vel.clone().set(0, -1, 0);
    probe.grounded = true; // suppress _onLand while retaining _resolve's landing query
    probe.ground = Object.assign({}, actor.ground, { normal: actor.ground.normal.clone() });
    probe.groundN = actor.groundN.clone();
    probe.contacts = { ...actor.contacts, groundNormal: actor.contacts.groundNormal.clone(), wallNormal: actor.contacts.wallNormal.clone() };
    probe._railIds = [];
    probe._resolve(false, y, false);
    return probe.grounded && probe.ground?.hit && probe.pos.x === x && probe.pos.z === z
      ? { x, y: probe.pos.y, z }
      : null;
  };
  const targetFor = actor => {
    const { pad } = slotPoint(actor), aim = actor.aimPoint;
    let dx = Number.isFinite(aim?.x) ? aim.x - pad.x : 0, dz = Number.isFinite(aim?.z) ? aim.z - pad.z : 0;
    let len = Math.hypot(dx, dz);
    if (len < minRange) { const yaw = Number.isFinite(actor.aimYaw) ? actor.aimYaw : (actor.team === 0 ? 0 : Math.PI); dx = Math.sin(yaw) * 7.5; dz = Math.cos(yaw) * 7.5; len = 7.5; }
    if (len > maxRange) { dx *= maxRange / len; dz *= maxRange / len; }
    return supportedTarget(actor, pad.x + dx, pad.z + dz);
  };
  const slotTarget = actor => {
    const { x, z } = slotPoint(actor);
    return supportedTarget(actor, x, z);
  };
  const setPos = (actor, p) => { actor.pos.set(p.x,p.y,p.z); actor.character.root.position.copy(actor.pos); };
  function finishLanding(actor) {
    actor._surface?.();
    actor.vel.set(0,0,0); actor.grounded = true;
    actor.invuln = 0;
    actor.character.root.position.copy(actor.pos);
    delete actor.s3.squidSpawn;
    emit?.('squidspawn:land',{actor});
  }
  function launch(actor) {
    const s = actor.s3?.squidSpawn; if (!s || s.phase !== 'aim') return false;
    const target = s.target && supportedTarget(actor, s.target.x, s.target.z);
    if (!target) return false;
    s.target = target;
    s.phase = 'flight'; s.t = 0; s.duration = flightDuration; s.from = { x: actor.pos.x, y: actor.pos.y, z: actor.pos.z }; s.to = { ...target };
    // Preserve #1005's launch-owned finite armor clock; advanceSpawnProtection
    // consumes it during flight just as it does during other live actor time.
    actor.s3.spawnArmorManaged = true; actor.s3.spawnArmor = { hp: cfg.hp, remaining: cfg.duration, breakRemaining: null };
    actor.invuln = SQUID_SPAWN_FLIGHT_INVULNERABILITY; actor.grounded = false; actor.vel.set(0,0,0); actor.character.trigger('spawn');
    emit?.('squidspawn:launch', { actor, initial: s.initial, target: { ...s.to } });
    return true;
  }
  function begin(actor, initial = false) {
    if (!actor || G.match?.mode !== 'turf' || G.match?.opts?.range) return false;
    const wasDead = !actor.alive, special = actor.special,
      quickRespawnHistory = actor.s3?.quickRespawnHistory, splatsThisLife = actor.s3?.splatsThisLife,
      p = slotPoint(actor), yaw = actor.team === 0 ? 0 : Math.PI;
    actor._respawnLifecycle = { wasDead, special };
    try { const point = actor.pos.clone().set(p.x,p.y,p.z); spawnAt.call(actor, point, yaw); }
    finally { delete actor._respawnLifecycle; }
    // Native spawnAt resets special; a post-death Squid Spawn must preserve the
    // already-finalized death penalty just like the legacy respawn wrapper did.
    if (wasDead) {
      actor.special = special;
      // The native gear wrapper also carries Quick Respawn's no-splat history
      // across spawnAt's reset. Squid Spawn calls spawnAt directly, so keep that
      // post-death gear state here while initial spawn/reset still starts clean.
      if (quickRespawnHistory) actor.s3.quickRespawnHistory = quickRespawnHistory;
      if (Number.isFinite(splatsThisLife)) actor.s3.splatsThisLife = splatsThisLife;
    }
    setPos(actor, p); actor.yaw = actor.aimYaw = yaw; actor.invuln = Infinity; actor.grounded = false; actor.vel.set(0,0,0);
    actor.s3 ||= {}; actor.s3.spawnArmorManaged = true; actor.s3.spawnArmor = null;
    actor.s3.squidSpawn = { phase:'aim', initial:!!initial, wait:0, fireArmed:!actor.intent.fire, target:targetFor(actor) ?? slotTarget(actor) };
    actor.netTp = (actor.netTp || 0) + 1;
    if (wasDead && !actor.isBot && !actor.remote) actor.s3.respawnRearm = new Set(KEYS);
    emit?.('respawn', { actor }); emit?.('squidspawn:aim', { actor, initial:!!initial });
    if (actor.isBot || actor.remote) launch(actor);
    return true;
  }
  beginInitialImpl = actor => begin(actor, true);
  A.reset = function (...args) {
    const result = reset.apply(this, args); this.s3 ||= {};
    delete this.s3.spawnArmor; delete this.s3.spawnArmorManaged; delete this.s3.spawnArmorRemote; delete this.s3.respawnRearm; delete this.s3.squidSpawn;
    for (const key of KEYS) this._prevIntent[key] = false;
    this._firePressT = this._squidPressT = -1;
    return result;
  };
  A.spawnAt = function (...args) {
    const pending = this._respawnLifecycle, result = spawnAt.apply(this, args);
    if (pending) {
      if (pending.wasDead) this.special = pending.special;
      this.invuln = 0;
      this.s3.spawnArmorManaged = true;
      this.s3.spawnArmor = null;
      if (pending.wasDead && !this.isBot && !this.remote) this.s3.respawnRearm = new Set(KEYS);
    }
    return result;
  };
  A.respawn = function (...args) {
    if (!this.alive && G.match?.mode === 'turf' && !G.match?.opts?.range) return begin(this, false);
    this._respawnLifecycle = { wasDead: !this.alive, special: this.special };
    try {
      const result = respawn.apply(this, args);
      // Legacy/non-Turf callers retain the pre-Squid-Spawn finite armor behavior.
      if (this.s3?.spawnArmorManaged && !this.s3.spawnArmor) this.s3.spawnArmor = { hp: cfg.hp, remaining: cfg.duration, breakRemaining: null };
      return result;
    } finally { delete this._respawnLifecycle; }
  };
  A.splat = function (...args) {
    const alive = this.alive, result = splat.apply(this, args);
    if (alive && !this.alive) { this.s3.spawnArmor = null; this.s3.spawnArmorRemote = false; }
    return result;
  };
  A.update = function (dt) {
    advanceSpawnProtection(this, dt);
    const spawn = this.s3?.squidSpawn;
    if (spawn) {
      if (spawn.phase === 'aim') {
        spawn.wait += Number.isFinite(dt) && dt > 0 ? dt : 0;
        if (spawn.transferTargetPending) delete spawn.transferTargetPending;
        else {
          const target = targetFor(this);
          if (target) spawn.target = target;
        }
        if (!this.intent.fire) spawn.fireArmed = true;
        const pressed = spawn.fireArmed && this.intent.fire && !this._prevIntent.fire;
        const auto = this.isBot || this.remote;
        this._prevIntent.fire = this.intent.fire;
        if (pressed || auto) launch(this);
        return;
      }
      if (spawn.phase === 'landing') {
        // A missed touchdown hands motion back to native gravity/collision with
        // controls held until actual support, instead of freezing at an invalid
        // endpoint or awarding armor while airborne.
        const intent=this.intent, moveX=intent.move.x, moveY=intent.move.y, moveZ=intent.move.z;
        const held={fire:intent.fire,jump:intent.jump,sub:intent.sub,special:intent.special,squid:intent.squid};
        intent.move.set(0,0,0);intent.fire=intent.jump=intent.sub=intent.special=intent.squid=false;
        try { update.call(this,dt); }
        finally {
          intent.move.set(moveX,moveY,moveZ);
          Object.assign(intent,held);
        }
        if(!this.alive){delete this.s3.squidSpawn;return;}
        if(this.grounded&&this.ground?.hit)finishLanding(this);
        return;
      }
      if (spawn.phase === 'flight') {
        const oldX=this.pos.x,oldY=this.pos.y,oldZ=this.pos.z,oldT=spawn.t;
        if (this.intent.move?.lengthSq?.() > 1e-10) {
          let x=spawn.to.x+this.intent.move.x*steerSpeed*dt,z=spawn.to.z+this.intent.move.z*steerSpeed*dt;
          const pad=G.level.spawnPads[this.team],dx=x-pad.x,dz=z-pad.z,len=Math.hypot(dx,dz);
          if(len>maxRange){x=pad.x+dx*maxRange/len;z=pad.z+dz*maxRange/len;}
          const target=supportedTarget(this,x,z);
          if(target)spawn.to=target;
        }
        spawn.t = Math.min(spawn.duration, spawn.t + dt); const u=Math.min(1,spawn.t/spawn.duration),arc=Math.sin(Math.PI*u)*2.2;
        this.pos.set(spawn.from.x+(spawn.to.x-spawn.from.x)*u, spawn.from.y+(spawn.to.y-spawn.from.y)*u+arc, spawn.from.z+(spawn.to.z-spawn.from.z)*u);
        this.character.root.position.copy(this.pos); if(dt>0&&oldT<spawn.duration)this.vel.set((this.pos.x-oldX)/dt,(this.pos.y-oldY)/dt,(this.pos.z-oldZ)/dt);
        this._prevIntent.fire = this.intent.fire;
        if (u >= 1-1e-10) {
          // A selected point stays eligible only while the native stage still
          // has support there. A ground-probe miss hands off to native gravity.
          if(!Number.isFinite(spawn.to?.x)||!Number.isFinite(spawn.to?.y)||!Number.isFinite(spawn.to?.z)||
             typeof this._resolve!=='function'||typeof G.physics?.collideBody!=='function'){
            spawn.phase='landing';this.invuln=Infinity;return;
          }
          this.pos.set(spawn.to.x,spawn.to.y,spawn.to.z);
          this._resolve(false,oldY,false);
          this.character.root.position.copy(this.pos);
          if(!this.grounded||!this.ground?.hit){
            spawn.phase='landing';this.invuln=Infinity;
            return;
          }
          finishLanding(this);
        }
        return;
      }
    }
    const blocked = this.s3?.respawnRearm, saved = [];
    if (this.alive && blocked) {
      for (const key of blocked) {
        const held = this.s3.physicalRespawnHeld?.[key] ?? this.intent[key];
        if (!held) { blocked.delete(key); continue; }
        saved.push([key, this.intent[key]]); this.intent[key] = false; this._prevIntent[key] = false;
      }
      if (!blocked.size) delete this.s3.respawnRearm;
    }
    try { return update.call(this, dt); }
    finally { for (const [key, value] of saved) this.intent[key] = value; }
  };
  if (PlayerController) {
    const control = PlayerController.prototype.update;
    PlayerController.prototype.update = function (...args) {
      this.a.s3 ||= {}; this.a.s3.physicalRespawnHeld = physicalHolds(this.input);
      return control.apply(this, args);
    };
  }
}
