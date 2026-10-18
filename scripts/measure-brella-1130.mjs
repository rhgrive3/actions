// Reproducible source-composed CPU logic measurement; never a retail/GPU claim.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {MAIN_WEAPON_CATALOG as C}from'../patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
import {brellaPelletSpeed,canopyEntry}from'../patches/splatoon3/runtime/brella-physics.mjs';
import {capsuleEntry}from'../patches/splatoon3/runtime/weapons-collision.mjs';
const destination=process.argv[2]||'reports/new-families-1130-20261018/brella-measurements.json';
const rng=(seed=1130)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const result={kind:'CPU source-composed logic, not retail/whole-game/GPU measurement',node:process.version,sourceBase:'9ef63350385bffee71b3afa0a09290a92e9c862b',groups:[],live:[]};
for(const r of C.records.filter(r=>r.family==='brella')){
 const p=r.parameters.spl__BulletShelterShotgunParam,random=rng();
 result.groups.push({id:r.id,pellets:p.GroupParams.reduce((n,g)=>n+g.TotalNum,0),damageCap:p.DamageEffectiveTotalMax/10,groups:p.GroupParams.map(g=>{
  const samples=20000,base=g.MoveParam?.SpawnSpeed??p.GroupParams[0].MoveParam.SpawnSpeed;let sum=0,sum2=0,min=Infinity,max=-Infinity;
  for(let i=0;i<samples;i++){const v=brellaPelletSpeed(g,p.GroupParams[0].MoveParam.SpawnSpeed,random);sum+=v;sum2+=v*v;min=Math.min(min,v);max=Math.max(max,v);}
  const amplitude=g.InitVelRandom||0;
  assert.ok(min>=base-amplitude-1e-9&&max<=base+amplitude+1e-9);
  assert.ok(Math.abs(sum2/samples-(sum/samples)**2-amplitude*amplitude/3)<=amplitude*amplitude/3*.03+1e-9);return {pellets:g.TotalNum,horizontal:g.HorizontalDegree,vertical:g.VerticalDegree,initVelRandomExplicit:g.InitVelRandom??null,samples,sourceSpeed:base,observedMin:min,observedMax:max,observedMean:sum/samples,observedVariance:Math.max(0,sum2/samples-(sum/samples)**2),reconstructedUniformExpectedVariance:amplitude*amplitude/3};
 })});
}
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});f.G.settings={};f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
f.G.paint.splat=()=>0;
const target=f.make('shooter');target.team=1;let damage=0;f.G.projectiles.applyHit=(_a,v,d)=>{if(v===target)damage+=d;return'accepted';};
for(const r of C.records.filter(r=>r.family==='brella')){
 const a=f.make(r.id);a.form='kid';a.pos.set(0,0,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1.05,100);a.character.getMuzzle=out=>out.set(0,1.05,.3);f.G.actors=[a,target];
 for(const distance of [1,5,10,20]){
  const samples=40,random=rng(1130+distance),totals=[];let hit=0;
  f.setRandom(random);target.pos.set(0,0,distance);
  for(let k=0;k<samples;k++){
   f.G.projectiles.clear();a.weaponRunner.reset();a.ink=100;a.hp=100;a.alive=true;damage=0;f.G.actors=[a];target.pos.x=-1.5+3*k/(samples-1);
   for(let i=0;i<14;i++)a.weaponRunner.update(1/60,{fire:true,firePressed:i===0});
   f.G.actors=[a,target];
   for(let i=0;i<60;i++)f.G.projectiles.update(1/60);
   totals.push(damage);if(damage>0)hit++;
  }
  assert.ok(Math.max(...totals)<=r.parameters.spl__BulletShelterShotgunParam.DamageEffectiveTotalMax/10+1e-8);
  result.live.push({id:r.id,distance,samples,lateralTargetRange:[-1.5,1.5],anyPelletHitRate:hit/samples,meanDamage:totals.reduce((s,n)=>s+n,0)/samples,minDamage:Math.min(...totals),maxDamage:Math.max(...totals),damageCap:r.parameters.spl__BulletShelterShotgunParam.DamageEffectiveTotalMax/10,seed:1130+distance});
 }
}
result.deterministicOutputSha256=crypto.createHash('sha256').update(JSON.stringify({groups:result.groups,live:result.live})).digest('hex');
const probes=Array.from({length:4096},(_,i)=>{const a=i%64/10-3.2,b=Math.floor(i/64)/10-3.2;return[{x:a,y:b,z:3},{x:a,y:b,z:-3}];});
const c={pos:{x:0,y:0,z:0},dir:{x:0,y:0,z:1},radius:.7};
const bench=(fn)=>{let hits=0;const started=performance.now();for(let i=0;i<100000;i++){const [from,to]=probes[i%probes.length];if(fn(from,to)!==null)hits++;}return {milliseconds:performance.now()-started,calls:100000,hits};};
for(let i=0;i<3;i++){bench((a,b)=>capsuleEntry(a,b,c.pos,.7,1.4,.1));bench((a,b)=>canopyEntry(a,b,c,.1));}
result.collisionBenchmark={scope:'Primitive CPU time; geometry changed, so hit counts differ. No GPU/GC claim.',baseline:Array.from({length:7},()=>bench((a,b)=>capsuleEntry(a,b,c.pos,.7,1.4,.1))),candidate:Array.from({length:7},()=>bench((a,b)=>canopyEntry(a,b,c,.1)))};
fs.mkdirSync(new URL('../reports/new-families-1130-20261018/',import.meta.url),{recursive:true});fs.writeFileSync(destination,JSON.stringify(result,null,2)+'\n');console.log(destination);
