import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {encodePaintEvents,decodePaintEvents,PaintPacketNegotiation,PAINT_PACKET_CODEC_VERSION as V} from '../../splatoon3/runtime/paint-packet-codec.mjs';
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

function json(v){return JSON.parse(JSON.stringify(v));}
function apply(c,from,rows){for(const row of rows){row._netTick=row.at(-2);row._netSeq=row.at(-1);c.nm._peer(from);c.nm._play(from,row);}}
function state(c){return {grid:Array.from(c.paint.grid),counts:Array.from(c.paint.counts),coverage:Array.from(c.paint.coverage()),stats:c.actors.map(a=>a.stats)};}
test('lossless JSON dictionary keeps real canonical paint ownership under delay, ties and duplicate replay',async()=>{
 const a=await client('a'),b=await client('b'),raw=await client('c'),packed=await client('c');
 for(let i=0;i<24;i++)for(const [c,team]of [[a,0],[b,1]])c.paint.splat(new c.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.42,team,{seed:team?.73:.31});
 const ar=json(a.nm.out),br=json(b.nm.out);assert.ok(encodePaintEvents(ar));assert.ok(encodePaintEvents(br));
 for(const [from,rows]of [['b',br],['a',ar],['a',ar],['b',br]]){
  apply(raw,from,json(rows));apply(packed,from,decodePaintEvents(json(encodePaintEvents(rows))));assert.deepEqual(state(packed),state(raw));
 }
 const forged=json(ar);for(const r of forged)r[6]=1;
 const before=state(packed);apply(packed,'a',decodePaintEvents(json(encodePaintEvents(forged))));assert.deepEqual(state(packed),before,'codec does not authorize forged owner team');
});
test('actual NetMatch tick JSON carries negotiated rows without duplicate score or sender reassignment',async()=>{
 const a=await client('a'),raw=await client('c'),packed=await client('c');let tick;
 a.session.tr={broadcast:d=>{tick=json(d);}};
 for(let i=0;i<24;i++)a.paint.splat(new a.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.3,0,{seed:.31});
 a.nm._sendTick();assert.ok(tick?.e?.length);const n=new PaintPacketNegotiation();n.sync('canonical-paint','a',['a','c']);n.observe('c',[V,'canonical-paint']);const wire=json(n.packTick(tick));assert.ok(wire.pe);
 const r=new PaintPacketNegotiation();r.sync('canonical-paint','c',['a','c']);const decoded=r.acceptTick('a',wire);assert.deepEqual(decoded.e,tick.e);
 for(const [c,t]of [[raw,tick],[packed,decoded]]){c.nm.onMessage('a',t);c.nm._peer('a').tr=t.ts;c.nm._playEvents();}
 assert.deepEqual(state(packed),state(raw));const before=state(packed);packed.nm.onMessage('a',decoded);packed.nm._playEvents();assert.deepEqual(state(packed),before);
 assert.equal(r.acceptTick('stranger',wire),null);
});
test('installed transport negotiates actual relay membership and keeps all sidecars',async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']);let outbound;
 a.session.tr={broadcast:d=>{outbound=json(d);}};
 a.nm.onMessage('c',{k:'t',ts:0,a:[],pc:[V,'canonical-paint']});
 for(let i=0;i<24;i++)a.paint.splat(new a.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.3,0,{seed:.31});
 const rows=json(a.nm.out);a.nm._sendTick();assert.ok(outbound.pe,'production _sendTick encodes after handshake');assert.equal(outbound.e,undefined);
 assert.deepEqual(decodePaintEvents(outbound.pe),rows);
 const raw=await client('c',['a','c']);
 // Legacy receiver comparison excludes compressed property entirely.
 const legacy={...outbound,e:rows};delete legacy.pe;raw.nm.onMessage('a',legacy);
 c.nm.onMessage('a',outbound);for(const x of [raw,c]){x.nm._peer('a').tr=outbound.ts;x.nm._playEvents();}assert.deepEqual(state(c),state(raw));
 a.session._members.set('old','old peer');a.nm.out=rows;a.nm._sendTick();assert.ok(outbound.e);assert.equal(outbound.pe,undefined,'new unknown peer forces legacy');
 a.session._members.delete('old');a.nm.out=rows;a.nm._sendTick();assert.ok(outbound.pe);
 a.session.hostId='c';a.nm.out=rows;a.nm._sendTick();assert.ok(outbound.pe,'host role alone does not reset authenticated membership');
 const before=state(c);c.nm.onMessage('stranger',outbound);c.nm._playEvents();assert.deepEqual(state(c),before);
});
for(const hostChanged of [false,true])test(`same-id relay rejoin forgets capability before next sync, hostChanged=${hostChanged}`,async()=>{
 const a=await client('a',['a','c']);let outbound;a.session.tr={broadcast:d=>{outbound=json(d);},sendTo(){}};
 a.nm.onMessage('c',{k:'t',ts:0,a:[],pc:[V,'canonical-paint']});
 for(let i=0;i<24;i++)a.paint.splat(new a.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.3,0,{seed:.31});
 const rows=json(a.nm.out);a.nm._sendTick();assert.ok(outbound.pe);
 // Relay leave and same-id join both occur between two sends: a set comparison
 // alone cannot see the incarnation change. Actual onLeave must retire support.
 a.session._members.delete('c');a.nm.onLeave('c',hostChanged);a.session._members.set('c','Legacy rejoin');
 a.nm.out=json(rows);a.nm._sendTick();assert.ok(outbound.e);assert.equal(outbound.pe,undefined);
 a.nm.onMessage('c',{k:'t',ts:1,a:[]});a.nm.out=json(rows);a.nm._sendTick();assert.equal(outbound.pe,undefined);
 a.nm.onMessage('c',{k:'t',ts:2,a:[],pc:[V,'canonical-paint']});a.nm.out=json(rows);a.nm._sendTick();assert.ok(outbound.pe);
});
