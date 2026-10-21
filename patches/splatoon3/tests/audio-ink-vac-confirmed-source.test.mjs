import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fixture } from './kit-composed-fixture.mjs';
// Bind both direct imports and the native fixture to the emitted site when set.
const built=process.env.INKWAVE_BUILT_SITE;
if(Object.hasOwn(process.env,'INKWAVE_BUILT_SITE')){
 assert.ok(built?.trim(),'INKWAVE_BUILT_SITE must name an emitted site, not fall back to source');
 const manifest=JSON.parse(fs.readFileSync(path.join(built,'inkwave-build.json'),'utf8'));
 assert.match(manifest.contentHash,/^[a-f0-9]{64}$/,'emitted site needs its build identity');
}
const root=built?pathToFileURL(path.resolve(built)+path.sep):new URL('../../../',import.meta.url);
const runtime=name=>import(new URL('patches/splatoon3/runtime/'+name,root));
const { installKitInkVac, inkVacAbsorbCandidate, inkVacState, disposeInkVac,
 replayInkVac, installInkVacSenderValidator, INK_VAC_EVENTS }=await runtime('kit-ink-vac.mjs');
const { installKitAudio }=await runtime('audio/kit-runtime.mjs');
const { KIT_FORWARD }=await runtime('kit-network.mjs');

const cue='source:Sp_Blower_Inhale_InkGet_00';
async function setup(fps=60){
 const f=await fixture(),plays=[],audioEvents=[];
 installKitInkVac(f,f.profile);
 f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
 f.G.audio={play(){},duck(){},playWeapon(id,event,options){plays.push({id,event,options});},
   loopWeapon(){return {playing:true,set(){},stop(){this.playing=false;}};}};
 const stops=[];
 const audio=installKitAudio(f,{listen:(name,fn)=>stops.push(f.on(name,fn)),
   options:(actor,pos,volume)=>({actor,pos,volume})});
 const stop=f.on('audio:inkvac-absorbed',e=>audioEvents.push(e));
 const a=f.make('charger');a.isLocal=true;f.G.local=a;
 a.weapon={...a.weapon,special:'inkVac',specialCost:190};a.special=190;
 const tick=seconds=>{for(let i=0;i<Math.ceil(seconds*fps);i++){f.G.time+=1/fps;a.update(1/fps);}};
 a.intent.fire=true;a._startSpecial();tick(1.25);
 const heard=()=>plays.filter(p=>p.id===cue);
 const close=()=>{disposeInkVac(a);audio.dispose();stop();for(const off of stops)off();};
 return {f,a,heard,audioEvents,tick,close};
}
const projectile=f=>({team:1,damage:30,pos:new f.THREE.Vector3(0,1,5),vel:new f.THREE.Vector3(0,0,-3)});
function hit(f,a,p){
 const c=inkVacAbsorbCandidate(a,p.pos,p.pos.clone().addScaledVector(p.vel,1/60),p);
 assert.ok(c,'real intake admits the projectile');return c;
}
for(const fps of [30,60,144])test(`confirmed native projectile absorption plays once at the Vac owner at ${fps} FPS`,async()=>{
 const s=await setup(fps);try{
  const {f,a}=s,shooter=f.make('shooter');shooter.team=1;shooter.pos.set(20,0,0);
  const p={...projectile(f),owner:shooter},c=hit(f,a,p),before=inkVacState(a).charge;
  assert.equal(c.onHit(),true);assert.equal(c.onHit(),false,'same projectile is not credited twice');
  assert.equal(inkVacState(a).charge,before+30/1100,'unchanged damage-equivalent charge');
  assert.equal(s.heard().length,1);assert.equal(s.audioEvents.length,1);
  assert.equal(s.heard()[0].options.actor,a);assert.equal(s.heard()[0].options.pos,a.pos);
  assert.equal(s.heard()[0].event,'fire');
 }finally{s.close();}
});
test('rejected and repeated proposals are silent; accepted owner credit plays exactly once',async()=>{
 const s=await setup();try{
  const {f,a}=s,shooter=f.make('shooter');shooter.team=1;shooter.remote=true;shooter.owner='peer';shooter.nid=77;
  installInkVacSenderValidator((actor,from)=>actor===shooter&&from==='peer');
  const p={actor:shooter,target:a,kit:'inkVac',serial:inkVacState(a).serial,key:'77#p1',damage:30};
  f.emit(INK_VAC_EVENTS.absorb,p);assert.equal(s.heard().length,0,'unadjudicated proposal bus event must stay silent');
  assert.equal(replayInkVac(INK_VAC_EVENTS.absorb,shooter,p,{from:'other'}).applied,false);
  assert.equal(s.heard().length,0);
  assert.equal(replayInkVac(INK_VAC_EVENTS.absorb,shooter,p,{from:'peer'}).applied,true);
  assert.equal(s.heard().length,1);assert.equal(s.heard()[0].options.actor,a);assert.equal(s.heard()[0].options.pos,a.pos);
  assert.equal(replayInkVac(INK_VAC_EVENTS.absorb,shooter,p,{from:'peer'}).applied,false);
  assert.equal(s.heard().length,1,'duplicate proposal must not play again');
 }finally{installInkVacSenderValidator(null);s.close();}
});
for(const fps of [30,60,144])test(`continuous drain, ghost hits, and disposal stay silent at ${fps} FPS`,async()=>{
 const s=await setup(fps);try{
  const {f,a}=s,enemy=f.make('shooter');enemy.team=1;enemy.pos.set(0,0,2);
  const before=inkVacState(a).charge;s.tick(1/6);
  assert.ok(inkVacState(a).charge>before,'real continuous contact still credits the owner');
  assert.equal(s.heard().length,0,'continuous actor contact is not a projectile one-shot');
  const ghost={...projectile(f),ghost:true};assert.equal(hit(f,a,ghost).onHit(),false);assert.equal(s.heard().length,0);
  const c=hit(f,a,projectile(f));disposeInkVac(a);disposeInkVac(a);
  assert.equal(c.onHit(),false);assert.equal(s.heard().length,0,'disposed owner cannot produce a delayed cue');
  s.close();s.close();f.emit('audio:inkvac-absorbed',{actor:a,pos:a.pos});
  assert.equal(s.heard().length,0,'repeated teardown leaves no orphaned absorption listener');
 }finally{s.close();}
});
test('confirmed cue stays outside the real network forwarding contract',async()=>{
 assert.equal(KIT_FORWARD.includes('audio:inkvac-absorbed'),false);
 assert.equal(Object.values(INK_VAC_EVENTS).includes('audio:inkvac-absorbed'),false);
 const f=await fixture(),net=new f.NetMatch({myId:'self',hostId:'self',_members:new Map()},{map:'arena'});
 f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
 try{
  net.bind({actors:[],time:0});const a=f.make('charger');a.nid=1;a.remote=false;
  f.emit('audio:inkvac-absorbed',{actor:a,pos:a.pos});assert.equal(net.out.length,0,'local cue does not enter native outgoing queue');
  f.emit(INK_VAC_EVENTS.charge,{actor:a,kit:'inkVac',serial:1,charge:.5});
  assert.equal(net.out.length,1,'existing confirmed charge still enters outgoing queue');
  assert.equal(net.out[0][2],INK_VAC_EVENTS.charge);
 }finally{net.dispose();net.dispose();}
});
