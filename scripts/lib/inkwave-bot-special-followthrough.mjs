// Shared CPU/browser assertions; all gameplay is performed by the supplied
// installed BotBrain, Actor, Physics and Projectiles, not by this observer.
export const FOLLOWTHROUGH_CASES = Object.freeze([
  ['trizooka', 20], ['tentaMissiles', 20], ['inkjet', 20], ['booyahBomb', 20],
  ['killerWail', 20], ['inkVac', 18], ['crabTank', 20], ['zipcaster', 20],
  ['ultraStamp', 12], ['reefslider', 12], ['tripleSplashdown', 5],
  ['bubbler', 20], ['storm', 20], ['tripleInkstrike', 20], ['tacticooler', 20],
  ['superChump', 20], ['splattercolorScreen', 20], ['waveBreaker', 16],
]);

export async function observeBotSpecialFollowthrough(env, selected = FOLLOWTHROUGH_CASES) {
  const { G, on, prepare, tick, bigBubblerDomes } = env;
  const rows = [];
  for (const [special, distance] of selected) {
    const { a, b, enemy, ally } = await prepare(special, distance);
    if (a.weapon.special !== special) throw Error('Wrong special fixture: ' + special);
    enemy.hp = 100; enemy.special = 0;
    const row = { special, main: a.weaponId, admissions: 0, initialDistance: distance, damage: 0, damageCauses: [],
      actions: {}, emittedRounds: 0, held: false, released: false, landed: false, landedCount: 0,
      waveReached: false, drinkApplied: false, shieldBlocked: false, hookArrived: false,
      paintArea: 0, targetEnd: null, frames: 0, pass: false };
    const stops = [];
    if (special === 'bubbler') enemy.setWeapon('charger');
    stops.push(on('all:special', event => {
      if (event.actor !== a || event.id !== special) return;
      row.actions[event.action] = (row.actions[event.action] || 0) + 1;
      if (event.action === 'hookImpact') row.hookArrived = true;
    }));
    stops.push(on('kit:bubbler:hit', event => {
      if ((event.actor || event.owner) === a && event.amount > 0) row.shieldBlocked = true;
    }));
    const damage = enemy.damage;
    let applyingProjectile = null;
    const burst = G.projectiles._blastBurst;
    G.projectiles._blastBurst = function (projectile, ...rest) {
      const previous = applyingProjectile; applyingProjectile = projectile;
      try { return burst.call(this, projectile, ...rest); }
      finally { applyingProjectile = previous; }
    };
    enemy.damage = function (amount, attacker, cause, ...rest) {
      const hp = this.hp;
      const result = damage.call(this, amount, attacker, cause, ...rest);
      // Zipcaster intentionally uses the equipped main between real hooks.
      // Every other case requires its own special cause, excluding ordinary
      // main fire after a special ends from the claimed effect.
      const projectileOwned = applyingProjectile?.owner === a && (applyingProjectile.wid === special ||
        applyingProjectile.s3AllSpecial === special || applyingProjectile.s3SpecialWeapon?.id === special);
      const owned = attacker === a && (cause === special || projectileOwned || special === 'zipcaster' &&
        a.specialActive?.id === special && row.hookArrived);
      if (owned && this.hp < hp) {
        row.damage += hp - this.hp;
        if (!row.damageCauses.includes(cause)) row.damageCauses.push(cause);
      }
      return result;
    };
    const push = G.projectiles._push;
    G.projectiles._push = function (projectile) {
      if (projectile.owner === a && (projectile.s3AllSpecial === special || projectile.wid === special ||
        projectile.s3SpecialWeapon?.id === special || special === 'zipcaster' && a.specialActive?.id === special)) row.emittedRounds++;
      return push.call(this, projectile);
    };
    const succeeded = () => {
      if (special === 'bubbler') return row.landed && row.shieldBlocked;
      if (special === 'tacticooler') return row.landed && row.drinkApplied;
      if (special === 'waveBreaker') return row.landed && row.waveReached && row.damage > 0;
      if (special === 'superChump') return row.landedCount === 12 && row.actions.balloon === 12 && row.paintArea > 0;
      if (special === 'splattercolorScreen') return row.landed && row.actions.cross > 0 && row.damage > 0;
      if (special === 'zipcaster') return row.actions.zip > 0 && row.hookArrived && row.damage > 0;
      if (special === 'tentaMissiles') return row.actions.target > 0 && row.actions.launch > 0 && row.damage > 0;
      if (special === 'killerWail') return row.actions.target > 0 && row.actions.laser > 0 && row.damage > 0;
      if (special === 'tripleInkstrike') return row.actions.marker === 3 && row.damage > 0;
      if (special === 'reefslider') return row.actions.impact > 0 && row.damage > 0;
      return row.damage > 0;
    };
    try {
      for (let frame = 0; frame < 900 && !succeeded(); frame++) {
        const beforeSub = a.intent.sub;
        if (special === 'bubbler') {
          const dome = bigBubblerDomes().find(d => d.owner === a && !d.dead);
          if (dome?.ignited && dome.radius > 1) {
            row.landed = true;
            // A real enemy Charger shot must hit the live barrier. Its native
            // charge/release, ammo and collision paths are retained.
            enemy.intent.fire = !(enemy.weaponRunner.charging && enemy.weaponRunner.charge >= 1);
            enemy.aimYaw = Math.PI; enemy.aimPitch = 0;
            enemy.aimPoint.copy(a.pos); enemy.aimPoint.y += 1.05;
          }
        }
        tick(a, b, enemy, ally);
        row.held ||= a.intent.sub;
        row.released ||= beforeSub && !a.intent.sub;
        row.frames = frame + 1; row.admissions = a.stats.specials;
        let landedCount = 0;
        for (const o of G.projectiles._s3AllSpecialObjects || []) {
          if (o.owner !== a || o.id !== special) continue;
          if (o.kind === 'waveFront' && enemy.s3?.revealedUntil?.[a.team] > G.time) row.waveReached = true;
          if (o.kind === 'decoy' && o.phase === 'active' || o.kind === 'wave' && o.phase !== 'flight' ||
            o.kind === 'screen' && o.phase !== 'flight') row.landed = true;
          if (o.kind === 'decoy' && o.phase === 'active') landedCount++;
        }
        row.landedCount = Math.max(row.landedCount, landedCount);
        if (special === 'tacticooler') {
          row.landed ||= (G.projectiles._s3SupportCoolers || []).some(o => o.owner === a);
          row.drinkApplied ||= !!ally?.s3?.drink && ally.s3.drinkUntil > G.time;
        }
        row.paintArea = a.stats.turf;
      }
      row.targetEnd = enemy.pos.toArray();
      row.targetHp = enemy.hp; row.targetAlive = enemy.alive;
      row.pass = row.admissions === 1 && succeeded();
      rows.push(row);
    } finally {
      enemy.damage = damage; G.projectiles._push = push; G.projectiles._blastBurst = burst;
      for (const stop of stops) stop?.();
    }
  }
  return rows;
}
