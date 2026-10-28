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
