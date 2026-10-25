// Drive a detached preparation generator without publishing partial resources.
// Each owner chooses safe yield points after its shared scratch is no longer live.
export async function runBuildSlices(steps, { signal, current = () => true, budgetMilliseconds = 4 } = {}) {
  const check = () => { if (signal?.aborted || !current()) throw new DOMException('Aborted', 'AbortError'); };
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  let completed = false, started = now();
  try {
    while (true) {
      check();
      const next = steps.next();
      if (next.done) { completed = true; return next.value; }
      if (now() - started >= budgetMilliseconds) {
        await new Promise(resolve => globalThis.requestAnimationFrame ? globalThis.requestAnimationFrame(resolve) : setTimeout(resolve, 0));
        check(); started = now();
      }
    }
  } finally { if (!completed) steps.return?.(); }
}
