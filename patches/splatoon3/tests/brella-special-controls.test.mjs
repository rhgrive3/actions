import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let booted;
const boot=()=>booted??=fixture({fullRuntime:true,includeCharacter:true,realProjectiles:true,productionComposition:true,
 extraExports:"export {animateWeapon} from './inkwave-public/src/game/character-weapons.js';export {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';export {inkVacState,inkVacAbsorbCandidate} from './patches/splatoon3/runtime/kit-ink-vac.mjs';"}).then(f=>{
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);f.G.scene=new f.THREE.Scene();
 f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};f.G.match={state:'playing',playing:()=>true};return f;
});
function actor(f,id='shooter',special=null){f.G.projectiles.clear();f.G.actors=[];
 const a=new f.Actor({team:0,weapon:id,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.character.actor=a;a.character.onEvent=null;f.G.actors=[a];f.G.scene.add(a.character.root);a.grounded=a.ground.hit=true;
 if(special)a.weapon={...a.weapon,special,specialCost:100};a.special=100;a._prevIntent={fire:false,sub:false,jump:false,squid:false,booyah:false};a._resolve=()=>{};return a;
}
const step=(f,a,n=1,hz=60)=>{for(let i=0;i<n;i++){f.G.time+=1/hz;if(a.specialActive)a._updateSpecial(1/hz);}};
const releaseSub=(f,a)=>{a.intent.sub=true;step(f,a);a.intent.sub=false;step(f,a);};

test('real cloth aperture and detached flight survive swim, main reset, retirement and far LOD',async()=>{
 const f=await boot();for(const id of ['s3-shelter-normal','s3-shelter-wide','s3-shelter-focus']){
  const a=actor(f,id),ch=a.character;let openWidth=0;const initialPos=a.pos.clone();
  a.intent.fire=true;for(let i=0;i<180;i++){
   f.G.time+=1/60;a.weaponRunner.update(1/60,{fire:true,firePressed:i===0,sub:false});a._finishFrame(1/60);
   const c=a.weaponRunner.catalogState.canopy;
   if(c?.open&&!c.launched){f.animateWeapon(ch.weapon,{t:f.G.time,dt:1/60,near:false,color:a.color,runner:a.weaponRunner});assert.equal(ch.weapon.near,true,'far LOD retains animated canopy channels');assert.equal(ch.weapon.bodyFar.visible,false);ch.root.updateMatrixWorld(true);openWidth=Math.max(openWidth,new f.THREE.Box3().setFromObject(ch.weapon.parts.canopy).getSize(new f.THREE.Vector3()).length());}
   if(f.G.scene.getObjectByName('brella-canopy:'+id))break;
  }
  assert.ok(openWidth>1.2,`${id} visibly opens to a body-sized shield (${openWidth})`);
  const mesh=f.G.scene.getObjectByName('brella-canopy:'+id);assert.ok(mesh?.children.length>0,id+' authored cloth is rendered on purge');
  const before=mesh.position.clone();a.intent.fire=false;a.form='squid';a.weaponRunner.reset();
  f.G.time+=1/60;f.G.projectiles.update(1/60);assert.ok(mesh.position.distanceTo(before)>0,'flight belongs to the world after runner reset');
  assert.ok(mesh.position.distanceTo(initialPos)>0);let disposed=0;mesh.children[0].geometry.addEventListener('dispose',()=>disposed++);
  f.G.projectiles.clear();assert.equal(mesh.parent,null);assert.equal(disposed,0,'clear never disposes cached weapon geometry');ch.dispose();
 }
});

test('Booyah cannot charge with fire, throw early, or auto-throw when fully charged',async()=>{
 const f=await boot(),a=actor(f,'shooter','booyahBomb');a._startSpecial();a.intent.fire=true;a.intent.sub=true;a.intent.move.set(1,0,0);step(f,a,29);
 assert.equal(a._s3AllSpecialState.charge,0);assert.equal(f.G.projectiles.list.length,0);assert.equal(a.pos.x,0);
 a.intent.sub=false;step(f,a,501);assert.equal(a._s3AllSpecialState.charge,1);assert.ok(a.specialActive,'full charge waits for a manual throw');
 assert.equal(f.G.projectiles.list.length,0);releaseSub(f,a);step(f,a,13);assert.equal(a.specialActive,null);assert.equal(f.G.projectiles.list.at(-1).s3AllSpecial,'booyahBomb');a.character.dispose();
});

test('Booyah self Nice cadence and passive charge are consistent at 30/60/120Hz',async()=>{
 const f=await boot(),results=[];for(const hz of [30,60,120]){const a=actor(f,'shooter','booyahBomb');a._startSpecial();step(f,a,hz,hz);results.push(a._s3AllSpecialState.charge);a.character.dispose();}
 for(const n of results)assert.ok(Math.abs(n-.06)<1e-8);
 const a=actor(f,'shooter','booyahBomb');a._startSpecial();step(f,a,30);a.intent.booyah=true;step(f,a);const charge=a._s3AllSpecialState.charge;
 a.intent.booyah=false;step(f,a);a.intent.booyah=true;step(f,a);assert.ok(Math.abs(a._s3AllSpecialState.charge-charge-.004)<1e-8,'too-fast Nice cannot add a second 7.7%');a.character.dispose();
});

test('Inkjet held trigger fires seven shots, sub cannot cancel, squid blocks firing',async()=>{
 const f=await boot(),a=actor(f,'shooter','inkjet');a._startSpecial();a.intent.fire=true;a.intent.sub=true;step(f,a,449);
 assert.equal(f.G.projectiles.list.filter(p=>p.s3AllSpecial==='inkjet').length,7);assert.ok(a.specialActive);a.intent.squid=true;step(f,a);assert.ok(a.superJumpState,'expiry returns to the origin');a.character.dispose();
});

test('marker and device specials use a sub release, with Triple Inkstrike forbidding squid',async()=>{
 const f=await boot();for(const id of ['tripleInkstrike','waveBreaker','splattercolorScreen']){
  const a=actor(f,'shooter',id);a._startSpecial();a.intent.fire=true;step(f,a,30);
  assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).length,0,id+' fire does not deploy');
  a.intent.fire=false;a.intent.squid=id==='tripleInkstrike';a.intent.sub=true;step(f,a,4);
  assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).length,0,id+' holding aims without releasing');
  if(id==='tripleInkstrike')assert.equal(a.form,'kid');a.intent.sub=false;step(f,a);step(f,a,16);
  assert.ok(f.G.projectiles._s3AllSpecialObjects.some(o=>o.id===id),id+' release authors the device');a.character.dispose();
 }
});

test('Super Chump holds aim until fire, deploys twelve, and cancels unlaunched at deadline',async()=>{
 const f=await boot(),a=actor(f,'shooter','superChump');a._startSpecial();step(f,a,180);assert.ok(a.specialActive);assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).length,0);
 a.intent.fire=true;step(f,a);assert.equal(f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy').length,0,'the first frame arms the 13F release, not an instant launch');
 a.intent.fire=false;step(f,a,12);assert.equal(f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy').length,0,'12F before release must still hold the decoys');
 step(f,a);assert.equal(f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy').length,12,'13F release authors exactly twelve decoys');a.character.dispose();
 const b=actor(f,'shooter','superChump');b._startSpecial();step(f,b,636);assert.equal(b.specialActive,null);assert.equal((f.G.projectiles._s3AllSpecialObjects||[]).length,0);b.character.dispose();
});

test('Tenta ignores empty reticles and sub, admits far targets through walls',async()=>{
 const f=await boot(),a=actor(f,'shooter','tentaMissiles');a._startSpecial();a.intent.fire=true;step(f,a);assert.ok(a.specialActive);assert.equal(f.G.projectiles.list.length,0);
 a.intent.fire=false;a.intent.sub=true;step(f,a);assert.equal(f.G.projectiles.list.length,0);const victim=f.make();victim.team=1;victim.pos.set(0,0,200);f.G.actors.push(victim);f.G.camera=new f.THREE.PerspectiveCamera(60,1,.1,50);f.G.camera.position.set(0,.7,-1);f.G.camera.lookAt(0,.7,200);f.G.camera.updateMatrixWorld(true);
 a.intent.fire=true;step(f,a,40);assert.equal(f.G.projectiles.list.filter(p=>p.s3AllSpecial==='tentaMissiles').length,10);a.character.dispose();f.G.camera=null;
});

test('Reefslider locks travel direction and only a fresh fire press cancels after fifteen frames',async()=>{
 const f=await boot(),a=actor(f,'shooter','reefslider');a._startSpecial();a.intent.fire=true;step(f,a,39);const state=a._s3AllSpecialState,d=state.direction.clone();
 a.intent.sub=true;a.intent.move.set(1,0,0);step(f,a,20);assert.equal(state.phase,'dash');assert.ok(state.direction.distanceTo(d)<1e-8);
 a.intent.fire=false;step(f,a);a.intent.fire=true;step(f,a);
 assert.equal(state.phase,'brake','a fresh cancel enters the sourced 38F preburst, not instant recovery');
 a.intent.fire=false;step(f,a,38);assert.equal(state.phase,'recovery');a.character.dispose();
});

test('Killer Wail locks three fixed pairs and still runs a catalogue main weapon',async()=>{
 const f=await boot(),a=actor(f,'s3-shooter-long','killerWail'),v=f.make();v.team=1;v.pos.set(0,0,10);f.G.actors.push(v);
 a._startSpecial();a.intent.fire=true;step(f,a,110);const state=a._s3AllSpecialState;assert.equal(state.beamPairs.length,3);assert.equal(state.beamPairs.flatMap(p=>p.origins).length,6);
 assert.ok(f.G.projectiles.list.some(p=>p.catalog),'catalogue main fires during the Wail layer');const origin=state.beamPairs[0].origins[0].clone();a.pos.x=5;step(f,a);assert.ok(state.beamPairs[0].origins[0].equals(origin));a.character.dispose();
});

test('Ink Vac suction obeys held fire and restarts expansion after squid interruption',async()=>{
 const f=await boot(),a=actor(f,'charger','inkVac');a._startSpecial();const state=f.inkVacState(a);assert.ok(state);
 for(let i=0;i<20;i++){f.G.time+=1/60;a.update(1/60);}assert.equal(state.length,0);assert.equal(state.charge,0);
 a.intent.fire=true;for(let i=0;i<46;i++){f.G.time+=1/60;a.update(1/60);}assert.equal(state.sucking,true);assert.ok(state.length>10);
 a.intent.squid=true;f.G.time+=1/60;a.update(1/60);assert.equal(state.sucking,false);assert.equal(state.length,0);assert.equal(a.form,'squid');
 a.intent.squid=false;f.G.time+=1/60;a.update(1/60);assert.ok(state.length<1,'intake restarts from its smallest extent');a.character.dispose();
});
test('Tacticooler holds without auto-placement and serves only after a released throw lands',async()=>{
 const f=await boot(),a=actor(f,'shooter','tacticooler');a._startSpecial();step(f,a,30);assert.equal((f.G.projectiles._s3SupportCoolers||[]).length,0);
 a.intent.fire=true;step(f,a,10);assert.equal((f.G.projectiles._s3SupportCoolers||[]).length,0);a.intent.fire=false;a.aimDir.set(0,-1,0);
 releaseSub(f,a);step(f,a,12);assert.equal((f.G.projectiles._s3SupportCoolers||[]).length,0,'windup finishes before a stand appears');step(f,a);
 const device=f.G.projectiles._s3SupportCoolerThrows[0];assert.ok(device);for(let i=0;i<10;i++){f.G.time+=1/60;f.G.projectiles.update(1/60);}assert.equal(f.G.projectiles._s3SupportCoolers.length,1);a.character.dispose();
});

test('Ink Vac gates17F activation then12F human or18F squid intake, including mixed frame rates',async()=>{
 const f=await boot();
 for(const hz of [30,60,120]){
  const a=f.make('charger');a.weapon={...a.weapon,special:'inkVac',specialCost:100};a.special=100;a._startSpecial();a.intent.fire=true;a.intent.move.set(1,0,0);
  const state=f.inkVacState(a),advance=frames=>{let left=frames/60;while(left>1e-10){const dt=Math.min(1/hz,left);f.G.time+=dt;a.update(dt);left-=dt;}};
  advance(17);assert.equal(state.length,0);assert.equal(a.vel.x,0,'startup blocks walking');
  advance(12);assert.equal(state.length,0);assert.equal(a._s3InkVacSucking,false);
  advance(1);assert.ok(Math.abs(state.length-.3334)<1e-8,`${hz}Hz source13th held frame opens the human intake`);assert.equal(a._s3InkVacSucking,true);
  a.intent.fire=false;advance(1);assert.equal(state.length,0);
  a.intent.fire=true;advance(12);assert.equal(state.length,0);advance(1);assert.ok(Math.abs(state.length-.3334)<1e-8);
  a.intent.squid=true;advance(1);assert.equal(state.length,0);assert.equal(a.form,'squid');
  a.intent.squid=false;advance(18);assert.equal(state.length,0);advance(1);assert.ok(Math.abs(state.length-.3334)<1e-8,'squid intake opens on19th frame');
  a.reset();
 }
});
