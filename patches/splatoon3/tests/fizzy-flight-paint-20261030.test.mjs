import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {paintFizzyFlight} from '../runtime/fizzy-flight-paint.mjs';
import {ALL_SUB_SPECS} from '../runtime/all-subs.mjs';
import {advanceSplashDrops,clearSplashDrops} from '../runtime/blaster-flight-paint.mjs';
import {fixture} from './source-fixture.mjs';

function scheduler(tier=1){
 const owner={remote:false,addTurf(n){this.turf=(this.turf||0)+n;}},system={},events=[];
 const game={projectiles:system,paint:{splat(p,r,team,opts){events.push({p:p.toArray(),r,team,seed:opts.seed,kind:opts.kind,stretch:opts.stretch?.toArray(),amount:opts.stretchAmt,face:opts.face});return 1;}},physics:{segment(a,b,h){h.hit=a.y>=0&&b.y<=0;if(h.hit){const t=a.y/(a.y-b.y);h.point.copy(a).lerp(b,t);h.normal.set(0,1,0);h.dist=a.distanceTo(h.point);h.face=0;}return h;}}};
 const object={subId:'fizzy',owner,team:0,popLimit:tier,spec:ALL_SUB_SPECS.fizzy,seed:0x345879};
 return{owner,object,game,system,events};
}
const V=(x,y,z)=>new THREE.Vector3(x,y,z);
test('real shared falling queue preserves 2.2 spacing across chunkings and uses source width/depth only on terrain',()=>{
 for(const tier of [1,2,3]){
  const rows=[];
  for(const endpoints of [[6.6],[2.19,2.2,4.4,6.6],[.7,1.4,2.1,2.8,3.5,4.2,4.9,5.6,6.3,6.6]]){
   const x=scheduler(tier);let last=0;
   for(const end of endpoints){paintFizzyFlight(x.game,x.object,V(0,2,last),V(0,2,end));last=end;}
   assert.equal(x.object.flySplashDrops,3);assert(Math.abs(x.object.flySplashDistance)<1e-9);
   assert.deepEqual(x.system._s3SplashDrops.map(d=>Math.round(d.pos.z*1e9)/1e9),[2.2,4.4,6.6]);
   assert.equal(x.events.length,0,'airborne drops cannot claim a fabricated floor');
   for(let i=0;i<60;i++)advanceSplashDrops(x.system,1/60,x.game);
   assert.equal(x.events.length,3);assert.equal(x.owner.turf,3);
   for(const e of x.events){assert.equal(e.r,ALL_SUB_SPECS.fizzy.flySplashPaintParam[tier-1].widthHalf);assert.equal(e.kind,'source-splash');assert.equal(e.amount,1.6*(1.6-1));assert.equal(e.face,0);}
   rows.push(x.events.map(e=>({...e,p:e.p.map(n=>Math.round(n*1e9)/1e9)})));
   assert.equal(paintFizzyFlight(x.game,x.object,V(0,2,6.6),V(0,2,6.6)),0,'stationary repeat creates no extra ordinal');
  }
  assert.deepEqual(rows[1],rows[0]);assert.deepEqual(rows[2],rows[0]);
 }
});
test('ghosts, remote owners, dead objects, missed terrain and cleared epochs cannot create flight turf',()=>{
 for(const flag of ['ghost','remote','dead']){const x=scheduler();if(flag==='remote')x.owner.remote=true;else x.object[flag]=true;assert.equal(paintFizzyFlight(x.game,x.object,V(0,2,0),V(0,2,6.6)),0);assert.equal(x.system._s3SplashDrops,undefined);}
 const x=scheduler();x.game.physics.segment=(a,b,h)=>(h.hit=false,h);
 paintFizzyFlight(x.game,x.object,V(0,2,0),V(0,2,6.6));for(let i=0;i<250;i++)advanceSplashDrops(x.system,1/60,x.game);
 assert.equal(x.events.length,0);assert.equal(x.system._s3SplashDrops.length,0);
 paintFizzyFlight(x.game,x.object,V(0,2,6.6),V(0,2,8.8));clearSplashDrops(x.system);advanceSplashDrops(x.system,1,x.game);assert.equal(x.events.length,0);
 const y=scheduler();paintFizzyFlight(y.game,y.object,V(0,2,0),V(0,2,2.2));y.owner.remote=true;advanceSplashDrops(y.system,1,y.game);assert.equal(y.events.length,0,'ownership transfer retires local authoring');
});

async function nativeRun(hz,{wall=null,intercept=null}={}){
 const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true,vmMathRandom:()=>.375});
 const owner=f.make('shooter');owner.weapon={...owner.weapon,sub:'fizzy'};owner.ink=100;owner.pos.set(0,1,0);owner.aimYaw=0;owner.aimPitch=0;owner.aimDir.set(0,0,1);
 const paints=[],events=[];f.G.paint.splat=(p,r,team,opts={})=>{paints.push({p:p.toArray(),r,team,seed:opts.seed,kind:opts.kind,stretch:opts.stretch?.toArray(),amount:opts.stretchAmt});return 0;};
 f.G.physics.segment=(a,b,h)=>{let t=Infinity,normal=[0,1,0];if(a.y>=0&&b.y<=0)t=a.y/(a.y-b.y);if(wall!=null&&a.z<=wall&&b.z>=wall&&b.z!==a.z){const q=(wall-a.z)/(b.z-a.z);if(q<t){t=q;normal=[0,0,-1];}}h.hit=t<=1;if(h.hit){h.point.copy(a).lerp(b,t);h.normal.set(...normal);h.dist=a.distanceTo(h.point);h.face=0;}return h;};
 owner.intent.sub=true;for(let i=0;i<3;i++){f.G.time+=1/60;owner.update(1/60);}owner.intent.sub=false;
 for(let i=0;i<20&&!f.G.projectiles._s3SubObjects?.length;i++){f.G.time+=1/60;owner.update(1/60);}
 const bomb=f.G.projectiles._s3SubObjects?.find(x=>x.subId==='fizzy');assert.ok(bomb,'real WeaponRunner admits and pays for a native throw');assert(owner.ink<100);
 if(intercept!=null){f.G.projectiles.kitDefenseCandidate=p=>p===bomb&&p.prev.z<=intercept&&p.pos.z>=intercept?{distance:p.prev.distanceTo(p.pos)*(intercept-p.prev.z)/(p.pos.z-p.prev.z),point:p.prev.clone().lerp(p.pos,(intercept-p.prev.z)/(p.pos.z-p.prev.z)),onHit(){events.push('intercept');}}:null;}
 const clock=new f.FixedClock();for(let frame=0;frame<hz*3;frame++)clock.advance(1/hz,dt=>{f.G.time+=dt;f.G.projectiles.update(dt);});
 const result={paints:paints.filter(x=>x.kind==='source-splash'),drops:bomb.flySplashDrops||0,pos:bomb.pos.toArray(),pops:bomb.pops,intercepts:events.length,landings:(f.G.projectiles._s3SplashLandings||[]).map(x=>({x:x.releaseX,y:x.releaseY,z:x.releaseZ}))};
 f.G.projectiles.clear();return JSON.parse(JSON.stringify(result));
}
test('actual paid Fizzy throw reaches the new call through the production integrator at 30/60/120 Hz',async()=>{
 const baseline=await nativeRun(60);assert(baseline.drops>0);assert(baseline.paints.length>0);
 assert.deepEqual(await nativeRun(30),baseline);assert.deepEqual(await nativeRun(120),baseline);
});
test('native interception clips the trail before the consumed object and wall response cannot spawn beyond its contact',async()=>{
 const cut=await nativeRun(60,{intercept:2});assert.equal(cut.intercepts,1);assert.equal(cut.drops,0);assert.equal(cut.paints.length,0);
 const wall=await nativeRun(60,{wall:4});assert(wall.paints.length>0);assert(wall.landings.every(x=>x.z<=4+1e-8),'release endpoints never extend beyond the terrain contact (paint centres include the sourced stretch offset)');
});

test('native owner throw and falling terrain contacts replicate through the unchanged paint codec, without a new action phase',async t=>{
 const {fixture:networkFixture}=await import('../../network-replication/tests/robustness-fixture.mjs');
 async function client(id){
  const f=await networkFixture({productionComposition:true});
  class Display{constructor(){this.root=new f.THREE.Group();}_owner(){return this.actor;}trigger(){}setVisible(){}setHurt(){}setWeapon(){}getMuzzle(out){return out.copy(this.actor.pos).add(new f.THREE.Vector3(0,1.05,.3));}}
  const make=(nid,owner,remote,team)=>{const a=new f.Actor({team,name:owner,weapon:'shooter',CharacterClass:Display});a.character.actor=a;Object.assign(a,{nid,owner,remote,netLife:0,grounded:true});a.pos.set(team?100:0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimDir.set(0,0,1);a._resolve=()=>{};return a;};
  const owner=make(7,'peer',id!=='peer',0),other=make(8,'host',id!=='host',1);owner.weapon={...owner.weapon,sub:'fizzy'};
  const session=f.makeSession(id,'host',[['peer','Peer'],['host','Host']]),nm=f.makeNetMatch(session,{id:'fizzy-paint-native'});
  const match=f.bind(nm,[owner,other]);nm.match=null;nm.bind(match);Object.assign(f.G,{actors:[owner,other],match});t.after(()=>nm.dispose());
  const face={paintable:true,su:200,sv:200,turf:true,wall:false,origin:new f.THREE.Vector3(-50,0,-50),u:new f.THREE.Vector3(1,0,0),v:new f.THREE.Vector3(0,0,1),n:new f.THREE.Vector3(0,1,0)};
  const block={aabbMin:new f.THREE.Vector3(-50,-.1,-50),aabbMax:new f.THREE.Vector3(150,.1,150),faces:[0,-1,-1,-1,-1,-1]};face.block=block;
  const level={faces:[face],blocks:[block],pointInside:()=>false,queryBlocks:()=>[0],groundHeight:()=>0};let rt=null,clr=new f.THREE.Color(),alpha=1;
  const renderer={capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>rt,setRenderTarget:v=>{rt=v;},getClearColor:o=>o.copy(clr),getClearAlpha:()=>alpha,setClearColor:(v,a)=>{if(v?.isColor)clr.copy(v);alpha=a;},clear(){},render(){}};
  const paint=f.G.paint=new f.PaintSystem(renderer,level,{atlasSize:1024,maxDensity:5,cell:.5});
  const packets=[];session.tr.broadcast=p=>{packets.push(structuredClone(p));return true;};
  return{f,nm,session,owner,paint,packets};
 }
 const sender=await client('peer'),receiver=await client('host');
 const {owner}=sender;owner.ink=100;owner.intent.sub=true;
 for(let i=0;i<3;i++)owner.weaponRunner.update(1/60,{sub:true,subReleased:false});owner.intent.sub=false;
 for(let i=0;i<30&&!sender.f.projectiles._s3SubObjects?.length;i++)owner.weaponRunner.update(1/60,{sub:false,subReleased:i===0});
 assert(sender.f.projectiles._s3SubObjects?.length>0);const seen=[];
 function deliver(){sender.nm._sendTick();for(const packet of sender.packets.splice(0)){if(packet.k!=='t')continue;seen.push(...(packet.e||[]));receiver.f.clock.set(100+sender.f.G.time);receiver.nm.onMessage('peer',packet);const peer=receiver.nm.peers.get('peer');for(const event of peer?.events.splice(0)||[])receiver.nm._play('peer',event);}}
 for(let i=0;i<180;i++){
  sender.f.G.time+=1/60;sender.f.clock.set(1000+sender.f.G.time);sender.f.projectiles.update(1/60);if(i%3===0)deliver();
 }
 deliver();
 const paints=seen.filter(e=>e[1]==='s'&&e[8]==='source-splash');assert(paints.length>0,'real flight landings use normal native paint rows');
 assert.equal(seen.some(e=>e[1]==='ac'&&e[5]?.phase==='fizzyFlightPaint'),false);
 assert(sender.paint.counts[0]>0);assert.deepEqual(Array.from(receiver.paint.grid),Array.from(sender.paint.grid));
 const before=Array.from(receiver.paint.grid);for(const row of paints.slice().reverse()){const event=structuredClone(row);event._netSeq=event.at(-1);event._netTick=event.at(-2);receiver.nm._play('peer',event);}
 assert.deepEqual(Array.from(receiver.paint.grid),before,'reverse duplicate native rows cannot grant turf twice');
 const wrong=structuredClone(paints[0]);wrong[6]=1;wrong[wrong.length-1]+=1000;wrong._netSeq=wrong.at(-1);wrong._netTick=wrong.at(-2);receiver.nm._play('peer',wrong);
 assert.deepEqual(Array.from(receiver.paint.grid),before,'an owner cannot paint the other team');
});
