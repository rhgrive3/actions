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
export { stealthJumpLongitudinalDistance, stealthJumpExtraFrames, stealthJumpExtraTime,
  STEALTH_JUMP_DISTANCE_MIN, STEALTH_JUMP_DISTANCE_MAX, STEALTH_JUMP_EXTRA_FRAMES_MAX }
  from './patches/splatoon3/runtime/superjump.mjs';
`});}
test('#272 Stealth Jump is a shoes-main-only fixed ability',async()=>{const f=await setup();assert.equal(f.ABILITIES.stealthJump,'ステルスジャンプ');assert.equal(f.abilityAllowed('stealthJump',2,0),true);for(const [piece,slot] of [[0,0],[1,0],[2,1],[2,2],[2,3]])assert.equal(f.abilityAllowed('stealthJump',piece,slot),false);const l=f.emptyLoadout();l[0].main=l[1].main=l[2].main='stealthJump';l[2].subs[0]='stealthJump';const n=f.normalizeLoadout(l);assert.equal(n[0].main,'none');assert.equal(n[1].main,'none');assert.equal(n[2].main,'stealthJump');assert.equal(n[2].subs[0],'none');});
test('#272 measured longitudinal metric uses XZ only and the 60..100 / 0..60F curve',async()=>{const f=await setup(),V=f.THREE.Vector3,level={stealthJumpFoci:[new V(0,30,0),new V(120,-20,0)],homeSuperJumpPoints:[new V(-999,0,0),new V(999,0,0)]},a={s3:{modifiers:{stealthJump:true}}},from=new V(0,500,0),at=x=>new V(x,-500,0);assert.equal(f.STEALTH_JUMP_DISTANCE_MIN,60);assert.equal(f.STEALTH_JUMP_DISTANCE_MAX,100);assert.equal(f.STEALTH_JUMP_EXTRA_FRAMES_MAX,60);assert.ok(Math.abs(f.stealthJumpLongitudinalDistance(from,at(60),level)-60)<1e-9);assert.equal(f.stealthJumpExtraFrames(a,from,at(60),level),0);assert.ok(Math.abs(f.stealthJumpExtraFrames(a,from,at(80),level)-30)<1e-9);assert.equal(f.stealthJumpExtraFrames(a,from,at(100),level),60);assert.equal(f.stealthJumpExtraFrames(a,from,at(120),level),60);assert.equal(f.stealthJumpExtraTime(a,from,at(100),level),1);});
test('#272 stage foci fail closed: ordinary spawn/home points are not guessed as Stealth Jump anchors',async()=>{const f=await setup(),V=f.THREE.Vector3,a={s3:{modifiers:{stealthJump:true}}},from=new V(0,0,0),to=new V(120,0,0),uncalibrated={homeSuperJumpPoints:[new V(0,0,0),new V(120,0,0)],spawnPads:[new V(0,0,0),new V(120,0,0)]};assert.equal(f.stealthJumpLongitudinalDistance(from,to,uncalibrated),0);assert.equal(f.stealthJumpExtraFrames(a,from,to,uncalibrated),0);});
test('#272 Stealth Jump composes after Quick Super Jump and does not alter preparation timing',async()=>{const f=await setup(),a=f.make(),zero={charge:a.s3.jumpChargeTime,flight:a.s3.jumpFlightTime};a.isLocal=false;const l=f.emptyLoadout();l[0].subs=['quickSuperJump','quickSuperJump','quickSuperJump'];l[1].subs=['quickSuperJump','quickSuperJump','quickSuperJump'];l[2]={main:'stealthJump',subs:['quickSuperJump','quickSuperJump','quickSuperJump']};a.s3.loadout=l;a.reset();assert.equal(a.s3.modifiers.stealthJump,true);assert.ok(a.s3.jumpChargeTime<zero.charge);assert.ok(a.s3.jumpFlightTime<zero.flight);const source=actorSource();assert.ok(source.includes('s.dur = this.s3.jumpFlightTime + stealthJumpExtraTime(this, s.from, s.to);'));assert.ok(source.includes('this.s3.jumpChargeTime + superJumpStartupTime(this)'));assert.ok(!/jumpChargeTime[^\n;]*stealthJump/.test(source));});
