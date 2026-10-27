// A stalled font fetch cannot hold stage creation forever. A late success is
// still observable so the owning canvas can repaint with the intended fonts.
export async function waitForFontBudget(request, budgetMilliseconds = 750) {
  let settled = false, timer;
  const ready = Promise.resolve().then(request).then(
    () => { settled = true; return true; },
    () => { settled = true; return false; },
  );
  try {
    await Promise.race([ready, new Promise(resolve => { timer = setTimeout(resolve, budgetMilliseconds); })]);
  } finally { clearTimeout(timer); }
  return { settled, ready };
}
export function repaintAfterFonts(ready, state) {
  return ready.then(ok => {
    const repaint = state.repaint; state.repaint = null;
    if (ok && repaint) {
      try { repaint(); }
      catch (error) {
        console.warn('[inkwave] late font repaint failed:', String(error?.message || error).slice(0, 240));
      }
    }
  });
}

