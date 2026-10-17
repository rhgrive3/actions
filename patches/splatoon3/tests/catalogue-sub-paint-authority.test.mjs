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
  nm.match={actors,state:'playing',time:180,follower:false,playing:()=>true}; f.G.match=nm.match;
  for(const a of actors){nm.byNid.set(a.nid,a);nm._setupActor(a);a.weapon={...a.weapon,sub};a.weaponRunner.reset();}
  f.G.actors=[];
  return {f,nm,paint,owner:actors[0]};
}
function wire(e) { const row=JSON.parse(JSON.stringify(e)); row._netSeq=e._netSeq;row._netTick=e._netTick;return row; }
function play(c, rows) {c.nm._peer('a');for(const e of rows)c.nm._play('a',wire(e));for(let i=0;i<240;i++)c.paint.advanceSimulation(1/60);}
function fire(c, sub, frames=8, afterBirth=null, controlled=true) {
  for(let i=0;i<frames;i++)c.owner.weaponRunner.update(1/60,{sub:true,fire:false});
  c.owner.weaponRunner.update(1/60,{sub:false,subReleased:true,fire:false});
  c.owner.weaponRunner.update(1/60,{sub:false,fire:false});
  if(controlled)for(const obj of [...(c.f.G.projectiles.bombs||[]),...(c.f.G.projectiles._s3SubObjects||[])])if(obj?.pos){
    obj.pos.set(0,.3,30);obj.prev?.copy(obj.pos);obj.vel?.set(0,-2,0);
  }
  afterBirth?.(c);
  if(sub==='inkMine')c.f.G.actors=[c.nm.match.actors[1]];
  for(let i=0;i<720;i++){c.f.G.time+=1/60;c.f.G.projectiles.update(1/60);c.paint.advanceSimulation(1/60);}
  return c.nm.out.filter(e=>['s','b','ac'].includes(e[1]));
}
for(const [sub,frames,cores] of [['burst',8,1],['fizzy',8,1],['fizzy',50,2],['fizzy',130,3],['fizzy',1860,3],['inkMine',8,1]]) {
  test(`${sub} held ${frames} frames: actual input, causal birth, paint and duplicate replay agree`,async()=>{
    const a=await client('a',sub),b=await client('b',sub);
    const rows=fire(a,sub,frames), core=rows.filter(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-sub-core-v1');
    assert.equal(core.length,cores);assert.ok(a.paint.counts[0]>400);
    assert.ok(a.owner.stats.turf>0);assert.ok(a.owner.special>0,'ordinary sub paint still charges the special gauge');
    play(b,rows);assert.equal(b.paint.counts[0],a.paint.counts[0]);
    const snapshot=Array.from(b.paint.grid);play(b,rows);assert.deepEqual(Array.from(b.paint.grid),snapshot);
  });
}
test('legacy Autobomb remains on its native descriptor and needs no enlarged radius grant',async()=>{
  const a=await client('a','autobomb'),b=await client('b','autobomb');const rows=fire(a,'autobomb');
  assert.ok(rows.filter(e=>e[1]==='s').every(e=>e[5]<=3.744));play(b,rows);assert.equal(b.paint.counts[0],a.paint.counts[0]);
});
test('Burst core rejects altered radius, seed, team, life and missing birth',async()=>{
  const a=await client('a','burst'),rows=fire(a,'burst');
  const birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),core=rows.find(e=>e[1]==='s'&&e[15]);
  assert.ok(birth&&core);
  for(const [label,mutate] of [['radius',e=>e[5]=5],['position',e=>e[2]+=10000],['seed',e=>e[7]=.123],['team',e=>e[6]=1],['life',e=>e[15][3]++],['receipt',e=>e[15]=null]]){
    const b=await client('b','burst'),changed=wire(core);mutate(changed);play(b,[birth,changed]);
    assert.equal(b.paint.counts[0],0,label);
  }
  const b=await client('b','burst');play(b,[core]);assert.equal(b.paint.counts[0],0);
  play(b,[birth]);assert.ok(b.paint.counts[0]>400,'held core is admitted after its authenticated birth');
});
function packet(c,rows,ts=1000){c.nm._tick('a',{k:'t',r:2,ts,u:720,a:[],e:rows.map(wire)});}
function drain(c){for(const e of c.nm._peer('a').events.splice(0))c.nm._play('a',e);for(let i=0;i<240;i++)c.paint.advanceSimulation(1/60);}
test('charged Fizzy real receive preserves every core with reverse order and delayed birth envelope',async()=>{
  const a=await client('a','fizzy'),rows=fire(a,'fizzy',130),birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn');
  for(const delayed of [false,true]){
    const b=await client('b','fizzy');
    if(delayed){packet(b,rows.filter(e=>e!==birth),1000.1);drain(b);packet(b,[birth],1000);}
    else packet(b,[...rows].reverse());
    drain(b);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid));
  }
});
test('accepted mine can finish after owner death but an unreceived old-life birth cannot authorize paint',async()=>{
  const a=await client('a','inkMine'),rows=fire(a,'inkMine'),birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn');
  for(const receivedBeforeDeath of [true,false]){
    const b=await client('b','inkMine');if(receivedBeforeDeath)play(b,[birth]);
    b.owner.alive=false;b.owner.netLife=1;b.owner.net.lastLife=1;
    play(b,receivedBeforeDeath?rows.filter(e=>e!==birth):rows);
    assert.equal(b.paint.counts[0],receivedBeforeDeath?a.paint.counts[0]:0);
  }
});
test('match and owner changes cannot reuse an accepted sub birth',async()=>{
  const a=await client('a','burst'),rows=fire(a,'burst'),birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),core=rows.find(e=>e[1]==='s'&&e[15]);
  for(const change of ['epoch','owner','weapon']){
    const b=await client('b','burst');
    if(change==='weapon'){b.owner.weapon={...b.owner.weapon,sub:'bomb'};play(b,[birth]);}
    else {play(b,[birth]);if(change==='epoch')b.nm.cfg.id='other-match';else b.owner.owner='b';}
    play(b,[core]);assert.equal(b.paint.counts[0],0,change);
  }
});
test('natural flight and impact stay inside their birth-derived reach envelope',async()=>{
  for(const sub of ['burst','fizzy','inkMine']){
    const a=await client('a',sub),b=await client('b',sub);a.owner.aimPitch=-.65;
    const rows=fire(a,sub,sub==='fizzy'?130:8,null,false);
    assert.ok(rows.some(e=>e[1]==='s'&&e[15]),sub+' actually emitted a core');
    play(b,rows);assert.deepEqual(Array.from(b.paint.grid),Array.from(a.paint.grid),sub);
  }
});
test('malformed catalogue birth cannot grant a core rejected by normal catalogue replay',async()=>{
  const a=await client('a','burst'),rows=fire(a,'burst'),birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn'),core=rows.find(e=>e[1]==='s'&&e[15]);
  for(const mutate of [v=>v.extra='x'.repeat(97),v=>v.vx=1e50,v=>v.eventSeq=-1,v=>v.hold=-1,v=>v.charge=2,v=>v.v=2]){
    const b=await client('b','burst'),bad=wire(birth);mutate(bad[5]);play(b,[bad,core]);assert.equal(b.paint.counts[0],0);
  }
});

test('Fizzy ground-fuse envelope remains bounded and cannot authorize a third core from a short-charge birth',async()=>{
  const a=await client('a','fizzy'),rows=fire(a,'fizzy',130);
  const birth=rows.find(e=>e[1]==='ac'&&e[5].phase==='spawn');
  const third=rows.find(e=>e[1]==='s'&&e[15]?.[0]==='inkwave-sub-core-v1'&&e[15][5]===2);
  assert.ok(birth&&third,'a full charge produces its third grounded core');
  for(const [label,change] of [
    ['teleport',(b,c)=>{c[2]+=10000;}],
    ['radius',(b,c)=>{c[5]+=.1;}],
    ['extra core',(b,c)=>{c[15][5]=3;}],
    ['short charge',(b,c)=>{b[5].hold=.1;b[5].charge=.05;}],
    ['legacy permit',(b,c)=>{c[15]=null;}],
  ]){
    const receiver=await client('b','fizzy'),b=wire(birth),c=wire(third);change(b,c);play(receiver,[b,c]);
    assert.equal(receiver.paint.counts[0],0,label+' cannot gain the third-core grant');
  }
});
