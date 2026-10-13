import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';

for(const impact of [false,true]) for(const special of (impact?[true]:[false,true])) for(const dead of [false,true]) test(`${impact?'terrain impact':'timed burst'}: ${special?'special':'main'} burst keeps correct immediate and delayed credit after owner ${dead?'death':'survival'}`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,V,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const owner=f.make('blaster');owner.special=0;owner.alive=!dead;
 const descriptor={...owner.weapon,kind:special?'inkjet':'blaster',impactRadius:3.2};
 const p={owner,team:0,ghost:false,type:'blast',s3Weapon:descriptor,s3SpecialWeapon:special?descriptor:null,vel:V(0,-1,1),prev:V(0,2,29),pos:V(0,.08,30),start:V(0,2,29),radius:3.2,seed:.37};
 let delayed=0;const award=owner.addTurfNoSpecial;
 owner.addTurfNoSpecial=function(area){delayed+=area;return award.call(this,area);};
 if(impact) f.G.projectiles._impact(p,{point:V(0,0,30),normal:V(0,1,0),face});
 else f.G.projectiles._blastBurst(p,V(0,.08,30),null);
 const immediate=owner.stats.turf;
 for(let i=0;i<240;i++)paint.advanceSimulation(1/60);
 const area=paint.counts[0]*face.cu*face.cv;
 assert.ok(area>0);assert.equal(owner.stats.turf,area,'one turf award per newly owned floor cell');
 if(special){assert.equal(owner.special,0);assert.equal(delayed,area);assert.ok(area>immediate,'delayed expansion is actually exercised');}
 else assert.ok(owner.special>0,'ordinary main paint still charges its gauge');
});

test('special paint network ownership replay awards no local gauge and duplicate stamps do not duplicate turf',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,V,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const owner=f.make('blaster');owner.special=0;const receiver=f.make('shooter');receiver.special=0;
 const descriptor={...owner.weapon,kind:'inkjet',impactRadius:3.2},events=[];
 const native=paint.splat;paint.splat=function(at,r,team,opts={}){events.push({at:at.clone(),r,team,opts:{...opts}});return native.call(this,at,r,team,opts);};
 f.G.projectiles._blastBurst({owner,team:0,ghost:false,type:'blast',s3Weapon:descriptor,s3SpecialWeapon:descriptor},V(0,.08,30),null);
 for(let i=0;i<240;i++)paint.advanceSimulation(1/60);
 const expected=Array.from(paint.grid),credits=owner.stats.turf;
 const remote=makePaintWorld(f).paint;
 for(let repeat=0;repeat<2;repeat++)for(const [i,e]of events.entries()){
  const opts={...e.opts};delete opts.claimOwner;delete opts.claimMode;
  opts.__netOrder={clock:i+1,seq:i+1,peer:'special-owner',epoch:'test'};
  remote.splat(e.at,e.r,e.team,opts);
 }
 for(let i=0;i<240;i++)remote.advanceSimulation(1/60);
 assert.deepEqual(Array.from(remote.grid),expected);assert.equal(remote.counts[0]*face.cu*face.cv,credits);
 assert.equal(receiver.special,0);assert.equal(owner.special,0);assert.equal(owner.stats.turf,credits);
});

for(const dead of [false,true])test(`Crab direct rounds retain no-gauge credit after ${dead?'death':'special expiry'}`,async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,V,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('shooter');a.weapon={...a.weapon,special:'crabTank',specialCost:100};a.special=100;a.pos.set(0,0,30);a._resolve=()=>{};
 a._startSpecial();a.intent.fire=true;for(let i=0;i<23;i++)a._updateSpecial(1/60);
 const p=f.G.projectiles.list.find(p=>p.s3AllSpecialMode==='shooter');assert.ok(p);assert.equal(p.type,'shot','exercise direct-only lane');assert.equal(p.s3SpecialWeapon.type,'shot');assert.equal(p.grav,4,'main gravity cannot replace Crab gravity');assert.equal(p.s3Weapon.id,'crabTank');assert.equal(p.s3PaintNoSpecial,true);
 a.intent.fire=false;if(dead)a.splat(null,'test');else for(let i=0;i<600&&a.specialActive;i++)a._updateSpecial(1/60);
 assert.equal(a.specialActive,null);a.special=0;
 p.pos.set(0,.08,30);p.prev.set(0,2,29);p.vel.set(0,-1,1);
 f.G.projectiles._impact(p,{point:V(0,0,30),normal:V(0,1,0),face});
 for(let i=0;i<240;i++)paint.advanceSimulation(1/60);
 assert.ok(paint.counts[0]>0);assert.equal(a.stats.turf,paint.counts[0]*face.cu*face.cv);assert.equal(a.special,0);
});

test('pooled special fields cannot resurrect Booyah paint, missile steering, or reduced damage on any main class',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,V}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const a=f.make('blaster');a.pos.set(0,0,30);a.weapon={...a.weapon,special:'booyahBomb',specialCost:100};a.special=100;
 a._startSpecial();a._s3AllSpecialState.charge=1;a.intent.sub=true;for(let i=0;i<30;i++)a._updateSpecial(1/60);
 const old=f.G.projectiles.list.at(-1);assert.equal(old.s3AllSpecial,'booyahBomb');f.G.projectiles.clear();
 for(const kind of ['shooter','blaster','roller','brush','charger','splatling','dualies','slosher','shelter','stringer','saber']){
  // Pollute every module-owned field, including those set by other specials.
  Object.assign(old,{s3AllSpecial:'booyahBomb',s3AllSpecialPaintRadius:13.5,s3AllSpecialActivation:9,s3AllSpecialSeed:.37,s3AllSpecialMode:'shooter',s3PaintNoSpecial:true,s3DamageReduce:{max:999},s3TentaTarget:V(9,9,9),s3TentaAge:8,s3TentaDescending:true,s3TentaDirection:V(1,0,0)});
  const p=f.G.projectiles._new();assert.equal(p,old);
  for(const key of ['s3AllSpecial','s3AllSpecialPaintRadius','s3AllSpecialActivation','s3AllSpecialSeed','s3AllSpecialMode','s3PaintNoSpecial','s3DamageReduce','s3TentaTarget','s3TentaAge','s3TentaDescending','s3TentaDirection'])assert.ok(!p[key],kind+' resets '+key);
  Object.assign(p,{owner:a,team:0,type:'blast',s3Weapon:{...a.weapon,kind,impactRadius:2}});p.pos.set(0,.08,30);p.prev.copy(p.pos);p.start.copy(p.pos);p.vel.set(0,0,1);
  f.G.projectiles._blastBurst(p,p.pos,null);
  assert.equal(f.G.projectiles._s3AllSpecialObjects.length,0,kind+' has no Booyah object');
  f.G.projectiles.list.push(p);f.G.projectiles.clear();
 }
 assert.ok(paint.counts[0]<1000,'ordinary impact does not inherit 13.5 WU special disk');
});

test('all four canonical Crab kits preserve direct-shot flight and real JSON ghost identity',async()=>{
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export { installMainWeaponCatalogRuntime } from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"});
 f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);
 for(const id of ['s3-shooter-precision','s3-shooter-expert','s3-shooter-triplequick','dualies']){
  const {paint}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
  const a=f.make(id);a.nid=7;a.pos.set(0,0,30);a._resolve=()=>{};a.special=a.specialCost();
  const nm=new f.NetMatch({myId:'owner'},{});f.G.netm=nm;
  a._startSpecial();a.intent.fire=true;for(let i=0;i<23;i++)a._updateSpecial(1/60);
  const p=f.G.projectiles.list.find(p=>p.s3AllSpecialMode==='shooter');assert.ok(p,id);
  assert.equal(p.wid,'crabTank');assert.equal(p.grav,4);assert.equal(p.drag,.04);assert.equal(p.radius,.22);assert.equal(p.s3SpecialWeapon.splashRadius,0);
  const packet=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='p'&&e[3]==='shot')));assert.ok(packet,id+' packet');
  const remote=f.make(id);remote.remote=true;remote.nid=7;
  const before=nm.out.length;f.G.projectiles.ghostProjectile(remote,packet);const ghost=f.G.projectiles.list.at(-1);
  assert.equal(ghost.ghost,true);assert.equal(ghost.s3Weapon.id,'crabTank');assert.equal(ghost.s3SpecialWeapon.type,'shot');assert.equal(ghost.s3SpecialWeapon.splashRadius,0);assert.equal(ghost.grav,4);assert.equal(ghost.damage,0);
  f.G.projectiles._impact(ghost,{point:p.pos.clone(),normal:new f.THREE.Vector3(0,1,0)});
  assert.equal(paint.counts[0],0,'remote presentation does not author paint');assert.equal(nm.out.length,before);
  f.G.netm=null;f.G.projectiles.clear();
 }
});
