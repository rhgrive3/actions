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
test('unpainted completed births must not permanently deny later legitimate cores',async()=>{
 const {sender,observer,b}=await kitPair();
 // Native bombs removed in water emit their birth but no explosion paint.
 for(let i=0;i<128;i++){sender.nm.out=[];sender.nm.recBomb(b);applyRemote(observer,'b',sender.nm.out[0]);sender.f.clock.advance(3);observer.f.clock.advance(3);}
 sender.nm.out=[];sender.nm.recBomb(b);kitBombExplosionPaint({},b,sender.paint);
 for(const row of sender.nm.out)applyRemote(observer,'b',row);
 gridsEqual(sender,observer);
});
test('native water retirements leave room for a later normal core',async()=>{
 const sender=await client('b'),observer=await client('c');
 for(const c of [sender,observer]){c.nm.match.duration=c.nm.match.time=600;c.f.SUB.suction=SUCTION;const a=c.actors[1];a.weapon={...a.weapon,sub:'suction'};a.netLife=0;a.net.lastLife=0;}
 const owner=sender.actors[1];owner.weaponRunner.s3Release=SUCTION;
 sender.f.G.physics.segment=(_a,_b,hit)=>{hit.hit=false;return hit;};
 for(let i=0;i<128;i++){
  sender.nm.out=[];owner.pos.y=sender.f.PLAYER.waterY-4;
  sender.f.projectiles.throwBomb(owner);
  const b=sender.f.projectiles.bombs.at(-1);assert.ok(b.s3PaintBirth);
  sender.f.projectiles._updateBombs(1/60);
  assert.equal(sender.f.projectiles.bombs.length,0,'native water boundary removes bomb without explosion');
  assert.deepEqual(sender.nm.out.map(e=>e[1]),['b']);
  applyRemote(observer,'b',sender.nm.out[0]);
  for(const c of [sender,observer]){c.f.clock.advance(3);c.f.G.time+=3;c.nm.match.time-=3;}
 }
 sender.nm.out=[];owner.pos.set(0,0,0);sender.f.projectiles.throwBomb(owner);
 const b=sender.f.projectiles.bombs.at(-1);b.pos.set(0,.21,0);
 kitBombExplosionPaint({},b,sender.paint);
 for(const e of sender.nm.out)applyRemote(observer,'b',e);
 gridsEqual(sender,observer);
});
test('bounded eviction retires oldest capability and retains younger flights',async()=>{
 const {sender,observer,b}=await kitPair();const births=[],metas=[];
 for(let i=0;i<129;i++){sender.nm.out=[];sender.nm.recBomb(b);births.push(received(sender.nm.out[0]));metas.push([...b.s3PaintBirth]);applyRemote(observer,'b',sender.nm.out[0]);}
 const coreFor=meta=>{sender.nm.out=[];kitBombExplosionPaint({},{...b,s3PaintBirth:meta},sender.paint);return sender.nm.out[0];};
 applyRemote(observer,'b',births[0]);applyRemote(observer,'b',coreFor(metas[0]));assert.ok(observer.paint.grid.every(x=>x===0),'evicted birth cannot be reapproved from stale sequence');
 applyRemote(observer,'b',coreFor(metas[1]));assert.ok(observer.paint.grid.some(x=>x!==0),'second-oldest flight survives one eviction');
 const before=Array.from(observer.paint.grid);const forged=coreFor(metas[1]);forged[2]=12;applyRemote(observer,'b',forged);assert.deepEqual(Array.from(observer.paint.grid),before,'retained flight still grants only one core');
});
for(const reverse of [false,true])test(`one envelope overflow retains its newest window (reverse=${reverse})`,async()=>{
 const {sender,observer,b}=await kitPair(),control=(await kitPair()).observer,births=[],metas=[];
 for(let i=0;i<129;i++){sender.nm.out=[];sender.nm.recBomb(b);births.push(received(sender.nm.out[0]));metas.push([...b.s3PaintBirth]);}
 const coreFor=meta=>{sender.nm.out=[];kitBombExplosionPaint({},{...b,s3PaintBirth:meta},sender.paint);return received(sender.nm.out[0]);};
 const oldCore=coreFor(metas[0]);oldCore[2]=12;const youngCore=coreFor(metas[1]);
 observer.nm._tick('b',{k:'t',r:2,ts:1000,u:720,a:[],e:[...(reverse?[...births].reverse():births),oldCore,youngCore]});
 for(const e of observer.nm._peer('b').events.splice(0))observer.nm._play('b',e);
 applyRemote(control,'b',births[1]);applyRemote(control,'b',youngCore);gridsEqual(control,observer);
});
