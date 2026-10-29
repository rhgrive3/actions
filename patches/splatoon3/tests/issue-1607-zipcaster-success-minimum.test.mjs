import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// j1% lists a 20F minimum successful-hook repeat independently of the 45F
// miss interval (https://note.com/j1per/n/ne7085d9350ef, Ver.5.0.0 table).
// The pinned 11.3.0 SuperHook table still contains ShotFailedIntervalFrm=20;
// its internal phase meaning is not decoded here. These regressions enforce
// the independently reported successful minimum without shortening misses,
// pulling faster or replacing the separate source-backed 12F arrival wait.
let fixturePromise;
const world=()=>fixturePromise??=fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export {replaySpecial} from './patches/splatoon3/runtime/all-specials.mjs';"});

function trace(f,{distance=.2,retry=20,hz=60,holdAcrossGate=false,events=null,fuel=null}={}){
  const {G}=f;G.actors.length=0;G.time=0;G.projectiles.clear();
  G.level=new f.Level({bounds:{minX:-60,maxX:60,minZ:-60,maxZ:60},
    spawnPads:[[-50,0,-50],[50,0,50]],spawnBarrier:0,half:[],single:[
      {kind:'box',min:[-60,-1,-60],max:[60,0,60]},
      {kind:'box',min:[-4,0,distance],max:[4,4,distance+.1]}]});
  G.physics=new f.Physics(G.level);
  const a=f.make('shooter');a.weapon={...a.weapon,special:'zipcaster',specialCost:100};
  a.special=100;a.pos.set(0,0,0);a.yaw=a.aimYaw=a.aimPitch=0;a._startSpecial();
  const state=a._s3AllSpecialState,rows=[],clock=new f.FixedClock();let tick=0;
  if(fuel!==null)state.inkFuel=fuel;
  const off=f.on('all:special',event=>{if(events&&event.actor===a&&event.id==='zipcaster')events.push({...event,tick,actor:a});});
  try{
  for(let frame=0;frame<hz;frame++)clock.advance(1/hz,dt=>{
    a.aimPitch=0;a.aimPoint.set(a.pos.x,a.pos.y+1.05,20);
    a.intent.sub=tick===0||(holdAcrossGate?tick>=retry&&tick<24||tick===25:tick===retry);
    const fuel=state.inkFuel;G.time+=dt;a.update(dt);
    rows.push({tick,phase:state.phase,fuel:state.inkFuel,spent:fuel-state.inkFuel,
      next:state.nextHookAt??null,zips:state.zips,failed:state.failedHooks??0,
      active:a.specialActive?.id??null,normalInk:a.ink,
      flight:state.hookFlightT??null,wait:state.hookWait??null,pos:a.pos.toArray()});tick++;
  });
  return JSON.parse(JSON.stringify(rows));
  }finally{off();}
}

test('#1607 successful near-wall hooks cannot repeat at 19F, and accept fresh 20F/21F inputs at every fixed render cadence',async()=>{
  const f=await world(),proof=[];
  for(const distance of [.01,.2,1,2])for(const retry of [19,20,21]){
    let baseline;
    for(const hz of [20,30,60,120]){
      const rows=trace(f,{distance,retry,hz});
      assert.equal(rows[0].phase,'hookFlight');assert.equal(rows[0].failed,0);
      const ready=rows.findIndex((r,t)=>t>0&&r.phase==='ready');
      assert.ok(ready>=12&&ready<20,'near-wall flight/pull/arrival wait finishes before20F');
      assert.equal(rows[retry].phase,retry<20?'ready':'hookFlight',`${distance}WU at ${retry}F`);
      assert.equal(rows[retry].failed,0,'denied successful-repeat input is not a failed hook');
      if(retry<20)assert.ok(Math.abs(rows[retry].spent-.25)<1e-8,'denied repeat pays only passive tank drain');
      else assert.ok(rows[retry].spent>2.5,'accepted repeat pays its independent hook cost exactly once');
      if(baseline)assert.deepEqual(rows,baseline,'same input schedule produces the same60Hz trajectory');else baseline=rows;
      proof.push({distance,retry,hz,ready,accepted:rows[retry].phase==='hookFlight'});
    }
  }
  console.log(JSON.stringify({successfulHookMinimum:proof}));
});

test('#1607 denied held input does not auto-repeat at20F; a later fresh press remains usable',async()=>{
  const f=await world();
  for(const hz of [20,30,60,120]){
    const rows=trace(f,{retry:19,hz,holdAcrossGate:true});
    for(let t=19;t<25;t++)assert.equal(rows[t].phase,'ready','held denied input remains consumed at'+t);
    assert.equal(rows[25].phase,'hookFlight','release/repress starts a valid hook');
  }
});

test('#1607 long hooks keep their complete flight/pull and12F arrival recovery beyond the20F minimum',async()=>{
  const f=await world(),rows=trace(f,{distance:8,retry:20});
  assert.notEqual(rows[20].phase,'hookFlight','minimum timer never skips an active pull/recovery');
  assert.notEqual(rows[20].phase,'ready','long hook still owns the actor after20F');
  assert.equal(rows[20].failed,0);
  const ready=rows.findIndex((r,t)=>t>0&&r.phase==='ready');assert.ok(ready>20);
  assert.ok(rows[ready].wait>=12/60-1e-8,'source-backed arrival wait retained');
});

test('#1607 accepted repeat events retain their network shape and replay grants no remote hook/ink/damage authority',async()=>{
  const f=await world(),events=[];trace(f,{retry:20,events});
  const hooks=events.filter(e=>e.action==='zip');assert.deepEqual(hooks.map(e=>e.tick),[0,20]);
  const remote=f.make('shooter');remote.remote=true;remote.team=1;
  const before={pos:remote.pos.toArray(),ink:remote.ink,hp:remote.hp,special:remote.special};
  for(const e of hooks){
    const {actor:owner,tick,...wire}=e;
    assert.deepEqual(Object.keys(wire).sort(),['action','activation','id','pos','seed','target']);
    assert.ok(wire.pos.every(Number.isFinite)&&wire.target.every(Number.isFinite));
    assert.ok(Number.isSafeInteger(wire.seed)&&wire.seed>=0&&wire.seed<=0xffffffff);
    const packet={...wire,tick,actor:remote};
    assert.equal(f.replaySpecial(f,packet),true,'actual remote presentation replay accepts this hook');
    assert.equal(f.replaySpecial(f,packet),false,'duplicate presentation is rejected');
  }
  assert.deepEqual({pos:remote.pos.toArray(),ink:remote.ink,hp:remote.hp,special:remote.special},before);
  assert.equal(remote._s3AllSpecialState,null,'remote replay never creates an authoritative retry timer');
});

test('#1607 last low-ink hook still completes and returns before any further admission',async()=>{
  const f=await world(),events=[],rows=trace(f,{retry:20,fuel:2.6,events});
  assert.equal(rows[0].phase,'hookFlight');assert.equal(rows[0].fuel,0,'last hook consumes the remaining special reserve');
  assert.ok(rows.some(r=>r.zips===1),'actual impact completes before recall');
  assert.ok(rows.some(r=>r.active===null),'empty reserve returns after the admitted hook');
  assert.equal(events.filter(e=>e.action==='zip').length,1,'no repeat at zero reserve');
  assert.ok(rows.every(r=>r.normalInk===100),'normal ink tank is preserved');
});

test('#1607 source35WU hook range still rejects distant surfaces without a hook debit or pull',async()=>{
  const f=await world();
  const inside=trace(f,{distance:34,retry:59}),outside=trace(f,{distance:36,retry:59});
  assert.equal(inside[0].phase,'hookFlight');assert.equal(inside[0].failed,0);
  assert.equal(outside[0].phase,'ready');assert.equal(outside[0].failed,1);
  assert.ok(Math.abs(outside[0].spent-.25)<1e-8,'miss pays only passive drain');
  assert.ok(outside.slice(0,45).every(r=>r.pos.every(v=>v===0)),'no movement toward out-of-range surface');
  assert.ok(Math.abs((outside[0].next-1/60)*60-45)<1e-8,'distant miss keeps the separate45F gate');
});
