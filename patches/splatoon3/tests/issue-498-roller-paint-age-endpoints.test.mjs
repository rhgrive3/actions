import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {batchFixture} from './batch03-fixture.mjs';
import {rollerPaintAgeMultiplier,rollerTrailAgeWidth,rollerImpactRadius} from '../runtime/roller-impact-paint.mjs';
import {adaptSource} from '../adapter.mjs';
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
  assert.equal((output.match(/rollerTrailAgeWidth\(p, p\.trailRadius/g)||[]).length,1);
  assert.equal((output.match(/import \{ rollerTrailAgeWidth \}/g)||[]).length,1);
  assert.equal(raw.includes('rollerTrailAgeWidth'),false);
  assert.match(output,/p\.trailRadius \* \(0\.8 \+ Math\.random\(\) \* 0\.4\)/);
});
