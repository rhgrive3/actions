// node spiral.mjs <site> <cpuRate> <seconds>
import {openGame} from './probe-lib.mjs';
const [site,rate='4',secs='20']=process.argv.slice(2);
const g=await openGame(site,{warm:60});
const cdp=await g.page.context().newCDPSession(g.page);
await g.page.evaluate(()=>{window.__vc.on=false;const game=probeG.game;game._skipRender=true;window.__log=[];const orig=game._frame.bind(game);game._frame=function(dt){const t=performance.now();const r=orig(dt);__log.push([performance.now(),dt,game._s3Ticked||0,game.s3Clock?.accumulator||0,performance.now()-t]);return r;};game.frozen=false;});
await cdp.send('Emulation.setCPUThrottlingRate',{rate:+rate});
await g.page.waitForTimeout(+secs*1000);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
const log=await g.page.evaluate(()=>{probeG.game.frozen=true;return __log;});
const t0=log[0][0];const buckets=[];for(const [t,dt,ticks,acc,ms] of log){const b=Math.floor((t-t0)/2000);(buckets[b]??={frames:0,ticks:0,maxTicks:0,maxAcc:0,ms:0,maxMs:0});const x=buckets[b];x.frames++;x.ticks+=ticks;x.maxTicks=Math.max(x.maxTicks,ticks);x.maxAcc=Math.max(x.maxAcc,acc);x.ms+=ms;x.maxMs=Math.max(x.maxMs,ms);}
console.log('rate',rate,'frames',log.length);for(const [i,b] of buckets.entries())if(b)console.log(`t=${i*2}-${i*2+2}s frames ${b.frames} ticks/frame ${(b.ticks/b.frames).toFixed(1)} max ${b.maxTicks} maxQueued ${(b.maxAcc*1000).toFixed(0)}ms frameMs avg ${(b.ms/b.frames).toFixed(0)} max ${b.maxMs.toFixed(0)} simRate ${(b.ticks/60/2).toFixed(2)}x`);
await g.close();
