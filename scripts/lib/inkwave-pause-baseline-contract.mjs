import assert from 'node:assert/strict';
export const PAUSE_BASELINE_SHA='00b8994711809ba6d0469723c858ddef6805e2ae';
const IDLE_SHA256='6995326cb014958afebdaef1453e933f6fda836b2bc7b5b4c3aec763ba9c327a';
export function verifyPauseBaselineProvenance(manifest,sourceSha){
 assert.equal(sourceSha,PAUSE_BASELINE_SHA,'pause baseline must be the fixed already-HUD-optimized main');
 assert.equal(manifest.files?.['local-quality/idle-adapter.mjs'],IDLE_SHA256,'fixed HUD pause owner input');
 assert.equal(manifest.build?.quality?.['idle-adapter.mjs'],IDLE_SHA256,'fixed HUD pause owner build identity');
 assert.equal(manifest.files?.['local-quality/pause-frame-retention.mjs'],undefined,'before must not contain the candidate retention owner');
 return {sourceSha,hudAlreadyOptimized:true,idleAdapterSha256:IDLE_SHA256,retention:false};
}
// Serialized by Playwright into the real browser. One explicit paused frame is
// sampled inside each distinct RAF callback. This is not a display scanout probe.
export async function observePausedRafFrames(){
 const G=window.__G,g=G.game,frames=[],restore=[];let current=-1;
 const counters={world:0,presents:0,captures:0};
 const snapshot=()=>JSON.stringify({time:G.match.time,actors:G.match.actors.map(a=>({hp:a.hp,ink:a.ink,pos:a.pos.toArray()}))});
 const initial=snapshot(),animations=document.getAnimations().filter(a=>[g.hud.el,g.hud.overLayer].some(root=>root===a.effect?.target||root.contains(a.effect?.target))),phases=animations.map(a=>a.currentTime);
 try{
  for(const [key,name]of [['render','world'],['presentPausedFrame','presents'],['capturePausedFrame','captures']]){const own=Object.hasOwn(g.R,key),fn=g.R[key];if(typeof fn!=='function')continue;g.R[key]=function(...args){counters[name]++;return fn.apply(this,args);};restore.push(()=>{if(own)g.R[key]=fn;else delete g.R[key];});}
  for(let i=0;i<120;i++)await new Promise((resolve,reject)=>requestAnimationFrame(timestamp=>{
   current=i;try{
    const before={...counters};g._frame(1/60);const gl=G.renderer.getContext(),pixel=new Uint8Array(4);let lit=0,brightness=0;
    for(const x of [.2,.5,.8])for(const y of [.2,.5,.8]){gl.readPixels(Math.floor(gl.drawingBufferWidth*x),Math.floor(gl.drawingBufferHeight*y),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);const sum=pixel[0]+pixel[1]+pixel[2];brightness+=sum;if(sum>24)lit++;}
    frames.push({index:i,timestamp,deltaMs:frames.length?timestamp-frames.at(-1).timestamp:null,visible:!document.hidden,world:counters.world-before.world,presents:counters.presents-before.presents,captures:counters.captures-before.captures,retained:!!g.R._pauseSnapshot,contextLost:gl.isContextLost(),glError:gl.getError(),lit,brightness,stateUnchanged:snapshot()===initial,hudUnchanged:animations.every((a,j)=>a.playState==='paused'&&a.currentTime===phases[j]),paused:G.match.paused,menu:g.menus.current});resolve();
   }catch(error){reject(error);}
  }));
  return {status:'observed',kind:'120 distinct RAF callbacks; GL samples after paused draw; not compositor scanout',frames};
 }catch(error){return {status:'failed',failedFrame:current,error:String(error?.stack||error),frames};}
 finally{for(const undo of restore.reverse())undo();}
}
export function verifyPausedRafFrames(receipt,{baseline=false}={}){
 assert.equal(receipt.status,'observed',receipt.error);assert.equal(receipt.frames.length,120);
 for(let i=0;i<120;i++){const r=receipt.frames[i];assert.equal(r.index,i);assert(Number.isFinite(r.timestamp));if(i){assert(r.timestamp>receipt.frames[i-1].timestamp);assert.equal(r.deltaMs,r.timestamp-receipt.frames[i-1].timestamp);}else assert.equal(r.deltaMs,null);
  for(const key of ['visible','stateUnchanged','hudUnchanged','paused'])assert.equal(r[key],true,key);
  assert.equal(r.menu,'pause');assert.equal(r.contextLost,false);assert.equal(r.glError,0);assert.equal(r.world,0);assert.equal(r.captures,0);
  assert.equal(r.presents,baseline?0:1);assert.equal(r.retained,!baseline);
  if(baseline){assert.equal(r.lit,0);assert.equal(r.brightness,0);}else assert(r.lit>=3&&r.brightness>120,'each paused RAF must retain a nonblack GL frame');
 }
 return true;
}
