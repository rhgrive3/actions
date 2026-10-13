import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
import { REMOTE_GHOST_BOMB_LIMITS, REMOTE_GHOST_STORM_RESERVE, ghostBombActorAllowance, allowGhostBombBirth } from '../snapshot-guard.mjs';

async function world() {
  const f = await fixture({productionComposition:true}), nm = f.makeNetMatch(f.makeSession('me', 'p2', [['me','Me'],['p2','P2'],['p3','P3'],['p4','P4'],['p5','P5']]));
  const make = (nid, owner, remote = true, team = 0) => f.makeActor({nid, owner, remote, team, roller:false});
  const fillers = [make(17,'p2'),make(18,'p2'),make(27,'p3'),make(28,'p4')];
  const attacker = make(37,'p5'), victim = make(1,'me',false,1);
  for (const a of [...fillers,attacker,victim]) a.weapon={...a.weapon,sub:'bomb'};
  victim.hp = 100; victim.netLife = 0; victim._netLifeStartedAt = 999;
  victim.pos.set(0,.6,2); victim.received = [];
  // The actual native blast/cloud and victim-authority delivery run. This
  // receiver records the resulting HP call; Actor death presentation is separate.
  victim.damage = function(amount) { this.received.push(amount); this.hp = Math.max(0,this.hp-amount); if (!this.hp) this.alive = false; return !this.alive; };
  f.G.match = f.bind(nm,[...fillers,attacker,victim]); f.G.match.playing = () => true;
  f.G.actors = f.G.match.actors;
  for (const owner of ['p2','p3','p4']) Object.assign(nm._peer(owner),{tr:1000,lastTs:1000,sim:60000,off:0});
  return {f,nm,fillers,attacker,victim};
}
function birth(a, sequence, x = 100) {
  return Object.assign([1000,'b',a.nid,'bomb',x,.6,0,0,0,0,60000,sequence], {_netTick:60000,_netSeq:sequence});
}
function flood(w, includeAttacker = false) {
  for (const a of [...w.fillers,...(includeAttacker ? [w.attacker] : [])]) {
    for (let n=0;n<256;n++) w.nm._play(a.owner,birth(a,(w.nm._peer(a.owner)._lastEventSeq || 0)+1));
  }
}

test('other authenticated roster actors cannot erase a native victim-authoritative bomb', async () => {
  const outcomes=[];
  for (const saturated of [false,true]) {
    const w=await world(),{f,nm,attacker,victim}=w;
    try {
      Object.assign(nm._peer('p5'),{tr:1000,lastTs:1000,sim:60000,off:0});
      if(saturated)flood(w);
      nm._play('p5',birth(attacker,1,0));
      const b=f.projectiles.bombs.find(b=>b.owner===attacker);
      assert.ok(b,'the independent owner retains an actual native bomb');
      b.age=1; f.projectiles._explodeBomb(b);
      outcomes.push({hp:victim.hp,damage:[...victim.received]});
      assert.ok(f.projectiles.bombs.length<=REMOTE_GHOST_BOMB_LIMITS.total);
    } finally {nm.dispose();}
  }
  assert.deepEqual(outcomes[1],outcomes[0]); assert.equal(outcomes[1].hp,0);
});

test('full ordinary quotas preserve authenticated Storm birth and native cloud damage', async () => {
  const w=await world(),{f,nm,attacker:a,victim}=w;
  a.weapon=Object.values(f.WEAPONS).find(w=>w.special==='storm');assert.ok(a.weapon);
  const packet=(ts,active,events)=>nm.onMessage('p5',JSON.parse(JSON.stringify({k:'t',ts,r:2,u:Math.round(ts*60),l:{37:0},a:[f.packActor(a,{f:1|(active?8192:0)})],...(events?{e:events}:{})})));
  try {
    f.clock.set(1000); packet(999.8,false); nm.update(1/60); nm.applyRemote(a,1/60);
    flood(w,true);
    const seq=(nm._peer('p5')._lastEventSeq||0)+1;
    f.clock.set(1000.2);
    packet(1000,true,[[1000,'ev','special:use',{actor:{n:37},id:'storm'},60000,seq],[1000,'b',37,'storm',0,3,0,0,5,10,60000,seq+1]]);
    for(let i=0;i<60;i++){f.clock.advance(1/60);nm.update(1/60);nm.applyRemote(a,1/60);}
    assert.equal(f.projectiles.bombs.filter(b=>b.owner===a&&b.kind==='storm').length,1);
    assert.equal(a.net._stormBirthAuth.used,true);
    // A duplicate token cannot spend the reserved capacity a second time.
    const duplicate=Object.assign([1000,'b',37,'storm',0,3,0,0,5,10,60000,seq+2],{_netTick:60000,_netSeq:seq+2,_stormSnapshot:{owner:'p5',life:0,at:1000,tick:60000}});
    nm._play('p5',duplicate);
    assert.equal(f.projectiles.bombs.filter(b=>b.kind==='storm').length,1);
    f.clock.set(1002.2);packet(1002,false);
    const peer=nm._peer('p5');peer.tr=1002;peer.sim=60120;peer.lastTs=1002;
    f.projectiles._updateBombs(1/60); f.projectiles._updateClouds(1/60);
    assert.equal(f.projectiles.clouds.filter(c=>c.owner===a).length,1);
    assert.ok(victim.received.some(n=>n>0),'the native cloud reaches the local damage receiver');
    assert.ok(victim.hp<100);
  } finally {nm.dispose();}
});

test('eight-actor reservations stay within total/owner ceilings including host-owned bots',()=>{
  const actors=Array.from({length:8},(_,i)=>({owner:i<5?'host':'p'+i,nid:i})),bombs=[];
  for(const a of actors){
    const quota=ghostBombActorAllowance(a,a.owner,actors);
    assert.equal(quota,a.owner==='host'?9:12);
    for(let i=0;i<quota-REMOTE_GHOST_STORM_RESERVE;i++){
      assert.equal(allowGhostBombBirth(bombs,a,a.owner,'bomb',actors),true);bombs.push({ghost:true,owner:a,kind:'bomb'});
    }
    assert.equal(allowGhostBombBirth(bombs,a,a.owner,'bomb',actors),false);
    for(let i=0;i<REMOTE_GHOST_STORM_RESERVE;i++){
      assert.equal(allowGhostBombBirth(bombs,a,a.owner,'storm',actors),true);bombs.push({ghost:true,owner:a,kind:'storm'});
    }
    assert.equal(allowGhostBombBirth(bombs,a,a.owner,'storm',actors),false);
  }
  assert.ok(bombs.length<=REMOTE_GHOST_BOMB_LIMITS.total);
  assert.ok(bombs.filter(b=>b.owner.owner==='host').length<=REMOTE_GHOST_BOMB_LIMITS.peer);
  assert.equal(allowGhostBombBirth([],actors[0],'forged','bomb',actors),false);
  assert.equal(allowGhostBombBirth([],{owner:'host'},'host','bomb',actors),false);
});

// Legal producer trace: native Actor -> WeaponRunner -> Projectiles -> NetMatch
// recording. Only actor locomotion/rendering is constrained; cost, recovery,
// throw cadence, ballistic gravity, landing fuse and packet encoding are native.
async function nativeBombTrace(gear, sub = 'bomb') {
  const { fixture: sourceFixture } = await import('../../splatoon3/tests/source-fixture.mjs');
  let seconds=1000;
  const f=await sourceFixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>seconds*1000}});
  f.G.scene=new f.THREE.Scene(); f.G.camera={position:new f.THREE.Vector3(0,12,10)};
  f.G.projectiles=new f.Projectiles(f.G.scene);
  f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
  f.G.physics=new f.Physics(f.G.level);
  const a=f.make('shooter'); Object.assign(a,{nid:37,owner:'p5',remote:false});
  a.weapon={...a.weapon,sub}; a.pos.set(0,12,0); a.aimPitch=.9; a.aimYaw=0; a.aimDir.set(0,Math.sin(.9),Math.cos(.9));
  a.s3.loadout=f.emptyLoadout(); for(const piece of a.s3.loadout){piece.main=gear;piece.subs.fill(gear);} a.s3RefreshGear();
  const session={myId:'p5',isHost:true,hostId:'p5',_members:new Map([['p5','P5']]),tr:{broadcast(){},sendTo(){}}};
  const sender=new f.NetMatch(session,{id:'native-bomb-producer',map:'map',difficulty:'normal'});
  f.G.netm=sender; sender.byNid.set(a.nid,a); sender._setupActor(a);
  let peak=0,minInk=100;
  try {
    for(let i=0;i<3600;i++){
      seconds=1000+(i+1)/60;
      a.intent.sub=i%30<6; a.intent.squid=i%30>8;
      f.tick(a); f.G.projectiles.update(1/60);
      peak=Math.max(peak,f.G.projectiles.bombs.length); minInk=Math.min(minInk,a.ink);
    }
    const events=JSON.parse(JSON.stringify(sender.out.filter(e=>e[1]==='b')));
    assert.ok(minInk>=0,'no resource cheats or negative ink');
    assert.ok(events.length>12,'the legal delayed batch must exceed the eight-actor ordinary share');
    assert.ok(peak<=4,'the native slow-airborne live occupancy remains below even an eight-bot host share');
    assert.ok(events.every(e=>e[3]==='bomb'&&e[5]>12&&e[8]>60),'exercise elevated, high-pitch slow retirement');
    return {events,peak};
  } finally {sender.dispose();f.G.projectiles.clear();}
}

test('delayed legal native producer bursts wait in the bounded FIFO and replay every bomb once',async()=>{
  for(const gear of ['none','inkSaverSub','inkRecovery']){
    const trace=await nativeBombTrace(gear);
    for(const hz of [30,60,120]){
    const w=await world(),{f,nm,attacker}=w;
    for(const [nid,owner] of [[38,'p3'],[39,'p4']]){
      const a=f.makeActor({nid,owner,remote:true,roller:false}); nm.match.actors.push(a); nm.byNid.set(nid,a); nm._setupActor(a);
    }
    let born=0; const create=f.projectiles.ghostBomb;
    f.projectiles.ghostBomb=function(...args){const b=create.apply(this,args);if(b)born++;return b;};
    const seen=[];attacker.character._netTrig=name=>seen.push(name);
    try {
      const lastSeq=trace.events.at(-1).at(-1),events=[...trace.events,[1060,'tr',37,'jump',null,3600,lastSeq+1]];
      f.clock.set(1060.2);
      nm.onMessage('p5',{k:'t',ts:1060,r:2,u:3600,l:{37:0},a:[f.packActor(attacker,{f:1})],e:events});
      const p=nm._peer('p5');Object.assign(p,{tr:1060,sim:3600,lastTs:1060});
      assert.equal(p.events.length,events.length,'all genuine native event rows were admitted');
      const ordinary=ghostBombActorAllowance(attacker,'p5',nm.match.actors)-REMOTE_GHOST_STORM_RESERVE;
      assert.equal(ordinary,10);
      nm._playEvents();
      assert.equal(born,ordinary);
      assert.equal(p.events.length,events.length-ordinary,'unallocated native attack retains FIFO position');
      assert.equal(p._lastEventSeq,trace.events[ordinary-1].at(-1),'waiting does not consume identity');
      assert.deepEqual(seen,[],'later owner event keeps its order');
      for(let frame=0;frame<30&&p.events.length;frame++){
        f.projectiles._updateBombs(1/hz);nm._playEvents();
        assert.ok(f.projectiles.bombs.length<=ordinary,'normal catch-up never allocates above quota');
      }
      assert.equal(p.events.length,0,'normal bounded owner-time physics releases all queued native births');
      assert.equal(born,trace.events.length,'no genuine attack was lost or replayed twice');
      assert.deepEqual(seen,['jump']);assert.equal(p._lastEventSeq,lastSeq+1);
      nm._playEvents();assert.equal(born,trace.events.length);
    } finally {nm.dispose();}
    }
  }
});

test('owner turnover and actor removal retire native bombs before recomputing roster shares',async()=>{
  const w=await world(),{f,nm,fillers,attacker}=w;
  try{
    flood(w,true);const before=f.projectiles.bombs.filter(b=>b.owner===fillers[0]);assert.ok(before.length);
    const unaffected=f.projectiles.bombs.filter(b=>b.owner===attacker);
    nm.onLeave('p3',false); // p3 actors become host-owned remote bots on this client.
    assert.equal(fillers[2].owner,'p2');
    assert.equal(f.projectiles.bombs.some(b=>b.owner===fillers[2]),false);
    assert.ok(unaffected.every(b=>f.projectiles.bombs.includes(b)));
    assert.equal(ghostBombActorAllowance(fillers[0],'p2',nm.match.actors),16);
    // Newly transferred actor can use only the recalculated host budget.
    const p=nm._peer('p2');nm._play('p2',birth(fillers[2],(p._lastEventSeq||0)+1));
    assert.ok(f.projectiles.bombs.some(b=>b.owner===fillers[2]));
    assert.ok(f.projectiles.bombs.filter(b=>b.owner.owner==='p2').length<=48);
    nm._remove(fillers[0]);
    assert.ok(before.every(b=>!f.projectiles.bombs.includes(b)));
    assert.equal(allowGhostBombBirth(f.projectiles.bombs,fillers[0],'p2','bomb',nm.match.actors),false);
    nm.dispose(); assert.equal(f.projectiles.bombs.length,0);
  } finally {if(f.G.netm===nm)nm.dispose();}
});

test('full Storm reserve waits without spending the accepted token, then allocates once',async()=>{
  const w=await world(),{f,nm,attacker:a}=w;a.weapon=Object.values(f.WEAPONS).find(w=>w.special==='storm');assert.ok(a.weapon);
  const packet=(ts,active,events)=>nm.onMessage('p5',JSON.parse(JSON.stringify({k:'t',ts,r:2,u:Math.round(ts*60),l:{37:0},a:[f.packActor(a,{f:1|(active?8192:0)})],...(events?{e:events}:{})})));
  try{
    f.clock.set(1000);packet(999.8,false);nm.update(1/60);nm.applyRemote(a,1/60);
    // Previously deployed native canisters occupy both reserved slots.
    for(let i=0;i<2;i++)f.projectiles.ghostBomb(a,'storm',100,3,0,0,0,0);
    f.clock.set(1000.2);packet(1000,true,[[1000,'ev','special:use',{actor:{n:37},id:'storm'},60000,1],[1000,'b',37,'storm',0,3,0,0,5,10,60000,2]]);
    const p=nm._peer('p5');Object.assign(p,{tr:1000,sim:60000});nm._playEvents();
    assert.equal(a.net._stormBirthAuth.used,false);assert.equal(p._lastEventSeq,1);assert.equal(p.events.length,1);
    // Advance the existing native canisters, not a parallel resource counter.
    f.projectiles._updateBombs(1.2);nm._playEvents();
    assert.equal(a.net._stormBirthAuth.used,true);assert.equal(p._lastEventSeq,2);assert.equal(p.events.length,0);
    assert.equal(f.projectiles.bombs.filter(b=>b.kind==='storm').length,1);
    nm._playEvents();assert.equal(f.projectiles.bombs.filter(b=>b.kind==='storm').length,1);
  }finally{nm.dispose();}
});

test('invalid Storm, nonfinite bomb and foreign owner never hold the FIFO behind a full quota',async()=>{
  const w=await world(),{f,nm,attacker:a,fillers}=w;
  try{
    flood(w,true);const p=nm._peer('p5'),seq=(p._lastEventSeq||0)+1,seen=[];
    a.character._netTrig=name=>seen.push(name);
    f.clock.set(1001);
    nm.onMessage('p5',{k:'t',ts:1001,r:2,u:60060,e:[
      [1001,'b',a.nid,'storm',0,3,0,0,5,10,60060,seq],
      [1001,'b',a.nid,'bomb',NaN,3,0,0,5,10,60060,seq+1],
      [1001,'b',fillers[0].nid,'bomb',0,3,0,0,5,10,60060,seq+2],
      [1001,'tr',a.nid,'jump',null,60060,seq+3],
    ]});Object.assign(p,{tr:1001,sim:60060});nm._playEvents();
    assert.equal(p.events.length,0);assert.deepEqual(seen,['jump']);assert.equal(p._lastEventSeq,seq+3);
  }finally{nm.dispose();}
});


test('native deployed Sprinkler replacement cannot pin an owner FIFO under a legal delayed trace',async()=>{
  const trace=await nativeBombTrace('inkSaverSub','sprinkler'),w=await world(),{f,nm,attacker:a}=w;
  a.weapon={...a.weapon,sub:'sprinkler'};
  try{
    assert.equal(trace.peak,1,'native owner retains only the newest Sprinkler');
    f.clock.set(1060.2);
    nm.onMessage('p5',{k:'t',ts:1060,r:2,u:3600,l:{37:0},a:[f.packActor(a,{f:1})],e:trace.events});
    const p=nm._peer('p5');Object.assign(p,{tr:1060,sim:3600,lastTs:1060});
    for(let frame=0;frame<30;frame++){nm._playEvents();f.projectiles._updateBombs(1/60);}
    assert.equal(p.events.length,0,'legal Sprinkler replacements must not wait for owner death');
    assert.equal(p._lastEventSeq,trace.events.at(-1).at(-1));
    assert.equal(f.projectiles.bombs.filter(b=>b.owner===a).length,1,'receiver matches the native one-Sprinkler lifecycle');
  }finally{nm.dispose();}
});

test('installed ghost bomb damage preserves read-only native Bubbler shielding and recipient life authority',async()=>{
  const {fixture:sourceFixture}=await import('../../splatoon3/tests/source-fixture.mjs');
  for(const mode of ['outside','inside','remote-victim','old-life','blocked-los']){
    const f=await sourceFixture({fullRuntime:true,productionComposition:true,realProjectiles:true,vmPerformance:{now:()=>1000e3},extraExports:"export {tickBigBubblers,bigBubblerDomes,clearBigBubblers} from './patches/splatoon3/runtime/kit-big-bubbler.mjs';"});
    f.G.scene=new f.THREE.Scene();f.G.camera={position:new f.THREE.Vector3(0,3,10)};f.G.projectiles=new f.Projectiles(f.G.scene);
    const owner=f.make('roller');owner.team=1;owner.nid=1;owner.owner='me';owner.weapon={...owner.weapon,special:'bubbler',specialCost:180};owner.special=180;
    owner._startSpecial();f.tickBigBubblers(1);
    const dome=f.bigBubblerDomes()[0];assert.ok(dome,'native Bubbler deploy succeeds');
    const attacker=f.make('shooter');Object.assign(attacker,{owner:'p5',nid:37,remote:true,team:0});attacker.weapon={...attacker.weapon,sub:'bomb'};
    const victim=f.make('shooter');Object.assign(victim,{owner:mode==='remote-victim'?'p3':'me',nid:2,remote:mode==='remote-victim',team:1,netLife:0,_netLifeStartedAt:mode==='old-life'?1002:999});victim.pos.copy(dome.pos);
    if(mode==='outside')victim.pos.z+=dome.radius-.25;
    let damage=0;victim.damage=amount=>{damage+=amount;return false;};
    const sent=[],session={myId:'me',hostId:'me',isHost:true,_members:new Map([['me','Me'],['p5','P5'],['p3','P3']]),tr:{broadcast:()=>{},sendTo:(...args)=>sent.push(args)}};
    const nm=new f.NetMatch(session,{id:'installed-bomb-defense',map:'map'});f.G.netm=nm;
    const match={actors:[owner,attacker,victim],state:'playing',playing:()=>true,canRespawn:()=>false};f.G.match=match;nm.bind(match);
    f.G.actors=[victim];f.G.physics.los=()=>mode!=='blocked-los';
    try{
      const hp=dome.hp,fieldHp=dome.fieldHp,offset=mode==='outside'?dome.radius+1:0;
      const bomb=f.G.projectiles.ghostBomb(attacker,'bomb',dome.pos.x,dome.pos.y+.6,dome.pos.z+offset,0,0,0);
      assert.ok(bomb);bomb._netBornLocal=1000;bomb.age=1;
      f.G.projectiles._explodeBomb(bomb);
      assert.equal(damage>0,mode==='inside',mode+' actor damage authority');
      assert.equal(dome.hp,hp,mode+' replica cannot spend dome canopy HP');
      assert.equal(dome.fieldHp,fieldHp,mode+' replica cannot spend dome emitter HP');
      assert.equal(sent.length,0,mode+' replica cannot propose object or shooter-owned bomb damage');
      assert.equal(f.G.projectiles.s3ExplosionDefense,undefined,'explosion scope restores');
      if(mode==='outside'){
        f.clearBigBubblers();f.G.projectiles._explodeBomb(bomb);
        assert.ok(damage>0,'identical in-range geometry damages after native shielding is removed');
      }
    }finally{nm.dispose();f.clearBigBubblers();f.G.projectiles.clear();}
  }
});

test('native Suction, Curling and Autobomb lifecycles replay under the seven-actor host share',async()=>{
  for(const sub of ['suction','curling','autobomb']){
    const trace=await nativeBombTrace('inkSaverSub',sub),w=await world(),{f,nm,attacker:a}=w;
    a.weapon={...a.weapon,sub};
    for(const actor of w.fillers)actor.owner='p5';
    for(const nid of [38,39]){const actor=f.makeActor({nid,owner:'p5',remote:true,roller:false});nm.match.actors.push(actor);nm.byNid.set(nid,actor);nm._setupActor(actor);}
    nm.s.hostId='p5';
    const ordinary=ghostBombActorAllowance(a,'p5',nm.match.actors)-REMOTE_GHOST_STORM_RESERVE;
    assert.equal(ordinary,4);assert.ok(trace.peak<=ordinary,sub+' live legal occupancy');
    let born=0;const create=f.projectiles.ghostBomb;f.projectiles.ghostBomb=function(...args){const b=create.apply(this,args);if(b)born++;return b;};
    try{
      f.clock.set(1060.2);nm.onMessage('p5',{k:'t',ts:1060,r:2,u:3600,l:{37:0},a:[f.packActor(a,{f:1})],e:trace.events});
      const p=nm._peer('p5');Object.assign(p,{tr:1060,sim:3600,lastTs:1060});
      for(let frame=0;frame<120&&p.events.length;frame++){nm._playEvents();assert.ok(f.projectiles.bombs.length<=ordinary);f.projectiles._updateBombs(1/60);}
      assert.equal(p.events.length,0,sub+' cannot pin the owner FIFO');assert.equal(born,trace.events.length,sub+' loses no native birth');
    }finally{nm.dispose();}
  }
});

test('Sprinkler replacement retires only the authenticated same-actor replica',async()=>{
  const trace=await nativeBombTrace('inkSaverSub','sprinkler'),w=await world(),{f,nm,attacker:a,victim,fillers}=w;
  a.weapon={...a.weapon,sub:'sprinkler'};victim.weapon={...victim.weapon,sub:'sprinkler'};
  try{
    const args=[0,3,0,0,0,0,null,'sprinkler',0];
    const replaced=f.projectiles.ghostBomb(a,'bomb',...args);
    const other=f.projectiles.ghostBomb(fillers[0],'bomb',...args);
    const ordinary=f.projectiles.ghostBomb(a,'bomb',100,100,0,0,0,0);
    f.projectiles.throwBomb(victim);const local=f.projectiles.bombs.at(-1);assert.equal(local.ghost,undefined);
    const event=trace.events[0],ts=event[0],tick=event.at(-2),seq=event.at(-1);
    const deliver=(from)=>{f.clock.set(ts+.2);nm.onMessage(from,{k:'t',ts,r:2,u:tick,e:[JSON.parse(JSON.stringify(event))]});const p=nm._peer(from);Object.assign(p,{tr:ts,sim:tick});nm._playEvents();};
    deliver('p4');assert.ok(f.projectiles.bombs.includes(replaced),'foreign sender cannot retire the device');
    deliver('p5');assert.equal(f.projectiles.bombs.includes(replaced),false);
    for(const kept of [other,ordinary,local])assert.ok(f.projectiles.bombs.includes(kept),'unrelated native object survives');
    const next=f.projectiles.bombs.find(b=>b!==ordinary&&b.owner===a);assert.ok(next);
    const duplicate=Object.assign([...event],{_netTick:tick,_netSeq:seq});nm._play('p5',duplicate);
    assert.ok(f.projectiles.bombs.includes(next),'stale sequence cannot retire the new device');
  }finally{nm.dispose();f.projectiles.clear();}
});
