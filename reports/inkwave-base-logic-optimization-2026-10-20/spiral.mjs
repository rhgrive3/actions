// node spiral.mjs <site> <cpuThrottle> <wallSeconds>
// Models a device whose next frame interval is max(1/60 s, previous frame's CPU time),
// with rendering skipped, so only simulation cost drives the fixed clock.
import {openGame} from './probe-lib.mjs';
const [site,rate='4',secs='20']=process.argv.slice(2);
const g=await openGame(site,{warm:60});
const cdp=await g.page.context().newCDPSession(g.page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:+rate});
const log=await g.page.evaluate(secs=>{const game=probeG.game,R=window.__realNow;game._skipRender=true;const out=[];let dt=1/60;const end=R()+secs*1000;
 while(R()<end){window.__vc.t+=dt*1000;const t=R();game._frame(dt);const ms=R()-t;out.push([dt,game._s3Ticked||0,game.s3Clock?.accumulator||0,ms]);dt=Math.max(1/60,ms/1000);}
 game._skipRender=false;return out;},+secs);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
let wall=0;const buckets=[];for(const [dt,ticks,acc,ms] of log){const b=Math.floor(wall/2);wall+=dt;(buckets[b]??={frames:0,ticks:0,maxTicks:0,maxAcc:0,ms:0,maxMs:0,dt:0});const x=buckets[b];x.frames++;x.ticks+=ticks;x.dt+=dt;x.maxTicks=Math.max(x.maxTicks,ticks);x.maxAcc=Math.max(x.maxAcc,acc);x.ms+=ms;x.maxMs=Math.max(x.maxMs,ms);}
console.log('cpu x'+rate,'frames',log.length,'modelled seconds',wall.toFixed(1));
for(const [i,b] of buckets.entries())if(b)console.log(`t=${i*2}-${i*2+2}s fps ${(b.frames/b.dt).toFixed(1)} ticks/frame ${(b.ticks/b.frames).toFixed(1)} max ${b.maxTicks} queued max ${(b.maxAcc*1000).toFixed(0)}ms frame avg ${(b.ms/b.frames).toFixed(0)}ms max ${b.maxMs.toFixed(0)}ms sim/real ${(b.ticks/60/b.dt).toFixed(2)}`);
await g.close();
