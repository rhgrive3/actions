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
