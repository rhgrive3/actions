// Actor caches must not own actors for the lifetime of the boot-level FxHooks.
export function adaptFxActorLifetime(rel, code, replaceOnce) {
  if (rel !== 'src/fx/fxHooks.js') return code;
  code = replaceOnce(code, 'this.st = new Map();', 'this.st = new WeakMap();', 'weak FxHooks actor state');
  code = replaceOnce(code, 'this.flickT = new Map();', 'this.flickT = new WeakMap();', 'weak FxHooks Roller state');
  return replaceOnce(code, '    const sub = (name, fn) => on(name, (e) => {',
    `    // Cleanup is independent of effects being enabled or the renderer existing.
    const forgetActor = (actor) => { this.st.delete(actor); this.flickT.delete(actor); };
    on('actor:removed', (e) => forgetActor(e?.actor));
    on('match:dispose', (e) => {
      for (const actor of e?.match?.actors || []) forgetActor(actor);
    });
    const sub = (name, fn) => on(name, (e) => {`, 'FxHooks actor lifecycle consumers');
}
