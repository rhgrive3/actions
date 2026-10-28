// Native browser session loss is different from a UI assertion failure.
// Require explicit crash/closure provenance before one independent rerun.
export function shouldRetryResponsiveSessionLoss({engine,name,processResult,fragment}={}) {
  if (engine !== 'webkit' || typeof name !== 'string' ||
      processResult?.status !== 1 || processResult.signal || processResult.error ||
      fragment?.status !== 'failed' || fragment?.errors?.length !== 0 ||
      fragment?.cases?.length !== 1) return false;
  const row=fragment.cases[0],diag=row?.diagnostics;
  if (row.engine !== engine || row.name !== name || row.status !== 'failed' ||
      diag?.pageUnavailable !== true || !Array.isArray(diag.events)) return false;
  const message=String(fragment.error||row.error||'');
  return /Target page, context or browser has been closed|Target closed/i.test(message) &&
    diag.events.some(e=>['page-crash','page-close','browser-disconnected','context-close'].includes(e?.type));
}
