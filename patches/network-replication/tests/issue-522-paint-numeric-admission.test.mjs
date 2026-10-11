import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

function paintLevel(THREE, size = 2, origin = 0) {
  const face = {
    paintable: true, su: size, sv: size, turf: true, wall: false, block: null,
    origin: new THREE.Vector3(origin, 0, origin),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), n: new THREE.Vector3(0, 1, 0),
  };
  const block = {
    aabbMin: new THREE.Vector3(origin, -0.1, origin), aabbMax: new THREE.Vector3(origin + size, 0.1, origin + size),
    faces: [0, -1, -1, -1, -1, -1],
  };
  face.block = block;
  return { faces: [face], blocks: [block], pointInside: () => false, queryBlocks: () => [0] };
}

function paintRenderer(THREE) {
  let target = null, clear = new THREE.Color(), alpha = 1;
  return {
    capabilities: { getMaxAnisotropy: () => 1 },
    getRenderTarget: () => target,
    setRenderTarget: value => { target = value; },
    getClearColor: out => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (value, opacity) => { if (value?.isColor) clear.copy(value); alpha = opacity; },
    clear() {}, render() {},
  };
}

async function client(id, memberIds = ['a', 'b', 'c'], host = 'a', large = false) {
  const f = await fixture();
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'canonical-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, large ? 20 : 2, large ? -10 : 0), { atlasSize: large ? 1024 : 128, maxDensity: large ? 30 : 8, cell: 0.25 });
  const paint = f.G.paint, pushQuad = paint._pushQuad.bind(paint), emitGrowth = paint._emitGrowth.bind(paint);
  paint._testQuadRecords = [];
  paint._emitGrowth = (growth, ...args) => {
    paint._testCurrentOrder = growth.netOrderId;
    try { return emitGrowth(growth, ...args); } finally { paint._testCurrentOrder = 0; }
  };
  paint._pushQuad = (face, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly) => {
    if (!large) paint._testQuadRecords.push([paint._testCurrentOrder, face.atlas.x, face.atlas.y, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly]);
    return pushQuad(face, u0, u1, v0, v1, lu, lv, dn, radius, team, seed, kind, sdu, sdv, sa, tn, dT, dripOnly);
  };
  return { f, nm, session, actors, paint: f.G.paint };
}

function received(event) {
  const copy = JSON.parse(JSON.stringify(event));
  if (Number.isSafeInteger(event._netTick) && Number.isSafeInteger(event._netSeq)) {
    copy._netTick = event._netTick;
    copy._netSeq = event._netSeq;
  } else if (copy.length >= 15) {
    copy._netTick = copy[copy.length - 2];
    copy._netSeq = copy[copy.length - 1];
  }
  return copy;
}

function applyRemote(clientState, from, event) {
  clientState.nm._peer(from);
  clientState.nm._play(from, received(event));
}


test('#522 malformed finite paint values cannot reserve clocks, mutate CPU turf or enter GPU attributes', async()=>{
  const sender=await client('a'), observer=await client('c');
  sender.paint.splat(new sender.f.THREE.Vector3(1,0,1),.42,0,{seed:.31});
  const valid=sender.nm.out[0], peer=observer.nm._peer('a');
  const beforeGrid=Array.from(observer.paint.grid),beforeCounts=Array.from(observer.paint.counts);
  const malformed=[
    [2,1e308],[3,-1e308],[4,1e308],[5,1e308],[7,1e308],
    [9,1e308],[10,-1e308],[11,1e308],[12,1e308],
    [2,1e20],[5,1e20],[7,1e38],[7,3.40282355e38/73],[7,3e36],[12,1e20],[5,1e-308],
    [8,'__proto__'],[8,'constructor'],[8,'toString'],[8,{}],
    [13,1.5],[13,-2],[13,null],[13,'0'],[13,{}],[13,1e308],
  ];
  for(const [index,value] of malformed){
    const event=received(valid);event[index]=value;
    // Keep a nonzero stretch direction so scalar-overflow rows exercise it.
    if(index===12)event[9]=1;
    observer.nm._play('a',event);
    assert.equal(peer._lastEventSeq??0,0,`field ${index} must not reserve sender sequence`);
    assert.equal(observer.nm._paintClockState.clock,0,`field ${index} must not advance causal time`);
    assert.equal(observer.nm._paintClockState.applied.size,0,`field ${index} must not reserve paint receipt`);
    assert.deepEqual(Array.from(observer.paint.grid),beforeGrid,`field ${index} must not paint CPU turf`);
    assert.deepEqual(Array.from(observer.paint.counts),beforeCounts);
    assert.equal(observer.paint.growing.length,0,`field ${index} must not queue GPU growth`);
  }
  applyRemote(observer,'a',valid);
  assert.deepEqual(Array.from(observer.paint.grid),Array.from(sender.paint.grid));
  assert.ok(observer.paint.growing.length>0);
  for(const growth of observer.paint.growing)observer.paint._emitGrowth(growth,3,1,false);
  for(const name of ['aLocal','aSplat','aStretch','aGrow'])
    assert.ok(Array.from(observer.paint[name]).every(Number.isFinite),name+' remains finite');
});

test('#522 deadline direct-commit boundary also rejects malformed finite paint',async()=>{
  const observer=await client('a');
  const event=[0,'s',1,0,1,.42,1,1e308,0,0,0,0,0];
  event._netPeer='b';event._netTick=1;event._netSeq=1;
  assert.equal(observer.nm._applyRemoteSplatEvent(event),false);
  assert.equal(observer.nm._paintClockState.applied.size,0);
  assert.equal(observer.paint.growing.length,0);
  assert.equal(observer.paint.grid.some(value=>value!==0),false);
});


test('#522 valid built-in paint kinds and same-sequence corrected payload stay compatible',async()=>{
  const sender=await client('a'), observer=await client('c');
  for(const kind of ['shot','line','blast','bomb','trail','drop','roll','rollFloor','speck']){
    sender.paint.splat(new sender.f.THREE.Vector3(1,0,1),.42,0,
      {seed:.31,kind,face:0,stretch:new sender.f.THREE.Vector3(1,0,0),stretchAmt:.7});
    const event=sender.nm.out.at(-1),peer=observer.nm._peer('a'),before=peer._lastEventSeq??0;
    const bad=received(event);bad[8]='__proto__';observer.nm._play('a',bad);
    assert.equal(peer._lastEventSeq??0,before);
    applyRemote(observer,'a',event);
    assert.equal(peer._lastEventSeq,event._netSeq,kind+' is accepted');
  }
  assert.deepEqual(Array.from(observer.paint.grid),Array.from(sender.paint.grid));
});


test('#522 legacy optional stretch uses the renderer default and rejects incomplete direction groups',async()=>{
  const observer=await client('a'),peer=observer.nm._peer('b');
  // Peer 'b' owns team 1 in this fixture, so its own-team rows paint team 1.
  const base=[0,'s',1,0,1,.42,1,.31,0,3e38,0,3e38];
  for(const event of [base,[...base.slice(0,9),1], [...base.slice(0,9),1,undefined,1]]){
    event._netTick=1;event._netSeq=1;
    observer.nm._play('b',event);
    assert.equal(peer._lastEventSeq??0,0);
    assert.equal(observer.paint.growing.length,0);
    assert.equal(observer.paint.grid.some(value=>value!==0),false);
  }
  const valid=[0,'s',1,0,1,.42,1,.31,0,1,0,0];valid._netTick=1;valid._netSeq=1;
  observer.nm._play('b',valid);
  assert.equal(peer._lastEventSeq,1,'safe legacy omitted amount stays supported');
  assert.ok(observer.paint.growing.length>0);
  for(const g of observer.paint.growing)observer.paint._emitGrowth(g,3,1,false);
  assert.ok(Array.from(observer.paint.aStretch).every(Number.isFinite));
});

// Sends one locally recorded splat from `from` (a malicious or honest client) and reports whether
// a fresh observer admits it. Admission is the only observable: rejected rows reserve no sequence.
async function admits(from, radius, team, opts = {}) {
  const sender = await client(from);
  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1), radius, team, { seed: 0.31, ...opts });
  const event = sender.nm.out.at(-1);
  const observer = await client('c');
  const peer = observer.nm._peer(from);
  observer.nm._play(from, received(event));
  return peer._lastEventSeq === event._netSeq;
}

test('#522 radius ceiling admits the largest legitimate splat and rejects anything larger', async () => {
  const sender = await client('b'), observer = await client('c');
  const slam = 5.2 * 0.72; // SPECIALS.slam.radius * actor.js _slamImpact factor: the largest producer
  sender.paint.splat(new sender.f.THREE.Vector3(1, 0, 1), slam, 1, { seed: 0.31 });
  const valid = sender.nm.out.at(-1), peer = observer.nm._peer('b');
  const beforeGrid = Array.from(observer.paint.grid);
  for (const radius of [slam * 1.001, 3.745, 4.999, 5.001, 1e3, 1e20]) {
    const forged = received(valid);
    forged[5] = radius;
    observer.nm._play('b', forged);
    assert.equal(peer._lastEventSeq ?? 0, 0, `radius ${radius} must not reserve sender sequence`);
    assert.equal(observer.paint.growing.length, 0, `radius ${radius} must not queue GPU growth`);
    assert.deepEqual(Array.from(observer.paint.grid), beforeGrid, `radius ${radius} must not paint CPU turf`);
  }
  applyRemote(observer, 'b', valid);
  assert.equal(peer._lastEventSeq, valid._netSeq, 'the largest legitimate radius is admitted');
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(sender.paint.grid));
});

test('#522 team ownership: own-team rows pass; foreign rows pass only with the exact victim-burst signature', async () => {
  const { THREE } = await fixture();
  assert.equal(await admits('b', 0.42, 1), true, 'own-team paint from b is admitted');
  assert.equal(await admits('b', 0.42, 0), false, 'a foreign-team ordinary row from b is rejected');
  // splatoon3/runtime/death-blast.mjs: SplPlayer DieBlastParam PaintRadius 5.0 + SplashAroundParam PaintRadius 1.0.
  assert.equal(await admits('b', 5, 0), true, 'a victim death blast paints the attacker team (DieBlastParam.PaintRadius)');
  assert.equal(await admits('b', 1, 0), true, 'a victim death-blast droplet paints the attacker team (SplashAroundParam.PaintRadius)');
  assert.equal(await admits('b', 1.7, 0), false, 'the replaced native radius-1.7 burst is no longer a producer');
  for (const radius of [5, 1]) {
    assert.equal(await admits('b', radius, 0, { kind: 'shot' }), false, `a foreign ${radius} burst carrying a kind is rejected`);
    assert.equal(await admits('b', radius, 0, { face: 0 }), false, `a foreign ${radius} burst restricted to a face is rejected`);
    assert.equal(await admits('b', radius, 0, { stretch: new THREE.Vector3(1, 0, 0), stretchAmt: 1 }), false, `a foreign stretched ${radius} burst is rejected`);
  }
  assert.equal(await admits('b', 5, 1, { kind: 'shot' }), false, 'only the plain death-blast signature may exceed the ordinary ceiling');
  assert.equal(await admits('c', 0.42, 1), false, 'a team-0 member cannot paint team 1 at ordinary radius');
  assert.equal(await admits('a', 0.42, 1), true, 'host-owned Boss ink may paint the other team');
});

test('#522 every legitimate paint producer passes the ceiling and team admission', async () => {
  const producers = [
    ['Tidal Slam centre', 'b', 5.2 * 0.72, 1, {}],
    ['Splat Bomb centre (SUB.bomb.paintRadius)', 'b', 2.7, 1, {}],
    ['Boss hazard (host, 2.8)', 'a', 2.8, 1, {}],
    ['Ink flight widthNear (2.226)', 'b', 2.226, 1, { kind: 'shot' }],
    ['Blaster impact at 1.15 jitter (1.5 * 1.15)', 'b', 1.5 * 1.15, 1, {}],
    ['Tidal Slam scatter (1.1 + 0.6)', 'b', 1.7, 1, {}],
    ['Victim death blast (attacker team, DieBlastParam.PaintRadius)', 'b', 5, 0, {}],
    ['Victim death-blast droplet (attacker team, SplashAroundParam.PaintRadius)', 'b', 1, 0, {}],
    ['Triple Splashdown fist stamp (#912, FIST_STAMP_RADIUS)', 'b', 3.74, 1, {}],
  ];
  for (const [name, from, radius, team, opts] of producers) assert.equal(await admits(from, radius, team, opts), true, `${name} still admitted`);
  assert.equal(await admits('b', 3.745, 1), false, 'a radius just above the ceiling is rejected');
});
