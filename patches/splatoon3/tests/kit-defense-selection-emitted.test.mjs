import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fixture } from './source-fixture.mjs';
import { adaptKitSource } from './kit-composed-fixture.mjs';
const extraExports = `export {installKitDefense} from './patches/splatoon3/runtime/kit-defense.mjs';
export {installKitBigBubbler,tickBigBubblers,bigBubblerDomes,clearBigBubblers} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';
export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';`;
function verifyBuild() {
  if (!process.env.INKWAVE_BUILT_SITE) return;
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  assert.equal(manifest.contentHash,hash(JSON.stringify(manifest.artifacts)),'artifact map content identity');
  for(const [relative,expectedHash] of Object.entries(manifest.artifacts)) {
    const file=path.resolve(site,relative);
    assert.ok(file.startsWith(site+path.sep),'artifact path stays inside built site');
    assert.equal(hash(fs.readFileSync(file)),expectedHash,'emitted artifact '+relative);
  }
  const sourceHash=hash(fs.readFileSync(new URL('../runtime/kit-defense.mjs',import.meta.url)));
  const artifactHash=hash(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/kit-defense.mjs')));
  assert.equal(manifest.files['patch/runtime/kit-defense.mjs'],sourceHash);
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/kit-defense.mjs'],artifactHash);
  console.log('DEFENSE_SELECTION_EMITTED_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,artifactHash}));
}
test('fixture-graph selector preserves 2197 distance, tie and provider-order combinations',async()=>{
  verifyBuild();const f=await fixture({adaptNative:adaptKitSource,extraExports});f.installKitDefense(f);
  const system=new f.Projectiles(new f.THREE.Scene());
  const projectile={team:0,prev:new f.THREE.Vector3(),pos:new f.THREE.Vector3(10,0,0)};
  const candidates=[null,undefined,{}, {distance:1},...[0,-0,-1,1,10,10.00001,NaN,Infinity,-Infinity].map(distance=>({distance,onHit(){throw Error('query must be inert');}}))];
  const eligible=c=>c&&typeof c.onHit==='function'&&Number.isFinite(c.distance)&&c.distance>=0&&c.distance<=10;
  let cases=0;
  for(const a of candidates)for(const b of candidates)for(const c of candidates){
    const order=[];system.kitBarrierCandidate=()=>{order.push('barrier');return a;};
    f.G.actors=[{alive:true,team:1,id:0},{alive:false,team:1,id:1},{alive:true,team:0,id:2},{alive:true,team:1,id:3}];
    f.inkVacAbsorbCandidate=actor=>{order.push(actor.id);return actor.id===0?b:c;};
    const expected=[a,b,c].filter(eligible).reduce((best,item)=>!best||item.distance<best.distance?item:best,null);
    assert.equal(system.kitDefenseCandidate(projectile),expected);assert.deepEqual(order,['barrier',0,3]);cases++;
  }
  assert.equal(cases,2197);
});
test('fixture-graph defense preserves real native sweep, Bubbler damage, ghost and terrain ownership',async()=>{
  verifyBuild();
  for(const mode of ['owned','ghost','nearer-wall']) {
    const f=await fixture({adaptNative:adaptKitSource,extraExports});
    f.installSubSpecialFidelity(f,f.profile);f.installWeaponsFidelity(f,f.profile);
    f.installKitDefense(f);f.installKitBigBubbler(f,f.profile);f.clearBigBubblers('setup');
    const system=f.G.projectiles=new f.Projectiles(new f.THREE.Scene());
    const owner=f.make('roller');owner.nid=4;owner.weapon={...owner.weapon,special:'bubbler',specialCost:180};
    owner.special=180;owner._startSpecial();f.tickBigBubblers(1);
    const dome=f.bigBubblerDomes()[0];assert.ok(dome);const hp=dome.hp;
    const shooter=f.make();shooter.team=1;shooter.nid=9;f.G.actors=[owner];f.G.boss=null;
    f.G.physics.segment=(_a,_b,out)=>{out.hit=mode==='nearer-wall';out.dist=.1;out.point.set(.1,1,0);out.normal.set(0,1,0);return out;};
    let hits=0,impacts=0,queries=0;system.applyHit=()=>{hits++;};system._impact=()=>{impacts++;};
    const nativeQuery=system.kitDefenseCandidate;system.kitDefenseCandidate=function(...args){queries++;return nativeQuery.apply(this,args);};
    const p=system._new();Object.assign(p,{owner:shooter,team:1,type:'shot',wid:'shooter',damage:36,size:.15,radius:.3,age:0,life:1,straight:1,grav:0,drag:0,trailEvery:0,ghost:mode==='ghost'});
    p.pos.copy(dome.pos).add(new f.THREE.Vector3(0,1,20));p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,-1800);
    assert.equal(system._step(p,1/60),true);assert.ok(queries>0,'native step calls fixture-graph selector');
    assert.equal(hits,0,mode);assert.equal(dome.hp,mode==='owned'?hp-360*.64:hp,mode);
    assert.equal(impacts,mode==='nearer-wall'?1:0,mode);assert.equal(p.age,1/60);
    system.clear();f.clearBigBubblers('finish');
  }
});
test('full production installer keeps real Curling producer identity through fixture-graph defense',async()=>{
  verifyBuild();const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
  const owner=f.make('roller');owner.team=0;owner.weapon={...owner.weapon,sub:'curling'};owner.weaponRunner.reset();
  const system=f.G.projectiles;system.throwBomb(owner);const bomb=system.bombs.at(-1);assert.equal(bomb.s3Sub.id,'curling');
  const start=new f.THREE.Vector3(0,1,0),end=new f.THREE.Vector3(4,1,0);let received;
  system.kitBarrierCandidate=(p,a,b)=>{received={p,a,b};return {distance:2,onHit(){}};};
  const candidate=system.kitBombDefenseCandidate(bomb,start,end);assert.equal(candidate.distance,2);
  assert.equal(received.p.damage,20);assert.equal(received.p.s3Sub.id,'curling');assert.equal(received.p.s3Resolved,bomb.s3Resolved);
  assert.equal(received.a,start);assert.equal(received.b,end);
});
