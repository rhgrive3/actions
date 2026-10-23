// Actual production projectile births, normal expiry and real pooled draw.
// Controlled physics/paint/FX sinks isolate allocation/render ownership; pose,
// movement and authoritative CPU paint are covered by spawn acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';
const cases=[];
const stable=x=>JSON.parse(JSON.stringify(x));
const canonical=p=>stable([p.type,p.wid,p.owner?.nid,p.team,p.age,p.delay,p.seed,p.life,p.size,p.radius,p.damage,p.grav,p.drag,p.start.toArray(),p.pos.toArray(),p.vel.toArray()]);
async function setup(){
 let seed=.37;
 const f=await fixture({productionComposition:true,fullRuntime:true,realProjectiles:true,vmMathRandom:()=>seed,
  extraExports:"export {throwVolley,trizookaSpecialWeapon} from './patches/splatoon3/runtime/kit-trizooka.mjs';"});
 const {G,THREE}=f;G.camera={position:new THREE.Vector3(0,2,-4)};
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 G.fx={muzzle(){},_spawnDrop(){}};
 const a=f.make('shooter');a.isLocal=true;
 const ps=G.projectiles,ids=new WeakMap();let nextId=1;
 const id=p=>{if(!ids.has(p))ids.set(p,nextId++);return ids.get(p);};
 const step=()=>{G.time+=1/60;ps.update(1/60);ps._draw();};
 const expire=()=>{let frames=0;while((ps.list.length||ps.shooterMuzzleDroplets.count||ps._s3Shapes?.sheets.bursts.length)&&frames++<1800)step();assert(frames<1800,'normal native expiry, no clear or pool reset');};
 return {f,G,THREE,a,ps,id,step,expire,setSeed:x=>seed=x};
}

for(const finalSeed of [.37,.38])test(`special→Shooter→Splatling→Slosher→Shooter pool reuse seed ${finalSeed} preserves legacy sheet and separate added drops`,async()=>{
 const {f,G,a,ps,id,step,expire,setSeed}=await setup(),rows=[];
 const draw=(phase)=>{
  const before=ps.list.map(canonical);ps._draw();assert.deepEqual(ps.list.map(canonical),before,'draw never changes canonical shot state');
  const row={phase,time:G.time,ids:ps.list.map(id),seeds:ps.list.map(p=>p.seed),shapes:ps.list.map(p=>p.s3Shape),special:ps.list.map(p=>!!p.s3SpecialWeapon),sheets:ps._s3Shapes.sheets.bursts.length,sheetInstances:ps.s3ShapeCounts.sheets,addedDrops:ps.shooterMuzzleDroplets.drawn,blobs:ps.blobs.count};rows.push(row);return row;
 };
 f.throwVolley(ps,a,f.trizookaSpecialWeapon());step();const specialIds=ps.list.map(id);const special=draw('special');assert.equal(special.sheets,0);assert.equal(special.addedDrops,0);expire();
 a.setWeapon('shooter');ps.fireShooter(a,a.weapon,0);const first=ps.list[0];assert(specialIds.includes(id(first)),'native Shooter reuses a retired special object');step();
 const firstRow=draw('first-shooter');assert.equal(first.seed,.37);assert.equal(firstRow.sheets,1);assert.equal(firstRow.addedDrops,3);expire();
 a.setWeapon('splatling');ps.fireSplatling(a,a.weapon,0);assert.equal(ps.list[0],first,'actual same pooled object enters Splatling');step();
 const splat=draw('splatling');assert.equal(splat.sheets,0);assert.equal(splat.addedDrops,0);assert.equal(splat.shapes[0],null);expire();
 a.setWeapon('slosher');ps.fireSlosh(a,a.weapon);assert(ps.list.includes(first),'same native pooled object participates in Slosher birth');step();
 const slosh=draw('slosher');assert.equal(slosh.sheets,0);assert.equal(slosh.addedDrops,0);expire();
 // Slosher has siblings with different native expiry times. Occupy the other
 // free records as pending native births so the real Shooter emitter reaches
 // the previously observed object. Do not reorder/reset the pool or clear any
 // per-object effect field (in particular s3FireSeed).
 assert(ps.pool.includes(first));let occupied=0;
 while(ps.pool.at(-1)!==first){
  const p=ps._new();Object.assign(p,{type:'blast',wid:'blaster',owner:a,team:a.team,age:0,delay:999,life:1,seed:.37,size:.12,vis:.1,radius:.1,damage:0,grav:0,drag:0});
  p.pos.set(0,3,2);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,1);ps._push(p);occupied++;
 }
 assert(occupied<100,'bounded sibling occupancy without pool reset');
 a.setWeapon('shooter');setSeed(finalSeed);ps.fireShooter(a,a.weapon,0);step();const final=draw('last-shooter');
 const reused=ps.list.at(-1);
 const result={mode:process.env.INKWAVE_BUILT_SITE?'emitted':'source',finalSeed,rows,occupiedSiblings:occupied,sameObject:reused===first,firstId:id(first),finalId:id(reused),newDropsPass:final.addedDrops===3,sheetPass:final.sheets===1};cases.push(result);
 console.log(JSON.stringify(result));
 assert(reused===first,'final native Shooter must reuse the original actual object');
 assert.equal(reused.seed,finalSeed);assert.equal(final.addedDrops,3,'new three-drop burst is independently retained');
 assert.equal(final.sheets,1,'a recycled Shooter birth must retain its existing muzzle sheet even with the same seed');
});

test('mixed special/Shooter/Splatling/Slosher capacity 0/1/2 retains the complete old draw prefix',async()=>{
 const {f,G,THREE,ps,step,a:shooter}=await setup();
 const splat=f.make('splatling'),slosh=f.make('slosher');
 // Real teammate body blocking must not expire a freshly emitted family
 // merely because this component fixture gave every owner the same origin.
 for(const [i,owner]of [shooter,splat,slosh].entries()){
  owner.pos.set((i-1)*12,0,0);owner.character.root.position.copy(owner.pos);owner.aimPoint.set(owner.pos.x,1,30);
 }
 f.throwVolley(ps,shooter,f.trizookaSpecialWeapon());ps.fireShooter(shooter,shooter.weapon,0);ps.fireSplatling(splat,splat.weapon,0);ps.fireSlosh(slosh,slosh.weapon);step();
 assert(ps.list.some(p=>p.s3SpecialWeapon)&&ps.list.some(p=>p.wid==='shooter')&&ps.list.some(p=>p.wid==='splatling')&&ps.list.some(p=>p.wid==='slosher'),'all four families share the actual pool/draw: '+JSON.stringify(ps.list.map(p=>({wid:p.wid,special:!!p.s3SpecialWeapon,type:p.type,owner:p.owner?.weaponId}))));
 // One visible special plus659 older native bodies leaves the required40
 // slots for old late drops; the remaining two special lobes are delayed.
 for(let i=0;i<659;i++){
  const p=ps._new();Object.assign(p,{type:'blast',wid:'blaster',owner:shooter,team:0,age:.1,delay:0,life:3,straight:1,size:.12,vis:.086,seed:.37,radius:.1,damage:0,grav:0,drag:0,tail0:1,tailK:0,wob:0,sats:0});
  p.start.set(0,3,0);p.pos.set(0,3,1+i*.0001);p.prev.copy(p.pos);p.vel.set(0,0,20);ps._push(p);
 }
 const drops=Array.from({length:48},(_,i)=>({owner:shooter,pos:new THREE.Vector3(i*.05,4,2),vel:new THREE.Vector3(0,-1,0),radius:.1,seed:i/48,frames:2}));ps._s3SplashDrops=drops;
 const matrix=new THREE.Matrix4();
 function capture(){return Array.from({length:ps.blobs.count},(_,i)=>{ps.blobs.getMatrixAt(i,matrix);return stable({matrix:matrix.toArray(),color:Array.from(ps.blobs.instanceColor.array.slice(i*3,i*3+3)),shape:Array.from(ps.blobShape.array.slice(i*4,i*4+4)),look:Array.from(ps.blobInkLook.array.slice(i*4,i*4+4)),petals:Array.from(ps.blobFourPetals.array.slice(i*2,i*2+2))});});}
 const before=ps.list.map(canonical);ps._draw();assert.equal(ps.blobs.count,700);assert.equal(ps.shooterMuzzleDroplets.drawn,0);
 const full=capture(),old=full.filter(r=>Math.abs(r.matrix[13]-4)<1e-6&&Math.abs(r.matrix[14]-2)<1e-6).length;
 assert.equal(old,40,'existing effects retain all40 required late-drop slots');
 const rows=[];
 for(const residual of [0,1,2]){
  // The existing sourced-drop owner walks newest to oldest. Keep that exact
  // prefix while reducing its length; slicing the array's front changes the
  // native input order and cannot serve as a prefix comparison.
  ps._s3SplashDrops=drops.slice(drops.length-(old-residual));ps._draw();const rendered=capture(),prefix=700-residual;
  assert.equal(rendered.length,700,'bounded additions consume residual slots only');
  for(let i=0;i<prefix;i++)assert.deepEqual(rendered[i],full[i],`residual${residual}: every old matrix/color/shape/look/petal entry remains at ${i}`);
  const oldNow=rendered.filter(r=>Math.abs(r.matrix[13]-4)<1e-6&&Math.abs(r.matrix[14]-2)<1e-6).length;assert.equal(oldNow,old-residual);
  assert.equal(ps.shooterMuzzleDroplets.drawn,Math.max(0,residual-1),'one Splatling addition precedes only residual Shooter drops');
  if(residual){assert(Math.abs(rendered[prefix].look[1]-4)<1e-6);assert.equal(rendered[prefix].petals[0],0);assert.equal(rendered[prefix].petals[1],0);}
  assert.deepEqual(ps.list.map(canonical),before,'all canonical live family records remain unchanged');
  rows.push({residual,oldDrops:oldNow,preservedPrefix:prefix,addedShooterDrops:ps.shooterMuzzleDroplets.drawn,addedSplatling:residual?1:0});
 }
 const result={mode:process.env.INKWAVE_BUILT_SITE?'emitted':'source',case:'mixed-residual-capacity',oldFullDrops:old,rows};cases.push(result);console.log(JSON.stringify(result));
});

test.after(()=>{if(process.env.SIXWAY_POOL_EVIDENCE)fs.writeFileSync(process.env.SIXWAY_POOL_EVIDENCE,JSON.stringify({cases},null,2)+'\n');});
