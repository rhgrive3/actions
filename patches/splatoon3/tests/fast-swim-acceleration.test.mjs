import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {WEAPON_WEIGHTS} from '../runtime/weapon-weight-data.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
const near=(a,b,m)=>assert.ok(Math.abs(a-b)<1e-8,`${m}: ${a} != ${b}`);
async function world(){
 const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 f.G.level=new f.Level({bounds:{minX:-40,maxX:40,minZ:-40,maxZ:40},spawnPads:[[-30,0,0],[30,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-40,-.5,-40],max:[40,0,40]}]});
 f.G.physics=new f.Physics(f.G.level);return f;
}
function prepare(a,{squid=true,air=false,attack='',vel=0,move=1}={}){
 a.form=squid?'squid':'kid';a.grounded=!air;a.submerged=squid&&!air;a.climbing=false;a.superJumpState=null;
 a.specialActive=attack==='special'?{}:null;a.weaponRunner.firingT=attack==='main'?.3:0;a.weaponRunner.aimingSub=attack==='aim';
 a.intent.sub=attack==='sub';a.intent.squid=squid;a.intent.move.set(0,0,move);a.vel.set(0,0,vel);a.pos.set(0,air?20:0,0);
}
test('all 65 actual Actors select acceleration class independently from speed weight',async()=>{
 const f=await world();assert.deepEqual(Object.entries(WEAPON_WEIGHTS).filter(([,w])=>w.acceleration==='Fast').map(([id])=>id),['s3-shooter-short']);
 for(const [id,w] of Object.entries(WEAPON_WEIGHTS)){
  const a=f.make(id);
  for(const squid of [false,true])for(const attack of ['', 'main','sub','aim','special']){
   prepare(a,{squid,attack});a._horizontal(1/60,squid,false);
   const rate=(attack?72:36*(squid&&w.acceleration==='Fast'?1.5:1))/60;
   const cap=squid?a.s3.modifiers.swimSpeed*f.PLAYER.swimSpeed:a.weaponRunner.moveSpeed();
   near(a.vel.z,Math.min(rate,cap),`${id} ${squid} ${attack}`);
  }
 }
});
test('Fast squid brakes and reverses at 1.5x without multiplying attack rate or leaking across form/weapon switches',async()=>{
 const f=await world(),a=f.make('s3-shooter-short');
 for(const move of [0,-1])for(const attack of ['', 'sub']){
  prepare(a,{move,vel:5,attack});a._horizontal(1/60,true,false);near(5-a.vel.z,attack?1.2:.9,`brake ${move} ${attack}`);
 }
 for(const [id,squid,expected] of [['s3-shooter-first',true,.6],['s3-shooter-short',true,.9],['s3-shooter-short',false,.6],['shooter',true,.6]]){
  a.setWeapon(id);prepare(a,{squid});a._horizontal(1/60,squid,false);near(a.vel.z,expected,'switch '+id);
 }
 // Air is deliberately unchanged until an air-specific reference is established.
 a.setWeapon('s3-shooter-short');prepare(a,{air:true});a._horizontal(1/60,true,false);near(a.vel.z,f.PLAYER.airAccel/60,'unchanged air');
});
test('Fast squid AP changes top speed, not acceleration; 30/60/120 render clocks agree through real Physics',async()=>{
 const f=await world(),a=f.make('s3-shooter-short');a._integrate=f.Actor.prototype._integrate;
 for(const ap of [0,57]){
  a.s3.loadout=emptyLoadout();if(ap)for(const p of a.s3.loadout){p.main='swimSpeed';p.subs=['swimSpeed','swimSpeed','swimSpeed'];}a.s3RefreshGear();
  const traces=[];
  for(const hz of [30,60,120]){
   prepare(a);const clock=new f.FixedClock(),rows=[];
   for(let i=0;i<hz;i++)clock.advance(1/hz,dt=>{a._horizontal(dt,true,false);a._integrate(dt,true,false);rows.push([a.vel.z,a.pos.z]);});
   assert.equal(clock.ticks,60);near(rows[0][0],.9,'first step');traces.push(rows);
  }
  assert.deepEqual(traces[0],traces[1]);assert.deepEqual(traces[1],traces[2]);
  const cap=ap?14.4:12.096;near(traces[0].at(-1)[0],cap,'gear cap');
 }
});
test('Fast owner accelerates once and remote snapshot playback never applies local acceleration',async()=>{
 const f=await world(),a=f.make('s3-shooter-short');prepare(a);
 a.isLocal=true;a.groundTeam=a.team;a.onOwn=true;a._finishFrame=()=>{};
 let calls=0,delta=0;const horizontal=a._horizontal;
 a._horizontal=function(...args){calls++;const v=this.vel.clone();const result=horizontal.apply(this,args);delta=this.vel.clone().sub(v).length();return result;};
 a.update(1/60);assert.equal(calls,1);near(delta,.9,'owner update');
 const sample={x:3,y:8,z:-2,vx:1.25,vy:-.5,vz:2.75,yaw:.2,aimYaw:.3,aimPitch:.1,f:1,hp:100,ink:100,sp:0,turf:0,ch:0,lock:0,tp:0};
 a.alive=true;a.remote=true;a.net={ready:true,cur:sample,err:new f.THREE.Vector3(),prevGrounded:false,prevVy:0,sjTo:null,sjRing:0,spawnPending:false};
 const net=new f.NetMatch({myId:'owner'},{});calls=0;net.applyRemote(a,1/60);assert.equal(calls,0);
 [sample.vx,sample.vy,sample.vz].forEach((v,i)=>near(a.vel.getComponent(i),v,'snapshot '+i));
});
