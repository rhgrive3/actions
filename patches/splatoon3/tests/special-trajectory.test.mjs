import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

// Exact production source composition, controlled terrain, PvP 11.3.0, AP0.
// This verifies INKWAVE's real launch/contact path, not Nintendo capture parity.
const EXTRA=`export {throwVolley,trizookaSpecialWeapon} from './patches/splatoon3/runtime/kit-trizooka.mjs';
export {SPECIAL_PREDICTION_IDS} from './patches/splatoon3/runtime/special-trajectory.mjs';
export {inkVacState} from './patches/splatoon3/runtime/kit-ink-vac.mjs';
export {superChumpLandingPreview} from './patches/splatoon3/runtime/all-specials.mjs';`;
const near=(a,b,label='',epsilon=1e-7)=>assert.ok(Math.abs(a-b)<=epsilon,`${label}: ${a} != ${b}`);
const vectorNear=(a,b,label='')=>{near(a.x,b.x,label+' x');near(a.y,b.y,label+' y');near(a.z,b.z,label+' z');};
async function world({wall=8,ceiling=Infinity,floor=0}={}){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:EXTRA});
  const hitPlanes=(from,to,h)=>{
    h.hit=false;h.dist=Infinity;let first=Infinity,axis=null,value=0,sign=0;
    const consider=(key,plane,normal,cross)=>{if(!Number.isFinite(plane)||!cross)return;const t=(plane-from[key])/(to[key]-from[key]);if(t>=0&&t<=1&&t<first){first=t;axis=key;value=plane;sign=normal;}};
    consider('y',floor,1,from.y>=floor&&to.y<=floor&&to.y<from.y);
    consider('z',wall,-1,from.z<=wall&&to.z>=wall&&to.z>from.z);
    consider('y',ceiling,-1,from.y<=ceiling&&to.y>=ceiling&&to.y>from.y);
    if(axis){h.hit=true;h.point.copy(from).lerp(to,first);h.point[axis]=value;h.normal.set(0,0,0);h.normal[axis]=sign;h.dist=from.distanceTo(h.point);h.face=-1;}
    return h;
  };
  f.G.physics.segment=hitPlanes;
  f.G.physics.raycast=(o,d,len,h)=>hitPlanes(o,o.clone().addScaledVector(d,len),h);
  f.G.physics.los=(a,b)=>!hitPlanes(a,b,new f.Hit()).hit;
  f.G.level.groundHeight=(_x,_z,y=Infinity)=>Number.isFinite(floor)&&y>=floor-1e-8?floor:-Infinity;
  f.G.paint.sample=()=>0;f.G.match.state='playing';f.G.camera=new f.THREE.PerspectiveCamera();
  const paints=[];f.G.paint.splat=(point,radius)=>{paints.push({point:point.clone(),radius});return 0;};
  const make=(id,y=2,pitch=.25)=>{
    const a=f.make();a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.invuln=0;
    a.pos.set(0,y,0);a.vel.set(0,0,0);a.aimYaw=0;a.aimPitch=pitch;
    a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));a.aimPoint.copy(a.pos).addScaledVector(a.aimDir,30);
    a._resolve=()=>{};a.intent.fire=a.intent.sub=a.intent.squid=false;return a;
  };
  const actor=(a,n=1)=>{for(let i=0;i<n&&a.specialActive;i++)a._updateSpecial(1/60);};
  const tick=(dt=1/60)=>{f.G.time+=dt;f.G.projectiles.update(dt);};
  const release=a=>{a.intent.sub=true;actor(a);a.intent.sub=false;actor(a,70);};
  return {f,make,actor,tick,release,paints};
}
function fire(w,a,id){
  const system=w.f.G.projectiles;
  if(id==='inkVac')return [system.fireInkVacExhale(a,{charge:.65})];
  if(id==='trizooka')return w.f.throwVolley(system,a,w.f.trizookaSpecialWeapon(0));
  a._startSpecial();
  if(id==='booyahBomb'){w.actor(a,31);a._s3AllSpecialState.charge=1;w.release(a);}
  else if(id==='ultraStamp')w.release(a);
  else if(id==='inkjet'){a.intent.fire=true;for(let i=0;i<120&&!system.list.some(p=>p.owner===a&&p.wid===id);i++)w.actor(a);a.intent.fire=false;}
  else if(id==='crabTank'){w.actor(a,21);a.intent.sub=true;w.actor(a);a.intent.sub=false;}
  return system.list.filter(p=>p.owner===a&&p.wid===id);
}

test('all nineteen specials have explicit classifications; previews do not spend, spawn or draw RNG',async()=>{
  const w=await world(),{f}=w,a=w.make('storm');f.G.actors=[a];
  const system=f.G.projectiles,events=[];for(const e of ['all:special','weapon:impact','kit:bubbler:damage-proposal'])f.on(e,x=>events.push(x));
  const snapshot=()=>JSON.stringify({special:a.special,ink:a.ink,hp:a.hp,pos:a.pos,vel:a.vel,active:a.specialActive,
    projectiles:system.list.length,bombs:system.bombs.length,objects:system._s3AllSpecialObjects?.length||0,paints:w.paints.length,events:events.length});
  const before=snapshot(),outcomes={};let randomCalls=0;
  f.setRandom(()=>{randomCalls++;throw new Error('prediction consumed gameplay RNG');});
  for(const id of f.SPECIAL_PREDICTION_IDS){
    const r=system.s3PredictSpecialTrajectory(a,{id});assert.ok(r,id);assert.equal(r.kind,id);
    assert.notEqual(r.outcome,'unsupported',id);assert.notEqual(r.outcome,'unavailable',id);
    assert.ok(r.points.every(p=>[p.x,p.y,p.z].every(Number.isFinite)),id);outcomes[id]=r.outcome;
  }
  f.restoreRandom();assert.equal(randomCalls,0);
  assert.equal(f.SPECIAL_PREDICTION_IDS.length,19);assert.equal(snapshot(),before);
  for(const id of ['bubbler','killerWail','krakenRoyale'])assert.equal(outcomes[id],'not-applicable');
  assert.equal(outcomes.reefslider,'action-dependent');assert.equal(outcomes.tentaMissiles,'target-dependent');
  assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);
  assert.equal(system.s3PredictSpecialTrajectory(a,{id:'unknown'}).outcome,'unsupported');
});

for(const id of ['booyahBomb','ultraStamp','crabTank','inkjet','inkVac','trizooka'])test(`${id}: guide and native blast contact agree through FixedClock at 30/60/120 render Hz`,async()=>{
  const w=await world(),{f}=w,system=f.G.projectiles,rows=[];
  for(const hz of [30,60,120]){
    system.clear();f.G.actors=[];const a=w.make(id);f.G.actors=[a];
    const actual=fire(w,a,id);assert.ok(actual.length>0,`real ${id} fired`);
    const prediction=system.s3PredictSpecialTrajectory(a,{id,charge:.65});
    vectorNear(prediction.origin,actual[0].pos,'origin');vectorNear(prediction.velocity,actual[0].vel,'velocity');
    const contacts=[],impact=system._impact,burst=system._blastBurst,clock=new f.FixedClock();
    system._impact=function(p,h,...rest){if(p.owner===a&&p.wid===id)contacts.push({point:h.point.clone(),index:p.s3VolleyIndex||0});return impact.call(this,p,h,...rest);};
    system._blastBurst=function(p,at,...rest){if(p.owner===a&&p.wid===id&&!contacts.some(c=>c.index===(p.s3VolleyIndex||0)))contacts.push({point:at.clone(),index:p.s3VolleyIndex||0});return burst.call(this,p,at,...rest);};
    try{for(let i=0;i<hz*7&&contacts.length<actual.length;i++)clock.advance(1/hz,w.tick);}
    finally{system._impact=impact;system._blastBurst=burst;}
    const first=contacts.find(c=>c.index===0);assert.ok(first,`native terminal contact at ${hz}Hz`);
    assert.equal(prediction.complete,true);vectorNear(prediction.endpoint,first.point,'terminal');rows.push(first.point.toArray());
    if(id==='trizooka'){
      assert.equal(prediction.trajectories.length,3);assert.equal(prediction.explosions.length,3);
      for(let i=0;i<3;i++)vectorNear(prediction.explosions[i].point,contacts.find(c=>c.index===i).point,'lobe '+i);
    }
  }
  for(const row of rows.slice(1))for(let i=0;i<3;i++)near(row[i],rows[0][i],id+' frame rate');
});

for(const id of ['waveBreaker','splattercolorScreen','tripleInkstrike','tacticooler'])test(`${id}: actual placement matches guide through wall/ceiling/floor contacts`,async()=>{
  const w=await world({wall:4,ceiling:5}),{f}=w,system=f.G.projectiles,rows=[];
  for(const hz of [30,60,120]){
    system.clear();f.G.actors=[];const a=w.make(id,2,.6);f.G.actors=[a];a._startSpecial();w.release(a);
    const prediction=system.s3PredictSpecialTrajectory(a,{id});assert.equal(prediction.complete,true);
    const clock=new f.FixedClock(),d=id==='tacticooler'?system._s3SupportCoolerThrows.find(d=>d.owner===a):system._s3AllSpecialObjects.find(d=>d.owner===a);
    assert.ok(d,'admitted live device');vectorNear(prediction.origin,d.pos,'initial');vectorNear(prediction.velocity,d.vel,'velocity');
    for(let i=0;i<hz*8&&(id==='tacticooler'?d.outcome==='flight':d.phase==='flight');i++)clock.advance(1/hz,w.tick);
    const actual=id==='tacticooler'?system._s3SupportCoolers.find(d=>d.owner===a):d;
    assert.ok(actual,'live placed device');vectorNear(prediction.endpoint,actual.pos,'placement');rows.push(actual.pos.toArray());
    assert.ok(prediction.firstImpact,'first terrain touch is retained');
    if(id==='tripleInkstrike'){near(prediction.explosions[0].time,prediction.time+82/60);assert.ok(prediction.endpoint.y>0,'marker stays attached to wall/ceiling');}
    if(id==='waveBreaker'||id==='tacticooler')assert.ok(prediction.endpoint.y<.1,'wall slide reaches real floor');
  }
  for(const row of rows.slice(1))for(let i=0;i<3;i++)near(row[i],rows[0][i],id+' frame rate');
});

test('booyah wall blast retains its contact height while ink independently samples floor support',async()=>{
  const w=await world({wall:5,floor:0}),a=w.make('booyahBomb',2,.05),{f}=w;f.G.actors=[a];
  fire(w,a,'booyahBomb');const prediction=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'booyahBomb'});
  let blast;for(let i=0;i<180&&!blast;i++){w.tick();blast=f.G.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='booyahBlast');}
  assert.ok(blast);assert.ok(blast.pos.y>3,'contact is above lower floor');vectorNear(blast.pos,prediction.endpoint,'blast center');
  near(prediction.explosions[0].time,prediction.time+41/60);
  near(prediction.explosions[0].time,f.G.time+blast.startDelay,'next-tick terrain queue plus blast startup');
  for(let i=0;i<70;i++)w.tick();
  assert.ok(w.paints.some(p=>p.point.y<.2),'ground paint uses its own support projection');
  vectorNear(blast.pos,prediction.endpoint,'ink projection never relocates damage center');
});

test('target contacts stay conditional, open water stays incomplete, and a reused point pool keeps the endpoint',async()=>{
  const w=await world({wall:Infinity,floor:-Infinity}),{f}=w,a=w.make('ultraStamp'),enemy=w.make('bubbler');
  enemy.team=1;enemy.pos.set(0,3.8,4);f.G.actors=[a,enemy];
  const conditional=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'ultraStamp'});
  assert.equal(conditional.targetDependent,true);assert.equal(conditional.complete,false);
  f.G.actors=[a];const lost=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'waveBreaker'});
  assert.equal(lost.outcome,'lost');assert.equal(lost.complete,false);
  const points=[],first=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'inkVac',points}),p0=points[0];
  const second=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'inkVac',points});
  assert.equal(second.points,points);assert.equal(points[0],p0);vectorNear(points.at(-1),second.endpoint);vectorNear(first.endpoint,second.endpoint);
});

test('activeOnly follows the held special state and disables previews during committed throws/rolling',async()=>{
  const w=await world(),{f}=w,system=f.G.projectiles;
  for(const id of ['tacticooler','storm','booyahBomb','ultraStamp','crabTank']){
    system.clear();const a=w.make(id);f.G.actors=[a];a._startSpecial();
    if(id==='booyahBomb'){assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);w.actor(a,31);a._s3AllSpecialState.charge=1;w.actor(a);}
    if(id==='ultraStamp'){assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);a.intent.sub=true;w.actor(a);}
    if(id==='crabTank'){assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);a.intent.sub=true;}
    assert.equal(system.s3CanPredictSpecialTrajectory(a),true);
    assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true})?.kind,id);
    if(id==='crabTank'){a.intent.squid=true;assert.equal(system.s3CanPredictSpecialTrajectory(a),false);assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);}
    if(id==='booyahBomb'||id==='ultraStamp'){a.intent.sub=true;w.actor(a);a.intent.sub=false;w.actor(a);assert.equal(system.s3CanPredictSpecialTrajectory(a),false);assert.equal(system.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);}
  }
});

test('decoy prediction returns each live landing point without changing the activation seed',async()=>{
  const w=await world({wall:Infinity}),{f}=w,a=w.make('superChump',0,0);a.grounded=true;f.G.actors=[a];a._startSpecial();
  const seed=a._s3AllSpecialState.seed,p=f.G.projectiles.s3PredictSpecialTrajectory(a,{activeOnly:true});
  assert.equal(p.presentationOwner,'special-vfx');assert.ok(f.superChumpLandingPreview(f,a));
  assert.equal(p.explosions.length,12);assert.equal(p.complete,true);assert.equal(a._s3AllSpecialState.seed,seed);
  a.intent.fire=true;w.actor(a);assert.equal(f.G.projectiles.s3CanPredictSpecialTrajectory(a),false);
  assert.equal(f.superChumpLandingPreview(f,a),null,'committed setup immediately hides the existing VFX guide');
  assert.equal(f.G.projectiles.s3PredictSpecialTrajectory(a,{activeOnly:true}),null);
  w.actor(a,13);const decoys=f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy');assert.equal(decoys.length,12);
  for(let i=0;i<12;i++){vectorNear(p.explosions[i].point,decoys[i].target,'decoy '+i);near(p.explosions[i].time,108/60+210/60);}
});

test('production Level/Physics OBB contacts preserve wall, ceiling and lower-storey endpoints',async()=>{
  const w=await world(),{f}=w,{G}=f;
  const cases=[
    {id:'booyahBomb',pitch:.05,roof:12,wall:6,axis:'z',normal:-1},
    {id:'ultraStamp',pitch:.8,roof:3.5,wall:40,axis:'y',normal:-1},
    {id:'tripleInkstrike',pitch:.6,roof:4,wall:40,axis:'y',normal:-1},
    {id:'tacticooler',pitch:.35,roof:12,wall:3,axis:'y',normal:1},
  ];
  for(const c of cases){
    G.projectiles.clear();G.actors=[];G.scene ||= new f.THREE.Scene();
    G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[
      {kind:'box',min:[-100,-1,-100],max:[100,0,100]},
      {kind:'box',min:[-50,c.roof,-20],max:[50,c.roof+.5,60]},
      {kind:'box',min:[-50,0,c.wall],max:[50,20,c.wall+1]},
    ]});G.physics=new f.Physics(G.level);
    const a=w.make(c.id,0,c.pitch);G.actors=[a];
    const device=['tripleInkstrike','tacticooler'].includes(c.id);
    if(device){a._startSpecial();w.release(a);}else fire(w,a,c.id);
    const forecast=G.projectiles.s3PredictSpecialTrajectory(a,{id:c.id});
    assert.equal(forecast.complete,true,c.id);assert.equal(forecast.normal[c.axis],c.normal,c.id+' normal');
    let endpoint=null;const impact=G.projectiles._impact;
    if(!device)G.projectiles._impact=function(p,h,...args){if(p.owner===a)endpoint=h.point.clone();return impact.call(this,p,h,...args);};
    try{
      for(let i=0;i<480&&!endpoint;i++){
        w.tick();
        if(c.id==='tacticooler')endpoint=G.projectiles._s3SupportCoolers?.find(d=>d.owner===a)?.pos.clone();
        if(c.id==='tripleInkstrike'){const d=G.projectiles._s3AllSpecialObjects?.find(d=>d.owner===a);if(d?.phase!=='flight')endpoint=d.pos.clone();}
      }
    }finally{G.projectiles._impact=impact;}
    assert.ok(endpoint,c.id+' actual contact');vectorNear(forecast.endpoint,endpoint,c.id+' actual OBB');
    if(c.id==='tacticooler')near(endpoint.y,0,'upper roof is not a deployment floor');
    if(c.id==='booyahBomb')assert.ok(endpoint.y>1,'wall contact is not projected to the lower floor');
  }
});

test('booyah lifetime airburst keeps the airborne center above every floor',async()=>{
  const w=await world({wall:Infinity}),a=w.make('booyahBomb',200,.25),{f}=w;f.G.actors=[a];
  fire(w,a,'booyahBomb');const forecast=f.G.projectiles.s3PredictSpecialTrajectory(a,{id:'booyahBomb'});
  assert.equal(forecast.outcome,'airburst');assert.equal(forecast.complete,true);assert.ok(forecast.endpoint.y>30);
  let blast;for(let i=0;i<180&&!blast;i++){w.tick();blast=f.G.projectiles._s3AllSpecialObjects?.find(o=>o.kind==='booyahBlast');}
  assert.ok(blast);vectorNear(forecast.endpoint,blast.pos,'airburst center');
});

test('special preview queries an enemy Ink Vac without mutating intake pose, charge or hit authority',async()=>{
  const w=await world({wall:Infinity}),{f}=w,vac=w.make('inkVac',0,0);f.G.actors=[vac];
  vac.team=1;vac.pos.z=6;vac.aimYaw=Math.PI;vac.aimDir.set(0,0,-1);vac.aimPoint.set(0,1,-20);vac._startSpecial();vac.intent.fire=true;
  for(let i=0;i<90;i++){f.G.time+=1/60;vac.update(1/60);}
  const state=f.inkVacState(vac);assert.equal(state.phase,'inhale');
  const shooter=w.make('ultraStamp',0,0);f.G.actors=[shooter,vac];
  const snapshot=()=>JSON.stringify({charge:state.charge,absorbed:state.absorbed,damage:state.absorbedDamage,t:state.t,
    scratch:['_fwd','_org','_q','_m','_e'].map(k=>state[k].toArray()),hp:shooter.hp,ink:shooter.ink,special:shooter.special,
    list:f.G.projectiles.list.length,paints:w.paints.length});
  const before=snapshot();f.setRandom(()=>{throw new Error('intake preview consumed gameplay RNG');});
  let p;try{p=f.G.projectiles.s3PredictSpecialTrajectory(shooter,{id:'ultraStamp'});}finally{f.restoreRandom();}
  assert.equal(p.outcome,'absorbed');assert.equal(p.complete,false);assert.equal(p.targetDependent,true);assert.equal(p.radius,0);
  assert.equal(snapshot(),before);
});
