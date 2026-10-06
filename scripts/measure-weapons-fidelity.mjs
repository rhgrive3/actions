#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {fixture, BASELINE, ROOT} from './weapons-fixture.mjs';
export const CASES = [
  {key:'shooter',id:'shooter'}, {key:'dualies-normal',id:'dualies'},
  {key:'dualies-post',id:'dualies',turret:true}, {key:'blaster',id:'blaster'},
  {key:'splatling-partial',id:'splatling',charge:.25},
  {key:'splatling-first',id:'splatling',charge:2/3},
  {key:'splatling-full',id:'splatling',charge:1},
  ...[0,.25,.5,.75,1].map(charge=>({key:'charger-'+charge,id:'charger',charge})),
  {key:'roller-horizontal',id:'roller'}, {key:'roller-vertical',id:'roller',vertical:true},
  {key:'slosher',id:'slosher'},
];
export const SEED = 0x1a2b3c4d;
export const round = n => Number.isFinite(n) ? Math.round(n*1e8)/1e8 : n;
const vec = v => v.toArray().map(round);
export function reset(f, c, target=null, height=0) {
  f.projectiles.clear(); f.G.time=0; f.G.boss=null; f.G.netm=null;
  f.paints.length=f.hits.length=f.fires.length=f.impacts.length=0;
  f.G.paint.grid.fill(0); f.G.paint.counts.fill(0); f.G.paint.growing.length=0;
  const a=f.make(c.id,{y:height});f.G.actors=[a];
  a.weaponRunner.s3Turret=!!c.turret;a.weaponRunner.s3FlickVertical=!!c.vertical;
  a.weaponRunner.fidelitySplatlingCharge=c.charge??1;
  if(target!==null) {const b=f.make('shooter',{team:1,z:target,y:height,name:'target'}); f.G.actors.push(b);}
  f.reseed(SEED);return a;
}
export function launch(f,a,c,spread=0) {
  const w=a.weapon;
  if(c.id==='charger')f.projectiles.fireCharger(a,w,c.charge);
  else if(c.id==='roller')f.projectiles.fireFlick(a,w);
  else if(c.id==='slosher')f.projectiles.fireSlosh(a,w);
  else if(c.id==='dualies')f.projectiles.fireDualies(a,w,spread,0);
  else if(c.id==='blaster')f.projectiles.fireBlaster(a,w,spread);
  else if(c.id==='splatling')f.projectiles.fireSplatling(a,{...w,spreadPitchGround:0},spread); // geometry fixture: neutralize both spread axes
  else f.projectiles.fireShooter(a,w,spread);
}
export function finish(f,a,maxFrames=240, trace=null) {
  const ids=new Map(); let next=0;
  const snap=(p,dead=false)=>({id:ids.get(p),age:round(p.age),pos:vec(p.pos),velocity:vec(p.vel),dead});
  if(trace) for(const p of f.projectiles.list){ids.set(p,next++);trace.push(snap(p));}
  for(let i=0;i<maxFrames && (f.projectiles.list.length || f.projectiles._fidelityChargerFlights?.length);i++){
    const ps=[...f.projectiles.list]; f.tick(a);
    if(trace)for(const p of ps)trace.push(snap(p,!f.projectiles.list.includes(p)));
  }
}
export function paintMetrics(f) {
  const points=[]; let area=0;
  for(const face of f.G.paint.paintFaces)for(let j=0;j<face.nv;j++)for(let i=0;i<face.nu;i++){
    const k=face.grid+j*face.nu+i;if(f.G.paint.grid[k]!==1||f.G.paint.dead[k])continue;
    points.push([round(face.origin.x+(i+.5)*face.cu),round(face.origin.z+(j+.5)*face.cv)]);area+=face.cu*face.cv;
  }
  const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const bounds=points.length?{minX:Math.min(...xs),maxX:Math.max(...xs),minZ:Math.min(...zs),maxZ:Math.max(...zs)}:null;
  let centre=0,side=0,centerTotal=0,sideTotal=0,gaps=0;
  if(bounds){
    for(const face of f.G.paint.paintFaces)for(let j=0;j<face.nv;j++){
      const z=face.origin.z+(j+.5)*face.cv;if(z<Math.max(0,bounds.minZ)||z>bounds.maxZ)continue;
      let anyCentre=false;
      for(let i=0;i<face.nu;i++){
        const x=face.origin.x+(i+.5)*face.cu, painted=f.G.paint.grid[face.grid+j*face.nu+i]===1;
        if(Math.abs(x)<=.5){centerTotal++;if(painted){centre++;anyCentre=true;}}
        else if(Math.abs(x)<=3){sideTotal++;if(painted)side++;}
      }
      if(!anyCentre)gaps++;
    }
  }
  const radii=f.paints.filter(p=>!p.cosmetic).map(p=>p.radius).sort((a,b)=>a-b);
  return {method:'production CPU scoring grid, cell centres; bounds uncertainty ±half-cell; not cosmetic GPU satellites',cell:f.G.paint.cell,area:round(area),cells:points.length,bounds,
    centerDensity:centerTotal?round(centre/centerTotal):0,sideDensity:sideTotal?round(side/sideTotal):0,
    densityRegions:'centre |x|<=0.5; sides 0.5<|x|<=3; z from max(0,minPaintZ) to maxPaintZ',
    emptyCentreRows:gaps,splatRadius:{n:radii.length,min:radii[0]??null,median:radii[Math.floor(radii.length/2)]??null,max:radii.at(-1)??null},cellsXZ:points};
}
function projectileParams(p) {
  const out={};for(const k of ['type','wid','life','straight','radius','damage','dmgFar','size','trail','trailEvery','trailRadius','grav','drag','delay','vis','tail0','tailK','wob','wobF','nose','sats','s3Vertical','fidelityMode'])out[k]=p[k]??null;
  out.origin=vec(p.start);out.velocity=vec(p.vel);return out;
}
function sampleBands(samples,predicate) {
  const bands=[];let band=null;
  for(const s of samples){if(predicate(s)){if(!band){band={fromZ:s.z,toZ:s.z};bands.push(band);}else band.toZ=s.z;}else band=null;}
  return bands;
}
export async function measure({site=BASELINE,fidelity=false,detail=true}={}) {
  const f=await fixture({site,fidelity});const open=await fixture({site,fidelity,floor:false});
  const result={schema:1,sourceMainSha:'17602ab094da6efb663d872934458e818ae3c93e',label:fidelity?'after':'before',fixture:{seed:SEED,fixedStep:1/60,origin:[0,0,0],muzzle:[0,1.05,.3],rollerMuzzle:[0,1.3,.6],aim:'horizontal, +Z; spread zero for range, native flick distribution',target:'production upright PLAYER capsule at variable z, continuous projectile time-of-impact; unmodified actor dimensions',units:{distance:'INKWAVE world unit; not Nintendo range meter',time:'seconds',damage:'HP',ink:'percent full tank'}},scale:{playerHeight:f.PLAYER.height,playerRadius:f.PLAYER.radius,gridCell:f.G.paint.cell,planeWidth:80,planeLength:105,referenceScale:1,confidence:'inherited provisional; no independent Switch-to-world metrology'},weapons:JSON.parse(JSON.stringify(f.WEAPONS)),cases:{}};
  for(const c of CASES){
    let a=reset(f,c);launch(f,a,c);const initial=f.projectiles.list.map(projectileParams),trace=[];
    finish(f,a,240,trace);const paint=paintMetrics(f),paintPoints=structuredClone(f.paints),impacts=structuredClone(f.impacts),fires=structuredClone(f.fires);
    const track=trace.filter(p=>p.id===0);
    const practical=[];let lastHit=null,lastFull=null;const nominal=c.id==='charger'?(c.charge>=.999?a.weapon.damageMax:a.weapon.damageMin+(a.weapon.damagePartialMax-a.weapon.damageMin)*c.charge):c.id==='roller'?150:c.id==='blaster'?125:c.id==='slosher'?70:a.weapon.damage;
    const limit=c.id==='charger'?27:c.id==='roller'?24:45;
    for(let zi=5;zi<=limit*10;zi++){
      const z=zi/10;a=reset(f,c,z);launch(f,a,c);finish(f,a);
      const damage=f.hits.reduce((s,h)=>s+h.damage,0);
      if(damage>0){lastHit=z;if(damage>=nominal-1e-7)lastFull=z;}
      practical.push({z,damage:round(damage),firstHitSeconds:f.hits[0]?.time??null});
    }
    a=reset(open,c,null,100);launch(open,a,c);const openTrace=[];finish(open,a,240,openTrace);
    const maxZ=openTrace.length?Math.max(...openTrace.map(p=>p.pos[2])):null;
    result.cases[c.key]={weapon:c.id,mode:c,configRange:a.weapon.range??null,initialProjectiles:initial,projectileCount:initial.length,nominalDamage:nominal,
      practicalHitRange:lastHit,fullDamageRange:lastFull,hitRangeResolution:.1,openFlightMaxWorldZ:maxZ,openFlightFixtureHeight:100,
      lineRange:fires[0]?.len??null,
      authoritativeTerminalCenterZ:trace.length?Math.max(...trace.map(p=>p.pos[2])):null,
      visualMainProjectileRange:trace.length?Math.max(...trace.filter(p=>!p.dead).map(p=>p.pos[2])):null,
      cosmeticVisualRange:null,
      practicalHitBands:sampleBands(practical,s=>s.damage>0),
      fullDamageBands:sampleBands(practical,s=>s.damage>=nominal-1e-7),
      reducedDamageBands:sampleBands(practical,s=>s.damage>0&&s.damage<nominal-1e-7),
      openFlightForwardDisplacement:maxZ!==null?round(maxZ-(initial[0]?.origin[2]??0)):null,
      visualRangeNote:'alive sampled gameplay projectile centers in world z; not rendered mesh extent. Dead terminal step and cosmetic FX range are separate. No renderer parity claim.',
      groundImpacts:impacts,paint,paintPoints,rangeOrigins:{hitSweep:"actor base z",paintBounds:"world cell centers",line:"muzzle-relative",openFlight:"world center at height 100"},hitSamples:practical,trajectory:detail?trace:track,openTrajectory:detail?openTrace:[]};
    console.error(c.key,JSON.stringify({hit:lastHit,full:lastFull,paint:paint.bounds?.maxZ,area:paint.area}));
  }
  result.runner={};
  for(const c of CASES){
    if(c.id==='charger'&&c.charge===0)continue;
    const a=reset(f,c);const r=a.weaponRunner;const chargeFrames=c.id==='charger'?1+Math.round(c.charge*a.weapon.chargeTime*60):c.id==='splatling'?Math.round(c.charge*a.weapon.chargeTime*60):0; // #726: charger counts the 1F humanoid startup before its charge frames
    if(c.id==='roller'&&c.vertical)a.grounded=false;
    const charge=[];
    for(let frame=0;frame<(chargeFrames||180);frame++) {f.tick(a,c.id==='roller'?{fire:frame%60===0,firePressed:frame%60===0}:{fire:true});if(chargeFrames)charge.push({frame:frame+1,charge:round(r.charge),ink:round(a.ink)});}
    if(chargeFrames)for(let frame=0;frame<240;frame++)f.tick(a,{fire:false});
    const shotTimes=f.fires.map(p=>round(p.time));
    result.runner[c.key]={chargeSamples:charge,inkSpent:round(100-a.ink),shots:shotTimes.length,shotTimes,intervals:shotTimes.slice(1).map((t,i)=>round(t-shotTimes[i])),releaseCharge:f.fires[0]?.charge??null,firstRemainingProjectileSpeedAtWindowEnd:f.projectiles.list[0]?.vel.length()??null};
  }
  const identity=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json')));
  result.artifactIdentity={contentHash:identity.contentHash,inputHash:identity.inputHash};
  result.inputs=Object.fromEntries(f.sourceFiles.sort().map(p=>[path.relative(site,p),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
  result.inputs['patches/splatoon3/profile.json']=crypto.createHash('sha256').update(fs.readFileSync(path.join(site,'patches/splatoon3/profile.json'))).digest('hex');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=(s,d)=>{const i=process.argv.indexOf(s);return i<0?d:process.argv[i+1];};
  const site=path.resolve(arg('--site',BASELINE));const out=path.resolve(arg('--out',path.join(ROOT,'reports/weapons-fidelity/before.json')));
  const data=await measure({site,fidelity:process.argv.includes('--after')});fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(data,null,2)+'\n');
  console.log(out);
}
