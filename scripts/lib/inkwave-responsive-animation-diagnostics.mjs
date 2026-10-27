export const RESPONSIVE_ANIMATION_PREFIX = 'INKWAVE_RESPONSIVE_ANIMATIONS:';
export const MAX_ANIMATION_MESSAGE = 16384;

// This function is serialized into the page. Keep it self-contained. The
// original cohort and captured finished promises remain the normal fast path.
export async function settleResponsiveAnimationsInPage(observe = false) {
  const animations = document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity);
  const waits = animations.map(a => a.finished.catch(() => {}));
  // Only observed loadout-continuation and stage-switch operations use native
  // whole-cohort confirmation. Other callers retain the promise-only gate.
  if (!observe) { await Promise.all(waits); return; }
  const settled = animations.map(() => false);
  waits.forEach((wait, i) => { wait.then(() => { settled[i] = true; }); });
  let timer;
  if (observe) {
    try {
      const number = value => typeof value === 'number' && Number.isFinite(value)
        ? Math.max(-2147483647, Math.min(2147483647, value)) : null;
      const timing = value => value === Infinity ? 'infinite' : value === -Infinity ? '-infinite'
        : value === 'auto' ? 'auto' : number(value);
      const choice = (value, options) => options.includes(value) ? value : 'other';
      const emit = phase => {
        try {
          const pending = animations.map((animation, index) => ({ animation, index })).filter(row => !settled[row.index]);
          const rows = pending.slice(0, 8).map(({ animation: a, index }) => {
            try {
              const effect = a.effect, target = effect?.target, t = effect?.getTiming();
              const card = target?.closest?.('.iw-wcard');
              // Metadata only: never request style, geometry, visibility or DOM
              // text. Such probes can wake content-visibility skipped content.
              const targetKind = target?.matches?.('.iw-wcard') ? 'weapon-card'
                : card ? 'weapon-card-descendant'
                : target?.closest?.('.iw-continuation-actions') ? 'continuation-action'
                : target?.closest?.('.iw-wd') ? 'weapon-detail' : 'other';
              return { index, kind: typeof a.animationName === 'string' ? 'css-animation'
                : typeof a.transitionProperty === 'string' ? 'css-transition' : 'web-animation',
                name: choice(a.animationName, ['iw-in-up', 'iw-in-down', 'iw-in-left', 'iw-in-right', 'iw-in-pop', 'iw-tip-in', 'iw-ticket-pick', 'iw-pick', 'iw-press', 'iw-squish']),
                property: choice(a.transitionProperty, ['transform', 'translate', 'scale', 'opacity', 'background-color', 'box-shadow', 'filter']),
                playState: choice(a.playState, ['idle', 'running', 'paused', 'finished']), pending: a.pending === true,
                currentTime: number(a.currentTime), startTime: number(a.startTime), playbackRate: number(a.playbackRate),
                timelineTime: number(a.timeline?.currentTime), duration: timing(t?.duration), delay: timing(t?.delay),
                endDelay: timing(t?.endDelay), iterations: timing(t?.iterations),
                targetKind, connected: target?.isConnected === true, artDeferred: card?.getAttribute?.('data-art-deferred') === '1' };
            } catch { return { index, unavailable: true }; }
          });
          console.info('INKWAVE_RESPONSIVE_ANIMATIONS:' + JSON.stringify({ phase,
            finiteCount: Math.min(2147483647, animations.length), pendingCount: Math.min(2147483647, pending.length),
            omittedCount: Math.min(2147483647, Math.max(0, pending.length - rows.length)), visibilityUnobserved: true, rows }));
        } catch {}
      };
      emit('before-await');
      // This watchdog only reports the original captured promises. It never
      // decides completion or changes the acceptance check below.
      timer = setTimeout(() => emit('watchdog'), 1000);
    } catch {}
  }
  // A native CSS transition can report finished while its captured promise
  // remains unresolved after scrolling. Never treat elapsed time as success:
  // recheck every unresolved original object, including any that restarted.
  let stateTimer, stopped = false;
  const allFinished = () => animations.every((animation, i) => {
    if (settled[i]) return true; // Original resolution/cancellation semantics.
    try { return animation.playState === 'finished' && animation.pending === false; }
    catch { return false; } // Unavailable state is not proof of completion.
  });
  const finishedState = () => new Promise(resolve => {
    const schedule = () => {
      try { stateTimer = setTimeout(check, 1000); } catch {} // Keep waiting on native promises.
    };
    const check = async () => {
      stateTimer = undefined;
      if (stopped) return;
      if (allFinished()) {
        // Native finish notification is asynchronous too. A pending play or
        // state reversal during this checkpoint must keep the cohort blocked.
        await Promise.resolve();
        if (stopped) return;
        if (allFinished()) { resolve(false); return; }
      }
      schedule();
    };
    if (animations.length) schedule();
  });
  const nativeFinished = Promise.all(waits).then(() => true);
  try {
    while (true) {
      const nativeCompleted = await Promise.race([nativeFinished, finishedState()]);
      // The state promise and this continuation run in separate microtasks.
      // Revalidate again rather than accepting a reversal in between them.
      if (nativeCompleted || allFinished()) break;
    }
  }
  finally {
    stopped = true;
    for (const id of [timer, stateTimer]) {
      if (id !== undefined) { try { clearTimeout(id); } catch {} }
    }
  }
}

// Revalidate the page message and stored receipt independently. No arbitrary
// strings, DOM values, error text, or unbounded arrays may reach official logs.
export function sanitizeResponsiveAnimations(value) {
  if (!value || typeof value !== 'object' || !['before-await', 'watchdog'].includes(value.phase)
    || !Array.isArray(value.rows)) return null;
  const number = x => typeof x === 'number' && Number.isFinite(x) ? Math.max(-2147483647, Math.min(2147483647, x)) : null;
  const count = x => Number.isSafeInteger(x) && x >= 0 ? Math.min(x, 2147483647) : null;
  const timing = x => ['infinite', '-infinite', 'auto'].includes(x) ? x : number(x);
  const choice = (x, options) => options.includes(x) ? x : 'other';
  return { phase: value.phase, finiteCount: count(value.finiteCount), pendingCount: count(value.pendingCount),
    omittedCount: count(value.omittedCount), visibilityUnobserved: true,
    rows: value.rows.slice(0, 8).map(row => {
      if (!row || typeof row !== 'object' || row.unavailable === true) return { index: count(row?.index), unavailable: true };
      return { index: count(row.index), kind: choice(row.kind, ['css-animation', 'css-transition', 'web-animation']),
        name: choice(row.name, ['iw-in-up', 'iw-in-down', 'iw-in-left', 'iw-in-right', 'iw-in-pop', 'iw-tip-in', 'iw-ticket-pick', 'iw-pick', 'iw-press', 'iw-squish']),
        property: choice(row.property, ['transform', 'translate', 'scale', 'opacity', 'background-color', 'box-shadow', 'filter']),
        playState: choice(row.playState, ['idle', 'running', 'paused', 'finished']), pending: row.pending === true,
        currentTime: number(row.currentTime), startTime: number(row.startTime), playbackRate: number(row.playbackRate),
        timelineTime: number(row.timelineTime), duration: timing(row.duration), delay: timing(row.delay), endDelay: timing(row.endDelay), iterations: timing(row.iterations),
        targetKind: choice(row.targetKind, ['weapon-card', 'weapon-card-descendant', 'continuation-action', 'weapon-detail']),
        connected: row.connected === true, artDeferred: row.artDeferred === true };
    }) };
}

export function parseResponsiveAnimations(text) {
  if (typeof text !== 'string' || text.length > MAX_ANIMATION_MESSAGE || !text.startsWith(RESPONSIVE_ANIMATION_PREFIX)) return null;
  try { return sanitizeResponsiveAnimations(JSON.parse(text.slice(RESPONSIVE_ANIMATION_PREFIX.length))); }
  catch { return null; }
}
