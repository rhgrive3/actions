// Bounded CPU component benchmark + actual-Actor replay receipt. This does
// not measure GPU FPS, physical mobile hardware, or Nintendo retail parity.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {makePaintWorld} from '../patches/splatoon3/tests/paint-authority-fixture.mjs';
import {adaptBuildSource} from './inkwave-source-composition.mjs';
const arg=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const output=arg('--output','reports/inkwave-main-ink-cost-2026-10-16.json');
const capture=arg('--capture',null),hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const opts={fullRuntime:true,productionComposition:true,realProjectiles:true,
  extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs'; export { FixedClock } from './patches/splatoon3/runtime/clock.mjs';"};
const variants={};
for(const candidate of [false,true]) {
  const f=await fixture({...opts,adaptNative:(rel,code)=>{
    const result=adaptBuildSource(rel,code);
    return !candidate&&rel==='src/world/paint.js'?result.replace('INK_FOOTPRINT_KINDS.includes(opts.footprint)','false'):result;
  }});
  f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);variants[candidate?'candidate':'circle']=f;
}
const weapons=['shooter','dualies','slosher','roller','s3-brush-mini','s3-roller-heavy','s3-brush-heavy','s3-slosher-diffusion'];
const receipts=[],captures=[];
function run(f,id,hz=60,single=false){
  f.G.projectiles.clear();f.G.actors=[];f.G.time=0;f.G.settings={};
  const {paint}=makePaintWorld(f);f.setRandom(()=>.37);
  const a=f.make(id);a.form='kid';a.pos.set(0,0,0);a.ink=100;
  a.aimDir.set(0,-.12,1).normalize();a.aimPoint.set(0,0,12);
  const events=[],native=paint.splat;
  paint.splat=function(at,R,team,opts={}){
    events.push({at:at.toArray(),R,team,seed:opts.seed,kind:opts.kind,stretch:opts.stretch?.toArray(),
      stretchAmt:opts.stretchAmt,face:opts.face,footprint:opts.footprint});
    return native.call(this,at,R,team,opts);
  };
  let emitted=false,ticks=0;const clock=new f.FixedClock();
  const begin=performance.now();
  for(let i=0;i<hz*5;i++){
    clock.advance(1/hz,dt=>{
      a.intent.fire=single?!emitted:ticks<120;
      f.G.time+=dt;a.update(dt);
      if(f.G.projectiles.list.length)emitted=true;
      f.G.projectiles.update(dt);paint.advanceSimulation(dt);ticks++;
    });
  }
  const ms=performance.now()-begin;
  // Ignore only silhouette metadata in the before/after emission contract.
  const source=events.map(({footprint,...rest})=>rest);
  return {ms,events,sourceHash:hash(source),grid:hash([...paint.grid]),stamps:events.length,
    cells:paint.counts[0],ink:a.ink,hp:a.hp,pos:a.pos.toArray()};
}
for(const id of weapons){
  const times={circle:[],candidate:[]};let control,candidate;
  for(let trial=0;trial<7;trial++)for(const name of trial%2?['candidate','circle']:['circle','candidate']){
    const result=run(variants[name],id);if(trial>1)times[name].push(result.ms);
    if(name==='circle')control=result;else candidate=result;
  }
  assert.equal(control.sourceHash,candidate.sourceHash,id+' source emissions unchanged');
  assert.equal(JSON.stringify([control.ink,control.hp,control.pos]),JSON.stringify([candidate.ink,candidate.hp,candidate.pos]),id+' non-paint state');
  const rates=[];
  for(const hz of [30,60,120]) {
    // A fresh module lifetime also resets the native global Slosher volley
    // ordinal, which legitimately contributes to its foot-stamp seed.
    const fresh=await fixture(opts);fresh.installMainWeaponCatalogRuntime(fresh.installedRuntime,fresh.profile);
    rates.push(run(fresh,id,hz));
  }
  // Production FixedClock consumes each render interval and owns 60Hz ticks.
  // Direct variable-dt Actor calls bypass the game's supported simulation path.
  assert.equal(rates[0].sourceHash,rates[1].sourceHash,id+' 30/60Hz emissions');
  assert.equal(rates[1].sourceHash,rates[2].sourceHash,id+' 60/120Hz emissions');
  assert.equal(rates[0].grid,rates[1].grid,id+' 30/60Hz grid');assert.equal(rates[1].grid,rates[2].grid,id+' 60/120Hz grid');
  receipts.push({id,stamps:candidate.stamps,sourceHash:candidate.sourceHash,circleCells:control.cells,candidateCells:candidate.cells,
    circleMedianMs:median(times.circle),candidateMedianMs:median(times.candidate),samples:times,rates:rates.map((r,i)=>({hz:[30,60,120][i],grid:r.grid}))});
  captures.push({id,events:run(variants.candidate,id,60,true).events});
}
const result={scope:'Actor/WeaponRunner/Projectiles/CPU Paint on bounded rectangular fixture; no render, movement integration stubbed',
  node:process.version,profileBytes:4096,additionalProjectiles:0,additionalStamps:0,additionalWireFields:0,rows:receipts};
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
if(capture)fs.writeFileSync(capture,JSON.stringify(captures)+'\n');
console.log(JSON.stringify({output,rows:receipts.map(({id,circleMedianMs,candidateMedianMs,stamps})=>({id,stamps,circleMedianMs,candidateMedianMs}))}));
