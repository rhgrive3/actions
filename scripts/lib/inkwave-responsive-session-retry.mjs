// A closure during the normal finally cleanup is not independent crash proof.
// The unchanged runner records first-error once before its single cleanup-start;
// page errors before then are retained in fragment.errors. Require that actual
// retained ordered evidence, and fail closed if the primary error is unclear.
export function shouldRetryResponsiveSessionLoss(input={}) {
  const {engine,name,processResult,fragment}=input ?? {};
  if (engine !== 'webkit' || typeof name !== 'string' ||
      processResult?.status !== 1 || processResult.signal || processResult.error ||
      fragment?.status !== 'failed' || !Array.isArray(fragment?.errors) || fragment.errors.length !== 0 ||
      !Array.isArray(fragment?.cases) || fragment.cases.length !== 1) return false;
  const row=fragment.cases[0],diag=row?.diagnostics;
  if (!row || typeof row !== 'object' || row.engine !== engine || row.name !== name || row.status !== 'failed' ||
      diag?.pageUnavailable !== true || !Array.isArray(diag.events) ||
      diag.events.length > 32 || !Number.isSafeInteger(diag.droppedEvents) || diag.droppedEvents < 0) return false;
  const message=fragment.error;
  if(typeof message !== 'string' || row.error !== message || diag.firstError?.message !== message ||
      !/Target page, context or browser has been closed|Target closed/i.test(message)) return false;
  const events=diag.events;
  if(!events.every((e,i)=>e && typeof e.type==='string' && Number.isFinite(e.ms) && e.ms>=0 &&
      (!i || e.ms>=events[i-1].ms))) return false;
  const first=events.findIndex(e=>e.type==='first-error');
  const cleanup=events.findIndex(e=>e.type==='context-close-start');
  const crash=events.findIndex(e=>e.type==='page-crash');
  if(crash<0 || first<=crash || cleanup<=first || events[first].detail!==message ||
      events.filter(e=>e.type==='first-error').length!==1 ||
      events.filter(e=>e.type==='context-close-start').length!==1) return false;
  const terminal=new Set(['context-close-start','page-close','context-close','browser-disconnected','fatal-pageerror-context-closing']);
  return !events.slice(0,crash).some(e=>terminal.has(e.type));
}

// Recovery must describe the same source and runner, not only a fresh profile.
export function sameResponsiveRecoveryIdentity(first,retry) {
  const valid=record=>!!record && typeof record==='object' && !Array.isArray(record) &&
    Object.keys(record).length>0 && Object.entries(record).every(([key,value])=>
      key.length>0 && typeof value==='string' && /^[a-f0-9]{64}$/.test(value));
  const same=(a,b)=>valid(a)&&valid(b)&&Object.keys(a).length===Object.keys(b).length &&
    Object.keys(a).every(key=>Object.hasOwn(b,key)&&a[key]===b[key]);
  return same(first?.sourceHashes,retry?.sourceHashes) && same(first?.runnerHashes,retry?.runnerHashes) &&
    typeof first?.runtimeInstalled==='boolean' && first.runtimeInstalled===retry?.runtimeInstalled;
}
