// #861 opt-in measurement in the ACTUAL browser/device hosting INKWAVE.
// Add ?profileBotPaint=1 to a battle URL, sample __inkwaveBotPaintProfile.
// No network, logging timer, worker, script reload or telemetry upload.
// CPU time here covers real regionStats calls only, not GPU, battery or heat.
const KEY=Symbol.for('inkwave.bot.paint.device.profile.v1');
export function installBotPaintDeviceProfile({ G, Actor }, env=globalThis) {
  if (!/(?:^|[?&])profileBotPaint=1(?:&|$)/.test(env.location?.search || '') ||
      Actor.prototype[KEY]) return null;
  Object.defineProperty(Actor.prototype,KEY,{value:true});
  let paint=null,raw=null,started=env.performance?.now?.() ?? 0;
  const stats={calls:0,cpuMs:0,byMode:Object.create(null),maxCallMs:0};
  const now=()=>env.performance?.now?.() ?? 0;
  const wrap=()=>{
    const next=G.paint;
    if(!next || typeof next.regionStats!=='function'||paint===next)return;
    paint=next;
    raw=next.regionStats;
    paint.regionStats=function(...args) {
      const start=now();
      try { return raw.apply(this,args); }
      finally {
        const elapsed=Math.max(0,now()-start);
        stats.cpuMs+=elapsed;stats.calls++;stats.maxCallMs=Math.max(stats.maxCallMs,elapsed);
        const mode=G.match?.mode === 'boss' ? 'boss' : G.match?.mode === 'turf' ? 'turf' : 'other';
        stats.byMode[mode]=(stats.byMode[mode]||0)+1;
      }
    };
  };
  const update=Actor.prototype.update;
  Actor.prototype.update=function(...args){wrap();return update.apply(this,args);};
  const client={
    snapshot() {
      wrap();
      const elapsedSeconds=Math.max(1e-6,(now()-started)/1000);
      return {calls:stats.calls,callsPerSecond:stats.calls/elapsedSeconds,
        cpuMs:stats.cpuMs,cpuMsPerSecond:stats.cpuMs/elapsedSeconds,
        maxCallMs:stats.maxCallMs,byMode:{...stats.byMode},elapsedSeconds,
        device:env.navigator?.userAgent || 'unidentified',source:'real-browser-PaintSystem.regionStats',
        hardwareFPS:'unmeasured',thermal:'unmeasured'};
    },
    reset() {started=now();stats.calls=0;stats.cpuMs=0;stats.maxCallMs=0;stats.byMode=Object.create(null);},
  };
  env.__inkwaveBotPaintProfile=client;
  return client;
}
