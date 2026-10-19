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
  const f = await fixture({ includeSession: true, built: process.env.INKWAVE_BUILT_SITE || null });
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'canonical-paint' });
  // Browser WebSocket JSON is parsed in the receiving realm.
  const incoming=nm.onMessage;nm.onMessage=function(from,data){const d=f.parseWire(JSON.stringify(data));return incoming.call(this,from,d);};
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
 for(let i=0;i<24;i++)for(const [c,team]of [[a,0],[b,1]])c.paint.splat(new c.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.42,team,{seed:team?.73:.31,claimOwner:c.actors.find(actor=>actor.owner===c.session.myId&&actor.team===team)});
 const ar=json(a.nm.out),br=json(b.nm.out);assert.ok(encodePaintEvents(ar));assert.ok(encodePaintEvents(br));
 for(const [from,rows]of [['b',br],['a',ar],['a',ar],['b',br]]){
  apply(raw,from,json(rows));apply(packed,from,decodePaintEvents(json(encodePaintEvents(rows))));assert.deepEqual(state(packed),state(raw));
 }
 const forged=json(ar);for(const r of forged)r[6]=1;
 const before=state(packed);apply(packed,'a',decodePaintEvents(json(encodePaintEvents(forged))));assert.deepEqual(state(packed),before,'codec does not authorize forged owner team');
});
function connect(a,b){const clients={a,c:b},queue=[],controls=[],ticks=[];
 for(const [from,c]of Object.entries(clients))c.session.tr={sendTo:(to,d)=>{queue.push([from,to,json(d)]);controls.push([from,to,json(d)]);return true;},broadcast:d=>{ticks.push([from,json(d)]);}};
 const flush=()=>{let guard=30;while(queue.length){assert.ok(guard-->0);const [from,to,d]=queue.shift();if(clients[to])clients[to].f.NetSession.prototype._message.call({match:clients[to].nm},from,d);}};
 a.nm._sendTick();b.nm._sendTick();flush();return{queue,controls,ticks,flush};}
function stamps(a){for(let i=0;i<24;i++)a.paint.splat(new a.f.THREE.Vector3(.4+(i%4)*.35,0,.4+Math.floor(i/4)*.2),.3,0,{seed:.31,kind:'drop',claimOwner:a.actors.find(actor=>actor.owner===a.session.myId)});}
test('actual NetMatch JSON hello/ack and compressed tick retain canonical paint and score',async()=>{
 const a=await client('a',['a','c']),packed=await client('c',['a','c']),raw=await client('c',['a','c']);const wire=connect(a,packed);assert.equal(wire.controls.length,4);stamps(a);const rows=json(a.nm.out);a.nm._sendTick();const outbound=wire.ticks.at(-1)[1];assert.ok(outbound.pe);assert.equal(outbound.pc,undefined);assert.deepEqual(decodePaintEvents(outbound.pe),rows);
 const legacy={...outbound,e:rows};delete legacy.pe;delete legacy.pn;
 for(const [c,t]of [[raw,legacy],[packed,outbound]]){c.nm.onMessage('a',t);c.nm._peer('a').tr=t.ts;c.nm._playEvents();}
 assert.deepEqual(state(packed),state(raw));const before=state(packed);packed.nm.onMessage('a',outbound);packed.nm._playEvents();assert.deepEqual(state(packed),before);packed.nm.onMessage('stranger',outbound);packed.nm._playEvents();assert.deepEqual(state(packed),before);
 for(let i=0;i<80;i++)a.nm._sendTick();assert.equal(wire.controls.length,4,'no repeated capability advertisements');assert.equal(wire.ticks.at(-1)[1].pc,undefined);
});
test('membership changes revoke compression until fresh actual JSON acknowledgement',async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']);const wire=connect(a,c);stamps(a);const rows=json(a.nm.out);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].pe);
 a.session._members.set('old','old peer');a.nm.out=json(rows);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].e);wire.flush();assert.equal(wire.ticks.at(-1)[1].pe,undefined);
 a.session._members.delete('old');a.nm.out=json(rows);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].pe,'unchanged existing peer remains negotiated');
 a.session.hostId='c';a.nm.out=json(rows);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].pe,'host role alone does not reset membership');
});
for(const hostChanged of [false,true])test(`same-id relay rejoin requires new nonce ack, hostChanged=${hostChanged}`,async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']);const wire=connect(a,c),oldAck=wire.controls.find(x=>x[0]==='c'&&x[2].a)[2];stamps(a);const rows=json(a.nm.out);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].pe);
 a.session._members.delete('c');a.nm.onLeave('c',hostChanged);a.session._members.set('c','Legacy rejoin');a.nm.out=json(rows);a.nm._sendTick();assert.equal(wire.ticks.at(-1)[1].pe,undefined);
 a.nm.onMessage('c',oldAck);a.nm.out=json(rows);a.nm._sendTick();assert.equal(wire.ticks.at(-1)[1].pe,undefined,'old ack cannot restore new membership epoch');
 wire.flush();a.nm.out=json(rows);a.nm._sendTick();assert.ok(wire.ticks.at(-1)[1].pe);
});

for(const transition of ['join','leave'])test(`actual Session ${transition} of third peer preserves already-sent paint`,async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']),raw=await client('c',['a','c']);const wire=connect(a,c);stamps(a);a.nm._sendTick();const delayed=wire.ticks.at(-1)[1];assert.ok(delayed.pe);
 const session=c.session;Object.assign(session,{match:c.nm,lobby:{players:[]},_pushLobby(){},_emit(){}});
 c.f.NetSession.prototype._control.call(session,{t:'join',m:{id:'third',name:'Third'}});
 c.nm._sendTick(); // force membership sync before the in-flight packet arrives
 if(transition==='leave'){c.f.NetSession.prototype._control.call(session,{t:'leave',id:'third',host:'a'});c.nm._sendTick();}
 const legacy={...delayed,e:decodePaintEvents(delayed.pe)};delete legacy.pe;delete legacy.pn;
 for(const [x,d]of [[raw,legacy],[c,delayed]]){x.f.NetSession.prototype._message.call({match:x.nm},'a',json(d));x.nm._peer('a').tr=d.ts;x.nm._playEvents();}
 assert.deepEqual(state(c),state(raw));assert.ok(c.paint.counts[0]>0,'in-flight paint was actually admitted');
});
test('actual Session same-id departure and rejoin reject old in-flight paint',async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']);const wire=connect(a,c);stamps(a);a.nm._sendTick();const delayed=wire.ticks.at(-1)[1];assert.ok(delayed.pe);
 const session=c.session;Object.assign(session,{match:c.nm,lobby:{players:[]},_pushLobby(){},_emit(){}});
 c.f.NetSession.prototype._control.call(session,{t:'leave',id:'a',host:'c'});c.f.NetSession.prototype._control.call(session,{t:'join',m:{id:'a',name:'New incarnation'}});
 const before=state(c);c.f.NetSession.prototype._message.call({match:c.nm},'a',json(delayed));c.nm._playEvents();assert.deepEqual(state(c),before);
});
test('same-id reconnect creates a new NetMatch generation and old paint remains rejected after fresh negotiation',async()=>{
 const a=await client('a',['a','c']),c=await client('c',['a','c']);const first=connect(a,c);stamps(a);a.nm._sendTick();const old=first.ticks.at(-1)[1];assert.ok(old.pe);
 const session=c.session;Object.assign(session,{match:c.nm,lobby:{players:[]},_pushLobby(){},_emit(){}});
 c.f.NetSession.prototype._control.call(session,{t:'leave',id:'a',host:'c'});c.f.NetSession.prototype._control.call(session,{t:'join',m:{id:'a',name:'New incarnation'}});
 // Real _connect calls leave(true), and _begin always constructs new NetMatch.
 const renewed=await client('a',['a','c']);const next=connect(renewed,c);stamps(renewed);renewed.nm._sendTick();const fresh=next.ticks.at(-1)[1];assert.ok(fresh.pe);assert.notEqual(fresh.pn,old.pn);
 let admitted=0;const tick=c.nm._tick;c.nm._tick=function(...args){admitted++;return tick.apply(this,args);};
 c.f.NetSession.prototype._message.call({match:c.nm},'a',json(old));assert.equal(admitted,0,'old generation never reaches normal owner admission');
 c.f.NetSession.prototype._message.call({match:c.nm},'a',json(fresh));assert.equal(admitted,1,'new generation still goes through unchanged owner admission');
});
