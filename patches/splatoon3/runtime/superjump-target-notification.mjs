const INSTALL_KEY = Symbol.for('inkwave.splatoon3.issue909.superjump-target.v1');

function isTeammateActor(actor, target) {
  return !!(actor && target && target !== actor && target.alive === true && target.character && target.pos?.isVector3 &&
    Number.isFinite(actor.team) && actor.team === target.team);
}

export function installSuperJumpTargetNotification({ Actor, emit }) {
  const proto = Actor?.prototype;
  if (!proto || typeof emit !== 'function' || typeof proto.superJump !== 'function')
    throw new Error('INKWAVE #909 Super Jump target installer requires Actor and emit');
  if (proto[INSTALL_KEY]) return;

  const original = proto.superJump;
  const pending = new WeakMap();
  const select = (actor, target) => {
    if (!isTeammateActor(actor, target) || (typeof actor.canSuperJump === 'function' && !actor.canSuperJump())) {
      pending.delete(actor); return null;
    }
    const ticket = {};
    pending.set(actor, { target, ticket });
    emit('superjump', { actor, phase: 'target', target });
    return ticket;
  };

  Object.defineProperty(proto, 'selectSuperJumpTarget', {
    configurable: true,
    value(target) { return select(this, target); },
  });
  Object.defineProperty(proto, 'cancelSuperJumpTargetSelection', {
    configurable: true,
    value(ticket) {
      const selected = pending.get(this);
      if (!selected || (ticket !== undefined && selected.ticket !== ticket)) return false;
      pending.delete(this);
      return true;
    },
  });
  proto.superJump = function (target, ticket) {
    if (!isTeammateActor(this, target) || (typeof this.canSuperJump === 'function' && !this.canSuperJump())) {
      pending.delete(this);
      return original.call(this, target);
    }
    let selected = pending.get(this);
    if (!selected || selected.target !== target || selected.ticket !== ticket) {
      ticket = select(this, target);
      selected = pending.get(this);
    }
    if (selected && selected.target === target && selected.ticket === ticket) pending.delete(this);
    return original.call(this, target);
  };
  Object.defineProperty(proto, INSTALL_KEY, { configurable: true, value: true });
}
