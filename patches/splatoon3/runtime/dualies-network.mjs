// Replicate the owner's native post-roll turret stance as presentation state.
// The reserved snapshot flag rides NetMatch's existing 20 Hz playback timeline;
// remote weapon logic remains disabled and owner-authoritative.
// Bits 20–26 are already owned by swim, Roller, armor, gear and special readiness.
export const DUALIES_TURRET_FLAG = 1 << 27;
const TURRET = DUALIES_TURRET_FLAG;
const INSTALL = Symbol.for('inkwave.splatoon3.dualies-network.v1');

export function installDualiesNetwork({ NetMatch, Actor } = {}) {
  if (!NetMatch?.prototype) throw Error('Dualies network presentation requires NetMatch');
  const proto = NetMatch.prototype;
  if (Object.hasOwn(proto, INSTALL)) return;

  const sendTick = proto._sendTick;
  const applyRemote = proto.applyRemote;
  const remoteSplat = proto._remoteSplat;
  const remoteRespawn = proto._remoteRespawn;
  const adopt = proto._adopt;
  const sampleRemote = proto._sample;
  const onLeave = proto.onLeave;
  if (typeof sendTick !== 'function' || typeof applyRemote !== 'function'
      || typeof remoteSplat !== 'function' || typeof remoteRespawn !== 'function' || typeof adopt !== 'function'
      || typeof sampleRemote !== 'function' || typeof onLeave !== 'function')
    throw Error('Dualies network presentation requires native NetMatch snapshot methods');

  Object.defineProperty(proto, INSTALL, { value: true });
  const clearPose = (actor, ownerChanged = false) => {
    const n = actor?.net;
    if (n) {
      const bufferedT = n.buf?.length ? n.buf[n.buf.length - 1].t : -Infinity;
      const sampleT = Number.isFinite(n.cur?.t) ? n.cur.t : -Infinity;
      const lastT = Math.max(bufferedT, sampleT);
      if (Number.isFinite(lastT)) n.s3TurretInvalidAt = Math.max(n.s3TurretInvalidAt ?? -Infinity, lastT);
      if (ownerChanged) {
        n.s3TurretInvalidAt = undefined;
        n.s3TurretSource = null;
      }
    }
    if (actor?.character) actor.character.s3RemoteTurretPose = false;
  };

  proto._sendTick = function (...args) {
    const session = this.s, transport = session?.tr, broadcast = transport?.broadcast;
    if (!session || typeof broadcast !== 'function') return sendTick.apply(this, args);

    // _sendTick creates the private packed array internally. Intercept its
    // existing broadcast so the flag is added without changing the protocol shape.
    const wrapped = Object.create(transport);
    Object.defineProperty(wrapped, 'broadcast', {
      configurable: true,
      value: (message, ...rest) => {
        if (message?.k === 't' && Array.isArray(message.a)) {
          for (const sample of message.a) {
            if (!Array.isArray(sample) || !Number.isInteger(sample[10])) continue;
            const actor = this.byNid.get(sample[0]);
            if (!actor || actor.weapon?.kind !== 'dualies') continue;
            sample[10] = actor.weaponRunner?.s3Turret
              ? sample[10] | TURRET
              : sample[10] & ~TURRET;
          }
        }
        return broadcast.call(transport, message, ...rest);
      },
    });
    session.tr = wrapped;
    try { return sendTick.apply(this, args); }
    finally { if (session.tr === wrapped) session.tr = transport; }
  };

  proto._sample = function (actor, ...args) {
    const result = sampleRemote.call(this, actor, ...args);
    if (actor?.remote && actor.net?.ready && actor.net.buf?.length) actor.net.s3TurretSource = actor.owner;
    return result;
  };

  proto.applyRemote = function (actor, dt, ...args) {
    if (actor?.remote && actor.character) {
      const n = actor.net;
      const sample = n?.ready ? n.cur : null;
      const waitingForSpawnSample = !!n?.spawnPending && sample?.tp === n.deathTp;
      const invalidAt = Number.isFinite(n?.s3TurretInvalidAt) ? n.s3TurretInvalidAt : -Infinity;
      const acceptedOwner = n?.s3TurretSource === actor.owner;
      const freshSample = Number.isFinite(sample?.t) && sample.t > invalidAt;
      const flags = actor.alive && !waitingForSpawnSample && acceptedOwner && freshSample ? sample?.f : 0;
      actor.character.s3RemoteTurretPose = actor.weapon?.kind === 'dualies'
        && Number.isInteger(flags) && !!(flags & TURRET);
    }
    return applyRemote.call(this, actor, dt, ...args);
  };

  proto._remoteSplat = function (actor, ...args) {
    clearPose(actor);
    return remoteSplat.call(this, actor, ...args);
  };
  proto._remoteRespawn = function (actor, ...args) {
    clearPose(actor);
    return remoteRespawn.call(this, actor, ...args);
  };
  proto._adopt = function (actor, ...args) {
    clearPose(actor, true);
    return adopt.call(this, actor, ...args);
  };
  proto.onLeave = function (id, ...args) {
    for (const actor of this.byNid.values()) if (actor.owner === id) clearPose(actor, true);
    return onLeave.call(this, id, ...args);
  };

  const setWeapon = Actor?.prototype?.setWeapon;
  if (typeof setWeapon === 'function') Actor.prototype.setWeapon = function (...args) {
    clearPose(this);
    return setWeapon.apply(this, args);
  };
}
