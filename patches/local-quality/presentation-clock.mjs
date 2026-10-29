import {getPlatformLifecycle} from './platform-lifecycle.mjs';

// A presentation deadline follows visible elapsed time. Its caller keeps a
// separate bounded delta for physical integration and performs one render.
export function createPresentationClock(env=globalThis) {
  const lifecycle=getPlatformLifecycle(env);
  let last=env.performance.now(),active=lifecycle.active,disposed=false;
  const rebase=(now=env.performance.now())=>{last=now;};
  const off=lifecycle.subscribe({
    suspend(){active=false;rebase();},
    resume(){active=true;rebase();},
  });
  const take=now=>{
      const dt=active&&!disposed&&Number.isFinite(now)?Math.max(0,now-last):0;
      if(Number.isFinite(now))last=now;
      return dt;
  };
  return {
    elapsed(now){return take(now)/1000;},
    elapsedMilliseconds(now){return take(now);},
    rebase,
    dispose(){if(disposed)return;disposed=true;off();},
  };
}
