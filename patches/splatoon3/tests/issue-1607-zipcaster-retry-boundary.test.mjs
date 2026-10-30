import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// #1607 diagnostic only: 45F is the current observable INKWAVE gate, not a
// decoded interpretation of the 11.3.0 ShotFailedIntervalFrm=20 field.
// Real Actor input, actual fixed clock and actual Physics terrain are kept;
// Character/display/paint remain the documented source-fixture stubs.
async function world(f){
  f.G.actors.length=0;f.G.time=0;f.G.projectiles.clear();
  f.G.level=new f.Level({bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},spawnPads:[[-15,0,-15],[15,0,15]],spawnBarrier:0,half:[],single:[
    {kind:'box',min:[-20,-1,-20],max:[20,0,20]},
    {kind:'box',min:[-4,0,2],max:[4,4,2.2]}]});
  f.G.physics=new f.Physics(f.G.level);
  const a=f.make('shooter');
  a.weapon={...a.weapon,special:'zipcaster',specialCost:100};a.special=100;a.alive=true;a.remote=false;
  a.pos.set(0,0,0);a.yaw=a.aimYaw=0;a.aimPitch=0;a._startSpecial();
  assert.equal(a._s3AllSpecialState.phase,'ready');
  return {f,a,s:a._s3AllSpecialState};
}
async function trace({f,hz,initial='miss',retry=45,hold=false}){
  const {a,s}=await world(f),clock=new f.FixedClock(),rows=[];let tick=0;
  for(let frame=0;frame<hz*3;frame++)clock.advance(1/hz,dt=>{
    // Empty sky has no hit; close-floor contact is <3 units. The same real
    // wall is a valid close hook at the later horizontal input.
    a.aimPitch=tick<retry?(initial==='miss'?Math.PI/2:-Math.PI/4):0;
    a.aimPoint.set(a.pos.x,a.pos.y+20*Math.sin(a.aimPitch),a.pos.z+20*Math.cos(a.aimPitch));
    a.intent.sub=hold?tick<=retry:tick===0||tick===retry;
    const fuel=s.inkFuel,from=a.pos.clone();f.G.time+=dt;a.update(dt);
    rows.push({tick,phase:s.phase,failed:s.failedHooks||0,gate:s.nextHookAt??null,
      fuel:s.inkFuel,deltaFuel:fuel-s.inkFuel,pos:Array.from(a.pos.toArray()),moved:from.distanceTo(a.pos),
      flight:s.hookFlightT??null,wait:s.hookWait??null});tick++;
  });
  return rows;
}

test('#1607 real sky/floor rejection and valid wall retry have exact fixed-tick boundaries at 20/30/60/120 render Hz',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  for(const initial of ['miss','close-floor'])for(const retry of [44,45,46]){
    let baseline;
    for(const hz of [20,30,60,120]){
      const rows=await trace({f,hz,initial,retry});
      if(baseline)assert.deepEqual(rows,baseline,initial+' retry '+retry+' is render independent');else baseline=rows;
      assert.equal(rows[0].failed,1,initial+' actual first failure');
      assert.equal(rows[0].phase,'ready','failed hook has no implicit flight/recovery phase in INKWAVE');
      assert.ok(Math.abs(rows[0].deltaFuel-.25)<1e-8,'failed hook pays only ordinary AP0 tank drain, no hook debit');
      for(let t=0;t<retry;t++)assert.equal(rows[t].moved,0,'failed hook never moves toward empty/near-floor surface');
      if(retry<45){assert.equal(rows[retry].phase,'ready','44F retry remains denied');assert.equal(rows[retry].failed,1,'denied retry is not a new failed hook');}
      else{
        assert.equal(rows[retry].phase,'hookFlight','45F and later accepts the real near wall');
        assert.ok(rows[retry].deltaFuel>2.5,'valid hook spends its separate hook ink');
        assert.ok(rows.some(r=>r.phase==='zip'),'actual pull phase occurs');
        const waits=rows.filter(r=>r.phase==='hookWait');assert.ok(waits.length>0,'actual landing wait occurs');
        const last=rows.findIndex((r,t)=>t>retry&&r.phase==='ready');assert.ok(last>retry,'eventual ready state');
        assert.ok(rows[last].wait>=12/60-1e-8,'existing 12F wait remains separate from failure retry');
      }
    }
  }
});

test('holding through a missed hook retries when the recovery expires at each render cadence',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  let baseline;
  for(const hz of [30,60,120]){
    const rows=await trace({f,hz,initial:'miss',retry:45,hold:true});
    assert.equal(rows[0].failed,1);
    assert.equal(rows[44].phase,'ready');
    assert.equal(rows[45].phase,'hookFlight');
    if(baseline)assert.deepEqual(rows,baseline);else baseline=rows;
  }
});
