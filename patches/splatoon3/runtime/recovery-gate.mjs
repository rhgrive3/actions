// A reload-required recovery is terminal for this page. Ordinary pause and
// successful stage rollback do not set either flag and keep their old behavior.
export function terminalRecoveryRequired(game) {
  return !!(game?.R?._contextLost || game?._nativeWorldRecoveryFatal);
}

const GUARDED = Symbol.for('inkwave.terminal-recovery.entry.v1');
export function installRecoveryEntryGuards(Game) {
  const proto = Game.prototype;
  for (const [name, asynchronous] of [
    ['resume', false], ['_padMenus', false], ['_startAttract', false],
    ['netMatchGo', false], ['netMatchAborted', false],
    ['_startMenuMatch', true], ['startMatch', true], ['startNetMatch', true],
    ['netMatchEnd', true], ['quitToMenu', true],
  ]) {
    const original = proto[name];
    if (typeof original !== 'function' || original[GUARDED]) continue;
    const guarded = function (...args) {
      if (terminalRecoveryRequired(this)) return asynchronous ? Promise.resolve(false) : false;
      return original.apply(this, args);
    };
    guarded[GUARDED] = true;
    proto[name] = guarded;
  }
  // Existing operations may have crossed an await before loss. Their actual
  // flow checks must reject continuations too, without changing token identity.
  const begin = proto._beginMatchFlow;
  if (typeof begin === 'function' && !begin[GUARDED]) {
    const guarded = function (...args) {
      const flow = begin.apply(this, args), current = flow?.current, game = this;
      if (typeof current === 'function') {
        flow.current = function (...values) {
          return !terminalRecoveryRequired(game) && current.apply(this, values);
        };
      }
      return flow;
    };
    guarded[GUARDED] = true;
    proto._beginMatchFlow = guarded;
  }
  // Boot/quality rebuilds can lack a match-flow token. Preserve their existing
  // owner-flow identity check while also fencing a late world publication.
  const build = proto._buildWorld;
  if (typeof build === 'function' && !build[GUARDED]) {
    const guarded = function (map, flow = null, ...rest) {
      if (terminalRecoveryRequired(this)) return Promise.resolve(false);
      const game = this, ownerFlow = this._matchFlow;
      const guardedFlow = flow ? { ...flow, current: (...args) =>
        !terminalRecoveryRequired(game) && flow.current(...args) }
        : { current: () => !terminalRecoveryRequired(game) && game._matchFlow === ownerFlow };
      return build.call(this, map, guardedFlow, ...rest);
    };
    guarded[GUARDED] = true;
    proto._buildWorld = guarded;
  }
}
