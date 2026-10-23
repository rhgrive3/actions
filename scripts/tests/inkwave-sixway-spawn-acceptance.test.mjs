// Focused six-way acceptance with an explicitly nonzero opposing barrier.
// Real minified/source Actor, Physics, Character/bank, Projectiles and CPU paint;
// only GPU submission is a sink. Existing barrier=0 donor fixtures are untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../patches/splatoon3/tests/source-loaded-actor-fixture.mjs';
const summary=[];
const stable=x=>JSON.parse(JSON.stringify(x));
const digest=x=>createHash('sha256').update(x).digest('hex');
let cached;
const fixture=()=>cached??=sourceLoadedActorFixture({random:()=>.314159,extraExports:`
 export {spawnMotionAllowsAction,spawnPoseSnapshot} from './patches/splatoon3/runtime/spawn-pose-motion.mjs';
 export {weaponHandoffSnapshot} from './patches/splatoon3/runtime/weapon-handoff-motion.mjs';
`});
function floor(f,y=0) {
 const {G,THREE}=f;G.level=new f.Level({bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
  spawnPads:[[0,0,-12],[0,0,12]],spawnBarrier:4.2,half:[],
  single:[{kind:'box',min:[-60,y-.5,-60],max:[60,y,60]}]});
 G.physics=new f.Physics(G.level);
 class CpuPaint extends f.PaintSystem {
  _initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};}
  _pushQuad(){} _drawQuads(){this.quads=0;this.dryMesh.visible=false;}
 }
 G.paint=new CpuPaint(null,G.level,{atlasSize:1024,maxDensity:10,cell:.5});
 const calls=[],native=G.paint.splat;
 G.paint.splat=function(pos,radius,team,opts={}){calls.push(stable({pos:pos.toArray(),radius,team,
  opts:{kind:opts.kind,seed:opts.seed,face:opts.face,stretchAmt:opts.stretchAmt,stretch:opts.stretch?.toArray?.()}}));return native.call(this,pos,radius,team,opts);};
 G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,3,-4);
 return calls;
}
function step(f,a,frames=1,afterActor=null) {
 for(let i=0;i<frames;i++){
  assert.equal(f.G.level.spawnBarrier,4.2,'nonzero exclusion remains installed on every step');
  f.tick(a);afterActor?.();f.G.projectiles.update(1/60);f.G.paint.advanceSimulation(1/60);
  if(a.alive&&a.pos.y>f.G.level.spawnPads[1-a.team].y-1) {
   const pad=f.G.level.spawnPads[1-a.team],r=4.2+f.PLAYER.radius+.02;
   assert(Math.hypot(a.pos.x-pad.x,a.pos.z-pad.z)>=r-1e-6,'opposing body volume remains enforced');
  }
 }
}
async function setup(f,team) {
 f.reset();f.G.time=0;const paintCalls=floor(f);
 f.G.match={mode:'turf',opts:{},state:'playing',playing:()=>true,canRespawn:()=>true};
 const a=await f.make(team);a.setWeapon('roller');a.slot=0;
 a.spawnAt(f.G.level.spawnPads[team],team?Math.PI:0);
 a.aimYaw=team?Math.PI:0;a.aimDir.set(0,0,team?-1:1);a.aimPoint.set(0,0,0);
 return {a,c:a.character,paintCalls};
}
function physicalFire(a,on){a.intent.fire=on;if(a.s3?.physicalRespawnHeld)a.s3.physicalRespawnHeld.fire=on;}
function deathToAim(f,a,{stale=false}={}) {
 physicalFire(a,stale);a._prevIntent.fire=stale;a.splat(null);
 for(let i=0;i<900&&!a.alive;i++)step(f,a);
 assert.equal(a.s3.squidSpawn?.phase,'aim');assert.equal(a.weaponRunner.rolling,false);
 a.s3.physicalRespawnHeld={fire:stale,jump:false,sub:false,special:false,squid:false};
 if(stale){step(f,a,4);assert.equal(a.s3.squidSpawn.phase,'aim','held-through-death does not auto-launch');assert.equal(a.s3.respawnRearm.has('fire'),true);}
}
function launch(f,a,held) {
 physicalFire(a,false);step(f,a);physicalFire(a,true);step(f,a);
 assert.equal(a.s3.squidSpawn?.phase,'flight');if(!held)physicalFire(a,false);
}
function land(f,a,{releaseDuringFlight=false}={}) {
 let frames=0,retiredAir=0;
 while(a.s3.squidSpawn&&frames++<360) {
  if(releaseDuringFlight&&frames===12)physicalFire(a,false);
  step(f,a);
  if(a.s3.squidSpawn){assert.equal(f.spawnMotionAllowsAction(a.character,true),false);
   if(a.s3.squidSpawn.phase==='landing'&&f.spawnPoseSnapshot(a.character)?.phase==='off'){retiredAir++;assert.equal(f.weaponHandoffSnapshot(a.character)?.weight??0,0);}}
 }
 assert(frames<360&&a.grounded&&a.ground.hit&&!a.s3.squidSpawn,'actual supported touchdown');
 return {frames,retiredAir};
}
function row(f,a,calls) {
 const c=a.character,ps=f.G.projectiles;
 return stable({position:a.pos.toArray(),velocity:a.vel.toArray(),alive:a.alive,grounded:a.grounded,groundHit:a.ground.hit,
  hp:a.hp,ink:a.ink,turf:a.stats.turf,form:a.form,spawn:a.s3.squidSpawn??null,
  rearm:a.s3.respawnRearm?[...a.s3.respawnRearm]:null,physical:a.s3.physicalRespawnHeld??null,
  armor:a.s3.spawnArmor??null,rolling:a.weaponRunner.rolling,flick:a.weaponRunner.flick,
  attack:a.weaponRunner.s3RollerAttack?{elapsed:a.weaponRunner.s3RollerAttack.elapsed,windup:a.weaponRunner.s3RollerAttack.windup}:null,
  muzzle:c.getMuzzle(new f.THREE.Vector3()).toArray(),channels:Array.from(c.P),timers:Array.from(c.tr),
  sourceHistory:c.sourceMotion.renderedPose,paintCounts:Array.from(f.G.paint.counts),paintGrid:digest(f.G.paint.grid),paintCalls:calls,
  shots:ps.list.map(p=>({type:p.type,wid:p.wid,pos:p.pos.toArray(),vel:p.vel.toArray(),age:p.age,life:p.life,damage:p.damage,size:p.size,radius:p.radius,seed:p.seed,grav:p.grav,drag:p.drag}))});
}
function shown(f,a) {
 const c=a.character,v=new f.THREE.Vector3();let minY=Infinity,vertices=0;
 // A direct reset can precede the next Actor/renderer tick. Read restored
 // local bones through fresh world matrices, as a renderer does before draw.
 c.root.updateMatrixWorld(true);c.skeleton.update();
 c.weapon.drum.traverseVisible(mesh=>{const p=mesh.geometry?.attributes?.position;if(p)for(let i=0;i<p.count;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);minY=Math.min(minY,v.y);vertices++;}});
 return stable({weight:f.weaponHandoffSnapshot(c)?.weight??0,hand:c.bones.handR.getWorldQuaternion(new f.THREE.Quaternion()).toArray(),
  pivot:c.weapon.pivot.getWorldQuaternion(new f.THREE.Quaternion()).toArray(),vertices,minY:Number.isFinite(minY)?minY:null});
}

for(const team of [0,1])test(`team${team}: enemy ingress blocked, own pad exit and native respawn/first-attack remain free`,async()=>{
 const f=await fixture(),{a}=await setup(f,team),sign=team?-1:1,pad=f.G.level.spawnPads[team],enemy=f.G.level.spawnPads[1-team],radius=4.2+f.PLAYER.radius+.02;
 a.intent.move.set(0,0,sign);step(f,a,120);
 assert(a.pos.distanceTo(pad)>radius+1,'own nonzero barrier permits ordinary exit');
 a.spawnAt(new f.THREE.Vector3(enemy.x,0,enemy.z-sign*(radius+.3)),team?Math.PI:0);a.intent.move.set(0,0,sign);
 let nearest=Infinity;for(let i=0;i<90;i++){step(f,a);nearest=Math.min(nearest,Math.hypot(a.pos.x-enemy.x,a.pos.z-enemy.z));}
 assert(nearest>=radius-1e-6&&nearest<radius+.02,'real native movement reaches but cannot cross enemy boundary');
 a.intent.move.set(0,0,-sign);step(f,a,90);assert(Math.hypot(a.pos.x-enemy.x,a.pos.z-enemy.z)>radius+1,'retreat remains possible');
 a.intent.move.set(0,0,0);a.aimPoint.set(0,0,0);deathToAim(f,a);launch(f,a,false);const flight=land(f,a);
 step(f,a,2);assert(f.weaponHandoffSnapshot(a.character).weight>0);physicalFire(a,true);step(f,a);
 assert(a.weaponRunner.s3RollerAttack,'first deliberate supported attack reaches native runner');
 let peak=0;for(let i=0;i<90;i++){if(i===45)a.intent.move.set(0,0,sign);step(f,a);peak=Math.max(peak,f.G.projectiles.list.length);}
 assert(peak>0&&f.G.paint.counts[team]>0,'actual first attack produces native rounds and CPU turf');
 summary.push({team,case:'both-volume-boundaries-and-first-attack',nearest,radius,flight,peak,paintCells:f.G.paint.counts[team],display:shown(f,a)});
});

for(const team of [0,1])for(const input of ['stale-death-hold','release-in-flight','fresh-on-touchdown'])
test(`team${team}: ${input} canonical shots/CPU paint/source history and displayed attack with nonzero exclusion`,async()=>{
 const f=await fixture();
 async function run(enabled) {
  const {a,c,paintCalls}=await setup(f,team);deathToAim(f,a,{stale:input==='stale-death-hold'});c.s3WeaponHandoffEnabled=enabled;
  launch(f,a,input!=='fresh-on-touchdown');const flight=land(f,a,{releaseDuringFlight:input==='release-in-flight'});
  const rows=[],display=[];let peak=0;
  for(let i=0;i<90;i++){
   if(input==='fresh-on-touchdown'&&i===0)physicalFire(a,true);
   if(input==='release-in-flight'&&i===5)physicalFire(a,true);
   if(i===45)a.intent.move.set(0,0,team?-1:1);
   step(f,a);rows.push(row(f,a,paintCalls));display.push(shown(f,a));peak=Math.max(peak,f.G.projectiles.list.length);
   if(input==='release-in-flight'&&i<5){assert.equal(a.weaponRunner.rolling,false);assert.equal(a.weaponRunner.flick,-1);assert.equal(f.G.projectiles.list.length,0);}
   if(input==='stale-death-hold'){assert.equal(a.weaponRunner.flick,-1,'released/repressed launch hold rolls without an airborne flick');}
   if(input!=='release-in-flight'||i>=5)assert.equal(display.at(-1).weight,0,'real attack overrides display interpolation immediately');
  }
  assert(f.G.paint.counts[team]>0&&paintCalls.length>0,'actual CPU paint is exercised');
  if(input!=='stale-death-hold')assert(peak>0,'fresh press emits actual native flick rounds');
  return {rows,display,peak,flight};
 }
 const raw=await run(false),visual=await run(true);
 for(let i=0;i<90;i++)assert.deepEqual(visual.rows[i],raw.rows[i],`frame${i}: complete canonical/shot/CPU-paint/source-history equals unfaded control`);
 for(let i=0;i<90;i++)if(input!=='release-in-flight'||i>=5)assert.deepEqual(visual.display[i],raw.display[i],'displayed native attack also equals control');
 if(input==='release-in-flight')assert(visual.display.slice(0,5).some(r=>r.weight>0),'idle display fade actually exercised before first attack');
 summary.push({team,case:input,frames:90,flight:visual.flight,peak:visual.peak,paintCells:visual.rows.at(-1).paintCounts,paintGrid:visual.rows.at(-1).paintGrid,canonicalEqualsControl:true,attackDisplayEqualsControl:true});
});

for(const team of [0,1])test(`team${team}: active idle display reset retires before immediate fresh life and actual first attack`,async()=>{
 const f=await fixture();
 async function run(enabled) {
  const {a,c,paintCalls}=await setup(f,team);deathToAim(f,a);c.s3WeaponHandoffEnabled=enabled;launch(f,a,false);land(f,a);step(f,a,2);
  if(enabled)assert(f.weaponHandoffSnapshot(c).weight>0&&f.weaponHandoffSnapshot(c).weight<1);
  a.reset();assert.equal(f.weaponHandoffSnapshot(c),null,'immediate old display retirement');
  const rows=[{canonical:row(f,a,paintCalls),display:shown(f,a)}];let peak=0;
  for(let i=0;i<90;i++){if(i===0)physicalFire(a,true);if(i===45)a.intent.move.set(0,0,team?-1:1);step(f,a);rows.push({canonical:row(f,a,paintCalls),display:shown(f,a)});assert.equal(f.weaponHandoffSnapshot(c)?.weight??0,0);peak=Math.max(peak,f.G.projectiles.list.length);}
  assert(peak>0&&f.G.paint.counts[team]>0,'immediate fresh life emits its own actual round and paint');return rows;
 }
 const raw=await run(false),visual=await run(true);for(let i=0;i<visual.length;i++)assert.deepEqual(visual[i],raw[i],`frame${i}: immediate reset and first-life canonical/display/paint match unfaded control`);
 summary.push({team,case:'active-idle-reset-immediate-fresh-life',frames:visual.length,canonicalAndDisplayEqual:true,paintCells:visual.at(-1).canonical.paintCounts});
});

for(const team of [0,1])test(`team${team}: missed support after retired spawn pose keeps action guard until supported lower-floor landing`,async()=>{
 const f=await fixture();
 async function run(enabled) {
  const {a,c}=await setup(f,team);c.s3WeaponHandoffEnabled=enabled;deathToAim(f,a);launch(f,a,false);const calls=floor(f,-8);const flight=land(f,a);
  assert(flight.retiredAir>0,'pose retires while actual spawn lifecycle is still airborne');assert.equal(a.pos.y,-8);step(f,a,2);
  assert.equal(f.spawnMotionAllowsAction(c,false),true);if(enabled)assert(f.weaponHandoffSnapshot(c).weight>0);
  assert.equal(f.G.projectiles.list.length,0);assert.equal(calls.length,0);assert.equal(f.G.paint.counts[0]+f.G.paint.counts[1],0);
  const display=shown(f,a);assert(display.vertices>0&&display.minY>=a.pos.y-1e-6,'actual displayed drum vertices clear supported lower floor');
  physicalFire(a,true);step(f,a);assert(a.weaponRunner.s3RollerAttack,'fresh supported press is not trapped by retired spawn timer');
  const rows=[],displays=[];let emittedPeak=0,survivingPeak=0;
  for(let i=0;i<90;i++){
   if(i===45)a.intent.move.set(0,0,team?-1:1);
   step(f,a,1,()=>{rows.push(row(f,a,calls));emittedPeak=Math.max(emittedPeak,f.G.projectiles.list.length);});
   survivingPeak=Math.max(survivingPeak,f.G.projectiles.list.length);displays.push(shown(f,a));
  }
  // This deliberately deep donor-style trench is below the unchanged water
  // cull plane. Assert actual native emission BEFORE its normal update and
  // retirement AFTER it; never disable water expiry to retain a test round.
  assert(emittedPeak>0,'fresh supported attack emits real native flick rounds');
  assert.equal(survivingPeak,0,'below-water rounds retain normal native expiry');
  assert(calls.length>0&&f.G.paint.counts[team]>0,'actual contact CPU paint still owns the dry trench floor');
  return {rows,displays,display,flight,emittedPeak,survivingPeak};
 }
 const raw=await run(false),visual=await run(true);
 for(let i=0;i<90;i++){
  assert.deepEqual(visual.rows[i],raw.rows[i],`frame${i}: deep landing canonical/native emission/CPU-paint/source history equals control`);
  assert.deepEqual(visual.displays[i],raw.displays[i],`frame${i}: first attack display equals control`);
 }
 summary.push({team,case:'missed-support-retired-pose',flight:visual.flight,lowerFloor:-8,display:visual.display,emittedPeak:visual.emittedPeak,survivingPeak:visual.survivingPeak,paintCells:visual.rows.at(-1).paintCounts,canonicalAndAttackDisplayEqual:true});
});

test.after(()=>{console.log(JSON.stringify({mode:process.env.INKWAVE_BUILT_SITE?'emitted':'source',barrier:4.2,cases:summary}));
 if(process.env.SIXWAY_ACCEPTANCE_EVIDENCE)fs.writeFileSync(process.env.SIXWAY_ACCEPTANCE_EVIDENCE,JSON.stringify({mode:process.env.INKWAVE_BUILT_SITE?'emitted':'source',barrier:4.2,cases:summary},null,2)+'\n');});
