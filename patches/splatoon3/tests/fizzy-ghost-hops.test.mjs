import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
const F=1/60;
// S3 11.3.0 GP0: the second and third bursts occur after the source hop lands.
// Replicas replay those owner-authored hops without painting or hitting twice.
// https://wikiwiki.jp/splatoon3mix/ブキ/サブウェポン/タンサンボム
test('Fizzy JSON hop replay resumes only the next owner stage and stays presentation-only through contact and clear',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});makePaintWorld(f);
  const a=f.make();Object.assign(a,{nid:1,netLife:0});a.pos.set(0,0,30);a.weapon={...a.weapon,sub:'fizzy'};a.weaponRunner.reset();a.ink=100;
  const events=[];f.on('all:sub',e=>{const {actor,paintSource,...rest}=e;events.push(JSON.parse(JSON.stringify(rest)));});
  for(let i=0;i<145;i++)a.weaponRunner.update(F,{sub:true});a.weaponRunner.update(F,{sub:false,subReleased:true});a.weaponRunner.update(F,{sub:false});
  const b=f.G.projectiles._s3SubObjects[0];assert.ok(b);assert.equal(b.pops,3);assert.equal(a.ink,40);
  b.pos.set(0,.2,30);b.prev.copy(b.pos);b.vel.set(0,-12,0);
  for(let i=0;i<60&&!events.some(e=>e.phase==='fizzyHop');i++){f.G.time+=F;f.G.projectiles.update(F);}
  const birth=events.find(e=>e.phase==='spawn'),hop=events.find(e=>e.phase==='fizzyHop');assert.ok(birth&&hop);assert.equal(hop.pops,2);
  f.G.projectiles.clear();const remote=f.make();Object.assign(remote,{nid:2,netLife:0,remote:true});remote.weapon={...remote.weapon,sub:'fizzy'};
  let stamps=0,hits=0,proposals=0;f.G.paint.splat=()=>{stamps++;return 0;};f.G.projectiles.applyHit=()=>{hits++;};f.on('all:sub',()=>proposals++);
  const replay=e=>f.installedRuntime.replaySub({...JSON.parse(JSON.stringify(e)),actor:remote});
  assert.equal(replay(birth),true);const ghost=f.G.projectiles._s3SubObjects[0];assert.equal(ghost.ghost,true);
  assert.equal(replay({...hop,pops:1}),false,'a skipped owner stage cannot manufacture the final hop');
  assert.equal(replay({...hop,fuse:0}),false,'a malformed immediate fuse cannot acquire a replica stage');
  assert.equal(replay(hop),true);assert.equal(ghost.pops,2);assert.equal(ghost.phase,'flight');
  const pos=ghost.pos.clone(),vel=ghost.vel.clone();assert.equal(replay(hop),false);assert.equal(ghost.pos.distanceTo(pos),0);
  f.G.time+=F;f.G.projectiles.update(F);assert.ok(ghost.pos.y>pos.y);assert.ok(ghost.vel.y<vel.y);
  for(let i=0;i<180;i++){f.G.time+=F;f.G.projectiles.update(F);}
  assert.equal(ghost.phase,'ghostWait','the next impact waits for owner burst/hop consequences');
  assert.deepEqual([stamps,hits,proposals],[0,0,0]);f.G.projectiles.clear();assert.equal(ghost.dead,true);
  assert.equal(replay(hop),false,'world reset prevents a late hop reviving the retired object');
});
