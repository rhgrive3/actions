import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {nativeFixture} from './fixture.mjs';
import {convertSource} from '../runtime/source-convert.mjs';
import {installHitchTracer} from '../../local-quality/range-hitch-tracer.mjs';
import {FixedClock} from '../../splatoon3/runtime/clock.mjs';

const f=await nativeFixture();
function setup({ramp=false,noPaint=false,grate=false}={}){
 let obj='',offset=0;
 const quad=(name,x0,x1,y0,y1,z0,z1,mat)=>{
  const verts=[[x0,y0,z0],[x0,y0,z1],[x1,y1,z1],[x1,y1,z0]];
  obj+='o '+name+'\nusemtl '+mat+'\n'+verts.map(v=>'v '+v.join(' ')+'\n').join('')+verts.map(()=>'vn 0 1 0\n').join('');
  obj+='f '+[1,2,3].map(i=>`${offset+i}//${offset+i}`).join(' ')+'\nf '+[1,3,4].map(i=>`${offset+i}//${offset+i}`).join(' ')+'\n';offset+=4;
 };
 quad(grate?'Fld_Grate':'Fld_Roof',0,ramp?6:2,6,ramp?3.6:6,-4,4,grate?'Grate00':noPaint?'Concrete00_np':'Concrete00');
 const hull=Math.min(1,f.PLAYER.fallDeathY+2);quad('Fld_LowerHull',-8,8,hull,hull,-8,8,'Concrete00');
 const data=convertSource({id:'combat-cliff',bounds:{minX:-8,maxX:8,minZ:-8,maxZ:8},spawnPads:[[1,6,0],[1,6,1]],spawnBarrier:0},obj,'newmtl Concrete00\nKd 1 1 1\nnewmtl Concrete00_np\nKd 1 1 1\nnewmtl Grate00\nKd 1 1 1\n',{});
 const G=f.G,L=G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(L);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
 G.paint=new CpuPaint(null,L,{atlasSize:256,maxDensity:4,cell:.25});
 const a=f.make('shooter');a.pos.set(1,ramp?5.6:6,0);a.grounded=a.alive=true;a.form='humanoid';a.s3.squidSpawn=null;a.superJumpState=null;a.specialActive=false;
 const brain=new f.BotBrain(a,'normal');brain.mode='fight';return {G,L,a,brain,data};
}
const digest=data=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex');

test('native paint body keeps canonical owner arguments and rejects older and duplicate cell takeover',()=>{
 const {G,a}=setup(),paint=G.paint,face=paint.paintFaces.find(f=>f.turf&&f.atlas&&f.nu>0&&f.nv>0);
 const position=face.origin.clone().addScaledVector(face.u,face.su*.5).addScaledVector(face.v,face.sv*.5);
 const raw=paint._cpuSplat,calls=[];
 paint._cpuSplat=function(...args){calls.push({count:args.length,order:args[10],state:args[11]});return raw.apply(this,args);};
 const snapshot=()=>({grid:Array.from(paint.grid),counts:Array.from(paint.counts),version:paint.version,orders:Array.from(paint._paintOwnershipOrder||[])});
 try{
  const stamp=(team,clock,peer)=>paint.splat(position,.45,team,{seed:.31,instant:true,face:face.id,claimOwner:a,__netOrder:{clock,peer,seq:1,epoch:'native-order-fixture'}});
  stamp(1,12,'b');assert(paint.counts[1]>0,'actual native cells must be painted');const newer=snapshot();
  stamp(0,10,'a');assert.deepEqual(snapshot(),newer,'older delivery cannot steal newer native cells');
  stamp(1,12,'b');assert.deepEqual(snapshot(),newer,'duplicate delivery cannot change ownership');
  assert(calls.length>=3);
  assert(calls.every(call=>call.count===12&&call.order>0&&call.state&&typeof call.state.accepted==='boolean'),
    'native adapter must retain ownerOrder, orderState in the original argument slots');
 }finally{paint._cpuSplat=raw;}
});

test('real native contact work is counted when ray counters are zero, with exact fixed-tick and physics preservation',()=>{
 const {G,data}=setup(),P=G.physics,w=G.level.triangleWorld,before=digest(data);
 const c={wall:false,ground:false,ceiling:false,wallNormal:new f.THREE.Vector3(),groundNormal:new f.THREE.Vector3(),wallBlock:-1,groundBlock:-1,ceilingBlock:-1};
 const pos=new f.THREE.Vector3(),saved={contact:P._nativeContacts,box:w.queryBox,distance:w._capsuleDistance};
 let boxes=0,distances=0,rng=0;
 w.queryBox=function(...args){boxes++;return saved.box.apply(this,args);};
 w._capsuleDistance=function(...args){distances++;return saved.distance.apply(this,args);};
 const rawBox=w.queryBox,rawDistance=w._capsuleDistance;
 const game={s3Clock:new FixedClock(),match:{actors:[],update(){pos.set(1,5.9,0);c.ground=false;P._nativeContacts(pos,.3,0,1,c,false,false,3);}},_frame(dt){this.s3Clock.advance(dt,()=>this.match.update());return 71;}};
 const oldMatch=G.match;G.match=game.match;
 const rawFrame=game._frame,rawUpdate=game.match.update;
 const tracer=installHitchTracer(game,{env:{__G:G}});
 f.setRandom(()=>{rng++;return .5;});
 try{
  assert.equal(game._frame(.2),71);tracer.record(1,1,{frameRateHz:60,phase:'native-fixture'});
  const row=tracer.snapshot().latest;
  assert.equal(row.fixedClock.ticks,12,'foreground elapsed .2 seconds produces twelve 60 Hz steps');
  assert.equal(row.methodCalls['native-contact'],12);
  assert(boxes>0&&distances>0,'real broad and narrow phase must execute');
  assert.equal(row.methodCalls['source-box'],boxes);assert.equal(row.methodCalls['source-capsule-distance'],distances);
  assert.deepEqual(row.sourceBVH,{queries:0,triangleTests:0},'legacy counters exclude contact work');
  assert.match(row.sourceBVHCounterCoverage,/ray and sphere-sweep only/);
  assert.equal(c.ground,true);assert(Math.abs(pos.y-6.0001)<1e-10);
  assert.equal(digest(data),before);assert.equal(rng,0);
 }finally{
  tracer.dispose();f.restoreRandom();G.match=oldMatch;
  assert.equal(P._nativeContacts,saved.contact);assert.equal(w.queryBox,rawBox);assert.equal(w._capsuleDistance,rawDistance);
  assert.equal(game._frame,rawFrame);assert.equal(game.match.update,rawUpdate);
  w.queryBox=saved.box;w._capsuleDistance=saved.distance;
 }
});

test('retained lower source hull cannot authorize a combat cliff, and real edge steering avoids it',()=>{
 const {G,L,a,brain,data}=setup(),before=digest(data);
 assert(L.groundHeight(3,0,6.6)>f.PLAYER.fallDeathY,'old death-only test treats lower hull as safe');
 assert.equal(brain._wet(3,0,6),true);
 assert.equal(brain._wet(1.2,0,6),false);
 const move=new f.THREE.Vector3(1,0,0);a.vel.set(8,0,0);brain._edgeGuard(a,move);
 assert.equal(brain._wet(a.pos.x+move.x*1.96,a.pos.z+move.z*1.96,a.pos.y),false,'ordinary guard chooses supported steering or stops');
 assert.equal(digest(data),before,'source geometry/roles/ownership stay intact');
});

test('continuous descending source ramp and NoPaint support remain ordinary combat walks',()=>{
 let {brain}=setup({ramp:true});assert.equal(brain._wet(5,0,5.6),false,'successive legal ground steps cross more than one total stepDown');
 const {G,L,a,brain:b}=setup({noPaint:true});assert.equal(L.manifest.objects[0].paintable,false);assert.equal(b._wet(1.3,0,6),false);
 assert.equal(b._wet(3,0,6),true);assert.equal(G.paint.sample(-1,0,0),0,'walkable NoPaint support gains no ink');
 const oldPos=a.pos.toArray(),oldVel=a.vel.toArray();b._wet(1.3,0,6);assert.deepEqual(a.pos.toArray(),oldPos);assert.deepEqual(a.vel.toArray(),oldVel);
});

test('installed ground probe preserves humanoid grates, squid gaps and genuine dynamic decks',()=>{
 let {brain,a}=setup({grate:true});assert.equal(brain._wet(1.3,0,6),false);a.form='squid';assert.equal(brain._wet(1.3,0,6),true);
 const {G,L,brain:b,a:actor}=setup();L._addBlock({kind:'box',min:[2,5.8,-2],max:[5,6,2],paint:true});L._buildFaces(L.blocks.at(-1));
 assert.equal(b._wet(4,0,6),false,'current live dynamic deck is physical support');
 actor.pos.set(3,6,0);assert.equal(b._wet(4,0,6),false);
 G.physics.level={};assert.equal(f.nativeCombatWet(b,G,4,0,6),null,'mismatched physics/level never supplies a new support verdict');
});

test('legacy, normal navigation, airborne, spawn and special owners retain existing policy',()=>{
 const {G,L,a,brain}=setup();
 for(const mode of ['paint','refill','ranked','boss']){brain.mode=mode;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);}
 brain.mode='fight';for(const key of ['grounded','alive']){a[key]=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a[key]=true;}
 for(const key of ['climbing','specialActive','superJumpState']){a[key]=true;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a[key]=false;}
 a.s3.squidSpawn={};assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);a.s3.squidSpawn=null;
 L.native=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);assert.equal(brain._wet(3,0,6),false,'original legacy lower-floor policy remains');
});

test('genuine grounded Trizooka move intent keeps cliff guard; other special owners delegate',()=>{
 const {G,a,brain}=setup();a.form='kid';a.specialActive={id:'trizooka',phase:'charge'};a.s3Trizooka={active:true};
 assert.equal(brain._wet(3,0,6),true,'ordinary special move input cannot authorize lower hull');
 assert.equal(brain._wet(1.2,0,6),false);
 a.s3Trizooka.active=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);
 a.s3Trizooka.active=true;
 for(const id of ['inkjet','zipcaster','slam','crabTank']){a.specialActive.id=id;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);}
 a.specialActive.id='trizooka';a.grounded=false;assert.equal(f.nativeCombatWet(brain,G,3,0,6),null);
});

test('an actual opposing spawn-zone A* refusal retains the same qualified source route goal',()=>{
 const {G,L,a,brain}=setup();L.spawnPads[1].set(1.5,6,1.5);
 const N=G.nav=new f.NavGraph(L,G.physics);a.pos.set(.5,6,-2.5);
 const goal=new f.THREE.Vector3(1.5,6,-1.5);brain.mode='paint';
 assert(brain._pathTo(goal,.6));const previous=brain.goal,oldPos=a.pos.toArray(),oldVel=a.vel.toArray();
 const enemy={team:1,alive:true,pos:L.spawnPads[1]};brain.target=enemy;brain.mode='fight';
 const blocked=N.nearest(enemy.pos,.8);assert.equal(N.nodes[blocked].zone,1);
 assert.equal(N.path(N.nearest(a.pos,1.2),blocked,a.team),null,'real A* forbids the opposing spawn zone');
 assert(brain._pathTo(enemy.pos,.8),'normal replanning remains on the prior valid source route');
 assert.equal(brain.goal,previous);assert.equal(brain.path.at(-1),previous);
 assert.deepEqual(a.pos.toArray(),oldPos);assert.deepEqual(a.vel.toArray(),oldVel);
});

test('protected-target route fallback delegates legacy, normal goals and stale world/path state',()=>{
 const {G,L,a,brain}=setup();L.spawnPads[1].set(1.5,6,1.5);
 const N=G.nav=new f.NavGraph(L,G.physics);a.pos.set(.5,6,-2.5);brain.mode='paint';
 assert(brain._pathTo(new f.THREE.Vector3(1.5,6,-1.5),.6));
 const enemy={team:1,alive:true,pos:L.spawnPads[1]},blocked=N.nearest(enemy.pos,.8);brain.target=enemy;brain.mode='fight';
 const resolve=()=>f.nativeCombatPathGoal(brain,G,enemy.pos,blocked),record=brain._nativeCombatPath;
 assert.equal(resolve(),brain.goal);
 brain.mode='paint';assert.equal(resolve(),blocked);brain.mode='fight';
 assert.equal(f.nativeCombatPathGoal(brain,G,enemy.pos.clone(),blocked),blocked);
 enemy.alive=false;assert.equal(resolve(),blocked);enemy.alive=true;
 enemy.team=0;assert.equal(resolve(),blocked,'teammate target retains original policy');enemy.team=1;
 assert.equal(f.nativeCombatPathGoal(brain,G,enemy.pos,brain.goal),brain.goal);
 for(const key of ['nav','level','physics','path']){record[key]={};assert.equal(resolve(),blocked);record[key]=key==='nav'?N:key==='level'?L:key==='physics'?G.physics:brain.path;}
 const path=brain.path;brain.path=path.slice();assert.equal(resolve(),blocked);brain.path=path;
 L.native=false;assert.equal(resolve(),blocked);
});

test('source combat edge steering reuses only the identical starting foot ring, with unchanged steering',()=>{
 for(const variant of [{},{ramp:true},{grate:true},{noPaint:true}]){
  const {G,a,brain}=setup(variant);
  a.vel.set(8,0,0);
  assert.equal(typeof brain._edgeGuardUncached,'function','the uncached path stays available for A/B');
  const raw=G.physics.groundProbe;let calls=0;
  G.physics.groundProbe=function(...args){calls++;return raw.apply(this,args);};
  const before=new f.THREE.Vector3(1,0,0);
  brain._edgeClear=null;
  brain._edgeGuardUncached(a,before);
  const baselineCalls=calls;
  calls=0;brain._edgeClear=null;
  const after=new f.THREE.Vector3(1,0,0);
  brain._edgeGuard(a,after);
  const cachedCalls=calls;
  assert.deepEqual(after.toArray(),before.toArray(), 'the original corner/cliff decision is preserved');
  assert(cachedCalls<baselineCalls,'the repeated starting foot ring must be eliminated');
  assert.equal(brain._nativeCombatEdgeProbe.active,false,'edge-scope cache never survives the call');
  // The same physical probe outside steering remains live, not reused on a
  // later simulation tick or across a rank-object/dynamic-deck change.
  calls=0;brain._wet(1.1,0,a.pos.y);const normalCalls=calls;
  calls=0;brain._wet(1.1,0,a.pos.y);
  assert.equal(calls,normalCalls,'ordinary wet checks must not reuse an edge check');
 }
});

test('edge-guard cache clears on exception and never serves a moved actor',()=>{
 const {G,a,brain}=setup();
 const original=brain._edgeGuardUncached;
 brain._edgeGuardUncached=function(){throw new Error('edge-probe-test');};
 assert.throws(()=>brain._edgeGuard(a,new f.THREE.Vector3(1,0,0)),/edge-probe-test/);
 assert.equal(brain._nativeCombatEdgeProbe.active,false);
 brain._edgeGuardUncached=original;
 const raw=G.physics.groundProbe;let calls=0;
 G.physics.groundProbe=function(...args){calls++;return raw.apply(this,args);};
 const cache=brain._nativeCombatEdgeProbe;
 cache.active=true;cache.ready=true;cache.actor=a;cache.physics=G.physics;cache.level=G.level;
 cache.x=a.pos.x;cache.y=a.pos.y;cache.z=a.pos.z;cache.squid=false;cache.safe=true;cache.height=a.pos.y;
 a.pos.x+=.01;
 brain._wet(a.pos.x+.1,a.pos.z,a.pos.y);
 assert(calls>1,'movement during a scope invalidates a cached starting foot ring');
 cache.active=false;
});

test('native all-dead paint charts skip pure CPU work but retain identical ownership and GPU splat path',()=>{
 const {G}=setup();
 const paint=G.paint,face=paint.paintFaces.find(f=>f.turf&&f.atlas&&f.nu>0&&f.nv>0);
 assert(face,'fixture must expose source turf');
 const begin=face.grid,end=begin+face.nu*face.nv;
 const oldDead=paint.dead.slice(begin,end),oldEmpty=face.nativeEmpty,oldGrid=paint.grid.slice(),oldVersion=paint.version;
 const position=face.origin.clone().addScaledVector(face.u,face.su*.5).addScaledVector(face.v,face.sv*.5);
 const raw=paint._cpuSplat;
 let cpuCalls=0,pushCalls=0;
 const rawPush=paint._pushQuad;
 paint._cpuSplat=function(...args){cpuCalls++;return raw.apply(this,args);};
 paint._pushQuad=function(...args){pushCalls++;return rawPush.apply(this,args);};
 try{
  paint.dead.fill(1,begin,end);face.nativeEmpty=true;
  const cached=paint.regionStats(position.x,position.y,position.z,.65,0,{});
  face.nativeEmpty=false;
  const scanned=paint.regionStats(position.x,position.y,position.z,.65,0,{});
  assert.deepEqual(cached,scanned,'all-dead tiles contribute zero ownership either way');
  face.nativeEmpty=true;
  paint.splat(position,.45,0,{seed:.5,face:face.id,instant:true});
  assert.equal(cpuCalls,0,'a provably all-dead chart has no CPU ink cells to visit');
  assert(pushCalls>0,'GPU splat entries remain even when authoritative cells are dead');
  assert.deepEqual(paint.grid,oldGrid,'authoritative ink cells remain unchanged');
  assert.equal(paint.version,oldVersion,'no turf grid version changes');
  face.nativeEmpty=false;
  paint.splat(position,.45,0,{seed:.5,face:face.id,instant:true});
  assert(cpuCalls>0,'unknown/nonempty native charts retain original CPU ownership work');
 } finally {
  face.nativeEmpty=oldEmpty;
  paint.dead.set(oldDead,begin);
  paint._cpuSplat=raw;paint._pushQuad=rawPush;
 }
});
