// Browser-serializable harness setup. All gameplay objects and capsule helpers
// come from the captured build; this module is never shipped to game clients.
export async function installProjectileCaptureRoster(runtime = null) {
  const host = runtime?.host ?? window;
  const G = runtime?.G ?? host.__G, game = runtime?.game ?? host.__inkwave;
  const check = (ok, message) => { if (!ok) throw new Error('Projectile capture roster: ' + message); };
  let api = runtime;
  if (!api) {
    const base = document.baseURI;
    const [config, hurtbox, motion, gear] = await Promise.all([
      import(new URL('src/config.js', base).href),
      import(new URL('patches/splatoon3/runtime/player-hurtbox.mjs', base).href),
      import(new URL('patches/splatoon3/runtime/actor-motion.mjs', base).href),
      import(new URL('patches/splatoon3/runtime/gear.mjs', base).href),
    ]);
    api = { ...config, ...hurtbox, ...motion, ...gear };
  }
  const { PLAYER, hurtboxRadius, hurtboxHeight, coherentMotionStart, markActorMotionDiscontinuity, emptyLoadout } = api;
  check(PLAYER && [hurtboxRadius, hurtboxHeight, coherentMotionStart, markActorMotionDiscontinuity, emptyLoadout]
    .every(fn => typeof fn === 'function'), 'native config, gear and capsule/motion APIs are required');
  const actors = game?.match?.actors;
  check(game?.frozen && game.match.state === 'playing' && !game.match.attract, 'requires frozen native Turf gameplay');
  check(Array.isArray(actors) && actors.length === 8 && G.actors === actors, 'requires the existing eight native actors in collision order');
  const identity = actors.map(a => ({ actor: a, team: a.team, slot: a.slot, local: !!a.isLocal,
    bot: !!a.isBot, nid: a.nid, owner: a.owner, remote: !!a.remote }));
  check(new Set(identity.map(a => a.team + ':' + a.slot)).size === 8 && identity.every(a =>
    (a.team === 0 || a.team === 1) && Number.isInteger(a.slot) && a.slot >= 0 && a.slot < 4 && !a.remote), 'offline team/slot identities must be unique');
  check(identity.filter(a => a.local).length === 1 && game.match.local === actors.find(a => a.isLocal)
    && game.match.local.team === 0 && game.match.local.slot === 0, 'requires native local team 0 / slot 0');
  const V = G.camera.position.constructor, floors = new Map();
  const clone = value => value === undefined ? null : JSON.parse(JSON.stringify(value));
  const vector = value => value?.toArray?.() ?? null;
  const fields = (source, keys) => Object.fromEntries(keys.map(key => [key, clone(source?.[key])]));
  const verifyIdentity = () => {
    check(game.match.actors === actors && G.actors === actors && actors.length === identity.length, 'native actor list was replaced');
    identity.forEach((saved, i) => {
      const a = actors[i];
      check(a === saved.actor && a.team === saved.team && a.slot === saved.slot && !!a.isLocal === saved.local
        && !!a.isBot === saved.bot && a.nid === saved.nid && a.owner === saved.owner && !!a.remote === saved.remote,
      'native actor identity/order changed at index ' + i);
    });
  };
  const neutral = a => {
    a.intent.move.set(0, 0, 0);
    for (const key of ['fire', 'jump', 'squid', 'sub', 'special']) a.intent[key] = a._prevIntent[key] = false;
    a._firePressT = a._squidPressT = -1; a.fireBuffer = a.jumpBuffer = 0;
  };
  const equipZero = a => {
    check(actors.includes(a) && typeof a.s3RefreshGear === 'function', 'native gear refresh is required');
    a.s3.loadout = emptyLoadout(); a.s3RefreshGear();
    check(Object.values(a.s3.abilityPoints).every(ap => ap === 0), 'capture gear must have zero ability points');
  };
  const snapshot = () => {
    verifyIdentity();
    return { schema: 1, method: 'native Actor.setWeapon / Actor.spawnAt / Actor.reset; existing collision roster',
      actors: actors.map((a, order) => {
        const radius = hurtboxRadius(a, PLAYER), height = hurtboxHeight(a, PLAYER), motion = coherentMotionStart(a);
        check(Number.isFinite(radius) && radius > 0 && Number.isFinite(height) && height > 0, 'native capsule dimensions are invalid');
        const surface = { hit: false, y: 0, normal: new V(), block: -1, face: -1, center: false, grate: false };
        G.physics.groundProbe(a.pos.x, a.pos.y, a.pos.z, .3, .3, PLAYER.footRadius, surface, false);
        return { order, team: a.team, slot: a.slot, isLocal: !!a.isLocal, isBot: !!a.isBot,
          remote: !!a.remote, nid: a.nid ?? null, owner: a.owner ?? null, weapon: a.weaponId,
          pos: vector(a.pos), vel: vector(a.vel), rootPosition: vector(a.character.root.position),
          aim: { yaw: a.yaw, aimYaw: a.aimYaw, aimPitch: a.aimPitch, direction: vector(a.aimDir), point: vector(a.aimPoint) },
          gear: { loadout: clone(a.s3?.loadout), abilityPoints: clone(a.s3?.abilityPoints), modifiers: clone(a.s3?.modifiers) },
          state: fields(a, ['alive', 'hp', 'ink', 'invuln', 'form', 'submerged', 'climbing', 'grounded', 'special', 'specialActive',
            'superJumpState', 'kidT', 'airTime', 'landT', 'lastFire', 'lastDamage', 'fireBuffer', 'jumpBuffer']),
          groundNormal: vector(a.groundN),
          lifecycle: { squidSpawn: clone(a.s3?.squidSpawn), respawnTimer: a.respawnTimer },
          intent: { ...fields(a.intent, ['fire', 'jump', 'squid', 'sub', 'special']), move: vector(a.intent.move) },
          previousIntent: fields(a._prevIntent, ['fire', 'jump', 'squid', 'sub', 'special']),
          weaponClock: fields(a.weaponRunner, ['cooldown', 'charge', 'charging', 'rolling', 'flick', 'slosh', 'streaming',
            'burstT', 'burstDur', 'burstFrac', 'firingT', 'emptyCd', 'aimingSub', 'bloom', 'spread', 'rollT', 'chargeT',
            'flickRecover', 'lockT', 'hand', 'sinceHand', 'rollsLeft', 'rollPaint', 's3FlickVertical']),
          capsule: { radius, height, start: [a.pos.x, a.pos.y + radius, a.pos.z],
            end: [a.pos.x, a.pos.y + Math.max(radius, height - radius), a.pos.z], active: !!a.alive },
          motionStart: motion ? { pos: [motion.x0, motion.y0, motion.z0], form: motion.form, alive: motion.alive } : null,
          resetFloorHit: clone(floors.get(a)),
          floorHit: { hit: !!surface.hit, center: !!surface.center, grate: !!surface.grate, block: surface.block, face: surface.face,
            point: [a.pos.x, surface.hit ? surface.y : a.pos.y, a.pos.z], normal: vector(surface.normal),
            blockTag: G.physics.level.blocks[surface.block]?.tag ?? null },
        };
      }) };
  };
  const reset = () => {
    verifyIdentity();
    check(game.frozen, 'cannot replace actor poses during a live performance window');
    for (const a of actors) {
      const pad = G.level.spawnPads[a.team], x = pad.x + [0, -3, 3, 6][a.slot], z = pad.z;
      const ground = { hit: false, y: 0, normal: new V(), block: -1, face: -1, center: false, grate: false };
      G.physics.groundProbe(x, pad.y, z, 8, 20, PLAYER.footRadius, ground, false);
      check(ground.hit && ground.center && !ground.grate && ground.normal.y >= 0.68 && ground.block >= 0 && ground.face >= 0,
        'team ' + a.team + ' slot ' + a.slot + ' has no centered native walkable floor');
      neutral(a); a.setWeapon(['shooter', 'roller', 'charger', 'slosher'][a.slot]);
      const yaw = a.team === 0 ? 0 : Math.PI;
      a.spawnAt(new V(x, ground.y, z), yaw); neutral(a); equipZero(a);
      a.pos.set(x, ground.y, z); a.vel.set(0, 0, 0); a.invuln = 0;
      a.grounded = true; a.groundN.copy(ground.normal);
      a.yaw = a.aimYaw = yaw; a.aimPitch = 0; a.aimDir.set(Math.sin(yaw), 0, Math.cos(yaw));
      a.aimPoint.copy(a.pos).add(new V(a.aimDir.x * 24, 1.05, a.aimDir.z * 24));
      a.character.root.position.copy(a.pos); a.character.root.rotation.y = yaw; a.character.root.updateMatrixWorld(true);
      markActorMotionDiscontinuity(a);
      check(!a.s3?.squidSpawn && coherentMotionStart(a) === null, 'native lifecycle reset must end startup and stale motion');
      floors.set(a, { hit: true, center: true, grate: false, block: ground.block, face: ground.face,
        point: [x, ground.y, z], normal: vector(ground.normal), blockTag: G.physics.level.blocks[ground.block]?.tag ?? null });
    }
    G.scene.updateMatrixWorld(true);
    return snapshot();
  };
  host.__iwResetProjectileRoster = reset;
  host.__iwResetProjectileGear = equipZero;
  host.__iwProjectileRosterSnapshot = snapshot;
  host.__iwCanonicalRoster = reset();
  return host.__iwCanonicalRoster;
}
