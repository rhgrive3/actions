import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const actorSource = () => adaptSource('src/game/actor.js', fs.readFileSync(path.join(ROOT, 'inkwave-public/src/game/actor.js'), 'utf8'));
async function setup(){return fixture({extraExports:`
export { stealthJumpFoci, stealthJumpLongitudinalDistance, stealthJumpExtraFrames, stealthJumpExtraTime,
  STEALTH_JUMP_DISTANCE_MIN, STEALTH_JUMP_DISTANCE_MAX, STEALTH_JUMP_EXTRA_FRAMES_MAX }
  from './patches/splatoon3/runtime/superjump.mjs';
`});}
test('#272 Stealth Jump is a shoes-main-only fixed ability',async()=>{const f=await setup();assert.equal(f.ABILITIES.stealthJump,'ステルスジャンプ');assert.equal(f.abilityAllowed('stealthJump',2,0),true);for(const [piece,slot] of [[0,0],[1,0],[2,1],[2,2],[2,3]])assert.equal(f.abilityAllowed('stealthJump',piece,slot),false);const l=f.emptyLoadout();l[0].main=l[1].main=l[2].main='stealthJump';l[2].subs[0]='stealthJump';const n=f.normalizeLoadout(l);assert.equal(n[0].main,'none');assert.equal(n[1].main,'none');assert.equal(n[2].main,'stealthJump');assert.equal(n[2].subs[0],'none');});
test('#272 measured longitudinal metric uses XZ only and the 60..100 / 0..60F curve',async()=>{const f=await setup(),V=f.THREE.Vector3,level={stealthJumpFoci:[new V(0,30,0),new V(120,-20,0)],homeSuperJumpPoints:[new V(-999,0,0),new V(999,0,0)]},a={s3:{modifiers:{stealthJump:true}}},from=new V(0,500,0),at=x=>new V(x,-500,0);assert.equal(f.STEALTH_JUMP_DISTANCE_MIN,60);assert.equal(f.STEALTH_JUMP_DISTANCE_MAX,100);assert.equal(f.STEALTH_JUMP_EXTRA_FRAMES_MAX,60);assert.ok(Math.abs(f.stealthJumpLongitudinalDistance(from,at(60),level)-60)<1e-9);assert.equal(f.stealthJumpExtraFrames(a,from,at(60),level),0);assert.ok(Math.abs(f.stealthJumpExtraFrames(a,from,at(80),level)-30)<1e-9);assert.equal(f.stealthJumpExtraFrames(a,from,at(100),level),60);assert.equal(f.stealthJumpExtraFrames(a,from,at(120),level),60);assert.equal(f.stealthJumpExtraTime(a,from,at(100),level),1);});
test('#272 stage foci: explicit calibration wins, otherwise the two team spawn pads; home jump points are never foci',async()=>{const f=await setup(),V=f.THREE.Vector3,a={s3:{modifiers:{stealthJump:true}}},from=new V(0,0,0),to=new V(120,0,0);
  // Community fit: foci at (or just behind) each team's initial Squid Spawn launch position.
  const pads={homeSuperJumpPoints:[new V(-500,0,0),new V(500,0,0)],spawnPads:[new V(0,2,0),new V(120,2,0)]};
  assert.equal(f.stealthJumpFoci(pads),pads.spawnPads);
  assert.ok(Math.abs(f.stealthJumpLongitudinalDistance(from,to,pads)-120)<1e-9);
  assert.equal(f.stealthJumpExtraFrames(a,from,to,pads),60);
  const explicit={...pads,stealthJumpFoci:[new V(0,0,-1000),new V(0,0,1000)]};
  assert.equal(f.stealthJumpFoci(explicit),explicit.stealthJumpFoci);
  assert.equal(f.stealthJumpLongitudinalDistance(from,to,explicit),0);
  // Malformed or missing pads still fail closed.
  for(const bad of [{},{homeSuperJumpPoints:pads.homeSuperJumpPoints},{spawnPads:[new V(3,0,3)]},{spawnPads:[new V(3,0,3),new V(3,9,3)]},{spawnPads:[new V(NaN,0,0),new V(1,0,0)]}]){
    assert.equal(f.stealthJumpFoci(bad),null);assert.equal(f.stealthJumpExtraFrames(a,from,to,bad),0);}
  assert.equal(f.stealthJumpExtraFrames({s3:{modifiers:{}}},from,to,pads),0);});
test('#272 Stealth Jump composes after Quick Super Jump and does not alter preparation timing',async()=>{const f=await setup(),a=f.make(),zero={charge:a.s3.jumpChargeTime,flight:a.s3.jumpFlightTime};a.isLocal=false;const l=f.emptyLoadout();l[0].subs=['quickSuperJump','quickSuperJump','quickSuperJump'];l[1].subs=['quickSuperJump','quickSuperJump','quickSuperJump'];l[2]={main:'stealthJump',subs:['quickSuperJump','quickSuperJump','quickSuperJump']};a.s3.loadout=l;a.reset();assert.equal(a.s3.modifiers.stealthJump,true);assert.ok(a.s3.jumpChargeTime<zero.charge);assert.ok(a.s3.jumpFlightTime<zero.flight);const source=actorSource();assert.ok(source.includes('s.dur = this.s3.jumpFlightTime + stealthJumpExtraTime(this, s.from, s.to);'));assert.ok(source.includes('this.s3.jumpChargeTime + superJumpStartupTime(this)'));assert.ok(!/jumpChargeTime[^\n;]*stealthJump/.test(source));});

test('#272 shipped-stage spawn pads lengthen only the Stealth Jump flight of a back-to-front Actor jump',async()=>{
  const defs=JSON.parse(fs.readFileSync(path.join(ROOT,'patches/native-stages/definitions/eeltail.json'),'utf8'));
  let chargeTicksWithout=null;
  for(const [loadoutStealth,expectExtra] of [[false,0],[true,1]]){
    const f=await setup(),V=f.THREE.Vector3;
    f.G.physics.groundProbe=(_x,_y,_z,_up,_down,_r,gh)=>{gh.hit=true;gh.y=0;gh.normal.set(0,1,0);return gh;};
    f.G.physics.collideBody=()=>({});f.G.physics.waterCheck=()=>false;
    f.G.level={...f.G.level,spawnPads:defs.spawnPads.map(p=>new V(...p)),pointInside:()=>false};
    const a=f.make();a.isLocal=false;
    if(loadoutStealth){const l=f.emptyLoadout();l[2].main='stealthJump';a.s3.loadout=l;a.reset();}
    const base=a.s3.jumpFlightTime,charge=a.s3.jumpChargeTime;
    // Own spawn side (z=-80) to the far half (z=+40): hyperbolic coordinate travel > 100.
    a.pos.set(0,0,-80);a.grounded=true;
    assert.ok(a.superJump(new V(0,0,40)));
    let chargeTicks=0;for(let i=0;i<400&&a.superJumpState?.phase==='charge';i++){f.tick(a);chargeTicks++;}
    assert.equal(a.superJumpState?.phase,'flight');
    assert.ok(Math.abs(a.superJumpState.dur-(base+expectExtra))<1e-9,`flight ${a.superJumpState.dur} vs ${base}+${expectExtra}`);
    assert.equal(a.s3.jumpChargeTime,charge);
    if(!loadoutStealth) chargeTicksWithout=chargeTicks;
    else assert.equal(chargeTicks,chargeTicksWithout,'ground preparation is unchanged');
  }
  // A short same-half hop stays below the 60 unit threshold.
  const f=await setup(),V=f.THREE.Vector3,a={s3:{modifiers:{stealthJump:true}}},level={spawnPads:defs.spawnPads.map(p=>new V(...p))};
  assert.equal(f.stealthJumpExtraFrames(a,new V(0,0,-80),new V(5,0,-30),level),0);
});
