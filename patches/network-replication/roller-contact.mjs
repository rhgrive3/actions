import { validRemoteActorPose } from './snapshot-guard.mjs';

// Optional presentation only. Bits 0–27 already have owners (including the
// pre-existing Object Shredder/Dualies alias at 27); do not repurpose them.
export const ROLLER_SUSPENDED_FLAG = 1 << 28;
const isRoller = actor => actor?.weapon?.kind === 'roller'
  || actor?.weapon?.catalogRecord?.family === 'roller';

export function packRollerSuspensionFlag(actor) {
  const runner = actor?.weaponRunner;
  return actor?.alive && !actor.remote && isRoller(actor)
    && actor.form !== 'squid' && !actor.submerged && !actor.climbing
    && !actor.specialActive && !actor.superJumpState && !runner?.aimingSub
    && runner?.rolling && runner.flick < 0 && runner.s3RollerSuspendedHold === true
    ? ROLLER_SUSPENDED_FLAG : 0;
}

export function clearRemoteRollerSuspension(actor, invalidateWeapon = false) {
  if (!actor?.remote) return;
  if (actor.weaponRunner) actor.weaponRunner.s3RollerSuspendedHold = false;
  // setWeapon does not clear the transport buffer. Invalidate only this
  // optional presentation, including a same-owner/life Roller → other → Roller.
  // This token is allocated only on weapon changes, never per render frame or
  // on the wire. Snapshot copying preserves its identity.
  if (invalidateWeapon && actor.net) actor.net.rollerContactEpoch = {};
}

function acceptedSample(actor, sample, flags) {
  const net = actor?.net;
  return !!actor?.remote && !!actor.alive && !!net?.ready
    && validRemoteActorPose(sample, net.err)
    && sample.rollerContactOwner === actor.owner
    && sample.rollerContactEpoch === (net.rollerContactEpoch ?? null)
    && Number.isSafeInteger(sample.life) && sample.life >= 0
    && sample.life === (actor.netLife ?? 0)
    && !!(sample.f & flags.alive)
    && !(net.spawnPending && sample.tp === net.deathTp);
}

export function applyRemoteRollerSuspension(actor, sample, flags) {
  const runner = actor?.weaponRunner;
  if (!runner || !actor.remote) return;
  const interrupted = flags.squid | flags.sub | flags.climb | flags.subAim
    | flags.special | flags.sjCharge | flags.sjFlight | flags.flick;
  runner.s3RollerSuspendedHold = isRoller(actor)
    && acceptedSample(actor, sample, flags) && !!(sample.f & flags.rolling)
    && !(sample.f & interrupted) && !!(sample.f & ROLLER_SUSPENDED_FLAG);
}

export function remoteRollerContactAudible(actor, flags) {
  if (!isRoller(actor)) return true; // preserve all unrelated families' existing loop gate
  // _voices runs after sampling but before Actor.applyRemote in production.
  // Read that accepted sample rather than the previous frame's runner flag.
  const sample = actor?.net?.cur;
  return acceptedSample(actor, sample, flags)
    && !(sample.f & ROLLER_SUSPENDED_FLAG);
}
