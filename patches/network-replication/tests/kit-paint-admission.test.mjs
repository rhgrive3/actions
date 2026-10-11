import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';
// Actual PaintSystem / NetMatch wire tests. Rendering and the socket are stubbed.

function paintLevel(THREE, size, origin) {
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

// The level is 40 units wide so a radius-10 footprint is never clipped by the face.
async function client(id, memberIds = ['a', 'b', 'c'], host = 'a') {
  const f = await fixture();
  const session = f.makeSession(id, host, memberIds.map((owner, i) => [owner, `P${i}`]));
  const nm = f.makeNetMatch(session, { id: 'fist-paint' });
  const actors = memberIds.map((owner, i) => f.makeActor({ nid: i, owner, remote: id !== owner, team: i % 2, roller: false }));
  f.G.match = f.bind(nm, actors);
  f.G.time = 12;
  f.G.paint = new f.PaintSystem(paintRenderer(f.THREE), paintLevel(f.THREE, 40, -20), { atlasSize: 1024, maxDensity: 30, cell: 0.25 });
  return { f, nm, session, actors, paint: f.G.paint };
}

function received(event) {
  const copy = JSON.parse(JSON.stringify(event));
  copy._netTick = event._netTick;
  copy._netSeq = event._netSeq;
  return copy;
}

function applyRemote(clientState, from, event) {
  clientState.nm._peer(from);
  clientState.nm._play(from, received(event));
}

import { kitBombExplosionPaint, resolveSubAtCharge, SUCTION, CURLING } from '../../splatoon3/runtime/kit-subs.mjs';

async function kitPair(id='suction',charge=0){
 const sender=await client('b'), observer=await client('c');
 for(const c of [sender,observer]){const a=c.actors[1];a.weapon={...a.weapon,sub:id};a.netLife=0;if(a.net)a.net.lastLife=0;}
 const owner=sender.actors[1],spec=id==='suction'?SUCTION:CURLING;
 const b={owner,kind:'bomb',team:1,pos:new sender.f.THREE.Vector3(0,.21,0),vel:new sender.f.THREE.Vector3(),s3Sub:spec,s3Charge:charge,s3Resolved:resolveSubAtCharge(spec,charge)};
 sender.nm.recBomb(b);assert.ok(Array.isArray(b.s3PaintBirth),'real recBomb attaches causal paint identity');
 kitBombExplosionPaint({},b,sender.paint);
 return {sender,observer,b,rows:sender.nm.out.map(received)};
}
function gridsEqual(a,b){assert.deepEqual(Array.from(a.paint.grid),Array.from(b.paint.grid));assert.deepEqual(Array.from(a.paint.counts),Array.from(b.paint.counts));}
test('causal kit core preserves exact Suction and Curling paint, no stamp split',async()=>{
 for(const [id,charge] of [['suction',0],['curling',0],['curling',.5],['curling',1]]){
  const {sender,observer,rows}=await kitPair(id,charge);
  for(const row of rows)applyRemote(observer,'b',row);gridsEqual(sender,observer);
 }
});
test('core-before-birth buffers following satellites and flushes in causal sender order',async()=>{
 const {sender,observer,rows}=await kitPair();
 for(const row of rows.slice(1))applyRemote(observer,'b',row);
 assert.equal(observer.nm._peer('b')._lastEventSeq??0,0);assert.ok(observer.paint.grid.every(x=>x===0));
 applyRemote(observer,'b',rows[0]);gridsEqual(sender,observer);
});
test('malformed and unknown birth/core claims do not acquire a wider paint permit',async()=>{
 for(const kind of ['owner','life','match','charge','kit','tag','radius','shape','before','birth-missing']){
  const {observer,rows}=await kitPair('curling',1),birth=rows[0],core=rows[1];
  if(kind==='owner')core[15][2]=0;
  if(kind==='life')core[15][3]++;
  if(kind==='match')core[15][1]='other-match';
  if(kind==='charge')birth[12]=1.01;
  if(kind==='kit')birth[11]='suction';
  if(kind==='tag')core[15][0]='invented';
  if(kind==='radius')core[5]=5.01;
  if(kind==='shape')core[9]=1;
  if(kind==='before')core._netSeq=birth._netSeq;
  if(kind!=='birth-missing')applyRemote(observer,'b',birth);
  applyRemote(observer,'b',core);
  assert.ok(observer.paint.grid.every(x=>x===0),kind);
 }
});
test('one core per birth, duplicate sequences and another owner cannot replay the capability',async()=>{
 const {observer,rows}=await kitPair();for(const row of rows)applyRemote(observer,'b',row);
 const before=Array.from(observer.paint.grid),growth=observer.paint.growing.length;
 const forged=received(rows[1]);forged._netSeq=rows.at(-1)._netSeq+1;forged[2]=12;
 applyRemote(observer,'b',forged);applyRemote(observer,'a',forged);for(const row of rows)applyRemote(observer,'b',row);
 assert.deepEqual(Array.from(observer.paint.grid),before);assert.equal(observer.paint.growing.length,growth);
});
test('match and ownership boundaries retire outstanding kit core capabilities',async()=>{
 for(const change of ['match','owner']){
  const {observer,rows}=await kitPair();applyRemote(observer,'b',rows[0]);
  if(change==='match')observer.nm.cfg.id='next';
  if(change==='owner')observer.actors[1].owner='a';
  applyRemote(observer,'b',rows[1]);assert.ok(observer.paint.grid.every(x=>x===0),change);
 }
});
test('tagless legacy radius cap remains intact even for a kit-equipped sender',async()=>{
 const {observer,rows}=await kitPair();applyRemote(observer,'b',rows[0]);const e=rows[1];e[15]=null;
 applyRemote(observer,'b',e);assert.ok(observer.paint.grid.every(x=>x===0));
});
function packet(c,rows,ts=1000){c.nm._tick('b',{k:'t',r:2,ts,u:720,a:[],e:rows.map(e=>Array.isArray(e)?received(e):e)});}
function drain(c){const p=c.nm._peer('b');for(const e of p.events.splice(0))c.nm._play('b',e);}
test('real tick receive normalizes reverse row order and delayed older birth envelopes',async()=>{
 for(const kind of ['reverse-array','later-envelope','older-envelope']){
  const {sender,observer,rows}=await kitPair();
  if(kind==='reverse-array')packet(observer,[...rows].reverse());
  else {packet(observer,rows.slice(1),1000.1);drain(observer);packet(observer,[rows[0]],kind==='older-envelope'?1000:1000.2);}
  drain(observer);gridsEqual(sender,observer);
 }
});
test('missing birth expires closed and no longer blocks subsequent unrelated paint',async()=>{
 const {observer,rows}=await kitPair();packet(observer,[rows[1]],1000);
 observer.f.clock.advance(3);packet(observer,[],1000.1);drain(observer);
 assert.ok(observer.paint.grid.every(x=>x===0));
 const ordinary=received(rows[2]);ordinary[2]=0;ordinary[4]=0;
 packet(observer,[ordinary],1000.2);drain(observer);assert.ok(observer.paint.grid.some(x=>x!==0));
});
test('old sequence cannot register a new capability after later events were accepted',async()=>{
 const {observer,rows}=await kitPair();applyRemote(observer,'b',rows[2]);
 const prior=Array.from(observer.paint.grid);applyRemote(observer,'b',rows[0]);
 const core=received(rows[1]);core._netSeq=rows.at(-1)._netSeq+1;
 applyRemote(observer,'b',core);assert.deepEqual(Array.from(observer.paint.grid),prior);
});

test('accepted flying bomb keeps its single explosion permit after owner death and respawn',async()=>{
 const {sender,observer,rows}=await kitPair();applyRemote(observer,'b',rows[0]);
 observer.actors[1].alive=false;observer.actors[1].netLife=1;observer.actors[1].net.lastLife=1;
 for(const row of rows.slice(1))applyRemote(observer,'b',row);gridsEqual(sender,observer);
});
test('unreceived old-life birth cannot be authorized retroactively in a new life',async()=>{
 const {observer,rows}=await kitPair();observer.actors[1].netLife=1;observer.actors[1].net.lastLife=1;
 applyRemote(observer,'b',rows[0]);applyRemote(observer,'b',rows[1]);assert.ok(observer.paint.grid.every(x=>x===0));
});
test('bounded missing-birth queue cannot silently discard unrelated later paints',async()=>{
 const {observer,rows}=await kitPair(),events=[rows[1]];
 for(let i=0;i<270;i++){const e=received(rows[2]);e._netSeq=3+i;e[e.length-1]=e._netSeq;events.push(e);}
 packet(observer,events);drain(observer);
 assert.ok(observer.paint.grid.some(x=>x!==0),'ordinary satellites remain admitted on capacity failure');
 assert.ok(observer.paint.growing.every(g=>g.R<3.744),'unproven core stays rejected');
});
test('completed capabilities are reclaimed before normal repeated throws hit the bounded ledger',async()=>{
 const {sender,observer,b}=await kitPair();
 for(let i=0;i<135;i++){
  sender.nm.out=[];sender.nm.recBomb(b);kitBombExplosionPaint({},b,sender.paint);
  const rows=sender.nm.out.map(received);for(const e of rows)applyRemote(observer,'b',e);
  assert.equal(observer.nm._peer('b')._lastEventSeq,rows.at(-1)._netSeq,`throw ${i}`);
 }
 gridsEqual(sender,observer);
});
test('malformed event entries cannot throw before ordinary receive admission skips them',async()=>{
 const {sender,observer,rows}=await kitPair();
 assert.doesNotThrow(()=>packet(observer,[null,undefined,{},7,'bad',...rows]));
 drain(observer);gridsEqual(sender,observer);
});

test('birth first arriving after timeout cannot revive an expired core in new or old envelopes',async()=>{
 for(const delayedTimestamp of [1000,1000.2]){
  const {observer,rows}=await kitPair();packet(observer,[rows[1]],1000.1);
  observer.f.clock.advance(3);packet(observer,[rows[0]],delayedTimestamp);drain(observer);
  assert.ok(observer.paint.grid.every(x=>x===0));
  packet(observer,[rows[1]],1000.3);drain(observer);assert.ok(observer.paint.grid.every(x=>x===0),'retry cannot resurrect timed-out proof');
 }
});
test('one sender exhausting unspent birth slots cannot deny another sender its legitimate core',async()=>{
 const {sender,observer,b}=await kitPair();
 for(let i=0;i<128;i++){sender.nm.out=[];sender.nm.recBomb(b);applyRemote(observer,'b',sender.nm.out[0]);}
 const other=await client('a');other.actors[0].weapon={...other.actors[0].weapon,sub:'suction'};
 observer.actors[0].weapon={...observer.actors[0].weapon,sub:'suction'};
 const owned={...b,owner:other.actors[0],team:0,pos:new other.f.THREE.Vector3(0,.21,0),vel:new other.f.THREE.Vector3()};
 other.nm.recBomb(owned);kitBombExplosionPaint({},owned,other.paint);
 for(const e of other.nm.out)applyRemote(observer,'a',e);gridsEqual(other,observer);
});
test('older-envelope recovered core remains eligible for host deadline commit before timeline playback',async()=>{
 const {sender,rows}=await kitPair();const observer=await client('a');
 observer.actors[1].weapon={...observer.actors[1].weapon,sub:'suction'};
 packet(observer,rows.slice(1),1000.1);packet(observer,[rows[0]],1000);
 assert.ok(observer.nm.commitDeadlinePaint()>0);gridsEqual(sender,observer);
 const counts=Array.from(observer.paint.counts);drain(observer);assert.deepEqual(Array.from(observer.paint.counts),counts);
});
