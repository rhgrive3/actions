// Applied after existing whole-method network transforms. Retain strict anchors.
export function adaptQueueCombatNetwork20261029(rel, code) {
  if (rel !== 'src/net/netmatch.js') return code;
  const replace = (before, after, label) => {
    if (code.split(before).length !== 2) throw new Error(`20261029 combat/network anchor: ${label}`);
    code = code.replace(before, after);
  };
  replace('    this.tickT -= dt;',
    '    if (this.isHost && Number.isFinite(dt) && dt > 0) this.clockT -= Math.min(dt, 0.5);\n    this.tickT -= dt;',
    'elapsed host heartbeat on existing tick gate');
  replace('      this.clockT -= TICK;\n', '', 'no per-send clock double decrement');
  return code;
}
