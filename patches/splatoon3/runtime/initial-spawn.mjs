// Initial Turf deployment is scoped to one real Match instance. The owner drives
// its Actor through the existing super-jump flight path; NetMatch carries the
// existing superjump event and owner snapshots to the other clients.
import * as THREE from 'three';
import { G, emit } from '../../../src/core/ctx.js';
import { PLAYER } from '../../../src/config.js';

const sessions = new WeakMap();
const stick = new THREE.Vector2();
const up = new THREE.Vector3(0, 1, 0);
let nextSessionId = 0;
let installed = false;

function configFrom(profile) {
  const c = profile?.initialSpawn;
  if (!c || c.schema !== 1 || c.calibrationStatus !== 'internal-unverified') {
    throw new Error('Initial Turf Spawn requires profile-declared internal calibration settings');
  }
  for (const k of ['selectionSpeed', 'ownZoneRadius', 'ownSideMargin', 'flightSeconds', 'arcBase', 'arcPerMeter', 'landingRadius', 'groundProbeUp', 'groundProbeDown']) {
    if (!Number.isFinite(c[k]) || c[k] <= 0) throw new Error(`Invalid initial-spawn setting: ${k}`);
  }
  return Object.freeze({ ...c });
}

export function beginInitialSpawnSession(match, actors = match?.actors || []) {
  if (!match || typeof match !== 'object' || !Array.isArray(actors)) return null;
  const previous = sessions.get(match);
  if (previous) closeSession(previous);
  const session = { id: ++nextSessionId, match, actors: new Map(), goStarted: false, config: null, networkId: null };
  sessions.set(match, session);
  return session;
}

export function currentInitialSpawnSession(match) {
  return match && typeof match === 'object' ? sessions.get(match) || null : null;
}

export function isCurrentInitialSpawnSession(match, session) {
  return !!session && currentInitialSpawnSession(match) === session && session.match === match;
}

export function endInitialSpawnSession(match, session) {
  if (!isCurrentInitialSpawnSession(match, session)) return false;
  closeSession(session);
  sessions.delete(match);
  return true;
}

function finitePoint(p) { return !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z); }

function clampLanding(actor, candidate, config) {
  const level = G.level, pads = level?.spawnPads;
  if (!finitePoint(candidate) || !pads || !pads[actor.team] || !pads[1 - actor.team] || !G.physics?.groundProbe) return null;
  const pad = pads[actor.team], enemy = pads[1 - actor.team];
  const p = new THREE.Vector3(candidate.x, candidate.y, candidate.z);
  let dx = p.x - pad.x, dz = p.z - pad.z;
  const distance = Math.hypot(dx, dz);
  if (distance > config.ownZoneRadius) {
    const scale = config.ownZoneRadius / distance;
    dx *= scale; dz *= scale;
  }
  const enemyDx = enemy.x - pad.x, enemyDz = enemy.z - pad.z;
  const between = Math.hypot(enemyDx, enemyDz);
  if (between > 1e-4) {
    const ux = enemyDx / between, uz = enemyDz / between;
    const maxForward = Math.max(0, Math.min(config.ownZoneRadius, between * 0.5 - config.ownSideMargin));
    const forward = dx * ux + dz * uz;
    if (forward > maxForward) { dx -= ux * (forward - maxForward); dz -= uz * (forward - maxForward); }
  }
  p.x = pad.x + dx; p.z = pad.z + dz;
  const b = level.bounds;
  if (b) {
    p.x = Math.max(b.minX + 0.35, Math.min(b.maxX - 0.35, p.x));
    p.z = Math.max(b.minZ + 0.35, Math.min(b.maxZ - 0.35, p.z));
  }
  const ground = G.physics.groundProbe(p.x, pad.y, p.z, config.groundProbeUp, config.groundProbeDown,
    PLAYER.footRadius, actor.ground, false);
  if (!ground.hit || ground.normal.y < 0.6) return null;
  p.y = ground.y;
  if (level.pointInside?.(new THREE.Vector3(p.x, p.y + 0.5, p.z), 0.3)) return null;
  return p;
}

function samePoint(a, b) { return finitePoint(a) && finitePoint(b) && a.distanceTo(b) <= 0.08; }

function deterministicSeed(actor) {
  const key = ((actor.team + 1) * 131 + (actor.slot + 1) * 197) % 997;
  return key / 997;
}

function botLanding(actor, config) {
  const pad = G.level.spawnPads[actor.team];
  const angle = actor.slot * 2.399963229728653 + (actor.team ? Math.PI : 0);
  const radius = config.ownZoneRadius * (0.22 + (actor.slot % 4) * 0.11);
  return new THREE.Vector3(pad.x + Math.cos(angle) * radius, pad.y, pad.z + Math.sin(angle) * radius);
}

function makeMarker(position, color, radius, opacity) {
  if (!G.scene) return null;
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.78, radius, 40),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.copy(position); mesh.position.y += 0.06;
  mesh.renderOrder = 5; mesh.frustumCulled = false;
  G.scene.add(mesh);
  return mesh;
}

function removeMarker(marker) {
  if (!marker) return;
  marker.parent?.remove(marker);
  marker.geometry?.dispose?.(); marker.material?.dispose?.();
}

function updateMarker(marker, point) {
  if (marker) { marker.position.x = point.x; marker.position.y = point.y + 0.06; marker.position.z = point.z; }
}

function clearIntent(actor) {
  actor.intent.move.set(0, 0, 0);
  actor.intent.jump = actor.intent.squid = actor.intent.fire = actor.intent.sub = actor.intent.special = false;
}

function closeSession(session) {
  if (!session) return;
  for (const [actor, state] of session.actors) {
    removeMarker(state.sourceMarker); removeMarker(state.targetMarker);
    state.sourceMarker = state.targetMarker = null;
    if (state.phase === 'choice' || state.phase === 'awaiting-owner' || state.phase === 'flight') state.phase = 'cancelled';
    if (actor.initialSpawn === state) actor.initialSpawn = null;
    if (actor.superJumpState?.initialSpawn?.sessionId === session.id) actor.superJumpState = null;
  }
  session.actors.clear();
  session.match.initialSpawnSession = null;
}

function openSession(match, config) {
  const o = match.opts || {};
  if (G.match !== match || G.mode !== 'match' || match.attract || o.attract || match.mode !== 'turf' || o.noBots) return null;
  if (currentInitialSpawnSession(match)) return currentInitialSpawnSession(match);
  const session = beginInitialSpawnSession(match);
  session.config = config;
  session.networkId = G.netm?.match === match ? G.netm.cfg?.id || null : null;
  match.initialSpawnSession = session;
  for (const actor of match.actors) {
    const resolved = clampLanding(actor, actor.pos, config) || actor.pos.clone();
    const proposed = actor.isBot && !actor.isLocal ? botLanding(actor, config) : resolved;
    const target = clampLanding(actor, proposed, config) || resolved.clone();
    const state = {
      session, phase: actor.remote ? 'awaiting-owner' : 'choice', authority: !actor.remote,
      target, origin: actor.pos.clone(), sawFlight: false, eventAccepted: false,
      sourceMarker: makeMarker(actor.pos.clone(), G.teamColors?.[actor.team] || '#fff', 0.82, 0.48),
      targetMarker: actor.isLocal && !actor.remote ? makeMarker(target, G.teamColors?.[actor.team] || '#fff', 0.48, 0.85) : null,
    };
    session.actors.set(actor, state);
    actor.initialSpawn = state;
  }
  return session;
}

function activeChoice(state) {
  const match = state.session.match;
  return isCurrentInitialSpawnSession(match, state.session) && state.authority &&
    match === G.match && G.mode === 'match' && match.state === 'intro' && !match.paused &&
    (!G.game?.menus || !G.game.menus.current);
}

function selectionVector(input) {
  let x = 0, z = 0;
  const down = (key) => !!input?.down?.(key);
  if (down('KeyA') || down('ArrowLeft')) x -= 1;
  if (down('KeyD') || down('ArrowRight')) x += 1;
  if (down('KeyW') || down('ArrowUp')) z += 1;
  if (down('KeyS') || down('ArrowDown')) z -= 1;
  if (input?.pad && input.padStick) {
    input.padStick(0, 1, stick, 0.14, 0.95);
    x += stick.x; z -= stick.y;
  }
  const touch = input?.mobile?.active && input.mobile.root && input.lastDevice === 'touch' ? input.mobile : null;
  if (touch) { x += touch.moveX || 0; z += touch.moveY || 0; }
  const length = Math.hypot(x, z);
  if (length > 1) { x /= length; z /= length; }
  return { x, z };
}

function chooseLanding(controller, dt, state, config) {
  const actor = controller.a;
  clearIntent(actor);
  controller.input?.mobile?.gyro?.discard?.();
  if (!activeChoice(state)) return true;
  const v = selectionVector(controller.input);
  if (Math.hypot(v.x, v.z) < 1e-5 || !(dt > 0)) return true;
  const yaw = Number.isFinite(controller.rig?.yaw) ? controller.rig.yaw : actor.team ? Math.PI : 0;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const worldX = sy * v.z - cy * v.x, worldZ = cy * v.z + sy * v.x;
  const candidate = state.target.clone().add(new THREE.Vector3(worldX, 0, worldZ).multiplyScalar(config.selectionSpeed * dt));
  const landing = clampLanding(actor, candidate, config);
  if (landing) {
    state.target.copy(landing);
    updateMarker(state.targetMarker, landing);
  }
  return true;
}

function seedFor(actor) {
  return deterministicSeed(actor);
}

function startFlights(match, session, config) {
  if (!isCurrentInitialSpawnSession(match, session) || session.goStarted || match.state !== 'playing') return false;
  session.goStarted = true;
  for (const [actor, state] of session.actors) {
    removeMarker(state.sourceMarker); removeMarker(state.targetMarker);
    state.sourceMarker = state.targetMarker = null;
    if (!state.authority || actor.remote || !actor.alive || state.phase !== 'choice' || actor.superJumpState) {
      if (state.phase === 'choice') state.phase = 'cancelled';
      continue;
    }
    const landing = clampLanding(actor, state.target, config) || actor.pos.clone();
    state.target.copy(landing); state.phase = 'flight'; state.sawFlight = true;
    actor._setClimb?.(false);
    actor.weaponRunner?.reset?.();
    actor.form = 'squid'; actor.grounded = false; actor.vel.set(0, 0, 0);
    actor.superJumpState = {
      phase: 'flight', t: 0, dur: config.flightSeconds, from: actor.pos.clone(), to: landing.clone(), marker: 0,
      initialSpawn: {
        sessionId: session.id, arcBase: config.arcBase, arcPerMeter: config.arcPerMeter,
        paintRadius: config.landingRadius, paintSeed: seedFor(actor),
      },
    };
    G.fx?.burst?.(actor.pos.clone().add(new THREE.Vector3(0, 0.3, 0)), up, actor.color, { count: 12, speed: 4, size: 0.08 });
    G.audio?.play?.('super_jump', { pos: actor.isLocal ? undefined : actor.pos, volume: actor.isLocal ? 0.75 : 0.5 });
    emit('superjump', {
      actor, phase: 'flight', to: landing.clone(), initialSpawn: true,
      ...(session.networkId ? { initialSpawnSession: session.networkId } : {}),
    });
  }
  return true;
}

function observeRemoteFlight(netmatch, actor) {
  const session = currentInitialSpawnSession(netmatch.match);
  const state = session?.actors.get(actor);
  if (!state || state.authority || !isCurrentInitialSpawnSession(netmatch.match, session)) return;
  if (actor.superJumpState?.phase === 'flight') state.sawFlight = true;
  else if (state.sawFlight) state.phase = 'landed';
}

export function installInitialSpawn(api, profile) {
  if (installed) throw new Error('Initial Turf Spawn already installed');
  const config = configFrom(profile);
  const { Actor, Match, PlayerController, NetMatch } = api;
  if (!Actor?.prototype || !Match?.prototype || !PlayerController?.prototype || !NetMatch?.prototype) {
    throw new Error('Initial Turf Spawn requires the native Actor, Match, PlayerController and NetMatch');
  }

  const setState = Match.prototype.setState;
  Match.prototype.setState = function (next, ...args) {
    const previous = this.state;
    const result = setState.call(this, next, ...args);
    if (next === 'intro' && previous !== 'intro') openSession(this, config);
    if (previous === 'intro' && next === 'playing') {
      const session = currentInitialSpawnSession(this);
      if (session) startFlights(this, session, config);
    }
    if (next !== 'intro' && next !== 'playing') {
      const session = currentInitialSpawnSession(this);
      if (session) for (const state of session.actors.values()) {
        removeMarker(state.sourceMarker); removeMarker(state.targetMarker);
        state.sourceMarker = state.targetMarker = null;
      }
    }
    return result;
  };

  const disposeMatch = Match.prototype.dispose;
  Match.prototype.dispose = function (...args) {
    const session = currentInitialSpawnSession(this);
    if (session) endInitialSpawnSession(this, session);
    return disposeMatch.apply(this, args);
  };

  const updateController = PlayerController.prototype.update;
  PlayerController.prototype.update = function (dt, ...args) {
    const state = this.a?.initialSpawn;
    if (state?.phase === 'choice' && state.session.config) return chooseLanding(this, dt, state, state.session.config);
    return updateController.call(this, dt, ...args);
  };

  const updateActor = Actor.prototype.update;
  Actor.prototype.update = function (dt, ...args) {
    const state = this.initialSpawn;
    const session = state?.session;
    if (!state || state.phase !== 'flight' || !state.authority || this.remote || !session ||
        !isCurrentInitialSpawnSession(session.match, session) || G.match !== session.match ||
        this.superJumpState?.initialSpawn?.sessionId !== session.id) return updateActor.call(this, dt, ...args);
    const i = this.intent, saved = [i.move.x, i.move.y, i.move.z, i.jump, i.squid, i.fire, i.sub, i.special];
    clearIntent(this);
    let result;
    try {
      result = updateActor.call(this, dt, ...args);
      if (!this.alive) state.phase = 'cancelled';
      else if (this.superJumpState?.initialSpawn?.sessionId !== session.id) state.phase = 'landed';
    } finally {
      i.move.set(saved[0], saved[1], saved[2]);
      i.jump = saved[3]; i.squid = saved[4]; i.fire = saved[5]; i.sub = saved[6]; i.special = saved[7];
    }
    return result;
  };

  const respawn = Actor.prototype.respawn;
  Actor.prototype.respawn = function (...args) {
    if (this.initialSpawn && ['choice', 'awaiting-owner', 'flight'].includes(this.initialSpawn.phase)) this.initialSpawn.phase = 'cancelled';
    return respawn.apply(this, args);
  };

  const play = NetMatch.prototype._play;
  NetMatch.prototype._play = function (from, event, ...args) {
    if (Array.isArray(event) && event[1] === 'ev' && event[2] === 'superjump' && event[3]?.initialSpawn === true) {
      if (this._initialSpawnDisposed || G.netm !== this) return;
      const session = currentInitialSpawnSession(this.match);
      const packed = event[3], actor = this.byNid?.get(packed.actor?.n), state = session?.actors.get(actor);
      if (!actor || !actor.remote || actor.owner !== from || !state || state.authority ||
          !isCurrentInitialSpawnSession(this.match, session) || state.phase !== 'awaiting-owner' ||
          !session.networkId || packed.initialSpawnSession !== session.networkId || packed.initialSpawnSession !== this.cfg?.id) return;
      const xyz = packed.to;
      if (!Array.isArray(xyz) || xyz.length !== 3) return;
      const proposed = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
      const landing = clampLanding(actor, proposed, config);
      if (!landing || !samePoint(landing, proposed)) return;
      state.target.copy(landing); state.phase = 'flight'; state.eventAccepted = true;
    }
    return play.call(this, from, event, ...args);
  };

  const applyRemote = NetMatch.prototype.applyRemote;
  NetMatch.prototype.applyRemote = function (actor, dt, ...args) {
    const result = applyRemote.call(this, actor, dt, ...args);
    observeRemoteFlight(this, actor);
    return result;
  };

  const disposeNetMatch = NetMatch.prototype.dispose;
  NetMatch.prototype.dispose = function (...args) {
    this._initialSpawnDisposed = true;
    return disposeNetMatch.apply(this, args);
  };

  installed = true;
}
