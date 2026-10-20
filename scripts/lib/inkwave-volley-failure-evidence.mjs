// Host-side failure evidence only: no browser call, retry, state change, or acceptance decision.
import fs from 'node:fs';
import path from 'node:path';
export function persistVolleyFailure(directory, detail, error, io = fs) {
  const receipt = { status: 'failed', ...detail, failure: {
    name: String(error?.name || 'Error'), message: String(error?.message || error).slice(0, 4000),
    stack: String(error?.stack || '').slice(0, 12000),
  } };
  try {
    io.mkdirSync(directory, { recursive: true });
    const target=path.join(directory,'volley-vortex-failure.json'),temporary=target+'.tmp';
    io.writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n');
    io.renameSync(temporary,target);
    return { status: 'written' };
  } catch (writeError) {
    return { status: 'unavailable', error: String(writeError?.message || writeError).slice(0, 2000) };
  }
}
// Run all teardown attempts. A secondary teardown rejection must not replace
// the exact original test failure. Successful tests still fail broken teardown.
export async function cleanupVolleyResources(actions, primaryError) {
  const errors = [];
  for (const action of actions) try { await action(); } catch (error) { errors.push(error); }
  if (!primaryError && errors.length) throw errors[0];
  return errors.map(error => String(error?.message || error).slice(0, 2000));
}

// A failed browser may no longer answer. Record timeouts without blocking receipt
// upload; observe late rejections without retrying or altering the original error.
export async function boundedVolleySnapshot(read, timeoutMs = 2000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read).then(value => ({status:'captured',value}), error => ({status:'unavailable',error:String(error?.message||error).slice(0,2000)})),
      new Promise(resolve => { timer=setTimeout(()=>resolve({status:'timed-out',timeoutMs}),timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}
