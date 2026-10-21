// node bench.mjs out.json frames rounds siteA siteB  -> ABBA alternation, sim-only per-frame times
import fs from 'node:fs';import {openGame} from './probe-lib.mjs';
const [out,framesS='600',roundsS='2',...sites]=process.argv.slice(2);
const res=sites.map(s=>({site:s,runs:[]}));
const order=[];for(let r=0;r<+roundsS;r++){order.push(...(r%2?[...sites.keys()].reverse():[...sites.keys()]));}
for(const i of order){
 const g=await openGame(sites[i],{warm:60});
 let cdp=null;if(process.env.THROTTLE){cdp=await g.page.context().newCDPSession(g.page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:+process.env.THROTTLE});}
 const r=await g.page.evaluate(frames=>{const game=probeG.game;game._skipRender=true;const ts=[];const R=window.__realNow;
  // characters only
  const C=game.match.actors[0].character.constructor.prototype;const cu=C.update;let ct=0;C.update=function(...a){const t=R();try{return cu.apply(this,a);}finally{ct+=R()-t;}};
  for(let i=0;i<frames;i++){window.__vc.t+=1000/60;const t=R();game._frame(1/60);ts.push(R()-t);}C.update=cu;game._skipRender=false;
  const tot=ts.reduce((a,b)=>a+b,0);ts.sort((a,b)=>a-b);return {mean:tot/frames,p50:ts[frames>>1],p95:ts[Math.floor(frames*.95)],charMean:ct/frames};},+framesS);
 res[i].runs.push(r);console.log(sites[i].split('/').pop(),JSON.stringify(r));await g.close();
}
for(const x of res){const m=x.runs.map(r=>r.mean),c=x.runs.map(r=>r.charMean);console.log(x.site.split('/').pop(),'mean frame',(m.reduce((a,b)=>a+b)/m.length).toFixed(3),'ms  character',(c.reduce((a,b)=>a+b)/c.length).toFixed(3),'ms');}
fs.writeFileSync(out,JSON.stringify(res,null,1));
