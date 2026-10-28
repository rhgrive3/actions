import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {softPushActor} from '../runtime/movement-physics.mjs';

const read=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const before=JSON.parse(read('./fixtures/queue-gameplay-review-before-20261026.json'));
const sourceBefore=JSON.parse(read('./fixtures/queue-gameplay-before-20261026.json')).functions;
function extract(source,predicate){let result;function walk(n){if(!n||typeof n!=='object')return;if(predicate(n)){result=source.slice(n.start,n.end);return;}for(const v of Object.values(n))if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')walk(v);}walk(parse(source,{sourceType:'module',ecmaVersion:'latest'}));assert.ok(result);return result;}
const compile=(source,bindings={})=>new Function(...Object.keys(bindings),'return ('+source+');')(...Object.values(bindings));
const fidelity=read('../runtime/weapons-fidelity.mjs');
const assignment=extract(fidelity,n=>n.type==='AssignmentExpression'&&fidelity.slice(n.left.start,n.left.end)==='Projectiles.prototype._step');
const stepAfter=assignment.slice(assignment.indexOf('function'));
const cachedYawCos=compile(extract(fidelity,n=>n.type==='VariableDeclarator'&&n.id?.name==='cachedYawCos').split('=').slice(1).join('='));
const cachedYawSin=compile(extract(fidelity,n=>n.type==='VariableDeclarator'&&n.id?.name==='cachedYawSin').split('=').slice(1).join('='));

test('delayed Slosher checks each live angle at the original read, including parameter mutation and throwing getters',()=>{
  const run=(source,kind,yaw0,pitch0,ready)=>{
    const log=[],owner={alive:true,hp:100,grounded:true,weapon:{id:'slosher'},_s3SlosherBirthEpoch:1};
    let yaw=yaw0,pitch=pitch0,yawReads=0,pitchReads=0;
    const p={owner,_s3SloshBirthPending:true,_s3SloshBirthOwner:owner,_s3SloshBirthEpoch:1,_s3SloshBirthWeaponId:'slosher',_s3SloshBirthWasInMatch:true,fidelitySloshIndex:0,
      pos:new THREE.Vector3(),prev:new THREE.Vector3(),start:new THREE.Vector3(),vel:new THREE.Vector3(4,5,6),_s3SloshTrigReady:ready,
      _s3SloshTrigYaw:yaw0,_s3SloshTrigPitch:pitch0,_s3SloshCosPitch:Math.cos(pitch0),_s3SloshSinYaw:Math.sin(yaw0),_s3SloshSinPitch:Math.sin(pitch0),_s3SloshCosYaw:Math.cos(yaw0)};
    Object.defineProperty(p,'_s3SloshYaw',{get(){log.push(['yaw',yaw]);if(kind==='yaw-throw-last'&&++yawReads===2)throw Error('yaw failure');const v=yaw;if(kind==='angle-change')yaw+=.2;return v;}});
    Object.defineProperty(p,'_s3SloshPitch',{get(){log.push(['pitch',pitch]);if(kind==='pitch-throw-first'&&++pitchReads===1)throw Error('pitch failure');const v=pitch;if(kind==='angle-change')pitch+=.1;return v;}});
    p.fidelitySloshUnit={SpawnSpeedGround:1,SpawnSpeedAir:1,AfterOffsetSpawnSpeed:0,get AddSpawnSpeedYRateByXZ(){log.push(['rate']);if(kind==='unit-change')yaw=Math.PI/2;if(kind==='unit-throw')throw Error('unit failure');return .05;}};
    const context={G:{actors:[owner],netm:{recProj(){log.push(['packet']);if(kind==='packet-throw')throw Error('packet failure');}}}};
    const fn=compile(source,{context,step(){log.push(['step']);return false;},cachedYawCos,cachedYawSin});
    let result;try{result=fn.call({_muzzle(a,out){log.push(['muzzle']);if(kind==='muzzle-change'){yaw+=.5;pitch-=.2;}out.set(1,2,3);}},p,1/60);}catch(e){result=e.message;}
    return{log,result,vel:p.vel.toArray(),pos:p.pos.toArray(),prev:p.prev.toArray(),start:p.start.toArray(),pending:p._s3SloshBirthPending,delay:p.delay,maxY:p.fidelityMaxY};
  };
  for(const kind of ['none','unit-change','angle-change','muzzle-change','unit-throw','yaw-throw-last','pitch-throw-first','packet-throw'])
    for(const [yaw,pitch] of [[0,0],[-0,-0],[.7,-.2],[NaN,Infinity]])for(const ready of [false,true])
      assert.deepEqual(run(stepAfter,kind,yaw,pitch,ready),run(before.step,kind,yaw,pitch,ready),kind);
});

test('FX burst invalidates basis after recursive drops or RNG normal changes without reordering draws or errors',()=>{
  const source=adaptBuildSource('src/fx/fx.js',read('../../../inkwave-public/src/fx/fx.js'));
  const method=extract(source,n=>n.type==='MethodDefinition'&&n.key?.name==='burst');
  const after='function '+method.slice('burst'.length);
  const run=(code,kind,seed)=>{
    const rows=[],b={THREE,TAU:Math.PI*2,EMPTY:{},UP:new THREE.Vector3(0,1,0),F_PAINT:1,R_WAVE:2,_white:new THREE.Color(1,1,1)};
    for(const key of ['_v1','_v2','_v3','_tA','_tB'])b[key]=new THREE.Vector3();
    let state=seed,draws=0,inside=false,dropCount=0;
    b.rand=()=>{draws++;if(kind==='rng-normal'&&draws%3===1)b._v3.set(Math.sin(draws),Math.cos(draws),.25);if(kind==='throw-rng'&&draws===8)throw Error('rng failure');state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
    b.basis=compile(sourceBefore.basis,b);b.coneDir=compile(sourceBefore.coneDir,b);
    const save=(tag,args)=>rows.push([tag,...args.map(v=>v?.isVector3||v?.isColor?v.toArray():v)]);
    let invoke;
    const self={q:1,_col:new THREE.Color(),_colB:new THREE.Color(),_color:(c,out)=>out.copy(c),_near:()=>true,puffs:'puffs',
      _spawnDrop(...args){
        save('drop',args);dropCount++;b._tA.set(17,9,-3);b._tB.set(-7,2,11);
        if(kind==='normal')b._v3.set(dropCount%2?1:-0,0,dropCount%2?0:1);
        if(kind==='throw-drop'&&dropCount===2)throw Error('drop failure');
        if(kind==='recursive'&&!inside){inside=true;invoke.call(self,new THREE.Vector3(2,3,4),new THREE.Vector3(1,0,0),new THREE.Color(.7,.2,.4),{count:2,sheet:false});inside=false;}
      },
      _shell(...a){save('shell',a);},_ripple(...a){save('ripple',a);},_ringRaw(...a){save('ring',a);},_sprite(...a){save('sprite',a);}};
    invoke=compile(code,b);let error;
    try{invoke.call(self,new THREE.Vector3(1,2,3),new THREE.Vector3(0,1,0),new THREE.Color(.2,.4,.7),{count:7,spread:.9,sheet:true,ring:true,mist:true});}catch(e){error=e.message;}
    return{rows,draws,error};
  };
  for(const kind of ['tangent','normal','recursive','rng-normal','throw-drop','throw-rng'])for(let seed=1;seed<=20;seed++)
    assert.deepEqual(run(after,kind,seed),run(sourceBefore.burst,kind,seed),kind+' '+seed);
});

test('Aim Assist prunes only the private camera vector and preserves original custom distance lookup/call order',()=>{
  const source=adaptBuildSource('src/game/player.js',read('../../../inkwave-public/src/game/player.js'));
  const method=extract(source,n=>n.type==='MethodDefinition'&&n.key?.name==='_assistTarget');
  const after='function'+method.slice('_assistTarget'.length);
  const run=(code,kind)=>{
    const log=[],position=new THREE.Vector3(),targetPosition=new THREE.Vector3(0,-.95,100);
    const metric=function(p){assert.equal(this,position);assert.equal(p,targetPosition);log.push('call-distance');if(kind==='throw-call')throw Error('distance failure');return kind==='far'?100:1;};
    metric.call=()=>{throw Error('must not consult a custom call property');};
    Object.defineProperty(position,'distanceTo',{get(){log.push('lookup-distance');if(kind==='throw-lookup')throw Error('lookup failure');return metric;}});
    const actor={team:0,weapon:{kind:'shooter',range:20},get pos(){log.push('actor-pos');return position;}};
    const enemy={id:'target',team:1,alive:true,invuln:0,anim:{form:'kid'},form:'kid',get pos(){log.push('target-pos');return targetPosition;}};
    const G={actors:[enemy],camera:{position:new THREE.Vector3(0,0,90),getWorldDirection:v=>v.set(0,0,1)},physics:{los(){log.push('los');return true;}}};
    const bindings={THREE,G,DEG:Math.PI/180,COS_ASSIST_MAX:Math.cos(10*Math.PI/180)-1e-12,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),_v:new THREE.Vector3(),_c:new THREE.Vector3(),_fwd:new THREE.Vector3()};
    const self={a:actor,assist:{has:false,target:null,yaw:0,pitch:0}};let error;
    try{compile(code,bindings).call(self,1);}catch(e){error=e.message;}
    return{log,error,assist:{...self.assist,target:self.assist.target?.id??null}};
  };
  for(const kind of ['near','far','throw-call','throw-lookup'])assert.deepEqual(run(after,kind),run(sourceBefore.assistTarget,kind),kind);
});

test('soft push retains live pair reads and ordering across mutation, reentry, walls, and exceptions',()=>{
  const source=adaptBuildSource('src/game/match.js',read('../../../inkwave-public/src/game/match.js'));
  const start=source.indexOf('    // soft push between actors'),end=source.indexOf('\n  }\n\n  updateController',start);
  assert.ok(start>=0&&end>start);const after=source.slice(start,end);
  const run=(body,kind)=>{
    const PLAYER={radius:.4,stepUp:.2,height:1.5,squidHeight:.5,squidBodyLift:.1};
    const make=(id,x)=>({id,alive:true,remote:false,form:'kid',pos:new THREE.Vector3(x,0,0)});
    const a=make('A',0),b=make('B',.1),d=make('D',.2),extra=make('extra',.15),replacement=make('replacement',10);
    const match={actors:[a,b,d]},log=[];let changed=false,depth=0,calls=0,error;
    let invoke;
    const G={physics:{bodyFits(pos){
      calls++;log.push(['fits',depth,pos.x,pos.z]);
      if(!changed){
        changed=true;
        if(kind==='roster'||kind==='both')match.actors[0]=replacement;
        if(kind==='radius'||kind==='both')PLAYER.radius=.8;
        if(kind==='death')a.alive=false;
        if(kind==='append')match.actors.push(extra);
        if(kind==='reentrant'){depth++;try{invoke();}finally{depth--;}}
        if(kind==='throw-first')throw Error('collision failure first');
      }
      if(kind==='throw-later'&&calls===3)throw Error('collision failure later');
      return kind!=='wall'||pos.x>=-.05;
    }}};
    const fn=new Function('PLAYER','G','softPushActor',body);
    invoke=()=>fn.call(match,PLAYER,G,(...args)=>{log.push(['push',depth,args[2].id,args[3],args[4]]);return softPushActor(...args);});
    try{invoke();}catch(e){error=e.message;}
    return{log,error,positions:[a,b,d,extra,replacement].map(x=>[x.id,...x.pos.toArray(),x.alive]),roster:match.actors.map(x=>x.id),radius:PLAYER.radius};
  };
  for(const kind of ['roster','radius','both','death','append','reentrant','throw-first','throw-later','wall']){
    const actual=run(after,kind),expected=run(before.softPushBody,kind);
    assert.deepEqual(actual,expected,kind);
    if(kind==='death')assert.equal(actual.positions[0][4],false);
    if(kind==='append'){assert.ok(actual.roster.includes('extra'));assert.ok(actual.log.some(row=>row[0]==='push'&&row[2]==='extra'));}
    if(kind==='reentrant')assert.ok(actual.log.some(row=>row[0]==='push'&&row[1]===1));
    if(kind==='throw-first'||kind==='throw-later')assert.match(actual.error,/collision failure/);
    if(kind==='wall'){assert.ok(actual.log.some(row=>row[0]==='fits'&&row[2]<-.05));assert.ok(actual.positions[0][1]>=-.05);}
  }
});
