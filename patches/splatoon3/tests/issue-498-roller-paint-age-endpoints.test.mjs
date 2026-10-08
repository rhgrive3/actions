import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerPaintAgeMultiplier,rollerTrailAgeWidth,rollerImpactRadius} from '../runtime/roller-impact-paint.mjs';
import {adaptSource} from '../adapter.mjs';
import {FixedClock,STEP} from '../runtime/clock.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
const SOURCE=process.env.INKWAVE_UPSTREAM_SOURCE || path.join(ROOT,'inkwave-public');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,actual+' !== '+expected);
test('#498 pinned 11.3.0 Roller width endpoints compose with the #411 near/far unit radius',async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3;
  const units=f.profile.weaponsFidelityCompletion.weapons.roller;
  for(const [unit,from,near,far,farDistance] of [
    [units.WideSwingUnitGroupParam.Unit[0],20,1.89,1.6275,12],
    [units.VerticalSwingUnitGroupParam.Unit[0],30,2.454,3.068,16]
  ]){
    const p={fidelityRollerUnit:unit,age:0,s3Weapon:{kind:'roller'},type:'drop',ghost:false,start:new V()};
    close(rollerImpactRadius(p,new V(1.1,0,0),1),near);
    for(const frame of [0,from]){
      p.age=frame/60;
      close(rollerPaintAgeMultiplier(p),1);
      close(rollerImpactRadius(p,new V(farDistance,0,0),1),far);
    }
    p.age=50/60;
    close(rollerPaintAgeMultiplier(p),.6);
    close(rollerImpactRadius(p,new V(1.1,0,0),1),near*.6);
    close(rollerImpactRadius(p,new V(farDistance,0,0),1),far*.6);
    close(rollerTrailAgeWidth(p,.45),.45*.6);
    // Provisional transition model only: the S3 source pins the endpoints,
    // not Nintendo's exact intermediate frame-by-frame interpolation.
    p.age=((from+50)/2)/60;
    close(rollerPaintAgeMultiplier(p),.8);
  }
});
test('#498 preserves other weapons, ghosts, collision radii and stored paint widths',async()=>{
  const f=await batchFixture();
  const raw=f.profile.weaponsFidelityCompletion.weapons.roller.WideSwingUnitGroupParam.Unit[0];
  const p={type:'drop',s3Weapon:{kind:'roller'},fidelityRollerUnit:raw,age:50/60,size:.85,radius:2,ghost:false};
  close(rollerTrailAgeWidth(p,.4),.24);
  assert.equal(p.size,.85);
  assert.equal(p.radius,2);
  assert.equal(rollerTrailAgeWidth({...p,ghost:true},.4),.4);
  assert.equal(rollerTrailAgeWidth({...p,s3Weapon:{kind:'shooter'}},.4),.4);
  assert.equal(rollerTrailAgeWidth({...p,type:'shot'},.4),.4);
  assert.equal(rollerTrailAgeWidth({...p,fidelityRollerUnit:null},.4),.4);
});
test('#498 emitted native projectile trail is composed exactly once and upstream remains locked',()=>{
  const raw=fs.readFileSync(path.join(SOURCE,'src/game/weapons.js'),'utf8');
  const output=adaptSource('src/game/weapons.js',raw);
  assert.equal((output.match(/rollerTrailAgeWidth\(p, fidelityFlightPaintRadius\(p\)\)/g)||[]).length,1);
  assert.equal((output.match(/import \{ rollerTrailAgeWidth \}/g)||[]).length,1);
  assert.equal(raw.includes('rollerTrailAgeWidth'),false);
  assert.doesNotMatch(output,/p\.trailRadius \* \(0\.8 \+ Math\.random\(\) \* 0\.4\)/,'the existing fidelity adapter owns the trail base radius');
});

for(const hz of [30,60,120])test(`#498 ${hz}Hz native impact paints every emitted unit at its source age boundaries`,async()=>{
  const f=await batchFixture(),V=f.THREE.Vector3,ps=f.G.projectiles;
  f.G.camera={position:new V()};
  for(const vertical of [false,true]){
    const a=f.make('roller');a.isLocal=true;a.grounded=!vertical;
    a.weaponRunner.s3FlickVertical=vertical;
    ps.fireFlick(a,a.weapon);
    const rounds=[...ps.list],from=vertical?30:20;
    assert.equal(rounds.length,vertical?5:13,'all native emitted units participate');
    for(const p of rounds){
      const source=p.fidelityRollerUnit.UnitParam.PaintParam;
      assert.equal(source.ChangeWidthStartFrame,from);
      assert.equal(source.ChangeWidthEndFrame,50);
      assert.equal(source.ChangeFrameWidthRate,.6);
      const hit={point:p.start.clone().add(new V(source.DistanceFar,0,0)),normal:new V(0,1,0)};
      const state=()=>JSON.stringify({size:p.size,damage:p.damage,vel:p.vel.toArray(),
        collision:p.fidelityPlayerCollision,field:p.fidelityFieldCollision,radius:p.radius});
      const original=state(),samples=new Map(),clock=new FixedClock();let tick=0;
      // Advance the simulation clock while holding geometry fixed: age is the
      // only variable, so distance, collision and damage records cannot mask it.
      while(tick<50)clock.advance(1/hz,()=>{
        if(tick>=50)return;
        p.age=++tick*STEP;
        if(![from-1,from,49,50].includes(tick))return;
        f.paint.length=0;
        ps._impact(p,hit);
        assert.equal(f.paint.length,1,'one authoritative landing paint call');
        samples.set(tick,f.paint[0].radius);
        assert.equal(state(),original,'paint scaling changes no stored gameplay field');
      });
      close(samples.get(from-1),source.WidthHalfFar);
      close(samples.get(from),source.WidthHalfFar);
      close(samples.get(50),source.WidthHalfFar*.6);
      assert.ok(samples.get(49)>samples.get(50)&&samples.get(49)<samples.get(from),
        'the provisional transition remains bounded; this does not validate Nintendo\'s curve');
    }
    ps.clear();
  }
});
