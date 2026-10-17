import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';

const snapshot = P => JSON.parse(JSON.stringify(P.list.map(p => ({
  type:p.type,age:p.age,delay:p.delay||0,pos:p.pos.toArray(),vel:p.vel.toArray(),seed:p.seed,
  headFrame:p.inkFrame??null,phase:p.inkPhase??null,
  sloshUnit:p.fidelitySloshIndex??p.fidelitySloshPacketIndex??null,
  rollerUnit:p.fidelityRollerUnitIndex??null,
}))));
async function run(history, target, resetPool, legacySloshIndex = false) {
  const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>.5,adaptRuntime:(rel,source)=>{
    if(!legacySloshIndex||rel!=='patches/splatoon3/runtime/weapons-fidelity.mjs')return source;
    const anchor='p.fidelitySloshIndex=null;';assert.equal(source.split(anchor).length,2,'one production Slosher index reset');
    return source.replace(anchor,''); // isolated pre-fix negative control, never shipped
  }});
  const {G}=f,P=G.projectiles;
  G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  const fire=kind=>{
    const a=f.make(kind.startsWith('roller')?'roller':kind);
    if(kind.startsWith('roller'))a.weaponRunner.s3FlickVertical=kind==='roller-vertical';
    P[kind==='shooter'?'fireShooter':kind==='slosher'?'fireSlosh':'fireFlick'](a,a.weapon,0);
  };
  for(const kind of history){fire(kind);for(let i=0;i<2;i++)P.update(1/60);P.clear();}
  // Exactly the independent capture boundary, after native cleanup.
  P.clear();if(resetPool)P.pool.length=0;
  G.actors=[];G.time=0;
  let state=0x1a2b3c4d;
  f.setRandom(()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;});
  fire(target);
  const born=[...P.list],result=[snapshot(P)];
  for(let i=0;i<5;i++){P.update(1/60);if(i===1||i===4)result.push(snapshot(P));}
  // The reset does not intercept native allocation/release within this scenario.
  P.clear();assert.ok(born.some(p=>P.pool.includes(p)),'native clear returns rounds to pool');
  const pooled=new Set(P.pool);fire(target);
  assert.ok(P.list.some(p=>pooled.has(p)),'native allocation still reuses pooled rounds');
  return result;
}
const histories=[[],['shooter'],['slosher'],['shooter','slosher','roller-horizontal','shooter']];
test('native pool retains incidental ink metadata but clears prior Slosher ownership; legacy control reproduces the old leak',async()=>{
  const cleanSlosh=await run([],'slosher',false),dirtySlosh=await run(['shooter'],'slosher',false);
  assert.equal(cleanSlosh[0][0].headFrame,null);assert.equal(dirtySlosh[0][0].headFrame,2);
  assert.equal(cleanSlosh[0][0].phase,null);assert.equal(dirtySlosh[0][0].phase,0);
  const cleanRoller=await run([],'roller-horizontal',false),dirtyRoller=await run(['slosher'],'roller-horizontal',false);
  assert.deepEqual(dirtyRoller,cleanRoller,'current native allocator clears Slosher state before Roller reuse');
  assert.ok(dirtyRoller[0].every(p=>p.sloshUnit===null));
  const legacyRoller=await run(['slosher'],'roller-horizontal',false,true);
  assert.notDeepEqual(legacyRoller,cleanRoller,'removing exactly the reviewed reset reproduces the metadata drift');
  assert.ok(legacyRoller[0].some(p=>p.sloshUnit!==null));
});
for(const target of ['shooter','slosher','roller-horizontal','roller-vertical'])test(`independent ${target} capture is exact across native pool histories`,async()=>{
  const baseline=await run([],target,true);
  assert.equal(baseline[0].length,target==='shooter'?1:target==='slosher'?9:target==='roller-horizontal'?13:5);
  for(const history of histories.slice(1))assert.deepEqual(await run(history,target,true),baseline);
});
test('harness resets only at scenario boundary after native cleanup',()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  assert.equal((source.match(/G\.projectiles\.pool\.length = 0;/g)||[]).length,1);
  assert.match(source,/G\.projectiles\.clear\(\);\s*\/\/ Independent captures[\s\S]*?G\.projectiles\.pool\.length = 0;\s*G\.fx\.clear\(\); G\.paint\.clear\(\);/);
});
