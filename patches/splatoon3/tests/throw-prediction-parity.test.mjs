import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// Executes the production composition, real throw owners, real Physics/Level
// and real Projectiles updates. Rendering/audio/paint sinks are observed only.
// These are engine parity checks, not measurements of Nintendo's executable.
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,
 extraExports:"export {bombMotionSnapshot} from './patches/splatoon3/runtime/bomb-motion.mjs'; export {RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';"});
const IDS=['bomb','suction','curling','burst','autobomb','fizzy','torpedo','inkMine',
  'toxicMist','angleShooter','splashWall','sprinkler','beakon','pointSensor'];
const sinks={paint:0,hit:0,fx:0,audio:0,event:0,network:0,rng:0};
for(const name of ['all:sub','all:special','bomb:throw','bomb:explode','storm:start','sub:beakon-expire'])
  f.on(name,()=>sinks.event++);
const originalHit=f.G.projectiles.applyHit;
f.G.projectiles.applyHit=function(...args){sinks.hit++;return originalHit.apply(this,args);};
const vec=v=>Array.from(v.toArray());
function nearVec(actual,expected,label,tolerance=1e-7){assert.ok(actual.distanceTo(expected)<=tolerance,
  `${label}: ${vec(actual)} != ${vec(expected)} (error ${actual.distanceTo(expected)})`);}
function records(){const p=f.G.projectiles;return [...p.bombs,...p._s3SubObjects||[],...p._s3SupportSensors||[]];}
function reset(terrain='floor'){
 const {G,THREE}=f;G.projectiles.clear();G.actors=[];G.local=null;G.netm=null;G.time=0;
 G.scene ||= new THREE.Scene();G.scene.clear();
 const floor={kind:'box',min:[-400,-1,-400],max:[400,0,400]};
 const blocks=terrain==='void'?[]:[floor];
 if(terrain==='wall')blocks.push({kind:'box',min:[-200,0,12],max:[200,80,13]});
 if(terrain==='ceiling')blocks.push({kind:'box',min:[-200,3,-100],max:[200,4,200]});
 if(terrain==='ledge')blocks.push({kind:'box',min:[-100,0,15],max:[100,4,60]});
 G.level=new f.Level({bounds:{minX:-400,maxX:400,minZ:-400,maxZ:400},spawnPads:[[-390,0,0],[390,0,0]],spawnBarrier:0,half:[],single:blocks});
 G.physics=new f.Physics(G.level);G.camera=new THREE.PerspectiveCamera();G.camera.position.set(0,5,-10);
 G.paint={sample:()=>1,splat(){sinks.paint++;return 0;}};
 G.fx=new Proxy({}, {get:()=>()=>{sinks.fx++;}});
 G.audio={play(){sinks.audio++;},loop(){sinks.audio++;return{set(){},stop(){}};}};
 G.match={state:'playing',playing:()=>true,canRespawn:()=>false};
 for(const k of Object.keys(sinks))sinks[k]=0;
 f.setRandom(()=>{sinks.rng++;return .5;});
}
function actor(id,{pitch=0,yaw=0,velocity=[0,0,0],ap=0,hold=0,nativeRig=false}={}){
 const a=nativeRig?new f.Actor({team:0,name:'throw prediction native rig',weapon:'shooter',
   CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}):f.make();
 if(nativeRig){a.isLocal=true;a.character.actor=a;a.character.onEvent=null;f.G.actors.push(a);f.G.scene.add(a.character.root);f.G.local=a;}
 a.weapon={...a.weapon,sub:id};a.weaponRunner.reset();a.ink=100;a.alive=true;a.remote=false;a.form='human';
 a.pos.set(0,0,0);a.vel.set(...velocity);a.aimYaw=yaw;a.yaw=yaw;a.aimPitch=pitch;
 a.aimDir.set(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 a.aimPoint.copy(a.pos).add(new f.THREE.Vector3(0,1.35,0)).addScaledVector(a.aimDir,100);
 a.grounded=true;a.ground.hit=true;a.ground.normal.set(0,1,0);a.weaponRunner.s3SubHold=hold;
 // Gear changes use the actual refresh owner, not an ad hoc velocity multiplier.
 if(ap===57){for(const slot of a.s3.loadout){slot.main='subPower';slot.subs.fill('subPower');}a.s3RefreshGear();}
 return a;
}
function tick(dt){f.G.time+=dt;f.G.projectiles.update(dt);}
function launch(a,id=a.weapon.sub){
 const before=new Set(records());
 const returned=id==='storm'?f.G.projectiles.throwStorm(a):f.G.projectiles.throwBomb(a);
 const object=returned||records().find(o=>!before.has(o));
 assert.ok(object,`${id} creates an actual runtime object`);return object;
}
function scalarFields(object){const out={};for(const [key,value]of Object.entries(object||{})){
 if(value==null||['string','number','boolean'].includes(typeof value))out[key]=value;
 else if(value?.toArray&&(value.isVector2||value.isVector3||value.isVector4||value.isQuaternion||value.isEuler||value.isMatrix3||value.isMatrix4||value.isColor))out[key]=vec(value);
 else if(ArrayBuffer.isView(value))out[key]=Array.from(value);
 }return out;}
function rigFields(a){
 const ch=a.character;if(!ch?.root?.traverse)return null;
 const nodes=[];ch.root.traverse(n=>nodes.push({name:n.name,position:vec(n.position),rotation:vec(n.rotation),
   quaternion:vec(n.quaternion),scale:vec(n.scale),matrix:Array.from(n.matrix.elements),world:Array.from(n.matrixWorld.elements),
   visible:n.visible,dirty:n.matrixWorldNeedsUpdate}));
 return {nodes,feet:Array.from(ch.feet||[],scalarFields),anim:scalarFields(a.anim),face:scalarFields(ch.face),
   gaze:scalarFields(ch.gz),blink:scalarFields(ch.bl),weapon:scalarFields(ch.weapon),bomb:f.bombMotionSnapshot(ch)};
}
function snapshot(a){const ps=f.G.projectiles;return{
 actor:scalarFields(a),runner:scalarFields(a.weaponRunner),intent:scalarFields(a.intent),
 actors:f.G.actors.map(o=>({fields:scalarFields(o),stats:JSON.parse(JSON.stringify(o.stats))})),
 ready:scalarFields(a.weaponRunner.s3SubReady),fizzyCharge:scalarFields(a.weaponRunner.s3FizzyCharge),
 stats:JSON.parse(JSON.stringify(a.stats)),s3:JSON.parse(JSON.stringify({abilityPoints:a.s3.abilityPoints,modifiers:a.s3.modifiers,flow:a.s3.flow})),
 character:scalarFields(a.character),rig:rigFields(a),time:f.G.time,sinks:{...sinks},
 network:f.G.netm?{out:JSON.parse(JSON.stringify(f.G.netm.out)),stats:{...f.G.netm.stats},hitNextSeq:f.G.netm.hitNextSeq}:null,
 lists:['list','pool','bombs','clouds','_s3SubObjects','_s3SupportSensors','_s3SupportCoolers','_s3SupportCoolerThrows','_s3AllSpecialObjects']
   .map(key=>[key,(ps[key]||[]).map(o=>({...scalarFields(o),mesh:o.mesh&&scalarFields(o.mesh.position),
     attachment:o.s3SurfaceAttachment&&{blockId:o.s3SurfaceAttachment.blockId,
       ...Object.fromEntries(['position','normal','tangent','bitangent','heading'].map(k=>[k,o.s3SurfaceAttachment[k]&&Array.from(o.s3SurfaceAttachment[k])]))},
     collider:o.s3CoolerCollision&&scalarFields(o.s3CoolerCollision)}))]),
 collisionCache:ps._s3CoolerCollisionLevel?.blocks?.map(b=>scalarFields(b)),
 scene:f.G.scene.children.map(o=>[o.uuid,...vec(o.position),o.visible]),
 };}
function prediction(a,options={}){
 const before=snapshot(a);const p=f.G.projectiles.s3PredictSubTrajectory(a,{maxTime:10,...options});
 assert.deepEqual(snapshot(a),before,`${options.id||a.weapon.sub} preview has no gameplay/scene/RNG side effect`);
 assert.ok(p&&p.origin&&p.velocity&&p.endpoint,`${a.weapon.sub} public API has a usable result`);
 assert.ok([...vec(p.origin),...vec(p.velocity),...vec(p.endpoint),p.time].every(Number.isFinite));
 assert.ok(p.points.length>0&&p.points.every(v=>vec(v).every(Number.isFinite)));
 return p;
}
function matchRuntime(a,p,hz=60,id=a.weapon.sub){
 const object=launch(a,id);nearVec(object.pos,p.origin,`${id} launch origin`);nearVec(object.vel,p.velocity,`${id} launch velocity`);
 // Production runSimulation owns the render-to-gameplay conversion. Passing
 // 1/30 directly into native _updateBombs is not its production clock contract.
 const clock=new f.FixedClock(),ticks=Math.max(0,Math.ceil(p.time*60-1e-8));
 let advanced=0;
 for(let frame=0;advanced<ticks&&frame<ticks*3+1;frame++)clock.advance(1/hz,dt=>{
   if(advanced<ticks){tick(dt);advanced++;}
 });
 assert.equal(advanced,ticks,'actual fixed clock reaches the predicted terminal tick');
 nearVec(object.pos,p.endpoint,`${id} ${hz}Hz ${p.outcome} endpoint`);
 if(p.outcome==='explosion'){
   assert.ok(object.dead||!records().includes(object)||object.fuse<=1e-7,`${id} predicted terminal frame reaches the real fuse/death transition`);
 }
 if(p.kind==='pointSensor'&&p.complete)assert.notEqual(object.activeAt,null,'sensor activates at its predicted contact');
 return object;
}

for(const id of IDS)for(const terrain of ['floor','wall','ceiling','ledge'])
 test(`${id}: real ${terrain} collision, terminal position and side-effect-free forecast`,()=>{
   reset(terrain);const a=actor(id,{pitch:terrain==='ceiling'?.45:0});const p=prediction(a);
   assert.equal(p.kind,id);assert.equal(p.complete,true);matchRuntime(a,p);
 });

for(const id of IDS.filter(id=>!['inkMine','beakon'].includes(id)))
 test(`${id}: moving AP57 downward throw preserves actual launch and endpoint`,()=>{
   reset();const a=actor(id,{pitch:-.35,yaw:.65,velocity:[3,5,-2],ap:57});const p=prediction(a);matchRuntime(a,p);
 });

for(const hz of [30,60,120])for(const id of ['bomb','suction','curling','burst','fizzy','torpedo','pointSensor','splashWall'])
 test(`${id}: forecast reaches the same terminal position through ${hz}Hz renders and the production fixed clock`,()=>{
   reset('wall');const a=actor(id,{hold:id==='fizzy'?2:0});
   // A charged native bomb consumes the WeaponRunner's admitted s3Release.
   // Advance the actual input owner so charge and release agree.
   if(id==='curling'){a.intent.sub=true;for(let i=0;i<60;i++){f.G.time+=1/60;a.update(1/60);}}
   const p=prediction(a);
   assert.equal(p.simulationStep,1/60);matchRuntime(a,p,hz);
 });

for(const id of IDS)test(`${id}: Actor input hold/release reaches the forecast through the real WeaponRunner`,()=>{
 reset();const a=actor(id);a.intent.sub=true;for(let i=0;i<10;i++){f.G.time+=1/60;a.update(1/60);}
 let p=prediction(a);const before=new Set(records());a.intent.sub=false;
 for(let i=0;i<20&&!records().some(o=>!before.has(o));i++){
   f.G.time+=1/60;a.update(1/60);
   // The admitted 1F use-startup remains a held aim frame in the real UI.
   // Compare its last visible forecast with the following actual release.
   if(!records().some(o=>!before.has(o)))p=prediction(a);
 }
 const o=records().find(o=>!before.has(o));assert.ok(o,`${id} native input admission produces the object`);
 nearVec(o.pos,p.origin,`${id} admitted origin`);nearVec(o.vel,p.velocity,`${id} admitted velocity`);
 for(let i=0;i<Math.round(p.time*60);i++)tick(1/60);nearVec(o.pos,p.endpoint,`${id} admitted endpoint`);
});

test('forecast options select Suction/Curling/Storm independently of the equipped Splat Bomb',()=>{
 for(const id of ['suction','curling','storm']){
   reset();const a=actor('bomb');const overridden=prediction(a,{id});
   assert.equal(a.weapon.sub,'bomb');assert.equal(overridden.kind,id);
   if(id!=='storm'){a.weapon={...a.weapon,sub:id};a.weaponRunner.reset();}
   matchRuntime(a,overridden,60,id);
 }
});

test('Fizzy forecasts each charged explosion and consumes no charge/sequence/RNG state',()=>{
 for(const hold of [0,40/60,2]){
   reset();const a=actor('fizzy',{hold}),p=prediction(a);const actual=[];
   const off=f.on('all:sub',e=>{if(e.actor===a&&e.phase==='burst')actual.push({point:new f.THREE.Vector3(e.x,e.y,e.z),index:e.burstIndex});});
   const o=matchRuntime(a,p);off?.();assert.equal(p.explosions.length,hold>=2?3:hold>=40/60?2:1);
   assert.equal(actual.length,p.explosions.length);for(let i=0;i<actual.length;i++)nearVec(actual[i].point,p.explosions[i].point,`fizzy burst ${i}`);
   assert.equal(o.dead,true);
 }
});

test('enemy-dependent Torpedo and Autobomb predictions do not promise a fixed future explosion',()=>{
 for(const id of ['torpedo','autobomb']){
   reset();const a=actor(id),control=prediction(a);const enemy=f.make();enemy.team=1;enemy.pos.copy(control.endpoint);enemy.pos.y=0;
   if(id==='torpedo')enemy.pos.set(0,0,10);
   const p=prediction(a);assert.equal(p.targetDependent,true);assert.equal(p.complete,false);assert.equal(p.outcome,'target-dependent');
 }
});

test('finite-horizon and open-void forecasts keep an unresolved outcome instead of a false landing',()=>{
 for(const id of ['bomb','pointSensor','suction','burst']){
   reset('void');const a=actor(id),p=prediction(a,{maxTime:.1});
   assert.equal(p.complete,false);assert.ok(['no-contact','out-of-bounds'].includes(p.outcome));assert.equal(p.firstImpact,null);
   matchRuntime(a,p);
 }
});

test('zero-horizon and pooled samples never retain actor/world ownership',()=>{
 reset();const a=actor('pointSensor'),points=[];const p=prediction(a,{maxTime:0,points});
 assert.equal(p.points,points);assert.equal(p.time,0);assert.equal(p.complete,false);nearVec(p.endpoint,p.origin,'zero horizon');
 const again=prediction(a,{points});assert.equal(again.points,points);assert.ok(points.length>1);
 assert.equal(Object.values(again).includes(a),false);assert.equal(Object.values(again).includes(f.G.physics),false);
});

for(const id of ['bomb','burst','pointSensor'])test(`${id}: actual Character hand pose, Actor input and admitted launch preserve the entire rig`,()=>{
 reset();const a=actor(id,{nativeRig:true,yaw:.35,pitch:.2}),ch=a.character,ps=f.G.projectiles;
 assert.equal(Object.hasOwn(a,'_finishFrame'),false);assert.equal(Object.hasOwn(a,'_integrate'),false);
 const step=()=>{f.G.time+=1/60;a.update(1/60);ch.root.updateMatrixWorld(true);};
 for(let i=0;i<90;i++)step();a.intent.sub=true;for(let i=0;i<15;i++)step();
 const held=prediction(a);assert.ok(held.origin.distanceTo(a.pos.clone().add(new f.THREE.Vector3(0,1.35,0)))>.2,
   'the native hand origin replaces the generic fixed-height fixture muzzle');
 const prior=ps.throwBomb;let admitted=null,object=null;
 ps.throwBomb=function(owner,...args){
   admitted=prediction(owner);const before=new Set(records()),out=prior.call(this,owner,...args);
   object=out||records().find(o=>!before.has(o));return out;
 };
 try{a.intent.sub=false;for(let i=0;i<20&&!object;i++)step();}
 finally{ps.throwBomb=prior;}
 assert.ok(object&&admitted,'the actual Actor/WeaponRunner emitted the projectile');
 nearVec(object.pos,admitted.origin,`${id} real rig release origin`);nearVec(object.vel,admitted.velocity,`${id} real rig release velocity`);
 for(let i=0;i<Math.round(admitted.time*60);i++)tick(1/60);
 nearVec(object.pos,admitted.endpoint,`${id} real rig terminal contact`);
 ch.dispose();
});

test('all fourteen forecasts leave a real NetMatch recorder and owner sequences unchanged',()=>{
 for(const id of IDS){
   reset();const a=actor(id);a.nid=1;a.owner='me';
   const session={myId:'me',isHost:true,hostId:'me',_members:new Set(['me']),tr:{broadcast(){sinks.network++;},sendTo(){sinks.network++;}}};
   const nm=new f.NetMatch(session,{map:'test'});f.G.netm=nm;
   f.G.match.actors=[a];f.G.match.local=a;nm.bind(f.G.match);
   const rec=nm._rec;nm._rec=function(...args){sinks.network++;return rec.apply(this,args);};
   try{prediction(a);assert.equal(nm.out.length,0);launch(a);assert.ok(nm.out.length>0,`${id} real emission reaches the recorder being observed`);}
   finally{nm.dispose();}
 }
});

test('moving-Tower mines, Splash Wall and Tacticooler remain untouched by collision prediction',()=>{
 reset();const {G}=f,ps=G.projectiles,tower=G.level.blocks[0];
 G.match.mode='tower';
 // Retain RankedWorld's actual volume query with the test floor as its wide
 // synthetic moving deck; no replacement contact/attachment function.
 G.match.rankedWorld=Object.assign(Object.create(f.RankedWorld.prototype),{towerBlock:tower,
   _towerHalfWidth:400,_towerHalfLength:400,_towerDeckTop:0});
 const mineOwner=actor('inkMine');mineOwner.pos.z=20;mineOwner.ground.block=0;const mine=launch(mineOwner);
 const wallOwner=actor('splashWall');wallOwner.pos.z=10;wallOwner.ground.block=0;wallOwner.team=1;const wall=launch(wallOwner);
 for(let i=0;i<120;i++)tick(1/60);
 assert.ok(mine.s3SurfaceAttachment&&wall.s3SurfaceAttachment,'actual deployed records bind to the tower');
 const coolerOwner=actor('bomb');coolerOwner.pos.z=35;coolerOwner.ground.block=0;
 coolerOwner.weapon={...coolerOwner.weapon,special:'tacticooler'};coolerOwner.special=coolerOwner.specialCost();
 coolerOwner._startSpecial();coolerOwner.intent.sub=true;coolerOwner._updateSpecial(1/60);
 coolerOwner.intent.sub=false;coolerOwner._updateSpecial(1/60);
 for(let i=0;i<14&&coolerOwner.specialActive;i++)coolerOwner._updateSpecial(1/60);
 for(let i=0;i<90;i++)tick(1/60);
 const stand=ps._s3SupportCoolers[0];assert.ok(stand?.towerLocal,'actual deployed cooler binds to the tower');
 // Leave attachment-derived positions stale exactly as a same-tick tower move
 // can do. A read-only guide must synchronize private collision records only.
 tower.center.x+=3;
 for(const id of IDS){const a=actor(id);prediction(a);}
 assert.equal(mine.pos.x,0);assert.equal(wall.pos.x,0);assert.equal(stand.pos.x,0);
});

for(const id of IDS)test(`${id}: UI forecast for release now matches the actual input admission`,()=>{
 reset();const a=actor(id);a.intent.sub=true;
 for(let i=0;i<10;i++){f.G.time+=1/60;a.update(1/60);}
 const p=prediction(a,{anticipateRelease:true}),before=new Set(records());a.intent.sub=false;
 for(let i=0;i<20&&!records().some(o=>!before.has(o));i++){f.G.time+=1/60;a.update(1/60);}
 const o=records().find(o=>!before.has(o));assert.ok(o,'actual input admission creates the thrown/deployed object');
 nearVec(o.pos,p.origin,`${id} release-now origin`);nearVec(o.vel,p.velocity,`${id} release-now velocity`);
 for(let i=0;i<Math.round(p.time*60);i++)tick(1/60);
 nearVec(o.pos,p.endpoint,`${id} release-now terminal position`);
});

for(const [id,holds] of [['curling',[1,4,5,10,59,60]],['fizzy',[1,4,38,39,40,118,119,120]]])
 for(const heldFrames of holds)test(`${id}: release-now forecast includes readiness/startup charge at held frame ${heldFrames}`,()=>{
   reset();const a=actor(id);a.intent.sub=true;
   for(let i=0;i<heldFrames;i++){f.G.time+=1/60;a.update(1/60);}
   const p=prediction(a,{anticipateRelease:true}),before=new Set(records());a.intent.sub=false;
   for(let i=0;i<20&&!records().some(o=>!before.has(o));i++){f.G.time+=1/60;a.update(1/60);}
   const o=records().find(o=>!before.has(o));assert.ok(o,'readiness and startup finish through Actor input');
   nearVec(o.vel,p.velocity,`${id} held ${heldFrames}F admitted velocity`);
   if(id==='fizzy')assert.equal(o.popLimit,p.explosions.length,'source charge stage matches the forecast explosion count');
   for(let i=0;i<Math.round(p.time*60);i++)tick(1/60);
   nearVec(o.pos,p.endpoint,`${id} held ${heldFrames}F final explosion`);
 });

test('Fizzy release-now forecast consumes only already queued shake credit through the real WeaponRunner',()=>{
 reset();const a=actor('fizzy');a.intent.sub=true;
 for(let i=0;i<35;i++){f.G.time+=1/60;a.weaponRunner.update(1/60,{sub:true});}
 // A real stick reversal queues the known acceleration bonus. The runner
 // owns charge; this particular case does not integrate actor movement.
 a.intent.move.set(1,0,0);f.G.time+=1/60;a.weaponRunner.update(1/60,{sub:true});
 assert.ok(a.weaponRunner.s3FizzyCharge.queue>0);
 const p=prediction(a,{anticipateRelease:true}),before=new Set(records());a.intent.sub=false;
 f.G.time+=1/60;a.weaponRunner.update(1/60,{subReleased:true});
 for(let i=0;i<20&&!records().some(o=>!before.has(o));i++){f.G.time+=1/60;a.weaponRunner.update(1/60,{});}
 const o=records().find(o=>!before.has(o));assert.ok(o);assert.equal(o.popLimit,p.explosions.length);
 nearVec(o.vel,p.velocity,'queued Fizzy release velocity');
 for(let i=0;i<Math.round(p.time*60);i++)tick(1/60);
 nearVec(o.pos,p.endpoint,'queued Fizzy final explosion');
});
