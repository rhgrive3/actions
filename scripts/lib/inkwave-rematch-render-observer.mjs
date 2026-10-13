// Diagnostic-only, serializable into page.evaluate. Native functions keep their
// receiver, arguments, return/promise identity and exceptions. No extra render,
// GL query, timer, frame, style read or animation mutation is introduced.
export function installRematchRenderObserver(game, env = globalThis, options = {}) {
  const maxEvents = options.maxEvents ?? 25000;
  const longCallMs = options.longCallMs ?? 50;
  const undo = [], stack = [], installedLabels = [], programs = new WeakMap();
  let serial = 0, active = null;
  const clock = () => env.performance.now();
  const state = () => ({ mode: env.__G?.mode ?? null, menu: game.menus?.current ?? null,
    frame: game._frameN ?? null, attract: !!game.match?.attract, matchState: game.match?.state ?? null });
  const programId = value => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return null;
    if (!programs.has(value)) programs.set(value, ++serial);
    return programs.get(value);
  };
  const observe = (owner, key, label, gl = false) => {
    const native = owner?.[key];
    if (typeof native !== 'function') return;
    const own = Object.getOwnPropertyDescriptor(owner, key);
    const wrapped = function (...args) {
      if (!active) return Reflect.apply(native, this, args);
      const record = active, start = clock(), parents = stack.slice();
      const context = state();
      stack.push(label);
      let value, thrown;
      try { return value = Reflect.apply(native, this, args); }
      catch (error) { thrown = error; throw error; }
      finally {
        stack.pop();
        // Observation failure cannot replace a native return or exception.
        try {
          const durationMs = clock() - start;
          const category = parents.join(' > ') + ' > ' + label;
          const aggregate = record.totals[category] ||= { calls: 0, totalMs: 0, maxMs: 0 };
          aggregate.calls++; aggregate.totalMs += durationMs; aggregate.maxMs = Math.max(aggregate.maxMs, durationMs);
          const event = { label, start, durationMs, parents, ...context };
          if (gl) {
            event.program = programId(args[0]);
            if (key === 'getProgramParameter') event.pname = args[1];
            if (typeof value === 'boolean' || typeof value === 'number') event.result = value;
            if (durationMs >= longCallMs) event.callerStack = String(new Error('render observation').stack || '').slice(0, 6000);
          }
          if (thrown) event.thrown = String(thrown?.message || thrown);
          record.observed++;
          if (record.events.length < maxEvents) record.events.push(event); else record.dropped++;
        } catch (error) { record.observerErrors.push(String(error?.message || error)); }
      }
    };
    Object.defineProperty(owner, key, { configurable: true, writable: true, enumerable: own?.enumerable ?? false, value: wrapped });
    installedLabels.push(label);
    undo.push(() => {
      if (owner[key] !== wrapped) return;
      if (own) Object.defineProperty(owner, key, own); else delete owner[key];
    });
  };
  observe(game, '_frame', 'Game._frame');
  observe(game, '_warmCharacters', 'Game._warmCharacters');
  observe(game.R, 'render', 'world.render');
  observe(game.showcase, 'render', 'showcase.render');
  observe(game.menus, 'update', 'Menus.update');
  const renderer = env.__G?.renderer;
  observe(renderer, 'render', 'WebGLRenderer.render');
  observe(renderer, 'compileAsync', 'WebGLRenderer.compileAsync(sync-part)');
  observe(renderer?.shadowMap, 'render', 'shadowMap.render');
  // Wrap the actual game's existing GL instance, rather than creating another
  // context or touching every canvas/prototype in the page.
  const gl = renderer?.getContext?.();
  for (const key of ['getProgramParameter', 'getProgramInfoLog', 'linkProgram']) observe(gl, key, 'gl.' + key, true);
  return {
    start(round) {
      if (active) throw new Error('Render observation already active');
      active = { round, startedAt: clock(), maxEvents, longCallMs, observed: 0, dropped: 0,
        installedLabels: installedLabels.slice(), observerErrors: [], totals: {}, events: [],
        limitations: 'Synchronous call boundaries only; compileAsync promise completion is not timed. Wrappers/timestamps/stacks add observation cost. No complete trace is claimed if dropped > 0.' };
    },
    snapshot() { return active; },
    stop() { const result = active; if (result) result.stoppedAt = clock(); active = null; return result; },
    dispose() { active = null; for (const restore of undo.reverse()) restore(); },
  };
}
