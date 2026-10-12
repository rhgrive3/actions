import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const GLOBAL_LIMIT = 640;
const PEER_LIMIT = 256;
const ACTOR_LIMIT = 128;
const clone = value => JSON.parse(JSON.stringify(value));

async function rig() {
  const f = await fixture();
  const members = [['me','Me'], ['p2','P2'], ['p3','P3'], ['p4','P4']];
  // A genuine native Shooter birth supplies the current 36-column fidelity
  // envelope, including the projectile ID and owner-tick/sequence columns.
  const source = f.makeNetMatch(f.makeSession('p2', 'p2', members));
  const author = f.makeActor({ nid: 17, owner: 'p2', remote: false, roller: false });
  author.character.getMuzzle = out => out.copy(author.pos).setY(30);
  f.bind(source, [author]);
  f.projectiles.fireShooter(author, author.weapon, 0);
  const native = source.out.find(e => e[1] === 'p');
  assert.ok(native, 'the real shooter must author a projectile birth');
  assert.equal(native.length, 36, 'preserve the real production packet schema');
  assert.equal(native[4], 'shooter');
  f.projectiles.clear();
  source.dispose();

  const nm = f.makeNetMatch(f.makeSession('me', 'me', members));
  const actors = [
    ...[17,18,19].map(nid => f.makeActor({ nid, owner: 'p2', remote: true, roller: false })),
    ...[27,28,29].map(nid => f.makeActor({ nid, owner: 'p3', remote: true, roller: false })),
    ...[37,38,39].map(nid => f.makeActor({ nid, owner: 'p4', remote: true, roller: false })),
  ];
  f.G.match = f.bind(nm, actors);
  f.G.netm = nm;
  return { f, nm, actors, native, members };
}

function birth(template, nid, seq, ts = 1000, tick = 600) {
  const row = [...template];
  row[0] = ts;
  row[2] = nid;
  row[12] = 1; // legitimate, finite one-second lifetime, not issue #1264
  row[32] = seq; // unique projectile birth identity
  row[34] = tick;
  row[35] = seq; // owner-scoped event sequence
  return row;
}
function live(f, owner) {
  return f.projectiles.list.filter(p => p.ghost && (!owner || p.owner?.owner === owner));
}
function playback(r, from, nid, count, start = 1, ts = 1000, tick = 600) {
  const peer = r.nm._peer(from);
  peer.tr = ts; peer.sim = tick;
  for (let seq = start; seq < start + count; seq++) {
    const e = birth(r.native, nid, seq, ts, tick);
    e._netTick = tick; e._netSeq = seq;
    r.nm._play(from, e);
  }
}
test('#1311 ten full 256-row owner ticks cannot allocate 2560 active one-second ghost rounds', async () => {
  const r = await rig(), { f, nm } = r;
  f.clock.set(1000);
  let allocations = 0;
  const create = f.projectiles._new;
  f.projectiles._new = function (...args) { allocations++; return create.apply(this,args); };
  const seen = [];
  r.actors[0].character._netTrig = name => seen.push(name);
  for (let batch = 0; batch < 10; batch++) {
    const ts = 1000 + batch * .05, tick = 600 + batch * 3;
    f.clock.set(ts);
    const events = Array.from({length:256}, (_,i)=>birth(r.native, 17, batch*256 + i + 1, ts, tick));
    // This is the actual composed NetMatch ingress, not a replacement of _play.
    nm.onMessage('p2', { k:'t', ts, u:tick, r:2, e:events });
    const peer = nm._peer('p2');
    peer.tr = ts; peer.sim = tick;
    assert.doesNotThrow(() => nm._playEvents());
    assert.equal(peer.events.length, 0);
    assert.ok(live(f).length <= ACTOR_LIMIT, 'over-budget births reached the allocator');
  }
  assert.equal(live(f).length, ACTOR_LIMIT, 'active actor cap is enforced');
  assert.equal(allocations, ACTOR_LIMIT, 'skipped births must not call _new');
  const peer = nm._peer('p2');
  assert.equal(peer._lastProjectileId, 2560, 'visual drops must still retire birth identity');
  assert.equal(peer._lastEventSeq, 2560, 'later critical events must not be blocked by visual drops');

  // A later accepted sender event and a distinct normal peer still proceed.
  const ts = 1000.5, tick = 630;
  f.clock.set(ts);
  nm.onMessage('p2',{k:'t',ts,u:tick,r:2,e:[[ts,'tr',17,'jump',null,tick,2561]]});
  peer.tr=ts;peer.sim=tick;nm._playEvents();
  assert.deepEqual(seen,['jump']);
  playback(r,'p3',27,32);
  assert.equal(live(f,'p2').length,ACTOR_LIMIT);
  assert.equal(live(f,'p3').length,32,'flooding one peer must not starve other players');
});

test('#1311 independent actor, peer and global budgets are enforced before allocating new objects', async () => {
  const r=await rig(), { f, nm } = r;
  const counters = new Map();
  for (const [owner,nids] of [['p2',[17,18,19]],['p3',[27,28,29]],['p4',[37,38,39]]]) {
    let seq=1;
    for (const nid of nids) { playback(r,owner,nid,200,seq); seq+=200; }
    counters.set(owner,live(f,owner).length);
  }
  assert.deepEqual(Array.from(counters.values()),[PEER_LIMIT, PEER_LIMIT, GLOBAL_LIMIT-2*PEER_LIMIT]);
  assert.equal(live(f).length,GLOBAL_LIMIT);
  for (const nid of [17,18,19,27,28,29,37,38,39])
    assert.ok(f.projectiles.list.filter(p=>p.ghost&&p.owner?.nid===nid).length<=ACTOR_LIMIT);
  const count=live(f).length;
  playback(r,'p4',39,20,601);
  assert.equal(live(f).length,count,'the global budget must hold when a fourth burst arrives');

  // Native object pooling and match cleanup must not leave a detached counter
  // pinning the next match's legal projectile capacity.
  f.projectiles.clear();
  assert.equal(live(f).length,0);
  playback(r,'p2',17,6,601);
  assert.equal(live(f,'p2').length,6,'capacity is reusable immediately after clear');
  assert.ok(f.projectiles.pool.length>0,'normal projectile reuse is preserved');
});

test('#1311 terminal retirement and owner handoff release budget without affecting other peers', async () => {
  const r=await rig(), { f, nm } = r;
  playback(r,'p2',17,ACTOR_LIMIT);
  playback(r,'p3',27,12);
  assert.equal(live(f).length,ACTOR_LIMIT+12);
  const first=f.projectiles.list.find(p=>p.ghost&&p.owner?.nid===17);
  assert.ok(first);
  first._netEnded=true;
  first._netEndStep=first._netSteps;
  f.projectiles.update(1/60);
  assert.equal(live(f,'p2').length,ACTOR_LIMIT-1,'terminal retirement frees a live slot');
  playback(r,'p2',17,1,ACTOR_LIMIT+1);
  assert.equal(live(f,'p2').length,ACTOR_LIMIT,'released slot permits a new legitimate birth');

  nm.onLeave('p2',false);
  assert.equal(live(f,'p2').length,0,'departed sender visuals are retired');
  assert.equal(live(f,'p3').length,12,'other sender visuals survive handoff');
  playback(r,'p3',27,4,13);
  assert.equal(live(f,'p3').length,16,'another sender retains remaining capacity');
  nm.dispose();
});

test('#1311 normal native Roller group and scheduled Slosher birth bundles are below the guard', async () => {
  for (const weapon of ['roller','slosher']) {
    const f=await fixture(), members=[['me','Me'],['p2','P2']];
    const sender=f.makeNetMatch(f.makeSession('p2','p2',members));
    const source=f.makeActor({nid:17,owner:'p2',remote:false,roller:true});
    source.weapon=f.WEAPONS[weapon];
    source.character.getMuzzle=out=>out.copy(source.pos).add(new f.THREE.Vector3(0,1.05,.3));
    f.bind(sender,[source]);
    if(weapon==='roller')f.projectiles.fireFlick(source,source.weapon);
    else {
      f.projectiles.fireSlosh(source,source.weapon);
      for(let i=1;i<=13;i++) { f.G.time=i/60; f.clock.set(1000+i/60); f.projectiles.update(1/60); }
    }
    const births=clone(sender.out.filter(e=>e[1]==='p'));
    assert.ok(births.length>=3,weapon+' emitted no genuine units');
    assert.ok(births.length<ACTOR_LIMIT);
    f.projectiles.clear();sender.dispose();
    const nm=f.makeNetMatch(f.makeSession('me','me',members));
    const remote=f.makeActor({nid:17,owner:'p2',remote:true,roller:true});
    remote.weapon=f.WEAPONS[weapon];f.bind(nm,[remote]);
    nm._peer('p2').tr=1002;
    for (const e of births) {e._netTick=e.at(-2);e._netSeq=e.at(-1);nm._play('p2',e);}
    assert.equal(live(f).length,births.length,weapon+' native burst lost legitimate ghosts');
  }
});
