import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { rollerSpawnBase, addRollerSpawnOffset } from '../runtime/weapons-fidelity.mjs';
import { spawnSplashDrop, advanceSplashDrops, clearSplashDrops } from '../runtime/blaster-flight-paint.mjs';
import { configureCrabProjectile, paintCrabFlight } from '../runtime/crab-tank-projectile.mjs';
import { RankedWorld } from '../runtime/ranked/world.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-gameplay-before-20261026.json',import.meta.url),'utf8'));
assert.equal(fixture.provenance.commit,'dd90aa241aabd5f0b972cc3471386ba3d4da86dc');
const before=fixture.functions;
const read=rel=>fs.readFileSync(new URL('../../../'+rel,import.meta.url),'utf8');
function nodeSource(source,predicate){let result;function walk(n){if(!n||typeof n!=='object')return;if(predicate(n)){result=n;return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{ecmaVersion:'latest',sourceType:'module'}));assert.ok(result,'production AST node');return source.slice(result.start,result.end);}
const runtime=name=>read('patches/splatoon3/runtime/'+name+'.mjs');
const declaration=(source,name)=>nodeSource(source,n=>['FunctionDeclaration','ClassDeclaration'].includes(n.type)&&n.id?.name===name);
const compile=(source,bindings={})=>new Function(...Object.keys(bindings),'return ('+source+');')(...Object.values(bindings));
function random(seed=17){let state=seed;const f=()=>{f.calls++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};f.calls=0;return f;}
const finite=(v,f=0)=>Number.isFinite(v)?v:f;

test('real Aim Assist keeps target transitions and LOS order at 30/60/120 Hz with exact distance boundaries',()=>{
  const s=adaptBuildSource('src/game/player.js',read('inkwave-public/src/game/player.js'));
  const method=nodeSource(s,n=>n.type==='MethodDefinition'&&n.key?.name==='_assistTarget');
  const after='function'+method.slice('_assistTarget'.length);
  let oldDistances=0,newDistances=0;
  for(const hz of [30,60,120])for(const weapon of [{kind:'shooter',range:20},{kind:'charger',rangeMax:40},{kind:'roller'},{kind:'catalog',behaviorKind:'brella',range:12}]){
    function setup(source){
      const trace=[],calls={distance:0},actor={team:0,pos:new THREE.Vector3(),weapon},cam={position:new THREE.Vector3(),getWorldDirection:v=>v.set(0,0,1)};
      const actors=Array.from({length:8},(_,id)=>({id,team:1,alive:true,invuln:0,anim:{form:'kid'},form:'kid',smoothY:0,pos:new THREE.Vector3()}));
      actor.pos.distanceTo=function(v){calls.distance++;return THREE.Vector3.prototype.distanceTo.call(this,v);};
      const G={actors,camera:cam,physics:{los(_a,b){trace.push(b.toArray());return b.x!==.07;}}};
      const fn=compile(source,{THREE,G,DEG:Math.PI/180,COS_ASSIST_MAX:Math.cos(10*Math.PI/180)-1e-12,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),_v:new THREE.Vector3(),_c:new THREE.Vector3(),_fwd:new THREE.Vector3()});
      return{fn,G,actors,cam,trace,calls,self:{a:actor,assist:{has:false,target:null,yaw:0,pitch:0}}};
    }
    const a=setup(before.assistTarget),b=setup(after),rng=random(hz*31),range=Math.min(32,(weapon.kind==='charger'?weapon.rangeMax:weapon.kind==='roller'?7:weapon.range||12)*1.15+2);
    for(let frame=0;frame<hz*2;frame++){
      const base=frame%11,edge=range*[1-Number.EPSILON,1,1+Number.EPSILON][frame%3];
      const points=[[.01,-.95,8],[.07,-.95,10],[(rng()-.5)*300,(rng()-.5)*120,(rng()-.5)*300],[0,-.95,edge],[range+5,0,0],[0,-.95,0.5],[0,-.95,12],[0,-.95,8]];
      if(frame%31===0)points[2]=[NaN,0,Infinity];
      for(const run of [a,b]){
        run.trace.length=0;run.cam.position.set(frame%19===0?80:0,0,0);
        run.actors.forEach((actor,i)=>{actor.pos.fromArray(points[i]);actor.alive=!(i===0&&base<4);actor.invuln=i===7&&base<6?1:0;actor.anim.form=i===6&&base<3?'swim':'kid';});
        run.fn.call(run.self,frame%23===0?0:1);
      }
      const state=run=>({...run.self.assist,target:run.self.assist.target?.id??null});
      assert.deepEqual(state(b),state(a),`${hz} Hz ${weapon.kind} frame ${frame}`);
      assert.deepEqual(b.trace,a.trace,'LOS callback ordering');
    }
    oldDistances+=a.calls.distance;newDistances+=b.calls.distance;
  }
  assert.ok(newDistances<=oldDistances);
});

const kit=runtime('special-vfx-kit');
function ribbonType(source){return compile(source,{THREE,RIBBON_VERT:'',RIBBON_FRAG:'',vfxRandom:()=>.25});}
const RibbonBefore=ribbonType(before.RibbonPool),RibbonAfter=ribbonType(declaration(kit,'RibbonPool'));
test('real RibbonPool preserves ring samples and every GPU attribute at 30/60/120 Hz and spacing boundaries',()=>{
  for(const hz of [30,60,120]){
    const a=new RibbonBefore(THREE,4,16,false,{value:0}),b=new RibbonAfter(THREE,4,16,false,{value:0});
    const ar=a.start({spacing:.12,life:.6}),br=b.start({spacing:.12,life:.6});
    for(let i=0;i<hz*3;i++){
      const spacing=[.12,.03,.3,0,-1,NaN,Infinity,1e-300,1e300][Math.floor(i/17)%9];ar.o.spacing=br.o.spacing=spacing;
      const t=i/hz,x=i%3?Math.sin(t*3):i*.12,y=Math.cos(t),z=Math.sin(t*.4);
      a.push(ar,x,y,z,t);b.push(br,x,y,z,t);
      if(i%9===0){a.push(ar,x+.12*(1+Number.EPSILON),y,z,t);b.push(br,x+.12*(1+Number.EPSILON),y,z,t);}
      if(i===hz*2){a.end(ar);b.end(br);}
      a.update(t,new THREE.Vector3(3,4,5));b.update(t,new THREE.Vector3(3,4,5));
      assert.deepEqual([br.head,br.count,br.pts,br.samples,br.ended],[ar.head,ar.count,ar.pts,ar.samples,ar.ended]);
      for(const key of ['pos','col','rib','side','face'])assert.deepEqual(b[key].array,a[key].array);
      assert.deepEqual(b.mesh.geometry.drawRange,a.mesh.geometry.drawRange);
    }
    a.mesh.geometry.dispose();a.mesh.material.dispose();b.mesh.geometry.dispose();b.mesh.material.dispose();
  }
});
test('RibbonPool accepts the same samples for finite, overflow, underflow and nonfinite numerical cases',()=>{
  const rng=random(31),edges=[0,-0,1e-310,1e-150,.03,.12,.3,1e150,1e308,Infinity,-Infinity,NaN];
  const protoA=RibbonBefore.prototype,protoB=RibbonAfter.prototype;
  for(let i=0;i<30000;i++){
    const spacing=i%2?edges[i%edges.length]:(rng()*.4),dx=i%3?spacing*(1+(rng()-.5)*1e-14):edges[(i>>3)%edges.length];
    const dy=i%5?0:(rng()-.5)*10,dz=i%7?0:edges[(i>>7)%edges.length];
    function run(proto){const row={count:1,head:0,samples:[[0,0,0,0]],pts:[null],viewDirty:false,o:{spacing},ended:false};proto.push.call({M:16},row,dx,dy,dz,1);return row;}
    assert.deepEqual(run(protoB),run(protoA));
  }
});

test('FX burst hoists basis while retaining every seeded birth, shell and RNG draw',()=>{
  const rel='src/fx/fx.js',s=adaptBuildSource(rel,read('inkwave-public/'+rel));
  const method=nodeSource(s,n=>n.type==='MethodDefinition'&&n.key?.name==='burst');
  const after='function '+method.slice('burst'.length);
  function run(source,seed,opts,normal){
    const rand=random(seed),rows=[],b={THREE,rand,TAU:Math.PI*2,EMPTY:{},UP:new THREE.Vector3(0,1,0),F_PAINT:1,R_WAVE:2,_white:new THREE.Color(1,1,1)};
    for(const key of ['_v1','_v2','_v3','_tA','_tB'])b[key]=new THREE.Vector3();
    b.basis=compile(before.basis,b);b.coneDir=compile(before.coneDir,b);
    const save=(tag,args)=>rows.push([tag,...args.map(v=>v?.isVector3||v?.isColor?v.toArray():v)]);
    const self={q:[.35,1,1.5][seed%3],_col:new THREE.Color(),_colB:new THREE.Color(),_color:(color,out)=>out.copy(color),_near:()=>seed%2===0,puffs:'puffs',
      _spawnDrop(...args){save('drop',args);b._tA.set(42,19,7);b._tB.set(-13,9,27);},
      _shell(...args){save('shell',args);},_ripple(...args){save('ripple',args);},_ringRaw(...args){save('ring',args);},_sprite(...args){save('sprite',args);}};
    compile(source,b).call(self,new THREE.Vector3(1,2,3),normal,new THREE.Color(.2,.4,.7),opts);return{rows,draws:rand.calls};
  }
  for(let i=0;i<180;i++){
    const opts={count:[0,1,3,4,6,12,64][i%7],spread:[0,.1,.5,.9,1.8][i%5],size:.1+i/1000,paint:!!(i%2),ring:!!(i%3),mist:!!(i%4),sheet:i%6!==0};
    const normal=i%9?new THREE.Vector3(Math.sin(i),Math.cos(i),Math.sin(i*.4)):null;
    assert.deepEqual(run(after,i,opts,normal),run(before.burst,i,opts,normal));
  }
});

test('Roller yaw reuse preserves ordinary helpers and yaw changes from getters and RNG callbacks',()=>{
  const baseline=compile(before.rollerSpawnBase,{ROLLER_SPAWN_BASE:{height:1.35,forward:.6}}),offset=compile(before.addRollerSpawnOffset);
  for(let i=0;i<300;i++)for(const mutation of ['none','random','getter']){
    function run(current){const rng=random(i),saved=Math.random;let yaw=i*.031,reads=0;const actor={pos:new THREE.Vector3(1,2,3),get yaw(){reads++;return mutation==='getter'?yaw+=.01:yaw;}};
      const unit={SpawnWideDegree:i%3?0:5,SpawnPositionWidth:.8,SpawnPositionRandomCube:.2,SpawnPositionOffsetHeight:-.3,SpawnPositionHeight:.25},out=new THREE.Vector3();
      Math.random=()=>{if(mutation==='random')yaw+=.1;return rng();};
      try{if(current){const sinAt=actor.yaw,sin=Math.sin(sinAt),cosAt=actor.yaw,cos=Math.cos(cosAt);addRollerSpawnOffset(rollerSpawnBase(actor,out,sin,cos),actor,unit,i%5,5,!!(i%2),sin,cos,sinAt,cosAt);}else offset(baseline(actor,out),actor,unit,i%5,5,!!(i%2));return{out:out.toArray(),reads,draws:rng.calls};}finally{Math.random=saved;}}
    assert.deepEqual(run(true),run(false));
  }
});

function wrapper(source,left){const assignment=nodeSource(source,n=>n.type==='AssignmentExpression'&&source.slice(n.left.start,n.left.end)===left);return assignment.slice(assignment.indexOf('function'));}
test('fixed-arity wrappers preserve padded arguments, extra arguments, exceptions and nested state',()=>{
  const newActor=wrapper(runtime('weapon-gates'),'Actor.prototype.update'),newFresh=wrapper(runtime('weapon-gates'),'Projectiles.prototype._new'),newHorizontal=wrapper(runtime('splatling'),'Actor.prototype._horizontal');
  for(let n=0;n<8;n++)for(const throws of [false,true]){
    const args=Array.from({length:n},(_,i)=>i===0?.016:{index:i});
    function actorRun(source){const rows=[],self={weaponRunner:{s3GateInActor:'prior'}};const wrapped=compile(source,{advance:(...v)=>rows.push(['advance',v[1]]),blasterCancellationEdge:()=>null,actorUpdate:function(...args){rows.push([this===self,args,self.weaponRunner.s3GateInActor]);if(throws)throw Error('expected');return 42;}});let result;try{result=wrapped.apply(self,args);}catch(e){result=e.message;}return{rows,result,flag:self.weaponRunner.s3GateInActor,length:wrapped.length};}
    assert.deepEqual(actorRun(newActor),actorRun(before.actorUpdate));
    function freshRun(source){const rows=[],self={};const wrapped=compile(source,{fresh:function(...args){rows.push([this===self,args]);if(throws)throw Error('expected');return{old:true};}});let result;try{result=wrapped.apply(self,args);}catch(e){result=e.message;}return{rows,result,length:wrapped.length};}
    assert.deepEqual(freshRun(newFresh),freshRun(before.fresh));
    function horizontalRun(source){const rows=[],self={weapon:{kind:'shooter'},weaponRunner:{s3SplatlingChargeDecel:1},vel:new THREE.Vector3()};const wrapped=compile(source,{profile:{},splatlingChargeDownRate:()=>0,horizontal:function(...args){rows.push([this===self,args]);if(throws)throw Error('expected');return 27;}});let result;try{result=wrapped.apply(self,args);}catch(e){result=e.message;}return{rows,result,runner:self.weaponRunner,length:wrapped.length};}
    assert.deepEqual(horizontalRun(newHorizontal),horizontalRun(before.horizontal));
  }
});

function splashWorld(onPaint=()=>{}){const system={},owner={remote:false,addTurf(){},addTurfNoSpecial(){}};const game={projectiles:system,physics:{segment(a,b,h){h.hit=b.y<=0;h.point.set(b.x,0,b.z);h.normal.set(0,1,0);h.face=1;return h;}},paint:{splat(...args){onPaint(...args);return 1;}}};return{system,owner,game};}
const falling=Object.freeze({gravity:3600,drag:0,depthScaleMax:1,depthScaleMin:1,dropHeightMax:0,dropHeightMin:0});
function drop(w,y=1){return spawnSplashDrop(w.game,{owner:w.owner,team:0,seed:.37,from:new THREE.Vector3(0,y,0),radius:1,spec:falling,depth:false});}
test('newborn splash catchup retains old prefix and recycles on the real system without clear resurrection',()=>{
  const w=splashWorld(),prefix=drop(w,100),newborn=drop(w,1);advanceSplashDrops(w.system,1/60,w.game,-Infinity,1);
  assert.deepEqual(w.system._s3SplashDrops,[prefix]);assert.equal(prefix.frames,0);assert.deepEqual(prefix.pos.toArray(),[0,100,0]);assert.deepEqual(w.system._s3SplashDropPool,[newborn]);assert.equal(newborn.owner,null);
  const re=splashWorld(()=>clearSplashDrops(re.system));drop(re,100);drop(re,1);advanceSplashDrops(re.system,1/60,re.game,-Infinity,1);
  assert.equal(re.system._s3SplashDrops.length,0);assert.equal(re.system._s3SplashDropPool?.length||0,0);
});
test('Crab flight catchup uses the owning queue, keeps pre-existing drop age and does not lose retirement reuse',()=>{
  const w=splashWorld(),prefix=drop(w,100),p={type:'shot',s3AllSpecial:'crabTank',s3SpecialWeapon:{},pos:new THREE.Vector3(0,.001,0),owner:w.owner,team:0,seed:.5};configureCrabProjectile(p,7);
  p.s3CrabFlightPaint.spec.randomVelocity=null;p.s3CrabFlightPaint.spec.gravity=3600;
  const n=paintCrabFlight(w.game,p,new THREE.Vector3(0,.001,30),1/30);assert.equal(n,3);
  assert.deepEqual(w.system._s3SplashDrops,[prefix]);assert.equal(prefix.frames,0);assert.equal(w.system._s3SplashDropPool.length,3);assert.ok(w.system._s3SplashDropPool.every(d=>d.owner===null));
});

test('Tower private rider leases keep public snapshots independent and release references on exceptions',()=>{
  const w=Object.create(RankedWorld.prototype),actor={alive:true,grounded:true,pos:new THREE.Vector3(1,2,3)};
  Object.assign(w,{mode:'tower',match:{actors:[actor]},towerBlock:{center:new THREE.Vector3(),axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)]},_a:new THREE.Vector3(),_riderOnBlock:()=>true,_towerPosition(){throw Error('test stop after collect');}});
  const a=w._collectRiderOffsets(),b=w._collectRiderOffsets();assert.notEqual(a,b);assert.notEqual(a[0],b[0]);assert.equal(a[0].actor,actor);
  for(let i=0;i<3;i++){assert.throws(()=>w._syncTower(null,true),/test stop/);assert.equal(w._riderLeaseDepth,0);assert.equal(w._riderLeases.length,1);assert.equal(w._riderLeases[0].offsets.length,0);assert.equal(w._riderLeases[0].records[0].actor,null);}
  assert.equal(a[0].actor,actor);assert.deepEqual([a[0].x,a[0].y,a[0].z],[1,2,3]);
});
