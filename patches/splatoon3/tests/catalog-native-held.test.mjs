import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let loaded;
async function setup(){
 if(loaded)return loaded;
 const f=await fixture({includeCharacter:true,fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:`export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';`});
 const api=f.installedRuntime,{G,THREE:T}=api;f.installMainWeaponCatalogRuntime(api,f.profile);
 G.scene=new T.Scene();G.camera=new T.PerspectiveCamera();G.camera.position.set(0,2,3);
 const floor={id:0,solid:true,grate:false,center:new T.Vector3(0,-.5,0),half:new T.Vector3(50,.5,50),axes:[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)],aabbMin:new T.Vector3(-50,-1,-50),aabbMax:new T.Vector3(50,0,50),faces:[-1,-1,-1,-1,-1,-1]};
 G.level={blocks:[floor],faces:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,o)=>{o.length=0;o.push(0);return o;}};
 G.physics=new api.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};G.match={playing:()=>true};G.actors=[];
 G.projectiles=new api.Projectiles(G.scene);return loaded={...f,...api};
}
function create(f,id,team){const {G,Actor,Character}=f;G.projectiles.clear();G.actors=[];
 const a=new Actor({team,weapon:id,isLocal:false,name:'admitted held verifier',CharacterClass:Character,style:{hair:0,skin:2,outfit:0,eyes:0}});a.character.actor=a;a.character.onEvent=null;G.actors=[a];
 const events=[],trigger=a.character.trigger.bind(a.character);a.character.trigger=(name,arg)=>{events.push({name,arg,time:G.time,projectiles:G.projectiles.list.length});return trigger(name,arg);};
 const step=(fire=false)=>{a.intent.fire=fire;G.time+=1/60;a.update(1/60);assert.equal(a.character.root.parent,null,'character stays off-scene');};
 for(let i=0;i<60;i++)step();assert.equal(a.grounded,true);events.length=0;return {a,events,step};
}
for(const [preferred,base] of [['s3-stringer-normal-02','s3-stringer-normal'],['s3-charger-quick-01','s3-charger-quick']])test(base+' family actual Actor input admits release, projectile and native firing pose',async()=>{
 const f=await setup(),id=f.WEAPONS[preferred]?preferred:base;console.log('NATIVE_FAMILY_SELECTION',JSON.stringify({base,requestedVariant:preferred,actual:id,variantCoverage:id===preferred?'applicable':'not applicable; variant absent'}));for(const team of [0,1]){const {a,events,step}=create(f,id,team),ch=a.character;
 try{const initialInk=a.ink;let frames=0;do{step(true);assert.equal(events.filter(e=>e.name==='charge_release').length,0);assert.equal(f.G.projectiles.list.length,0);}while(a.weaponRunner.charge<.999&&++frames<240);
 assert.ok(a.weaponRunner.charge>=.999,'actual input reaches full charge');assert.ok(ch._wst.charge>.9);
 const beforeInk=a.ink;step(false);const release=events.filter(e=>e.name==='charge_release');
 assert.equal(release.length,1);assert.ok(release[0].projectiles>0,'projectile precedes release notification');assert.ok(f.G.projectiles.list.length>0);assert.ok(a.ink<initialInk,'admitted charge spends ink through the catalog runner');
 assert.equal(a.weaponRunner.firingT,0,'catalog initial release does not assign the upstream .35 firingT');assert.equal(a.anim.firing,a.weaponRunner.firingPose());assert.equal(ch._wst.firing,a.anim.firing);assert.ok(ch._wst.sinceRelease<.05);
 console.log('ADMITTED_RELEASE',JSON.stringify({id,team,frames,projectiles:f.G.projectiles.list.length,firingT:a.weaponRunner.firingT,sinceRelease:ch._wst.sinceRelease,charge:ch._wst.charge,inkSpent:initialInk-a.ink,releaseInkDelta:beforeInk-a.ink}));
 }finally{ch.dispose();f.G.projectiles.clear();}}
});
test('Dapple family actual Actor input alternates native hand events and hand clocks',async()=>{
 const f=await setup(),all=[];
 for(const team of [0,1]){const {a,events,step}=create(f,f.WEAPONS['s3-maneuver-short-02']?'s3-maneuver-short-02':'s3-maneuver-short',team),ch=a.character,shots=[];
 try{assert.ok(ch.weapon.left);assert.ok(!ch.weapon.left.left);
 for(let frame=0;frame<120&&shots.length<4;frame++){const n=events.length;step(true);for(const e of events.slice(n).filter(e=>e.name==='shoot')){
  assert.ok(e.projectiles>0,'admitted projectile precedes native shoot');
  const timers=[f.CHARACTER_TIMERS.T_SHOOT,f.CHARACTER_TIMERS.T_SHOOTL];
  const row={team,frame,hand:e.arg?.hand??null,runnerHand:a.weaponRunner.hand,sinceHand:Array.from(a.weaponRunner.sinceHand),characterClocks:timers.map(t=>ch.tr[t]),projectiles:f.G.projectiles.list.length,firingT:a.weaponRunner.firingT};
  shots.push(row);console.log('ADMITTED_PAIRED_SHOT',JSON.stringify(row));
 }}assert.equal(shots.length,4);all.push(...shots);
 }finally{ch.dispose();f.G.projectiles.clear();}}
 for(const shot of all){assert.ok(shot.hand===0||shot.hand===1,'admitted paired shoot must identify its native hand');assert.equal(shot.sinceHand[shot.hand],0);assert.ok(shot.sinceHand[1-shot.hand]>0);assert.ok(shot.characterClocks[shot.hand]<.02);assert.ok(shot.characterClocks[1-shot.hand]>shot.characterClocks[shot.hand]);}
 for(const team of [0,1]){const shots=all.filter(x=>x.team===team);for(let i=1;i<shots.length;i++)assert.notEqual(shots[i].hand,shots[i-1].hand);}
});

test('actual remote Character replay resets only the packet-selected hand clock',async()=>{
 const f=await setup(),{a,step}=create(f,f.WEAPONS['s3-maneuver-short-02']?'s3-maneuver-short-02':'s3-maneuver-short',0);a.owner='local';a.nid=91;
 const nm=new f.NetMatch({myId:'local',isHost:true},{});f.G.netm=nm;nm.byNid.set(91,a);nm._setupActor(a);const off=f.on('weapon:fire',e=>nm._onLocalEvent('weapon:fire',e));
 try{for(let i=0;i<7;i++)step(true);const packets=JSON.parse(JSON.stringify(nm.out));assert.deepEqual(packets.filter(p=>p[1]==='tr'&&p[3]==='shoot').map(p=>p[4].hand),[1,0]);f.G.netm=null;
 const {a:remote}=create(f,f.WEAPONS['s3-maneuver-short-02']?'s3-maneuver-short-02':'s3-maneuver-short',1);remote.owner='other';remote.nid=91;nm._setupActor(remote);nm.byNid.set(91,remote);f.G.netm=nm;
 const tr=[f.CHARACTER_TIMERS.T_SHOOT,f.CHARACTER_TIMERS.T_SHOOTL],beforeOut=nm.out.length;let count=0;
 try{for(const packet of packets){const before=tr.map(t=>remote.character.tr[t]);nm._play('other',packet);if(packet[1]==='tr'&&packet[3]==='shoot'){const hand=packet[4].hand;assert.equal(remote.character.tr[tr[hand]],0);assert.equal(remote.character.tr[tr[1-hand]],before[1-hand]);count++;}}
 assert.equal(count,2);assert.equal(nm.out.length,beforeOut);assert.equal(remote.character.root.parent,null);assert.equal(f.G.projectiles.list.length,2);assert.ok(f.G.projectiles.list.every(p=>p.ghost));console.log('REMOTE_NATIVE_HAND_CLOCKS',JSON.stringify({hands:[1,0],selectedResetOnly:true,ghosts:2}));
 }finally{remote.character.dispose();}
 }finally{off();f.G.netm=null;a.character.dispose();f.G.projectiles.clear();}
});
