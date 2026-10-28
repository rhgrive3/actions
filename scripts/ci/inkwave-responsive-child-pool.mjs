// Bounded browser-worker fan-out. Every child remains isolated with its own
// filesystem paths; no acceptance case is dropped or silently converted to a pass.
import {spawn} from 'node:child_process';

export async function mapResponsiveCases(cases, workers, runCase) {
  if (!Array.isArray(cases) || !cases.length || !Number.isSafeInteger(workers) || workers < 1 || workers > 2
      || typeof runCase !== 'function') throw TypeError('Invalid bounded responsive worker configuration');
  const output = new Array(cases.length);
  let cursor = 0, firstError = null;
  await Promise.all(Array.from({length:Math.min(cases.length,workers)},async () => {
    while (cursor < cases.length) {
      const index = cursor++;
      try { output[index] = await runCase(cases[index], index); }
      catch (error) { firstError ||= error; }
    }
  }));
  if (firstError) throw firstError;
  return output;
}

// A crashing WebKit renderer must never share a runner with another WebKit
// renderer. Retain two browser workers by giving Chromium and WebKit one
// isolated serial lane each, allowing the two engines to overlap.
export async function mapResponsiveByEngine(cases,workers,runCase) {
  if (workers===1) return mapResponsiveCases(cases,1,runCase);
  if (workers!==2 || !Array.isArray(cases) || typeof runCase!=='function')
    throw TypeError('Invalid engine-owned responsive work');
  const chromium=cases.filter(x=>x?.engine==='chromium');
  const webkit=cases.filter(x=>x?.engine==='webkit');
  if (!chromium.length || !webkit.length || chromium.length+webkit.length!==cases.length)
    throw TypeError('Both browser engines must own every responsive case');
  // Promise.all waits for both complete 7-case lanes. No case disappears if
  // another lane fails; the full 14-case acceptance receipt still fails closed.
  const [a,b]=await Promise.all([
    mapResponsiveCases(chromium,1,runCase),
    mapResponsiveCases(webkit,1,runCase),
  ]);
  return cases.map(item=>item.engine==='chromium'?a[chromium.indexOf(item)]:b[webkit.indexOf(item)]);
}

export function spawnResponsiveCase(program,args,{cwd,timeoutMs=20*60*1000,maxBuffer=16*1024*1024}={}) {
  if (typeof program !== 'string' || !program || !Array.isArray(args) || args.some(a=>typeof a!=='string')
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1
      || !Number.isSafeInteger(maxBuffer) || maxBuffer < 1) throw TypeError('Invalid responsive child process');
  return new Promise(resolve => {
    let child;
    try { child = spawn(program,args,{cwd,stdio:['ignore','pipe','pipe'],shell:false}); }
    catch (error) { resolve({status:null,signal:null,error,stdout:'',stderr:''});return; }
    const out = [], err = [];
    let outBytes = 0, errBytes = 0, error = null, killTimer = null, done = false;
    const stop = problem => {
      error ||= problem;
      if (child.exitCode === null && child.signalCode === null) {
        try { child.kill('SIGTERM'); } catch {}
        if (!killTimer) {
          killTimer=setTimeout(()=>{try{if(!done)child.kill('SIGKILL');}catch{}},5000);
        }
      }
    };
    child.stdout.on('data', bytes => {
      if(outBytes + bytes.length > maxBuffer) { stop(Error('Responsive stdout exceeded '+maxBuffer+' bytes'));return; }
      outBytes += bytes.length;out.push(bytes);
    });
    child.stderr.on('data', bytes => {
      if(errBytes + bytes.length > maxBuffer) { stop(Error('Responsive stderr exceeded '+maxBuffer+' bytes'));return; }
      errBytes += bytes.length;err.push(bytes);
    });
    child.on('error',e=>{error ||= e;});
    const timer=setTimeout(()=>stop(Object.assign(Error('Responsive child exceeded '+timeoutMs+' ms'),{code:'INKWAVE_RESPONSIVE_TIMEOUT'})),timeoutMs);
    child.once('close',(status,signal)=>{
      done=true;clearTimeout(timer);if(killTimer)clearTimeout(killTimer);
      resolve({status,signal,error,stdout:Buffer.concat(out).toString('utf8'),stderr:Buffer.concat(err).toString('utf8')});
    });
  });
}
