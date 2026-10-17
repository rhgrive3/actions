import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {ALL_SUB_SPECS} from '../runtime/all-subs.mjs';
const F=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
// S3 11.3.0 GP0. All three raw BlastParamArray stages explicitly specify six
// harmless paint droplets. Their default gravity/azimuth remain calibrated.
// https://leanny.github.io/splat3/data/parameter/1130/weapon/WeaponBombFizzy.game__GameParameterTable.json
async function world(id=null){
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const {paint}=makePaintWorld(f);
  f.G.settings={};f.setRandom(()=>.37);
  const a=f.make(),enemy=f.make();Object.assign(a,{nid:1,owner:'a',team:0,netLife:0,remote:id==='b'});a.pos.set(0,0,30);
  Object.assign(enemy,{nid:2,owner:'b',team:1,netLife:0,remote:id==='a'});enemy.pos.set(35,0,90);
  a.weapon={...a.weapon,sub:'fizzy'};a.weaponRunner.reset();let nm=null;
  if(id){
    nm=new f.NetMatch({myId:id,isHost:id==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},
      {id:'fizzy-detached',map:'map',difficulty:'normal'});
    nm.bind({actors:[a,enemy],state:'playing',time:180,follower:false,playing:()=>true});f.G.netm=nm;f.G.match=nm.match;
    for(const actor of [a,enemy]){nm.byNid.set(actor.nid,actor);nm._setupActor(actor);}
  }
  const stamps=[],hits=[],events=[];const splat=paint.splat.bind(paint),applyHit=f.G.projectiles.applyHit.bind(f.G.projectiles);
  paint.splat=(p,r,t,o)=>{stamps.push({pos:p.clone(),radius:r,meta:o?.kitPaint});return splat(p,r,t,o);};
  f.G.projectiles.applyHit=(...args)=>{hits.push(args);return applyHit(...args);};
  f.on('all:sub',e=>events.push(e));
  function step(){f.G.time+=F;f.G.projectiles.update(F);paint.advanceSimulation(F);}
  function fire(){a.ink=100;for(let i=0;i<145;i++)a.weaponRunner.update(F,{sub:true});
    a.weaponRunner.update(F,{sub:false,subReleased:true});a.weaponRunner.update(F,{sub:false});
    const b=f.G.projectiles._s3SubObjects[0];assert.ok(b);assert.equal(b.pops,3);assert.equal(a.ink,40);
    b.pos.set(0,.2,30);b.prev.copy(b.pos);b.vel.set(0,-12,0);return b;}
  return {f,paint,a,nm,stamps,hits,events,step,fire};
}
function replay(w,rows){w.nm._peer('a');for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;w.nm._play('a',row);}}
function settle(w){for(let i=0;i<180;i++)w.paint.advanceSimulation(F);}

test('Fizzy every stage uses its own pinned six-droplet count, paint radius, offset, pitch and speed',()=>{
  const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/source-1130/weapon/WeaponBombFizzy.game__GameParameterTable.json',import.meta.url))).GameParameters.MoveParam.BlastParamArray;
  for(let i=0;i<3;i++){
    const a=ALL_SUB_SPECS.fizzy.bursts[i].splashAround,b=raw[i].SplashAroundParam;
    for(const [field,rawField] of [['count','Num'],['paintRadius','PaintRadius'],['offsetY','OffsetY'],['pitchMinDegrees','PitchMin'],['pitchMaxDegrees','PitchMax']])assert.equal(a[field],b[rawField]);
    near(a.velocityMin,b.VelocityMin*60);near(a.velocityMax,b.VelocityMax*60);
  }
});

test('actual Fizzy ground pops spawn six harmless detached drops per stage, retained after death and cleared with the world',async()=>{
  const w=await world(),b=w.fire();for(let i=0;i<60&&!w.events.some(e=>e.phase==='burst');i++)w.step();
  const burst=w.events.find(e=>e.phase==='burst'),drops=w.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='fizzy');assert.equal(drops.length,6);
  for(const d of drops){
    near(d.pos.y,burst.y+.3);assert.equal(d.damage,0);assert.equal(d.paintRadius,.7);assert.equal(d.age,0);
    const angle=Math.atan2(d.vel.y,Math.hypot(d.vel.x,d.vel.z))*180/Math.PI;
    assert.ok(angle>=10&&angle<=25);assert.ok(d.vel.length()>=.35*60&&d.vel.length()<=.4*60);
  }
  assert.equal(w.stamps.filter(s=>s.radius===.7).length,0,'parent burst does not prepaint its airborne children');
  w.a.splat(null,'fall');for(let i=0;i<300;i++)w.step();
  assert.equal(b.dead,true);assert.equal(w.stamps.filter(s=>s.radius===.7).length,18);
  assert.ok(w.stamps.filter(s=>s.radius===.7).every(s=>!s.meta),'harmless children never consume causal core receipts');
  assert.equal(w.hits.length,0);assert.equal(w.f.G.projectiles._s3TorpedoSplashes.length,0);
  w.f.G.projectiles.clear();assert.equal(w.f.G.projectiles._s3TorpedoSplashes.length,0);
  const fresh=await world(),again=fresh.fire();for(let i=0;i<60&&!fresh.f.G.projectiles._s3TorpedoSplashes?.length;i++)fresh.step();
  const mesh=fresh.f.G.projectiles._s3TorpedoSplashes[0]?.mesh;assert.ok(mesh);fresh.f.G.projectiles.clear();assert.equal(again.dead,true);assert.equal(mesh.parent,null);
});

test('Fizzy JSON replay paints all eighteen ordinary children and three bounded cores once while ghost impacts have no authority',async()=>{
  const a=await world('a'),b=await world('b');a.fire();
  for(let i=0;i<60&&!a.events.some(e=>e.phase==='fizzyHop');i++)a.step();
  replay(b,a.nm.out.filter(e=>e[1]==='ac'));
  assert.equal(b.f.G.projectiles._s3TorpedoSplashes.filter(d=>d.kind==='fizzy').length,6);
  const ghost=b.f.G.projectiles._s3SubObjects[0],burst=a.events.find(e=>e.phase==='burst');
  assert.equal(b.f.installedRuntime.replaySub({...burst,actor:b.a}),false,'a duplicate owner stage cannot duplicate ghost child visuals');
  const counters=[b.stamps.length,b.hits.length,b.events.length,b.nm.out.length];
  for(let i=0;i<180;i++)b.step();assert.deepEqual([b.stamps.length,b.hits.length,b.events.length,b.nm.out.length],counters);
  assert.equal(ghost.ghost,true);
  for(let i=0;i<300;i++)a.step();
  const rows=a.nm.out.filter(e=>['s','ac'].includes(e[1])),small=rows.filter(e=>e[1]==='s'&&e[5]===.7),cores=rows.filter(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-sub-core-v1');
  assert.equal(small.length,18);assert.ok(small.every(e=>e[15]?.[0]!=='inkwave-sub-core-v1'));assert.equal(cores.length,3);assert.ok(cores.every(e=>e[15].length===6));
  replay(b,rows);settle(a);settle(b);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));
  const grid=Array.from(b.paint.grid),before=b.paint.counts[0];replay(b,rows);settle(b);
  assert.deepEqual(Array.from(b.paint.grid),grid);assert.equal(b.paint.counts[0],before);b.f.G.projectiles.clear();
});
