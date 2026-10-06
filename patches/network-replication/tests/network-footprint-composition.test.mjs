import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, fixture } from './robustness-fixture.mjs';

const PIN='f69e80bd486aff862e9d5166e9d1386b241dde1';
const MATCH='footprint-network-composition';
const MEMBERS=[['host','Host'],['guestA','Guest A'],['observer','Observer']];
const ROSTER=[{owner:'host',bot:false,team:0},{owner:'guestA',bot:false,team:0},{owner:'observer',bot:false,team:1}];
function blob(path) { return execFileSync('git',['-C',ROOT,'show',`${PIN}:${path}`],{encoding:'utf8'}); }
function wire(value) { return JSON.parse(JSON.stringify(value)); }

test('pinned #264 paint-footprint adapter composes and runs through network prediction, canonical paint, and rollback', async () => {
  const paintSource=blob('inkwave-public/src/world/paint.js');
  const checkoutSource=await import('node:fs').then(({readFileSync})=>readFileSync(`${ROOT}/inkwave-public/src/world/paint.js`,'utf8'));
  assert.equal(createHash('sha256').update(paintSource).digest('hex'),createHash('sha256').update(checkoutSource).digest('hex'),'the tested native paint input is byte-identical to pinned f69e80b');
  const adapterSource=blob('patches/local-quality/paint-footprint-adapter.mjs');
  const moduleCode=blob('patches/local-quality/paint-footprint.mjs');
  const adapter=await import(`data:text/javascript;base64,${Buffer.from(adapterSource).toString('base64')}`);
  function send(host,guest,packet) { host.f.clock.set(Math.max(host.f.clock.now(),packet.ts)); host.nm.onMessage(guest.id,wire(packet)); }
  function tick(p) { p.f.clock.advance(0.01); p.nm._sendTick(); return wire(p.session.sent.at(-1).packet); }
  function prime(host,guest,position) {
    guest.actors.get(guest.id).pos.set(...position);
    for(let i=0;i<2;i++) send(host,guest,tick(guest));
  }
  function paintOwner(p,team,position) {
    p.actors.get(p.id).pos.set(...position);
    p.actors.get(p.id).weaponRunner.firingT=0.12;
    const area=p.paint.splat(new p.f.THREE.Vector3(...position),1.2,team,{seed:0.42});
    p.actors.get(p.id).addTurf(area); return area;
  }
  const hostFixture=await fixture({paintFootprint:{adapt:adapter.adaptPaintFootprint,moduleCode}});
  const guestFixture=await fixture({paintFootprint:{adapt:adapter.adaptPaintFootprint,moduleCode}});
  const host=peerWith(hostFixture,'host'), guest=peerWith(guestFixture,'guestA');

  prime(host,guest,[4,0,4]);
  const predictedArea=paintOwner(guest,0,[4,0,4]), request=tick(guest);
  assert.ok(predictedArea>0&&guest.paint.gridPrediction.some(id=>id>=0),'#264 owned CPU writer retains the immediate request prediction');
  send(host,guest,request);
  const canonical=flushHost(host);
  receiveAndPlay(guest,canonical);
  assert.deepEqual(Array.from(guest.paint.grid),Array.from(host.paint.grid),'network order reaches the installed #264 CPU ownership writer');
  assert.equal(guest.actors.get('guestA').creditCalls,1,'host echo does not duplicate existing caller-side turf credit');
  assert.equal(guest.paint.growing.some(g=>g._netContext?.prediction),false,'canonical acknowledgement retires the matched prediction growth');
  settle(host); settle(guest);
  assert.deepEqual(Array.from(guest.paint.grid),Array.from(host.paint.grid),'fixed CPU growth stays canonical after the visual clock advances');

  const observerFixture=await fixture({paintFootprint:{adapt:adapter.adaptPaintFootprint,moduleCode}});
  const observer=peerWith(observerFixture,'observer');
  receiveAndPlay(observer,canonical);
  settle(observer);
  const canonicalGrid=Array.from(observer.paint.gridCanonical);
  assert.ok(canonicalGrid.some(cell=>cell===1),'observer established retained canonical team paint');
  observer.paint._netQuads.length=0;
  paintOwner(observer,1,[4,0,4]);
  observer.paint.flush(1/60);
  assert.ok(observer.paint.gridPrediction.some(id=>id>=0),'observer has pending GPU and CPU prediction before migration');
  observer.paint._netQuads.length=0;
  observer.paint.cancelPredictedPaint();
  assert.deepEqual(Array.from(observer.paint.grid),canonicalGrid,'migration restores only canonical CPU cells');
  assert.ok(observer.paint._netClearCalls.length>0,'the actual #264 composition clears the affected GPU atlas rectangle');
  const rebuilt=observer.paint._netQuads.filter(q=>q.clearGeneration===observer.paint._netClearCalls.length);
  assert.ok(rebuilt.length>0&&rebuilt.every(q=>q.team===0),`GPU recovery rebuilds from canonical team cells: clear=${observer.paint._netClearCalls.length} rebuilt=${rebuilt.length} teams=${observer.paint._netQuads.map(q=>q.team).join(',')}`);
  assert.equal(observer.paint.growing.some(g=>g._netContext?.prediction),false,'migration removes hidden #264 prediction growth replay');

  function peerWith(fixture,id) {
    const session=fixture.makeSession(id,'host',MEMBERS), nm=fixture.makeNetMatch(session,{id:MATCH,roster:ROSTER});
    const actors=new Map(MEMBERS.map(([owner])=>[owner,fixture.makeActor({nid:owner,owner,remote:owner!==id,team:owner==='observer'?1:0})]));
    fixture.bind(nm,[...actors.values()]); const paint=fixture.makePaint({su:8,sv:8,atlasSize:512,maxDensity:30});
    fixture.clock.set(10); fixture.G.time=2; return {f:fixture,id,session,nm,actors,paint};
  }
  function flushHost(p) { p.f.clock.advance(0.01); p.nm._sendTick(); return wire(p.session.sent.at(-1).packet); }
  function receiveAndPlay(p,packet) { p.f.clock.set(Math.max(p.f.clock.now(),packet.ts)); p.nm.onMessage('host',wire(packet)); p.nm._peer('host').tr=Infinity; p.nm._playEvents(); }
  function settle(p) { for(let i=0;i<40;i++) { p.paint.advanceCpuOwnership(1/60); p.paint.flush(1/60); } }
});
