import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
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

test('capture releases the actual catalog Explosher through Actor input, never ordinary fireSlosh', async()=>{
  const source=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
  const prefix='const birthResult = await page.evaluate(({ method, seed, expectedWall }) => {';
  const begin=source.indexOf(prefix), end=source.indexOf('}, { method: scenario.method, seed: scenario.seed, expectedWall: setup.wall });',begin);
  assert(begin>0&&end>begin,'one existing native contact birth callback');
  const body=source.slice(begin+prefix.length,end);
  const loaded=new Map(),hash=value=>createHash('sha256').update(value).digest('hex');
  const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>.5,
    adaptRuntime:(rel,raw)=>{loaded.set(rel,hash(raw));return raw;},
    adaptNative:(rel,raw)=>{loaded.set('inkwave-public/'+rel,hash(raw));return raw;}});
  const identities={};
  for(const rel of ['patches/splatoon3/runtime/s3-projectile-shapes.mjs','patches/splatoon3/runtime/main-weapon-catalog.mjs','inkwave-public/src/game/weapons.js']){
    const expected=hash(fs.readFileSync(new URL('../../'+rel,import.meta.url)));
    assert.equal(loaded.get(rel),expected,'Fixture must consume the actual capture checkout: '+rel);
    identities[rel]=loaded.get(rel);
  }
  console.log('EXPLOSHER_CAPTURE_FIXTURE_SOURCES '+JSON.stringify(identities));
  const {G}=f,P=G.projectiles;
  G.physics.level=null;G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};G.physics.raycast=(_a,_b,_d,h)=>{h.hit=false;return h;};
  G.fx=new Proxy({update(){}},{get:(o,k)=>k in o?o[k]:()=>{}});G.paint.flush??=()=>{};G.camera=new f.THREE.PerspectiveCamera();
  const a=f.make('s3-slosher-washtub');a.form='kid';a.ink=100;a.grounded=true;a.vel.set(0,0,0);a.aimYaw=0;a.aimPitch=0;a.aimPoint.set(0,1.05,70);
  G.match.local=a;
  P.fireSlosh=()=>{throw Error('ordinary Slosher bypass is forbidden for Explosher capture');};
  let state=13,draws=0;
  const reset=seed=>{state=seed;draws=0;f.setRandom(()=>{draws++;state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;});return{snapshot:()=>({seed,draws,state})};};
  const window={__G:G,__inkwave:{time:0},__iwResetScenarioRandom:reset};
  const capture=new Function('window','method','seed','expectedWall',body);
  const result=capture(window,'controller-washtub',13,null);
  assert.equal(result.births.length,1);const born=result.births[0];
  assert.equal(born.weapon,'s3-slosher-washtub');assert.equal(born.sourceActor,'WeaponSlosherWashtub');
  assert.equal(born.route,'MainWeaponCatalog.P._step');assert.equal(born.catalogUnit,0);assert(born.life>0);
  assert.equal(result.controllerProbe.sourceActor,'WeaponSlosherWashtub');assert(result.controllerProbe.heldFrames>=1&&result.controllerProbe.heldFrames<=60);
  assert.equal(a.intent.fire,false);assert.equal(!!P.list[0].catalog.birthPending,false);
  // Exercise the exact resource observer with real native Three buffer owners.
  // The renderer/context below is a unit double, not a WebGL/image claim.
  const resourcePrefix='const runtime = await page.evaluate(scenario => {';
  const resourceStart=source.indexOf(resourcePrefix),resourceEnd=source.indexOf('}, scenario);',resourceStart);
  assert(resourceStart>0&&resourceEnd>resourceStart);
  const resourceBody=source.slice(resourceStart+resourcePrefix.length,resourceEnd);
  const observe=new Function('window','innerWidth','innerHeight','scenario',resourceBody);
  window.__iwScenarioRandomRecorder={snapshot:()=>({seed:13,draws,state})};
  window.__iwAssertProjectileCaptureProjection=()=>{};window.__iwProjectileRosterSnapshot=()=>({});
  G.renderer={getContext:()=>({NO_ERROR:0,getError:()=>0,drawingBufferWidth:800,drawingBufferHeight:450}),
    info:{reset(){},render:{calls:1,triangles:1},memory:{geometries:1,textures:0},programs:[]}};
  G.game={R:{render:()=>P._draw()}};
  const resource=observe(window,800,450,'floor-washtub').washtubResources;
  assert.equal(resource.liveRounds,1);assert.equal(resource.sparkles,28);assert.equal(resource.totalBufferBytes,2560);
  assert.deepEqual(resource.arrayLengths,[480,160]);assert.equal(resource.repeatedDraws,2);
  assert.equal(observe(window,800,450,'floor-washtub').washtubResources.stableOwners,true);
  const position=P._s3Shapes.sparkPos;P._s3Shapes.sparkPos=position.clone();
  assert.throws(()=>observe(window,800,450,'floor-washtub'),/resource owner\/buffer replaced/);P._s3Shapes.sparkPos=position;
  const nativeDraw=P._draw;P._draw=function(...args){const result=nativeDraw.apply(this,args);draws++;return result;};
  assert.throws(()=>observe(window,800,450,'floor-washtub'),/changes scenario RNG/);P._draw=nativeDraw;
  const original=a.weaponId;a.weaponId='slosher';
  assert.throws(()=>capture(window,'controller-washtub',13,null),/Wrong native Explosher/);a.weaponId=original;
  assert.match(source,/name === 'floor-washtub' \? 's3-slosher-washtub'/);
  assert.match(source,/visualProtocol: 2/);
});
