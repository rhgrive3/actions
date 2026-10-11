import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';import {makePaintWorld} from './paint-authority-fixture.mjs';
async function client(id){const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});const {paint,V}=makePaintWorld(f);f.G.settings={};const nm=new f.NetMatch({myId:id,isHost:id==='a',hostId:'a',_members:new Map([['a','A'],['b','B']]),tr:{broadcast(){},sendTo(){}}},{id:'sprinkler-authority',map:'map',difficulty:'normal'});f.G.netm=nm;const actor=f.make();Object.assign(actor,{owner:'a',nid:0,remote:id!=='a',team:0});actor.pos.set(0,0,30);actor._resolve=()=>{};f.G.match={actors:[actor],state:'playing',time:180,follower:false,playing:()=>true};nm.bind(f.G.match);nm.byNid.set(0,actor);nm._setupActor(actor);actor.weapon={...actor.weapon,sub:'sprinkler'};actor.weaponRunner.reset();f.G.actors=[];return{f,paint,nm,actor,V};}

function advance(c,frames=120){for(let i=0;i<frames;i++){c.f.G.time+=1/60;c.f.G.projectiles.update(1/60);c.paint.advanceSimulation(1/60);}}
function wire(a,b,row){const e=JSON.parse(JSON.stringify(row));e._netSeq=row._netSeq;e._netTick=row._netTick;b.nm._play('a',e);}
test('retired catalogue Sprinkler spawn and repeated drop packets cannot acquire paint authority',async()=>{
 const a=await client('a'),b=await client('b'),life=Math.max(b.actor.netLife||0,b.actor.net?.lastLife||0);
 const base={v:1,subId:'sprinkler',seq:1,eventSeq:1,life,sourceLife:life,x:0,y:.08,z:30,vx:0,vy:0,vz:0,charge:0,seed:8};
 const send=p=>wire(a,b,a.nm._rec(['ac','sub',0,life,p]));
 send({...base,phase:'spawn'});send({...base,eventSeq:2,phase:'deploy'});
 assert.equal((b.f.G.projectiles._s3SubObjects||[]).length,0);
 for(const radius of[.25,.6])send({...base,eventSeq:3,phase:'sprinklerDrop',radius,drop:0});
 advance(b);assert.equal(b.paint.counts[0],0);
 b.paint.splat(b.V(0,.08,30),2,1,{seed:.9,instant:true});const expected=Array.from(b.paint.grid),score=b.actor.stats.turf;
 for(let i=0;i<4;i++)send({...base,eventSeq:4+i,phase:'sprinklerDrop',radius:.6,drop:0});
 advance(b);assert.deepEqual(Array.from(b.paint.grid),expected);assert.equal(b.actor.stats.turf,score);
});
test('native Sprinkler admission and ordered real JSON paint keep ownership, credit and death persistence',async()=>{
 const a=await client('a'),b=await client('b');a.actor.pos.z=0;b.actor.pos.z=0;a.actor.ink=100;
 for(let i=0;i<8;i++)a.actor.weaponRunner.update(1/60,{sub:true});
 a.actor.weaponRunner.update(1/60,{subReleased:true});a.actor.weaponRunner.update(1/60,{subReleased:true});
 assert.equal(a.actor.ink,40);assert.equal(a.f.G.projectiles.bombs.length,1);
 assert.equal(a.f.G.projectiles.bombs[0].s3Sub.id,'sprinkler');advance(a,300);
 const rows=a.nm.out.slice();assert.ok(rows.some(e=>e[1]==='b'));assert.ok(rows.filter(e=>e[1]==='s').length>5);
 assert.equal(rows.filter(e=>e[1]==='ac'&&e[2]==='sub'&&e[5]?.subId==='sprinkler').length,0);
 for(const e of rows)wire(a,b,e);advance(b,300);
 assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));assert.ok(a.paint.counts[0]>0);assert.ok(a.actor.stats.turf>0);
 const before=Array.from(b.paint.grid);for(const e of rows)wire(a,b,e);advance(b);assert.deepEqual(Array.from(b.paint.grid),before);
 // An authenticated enemy's ordered paint wins over already played rows.
 const enemies=[];for(const c of[a,b]){const e=c.f.make();Object.assign(e,{owner:'b',nid:1,team:1,remote:c===a});c.nm.byNid.set(1,e);c.nm._setupActor(e);enemies.push(e);}
 const device=a.f.G.projectiles.bombs[0],point=device.pos.clone();point.y=.035;
 b.paint.splat(point,2,1,{seed:.42,claimOwner:enemies[1],instant:true});
 const enemyRows=b.nm.out.filter(e=>e[1]==='s');assert.ok(enemyRows.length>0);
 for(const row of enemyRows){const e=JSON.parse(JSON.stringify(row));e._netSeq=row._netSeq;e._netTick=row._netTick;a.nm._play('b',e);}
 for(let i=0;i<120;i++){a.paint.advanceSimulation(1/60);b.paint.advanceSimulation(1/60);}
 assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));assert.ok(b.paint.counts[1]>0);
 const enemyGrid=Array.from(b.paint.grid);for(const e of rows)wire(a,b,e);advance(b);assert.deepEqual(Array.from(b.paint.grid),enemyGrid);
 const start=a.nm.out.length,credit=a.actor.stats.turf;advance(a,120);
 for(const e of a.nm.out.slice(start))wire(a,b,e);advance(b,240);
 assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));assert.ok(a.actor.stats.turf>=credit);
 a.actor.alive=false;b.actor.alive=false;advance(a);advance(b);
 const tail=a.nm.out.slice(rows.length);for(const e of tail)wire(a,b,e);advance(b);
 assert.equal(a.f.G.projectiles.bombs.length,0);assert.equal(b.f.G.projectiles.bombs.length,0);
 assert.ok(a.paint.counts[0]>0);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));
});
