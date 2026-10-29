import test from 'node:test';import assert from 'node:assert/strict';
import{installIntermediateTickBudget}from'../intermediate-tick-budget.mjs';
function fixture(){const calls=[],G={game:{s3Clock:{advancing:true,finalTick:false}},match:{opts:{}}};class Character{constructor(){this.inWorld=true;this.elapsed=0}update(dt,s){calls.push([dt,s]);this.elapsed+=Math.min(.1,dt);return calls.length}}installIntermediateTickBudget({Character},G);return{G,calls,ch:new Character(),s:{isBot:true}}}
test('deferred fixed-tick visual time is conserved beyond the native 100 ms clamp with unchanged ordinary-frame dispatch',()=>{
 for(const ticks of [1,2,3,6,12,30,120,600]){const f=fixture();for(let i=0;i<ticks;i++)f.ch.update(1/60,f.s);f.G.game.s3Clock.finalTick=true;const ret=f.ch.update(1/60,f.s);assert.equal(ret,f.calls.length);assert.ok(f.calls.every(([dt,s])=>dt<=.1&&dt>0&&s===f.s));assert.ok(Math.abs(f.ch.elapsed+f.ch._itbDeferredDt-(ticks+1)/60)<1e-12);assert.ok(f.calls.length<=32);if(ticks<=3)assert.equal(f.calls.length,1);while(f.ch._itbDeferredDt>0)f.ch.update(0,f.s);assert.ok(Math.abs(f.ch.elapsed-(ticks+1)/60)<1e-12);}
});
test('local and range characters retain original per-tick native dispatch',()=>{
 for(const mode of ['local','range']){const f=fixture();if(mode==='local')f.s.isLocal=true;else f.G.match.opts.range=true;f.ch.update(.2,f.s);assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],.2);assert.equal(f.ch._itbDeferredDt,0);}
});

test('real source-loaded Character debt replay matches explicit stable native steps without extra actor events, RNG or gameplay mutation',async()=>{
 const {sourceLoadedActorFixture}=await import('../../splatoon3/tests/source-loaded-actor-fixture.mjs');
 const randomCalls=[0,0],apis=await Promise.all([0,1].map(i=>sourceLoadedActorFixture({sourceOnly:true,random:()=>{randomCalls[i]++;return .4}})));
 try{
  const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character),events=[[],[]];
  chars.forEach((ch,i)=>{ch.isLocal=false;ch.inWorld=true;const emit=ch.onEvent;ch.onEvent=(name,data)=>{events[i].push(structuredClone({name,data}));emit?.(name,data)};apis[i].G.game={s3Clock:{advancing:true,finalTick:false}};apis[i].G.match.opts={};});
  installIntermediateTickBudget(apis[1],apis[1].G);
  const state={isBot:true,form:'kid',grounded:true,speed:3,localMove:{x:.2,z:1},ink:1,hp:1,firing:true,aimPitch:.15,aimDist:10,vy:0};
  const gameplay=a=>({hp:a.hp,ink:a.ink,weapon:a.weapon,position:a.pos.toArray(),velocity:a.vel.toArray()});
  const initial=actors.map(gameplay);
  for(const slices of [[.1,.05],[.1,.1,.05],[.1,.1,.1,.05]]){
   const total=slices.reduce((x,y)=>x+y,0),ticks=Math.round(total*60);
   chars.forEach((ch,i)=>{ch.root.position.x+=.15;ch.root.position.z+=.3;apis[i].G.time+=total;});
   // Independent oracle explicitly advances the stability-sized native calls.
   for(const dt of slices)chars[0].update(dt,state);
   for(let i=0;i<ticks-1;i++){apis[1].G.game.s3Clock.finalTick=false;chars[1].update(1/60,state)}
   apis[1].G.game.s3Clock.finalTick=true;chars[1].update(total-(ticks-1)/60,state);
   assert.ok(Math.abs(chars[1].t-chars[0].t)<1e-12);
   assert.deepEqual(events[1],events[0]);assert.equal(randomCalls[1],randomCalls[0]);
   actors.forEach((a,i)=>assert.deepEqual(gameplay(a),initial[i]));
  }
  assert.ok(events[0].length>0,'exercise real actor footstep emission');
  console.log(JSON.stringify({actualCharacterFootstepEvents:events[0].length,randomCalls,scope:'stable debt-step oracle; actor HP/ink/weapon/position/velocity unchanged'}));
 }finally{apis.forEach(a=>a.reset())}
});
