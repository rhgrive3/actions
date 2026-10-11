import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { makePaintWorld } from './paint-authority-fixture.mjs';

async function client(id, sub) {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { paint } = makePaintWorld(f);
  f.G.settings = {}; f.setRandom(() => .37);
  const nm = new f.NetMatch({ myId:id, isHost:id==='a', hostId:'a',
    _members:new Map([['a','A'],['b','B']]), tr:{broadcast(){},sendTo(){}} },
    {id:'sub-paint-authority',map:'map',difficulty:'normal'});
  f.G.netm = nm;
  const actors = ['a','b'].map((owner,nid) => {
    const a=f.make('shooter'); Object.assign(a,{owner,nid,remote:owner!==id,team:nid});
    a.pos.set(0,0,30); a.aimDir.set(0,-.1,1).normalize(); return a;
  });
  nm.match={actors,state:'playing',time:180,follower:false,playing:()=>true}; f.G.match=nm.match;nm.match=null;nm.bind(f.G.match);
  for(const a of actors){nm.byNid.set(a.nid,a);nm._setupActor(a);a.weapon={...a.weapon,sub};a.weaponRunner.reset();}
  f.G.actors=[];
  return {f,nm,paint,owner:actors[0]};
}
function wire(e) { const row=JSON.parse(JSON.stringify(e)); row._netSeq=e._netSeq;row._netTick=e._netTick;return row; }
function play(c, rows) {c.nm._peer('a');for(const e of rows)c.nm._play('a',wire(e));for(let i=0;i<240;i++)c.paint.advanceSimulation(1/60);}
async function pair(){const a=await client('a','bomb'),b=await client('b','bomb');for(const c of[a,b]){c.owner.weapon={...c.owner.weapon,special:'bubbler'};c.owner.weaponRunner.reset();}return{a,b};}
function ignite(a){a.owner.special=a.owner.specialCost();a.owner.intent.special=true;a.f.tick(a.owner);for(let i=0;i<120;i++){a.f.G.time+=1/60;a.f.G.projectiles.update(1/60);a.paint.advanceSimulation(1/60);}return a.nm.out;}
test('Big Bubbler actual activation and full event replay preserve ignition ownership once without gauge recharge',async()=>{
 const{a,b}=await pair(),rows=ignite(a);assert.ok(rows.some(e=>e[1]==='ev'&&e[2]==='kit:bubbler:deploy'));
 assert.equal(rows.filter(e=>e[1]==='s').length,1);assert.ok(a.paint.counts[0]>800);assert.equal(a.owner.special,0);
 play(b,rows);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));const saved=Array.from(b.paint.grid);play(b,rows);assert.deepEqual(Array.from(b.paint.grid),saved);
});
test('Bubbler ignition refuses radius, position, seed, owner, life and malformed deployment claims',async()=>{
 const{a}=await pair(),rows=ignite(a),birth=rows.find(e=>e[1]==='ev'&&e[2]==='kit:bubbler:deploy'),core=rows.find(e=>e[1]==='s');
 for(const edit of [e=>e[5]=5,e=>e[2]+=1,e=>e[7]=.123,e=>e[6]=1,e=>e[15][3]++,e=>e[15]=null]){
  const b=await client('b','bomb');b.owner.weapon={...b.owner.weapon,special:'bubbler'};const bad=wire(core);edit(bad);play(b,[birth,bad]);assert.equal(b.paint.counts[0],0);
 }
 for(const edit of [v=>v.hp=-1,v=>v.pos=[1e40,0,0],v=>v.paintLife++,v=>v.owner.n=1,v=>v.t=2]){
  const b=await client('b','bomb');b.owner.weapon={...b.owner.weapon,special:'bubbler'};const bad=wire(birth);edit(bad[3]);play(b,[bad,core]);assert.equal(b.paint.counts[0],0);
 }
});
test('a delayed ignition core can follow accepted owner death; a missing birth must arrive first',async()=>{
 const{a,b}=await pair(),rows=ignite(a),birth=rows.find(e=>e[1]==='ev'&&e[2]==='kit:bubbler:deploy'),core=rows.find(e=>e[1]==='s');
 play(b,[birth]);b.owner.alive=false;b.owner.netLife=1;b.owner.net.lastLife=1;play(b,[core]);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));
 const c=await client('b','bomb');c.owner.weapon={...c.owner.weapon,special:'bubbler'};play(c,[core]);assert.equal(c.paint.counts[0],0);play(c,[birth]);assert.deepEqual(Array.from(c.paint.grid),Array.from(a.paint.grid));
});
test('Bubbler real tick receive resolves reverse rows and an older deployment envelope',async()=>{
 const{a}=await pair(),rows=ignite(a),birth=rows.find(e=>e[1]==='ev'&&e[2]==='kit:bubbler:deploy');
 for(const delayed of [false,true]){
  const b=await client('b','bomb');b.owner.weapon={...b.owner.weapon,special:'bubbler'};
  const packet=(list,ts)=>b.nm._tick('a',{k:'t',r:2,ts,u:720,a:[],e:list.map(wire)});
  const drain=()=>play(b,b.nm._peer('a').events.splice(0));
  if(delayed){packet(rows.filter(e=>e!==birth),1000.1);drain();packet([birth],1000);}
  else packet([...rows].reverse(),1000);
  drain();assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));
 }
});
