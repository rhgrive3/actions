import { mainAudioSourceId } from './bank.mjs';
// Audio-only scoped classification for admitted Blaster body contacts.
// Neither projectile physics nor damage/kill authority may depend on this flag.
// Nintendo's exact hit-confirm PCM is not part of the installed 2022 weapon bank.
const splashScopes = new WeakMap();
export const BLASTER_HIT_PITCH = Object.freeze({ direct: 1.16, indirect: 0.84 });

export function withBlasterSplashHit(actor, callback) {
  if (typeof callback !== 'function') throw new TypeError('Missing hit callback');
  if (!actor || typeof actor !== 'object') return callback();
  const depth = splashScopes.get(actor) || 0;
  splashScopes.set(actor, depth + 1);
  try { return callback(); }
  finally {
    if (depth) splashScopes.set(actor, depth);
    else splashScopes.delete(actor);
  }
}

export function blasterHitCueKind(actor, weaponId, damage) {
  // Never classify a special, sub, or an unrelated weapon as a Blaster hit.
  const mainId=mainAudioSourceId(weaponId);
  if (mainId !== 'blaster' &&
      !(typeof mainId === 'string' && mainId.startsWith('s3-blaster-'))) return null;
  const weapon = actor?.weapon;
  if (!weapon || (weapon.kind !== 'blaster' && weapon.behaviorKind !== 'blaster' &&
      weapon.catalogRecord?.family !== 'blaster')) return null;
  const directDamage=weapon.directDamage ?? weapon.catalogRecord?.parameters?.DamageParam?.ValueMax / 10;
  // A late-flight body graze is reduced damage, even though its geometry is
  // outside _blastBurst. It must not announce a full direct hit.
  const reduced=Number.isFinite(damage)&&Number.isFinite(directDamage)&&damage+1e-8<directDamage;
  return splashScopes.has(actor)||reduced ? 'indirect' : 'direct';
}

// The existing hit marker remains a single sound, but its pitch identifies
// direct vs blast-radius contact. These are INKWAVE mix choices, not retail SLINK.
export function blasterHitCuePitch(actor, weaponId) {
  const kind = blasterHitCueKind(actor, weaponId);
  return kind ? BLASTER_HIT_PITCH[kind] : 1;
}
