import {readySpecialEvidence,useSpecialEvidence} from './special-control-evidence.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
import {makePaintWorld} from './paint-authority-fixture.mjs';
import {emptyLoadout} from '../runtime/gear.mjs';
async function client(id,special='inkjet'){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
 const {paint,V,face}=makePaintWorld(f);f.G.settings={};f.setRandom(()=>.37);
 const nm=new f.NetMatch({myId:id,isHost:id==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'inkjet-paint-wire',map:'map',difficulty:'normal'});f.G.netm=nm;
 const actor=f.make('shooter');Object.assign(actor,{owner:'a',nid:0,remote:id!=='a',team:0});actor.pos.set(0,0,30);actor.aimDir.set(0,0,1);actor._resolve=()=>{};
 actor.weapon={...actor.weapon,special,specialCost:100};actor.weaponRunner.reset();
 f.G.match={actors:[actor],state:'playing',time:180,follower:false,playing:()=>true};nm.bind(f.G.match);nm.byNid.set(0,actor);nm._setupActor(actor);actor.weapon={...actor.weapon,special,specialCost:100};actor.weaponRunner.reset();f.G.actors=[];
 return{f,nm,actor,paint,V,face};
}
for(const ap of[0,10,57])test(`Inkjet AP${ap} native and clustered paint survive actual NetMatch JSON exactly once`,async()=>{
 const a=await client('a'),b=await client('b');a.actor.s3.loadout=emptyLoadout();
 if(ap===10)a.actor.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.actor.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.actor.s3RefreshGear();
 a.actor.special=a.actor.specialCost();readySpecialEvidence(a.actor, {placeAtFixtureOrigin:true});useSpecialEvidence(a.f,a.actor);
 const p=a.f.G.projectiles.list.find(x=>x.s3AllSpecial==='inkjet');assert.ok(p);assert.ok(p.radius<=3.74);
 // End the special before impact; no special-gauge recharge may appear later.
 a.actor.specialActive=null;a.actor.special=0;p.pos.set(0,.08,30);p.prev.set(0,2,29);
 a.f.G.projectiles._blastBurst(p,p.pos.clone(),null);
 for(let i=0;i<240;i++)a.paint.advanceSimulation(1/60);
 const rows=a.nm.out.filter(e=>e[1]==='s');assert.ok(rows.length>0);for(const row of rows)assert.ok(row[5]<=3.74);
 b.nm._peer('a');const replay=()=>{for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;b.nm._play('a',row);}for(let i=0;i<240;i++)b.paint.advanceSimulation(1/60);};
 replay();assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));assert.ok(a.paint.counts[0]>0);
 const saved=Array.from(b.paint.grid);replay();assert.deepEqual(Array.from(b.paint.grid),saved);
 assert.equal(a.actor.special,0);assert.equal(b.actor.special,0);assert.ok(Math.abs(a.actor.stats.turf-a.paint.counts[0]*a.face.cu*a.face.cv/3.305785)<1e-7);
});

for(const ap of[0,10,57])test(`Super Chump AP${ap} delayed decoys preserve real JSON paint ownership`,async()=>{
 const a=await client('a','superChump'),b=await client('b','superChump');a.actor.s3.loadout=emptyLoadout();
 if(ap===10)a.actor.s3.loadout[0].main='specialPower';if(ap===57)for(const p of a.actor.s3.loadout){p.main='specialPower';p.subs.fill('specialPower');}a.actor.s3RefreshGear();
 a.actor.special=a.actor.specialCost();readySpecialEvidence(a.actor, {placeAtFixtureOrigin:true});useSpecialEvidence(a.f,a.actor);
 assert.equal(a.f.G.projectiles._s3AllSpecialObjects.filter(o=>o.kind==='decoy').length,12);a.actor.specialActive=null;a.actor.special=0;
 for(let i=0;i<600;i++){a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);a.paint.advanceSimulation(1/60);}
 const rows=a.nm.out.filter(e=>e[1]==='s');assert.ok(rows.length>=12);for(const row of rows)assert.ok(row[5]<=3.74);b.nm._peer('a');
 for(let repeat=0;repeat<2;repeat++){for(const e of rows){const row=JSON.parse(JSON.stringify(e));row._netSeq=e._netSeq;row._netTick=e._netTick;b.nm._play('a',row);}for(let i=0;i<240;i++)b.paint.advanceSimulation(1/60);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));}
 assert.ok(a.paint.counts[0]>0);assert.equal(a.actor.special,0);assert.equal(b.actor.special,0);assert.ok(Math.abs(a.actor.stats.turf-a.paint.counts[0]*a.face.cu*a.face.cv/3.305785)<1e-7);
});
