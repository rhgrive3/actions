// #365 / #369: exercise paint requests and authoritative receipts through the
// installed NetMatch/PaintSystem adapters. Only WebGL and wall-clock time are stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

const MATCH = 'paint-order-fixture';
const MEMBERS = [['host', 'Host'], ['guestA', 'Guest A'], ['guestB', 'Guest B'], ['observer', 'Observer']];
const ROSTER = [
  { owner:'host', bot:false, team:0 },
  { owner:'host', bot:true, team:1 },
  { owner:'guestA', bot:false, team:0 },
  { owner:'guestB', bot:false, team:1 },
  { owner:'observer', bot:false, team:1 },
];
const CENTER = [4, 0, 4];
const RADIUS = 1.2;

function wire(value) { return JSON.parse(JSON.stringify(value)); }

function peer(f, id, hostId = 'host', { mode = 'turf', roster = ROSTER } = {}) {
  const session = f.makeSession(id, hostId, MEMBERS);
  const nm = f.makeNetMatch(session, { id:MATCH, mode, roster });
  const actors = new Map(MEMBERS.map(([owner]) => [owner, f.makeActor({
    nid:owner, owner, remote:owner !== id, team:owner === 'guestB' || owner === 'observer' ? 1 : 0,
  })]));
  const hostBot = f.makeActor({ nid:'host-bot', owner:'host', remote:id !== 'host', team:1 });
  hostBot.isBot = true;
  actors.set('hostBot', hostBot);
  f.bind(nm, [...actors.values()]);
  const paint = f.makePaint({ su:8, sv:8, atlasSize:512, maxDensity:30 });
  f.clock.set(10);
  f.G.time = 2;
  return { f, session, nm, actors, paint };
}

function flushTick(p, simulationAdvance = 0) {
  if (simulationAdvance > 0) { p.f.clock.advance(simulationAdvance); p.f.G.time += simulationAdvance; }
  p.f.clock.advance(0.01);
  p.nm._sendTick();
  return wire(p.session.sent.at(-1).packet);
}

function ownerSplat(p, ownerId, team, center = CENTER, radius = RADIUS) {
  p.actors.get(ownerId).pos.set(...center);
  p.actors.get(ownerId).weaponRunner.firingT = Math.max(p.actors.get(ownerId).weaponRunner.firingT || 0,0.12);
  const area = p.paint.splat(new p.f.THREE.Vector3(...center), radius, team, { seed:0.42 });
  p.actors.get(ownerId).addTurf(area); // the same caller-side credit used by weapons and actors
  return area;
}

function receive(host, from, packet) {
  host.f.clock.set(Math.max(host.f.clock.now(), packet.ts));
  host.nm.onMessage(from, wire(packet));
}

function primeOwner(host, guest, center = CENTER) {
  guest.actors.get(guest.nm.s.myId).pos.set(...center);
  for (let i=0;i<2;i++) receive(host, guest.nm.s.myId, flushTick(guest));
}

function playThroughNetMatch(p, from, packet) {
  p.nm.onMessage(from, wire(packet));
  const timeline = p.nm._peer(from);
  timeline.tr = Infinity;
  p.nm._playEvents();
}

function playOneCanonical(p, event, outerTs) {
  const tick = event[event.length - 2];
  playThroughNetMatch(p, 'host', { k:'t', ts:outerTs, r:2, u:tick, e:[event] });
}

function settle(p, frames = 40) {
  for (let i = 0; i < frames; i++) p.paint.flush(1 / 60);
}

function cellAt(paint, u, v) {
  const f = paint.paintFaces[0];
  const i = Math.min(f.nu - 1, Math.max(0, Math.floor(u / f.cu)));
  const j = Math.min(f.nv - 1, Math.max(0, Math.floor(v / f.cv)));
  return f.grid + j * f.nu + i;
}

function assertAtlasMatchesGrid(paint) {
  const f = paint.paintFaces[0], eps = 1e-9;
  for (const q of paint._netQuads) {
    for (let row = 0; row < f.nv; row++) for (let col = 0; col < f.nu; col++) {
      const u0 = col * f.cu, u1 = (col + 1) * f.cu;
      const v0 = row * f.cv, v1 = (row + 1) * f.cv;
      if (q.u1 <= u0 + eps || q.u0 >= u1 - eps || q.v1 <= v0 + eps || q.v0 >= v1 - eps) continue;
      const owner = paint.grid[f.grid + row * f.nu + col];
      assert.equal(q.team + 1, owner, `team ${q.team} growth crossed cell (${col},${row}) owned by ${owner}`);
    }
  }
}

async function ownerGeneratedPair() {
  const hf = await fixture(), host = peer(hf, 'host');
  const guestAF = await fixture(), guestBF = await fixture();
  const guestA = peer(guestAF, 'guestA'), guestB = peer(guestBF, 'guestB');
  primeOwner(host,guestA,[3.45,0,4]); primeOwner(host,guestB,[4.55,0,4]);
  ownerSplat(guestA, 'guestA', 0, [3.45, 0, 4]);
  const requestA = flushTick(guestA);
  ownerSplat(guestB, 'guestB', 1, [4.55, 0, 4]);
  const requestB = flushTick(guestB);
  receive(host,'guestA',requestA);
  receive(host,'guestB',requestB);
  const canonical = Array.from(host.nm.out.filter((e) => e[1] === 's'), wire);
  return { host, canonical, guestA, guestB };
}

test('guest predictions are accepted once, host ordered, relayed, and credited once', async () => {
  const hf = await fixture(), host = peer(hf, 'host');
  const af = await fixture(), guestA = peer(af, 'guestA');
  const bf = await fixture(), guestB = peer(bf, 'guestB');
  primeOwner(host,guestA); primeOwner(host,guestB);
  const areaA = ownerSplat(guestA, 'guestA', 0);
  const reqA = flushTick(guestA);
  const areaB = ownerSplat(guestB, 'guestB', 1);
  const reqB = flushTick(guestB);

  receive(host,'guestA',reqA);
  receive(host,'guestB',reqB);
  assert.deepEqual(Array.from(host.nm.out.filter((e) => e[1] === 's'), (e) => e[16]), [1, 2], 'host assigns order by accepted request arrival');

  const duplicate = { ...reqA, ts:reqA.ts + 0.2 };
  receive(host,'guestA',duplicate);
  assert.equal(host.nm.out.filter((e) => e[1] === 's').length, 2, 'replayed owner request adds no second authoritative splat');
  assert.equal(host.actors.get('guestA').creditCalls, 0, 'authority applies guest paint without granting owner credit again');

  const relay = flushTick(host);
  assert.equal(relay.r, 2, 'canonical receipts use the existing event packet marker');
  assert.equal(relay.e.filter((e) => e[1] === 's').length, 2);
  playThroughNetMatch(guestA, 'host', relay);
  playThroughNetMatch(guestB, 'host', relay);
  settle(host); settle(guestA); settle(guestB);

  assert.equal(host.paint.grid[cellAt(host.paint, CENTER[0], CENTER[2])], 2);
  assert.deepEqual(Array.from(guestA.paint.grid), Array.from(host.paint.grid));
  assert.deepEqual(Array.from(guestB.paint.grid), Array.from(host.paint.grid));
  assert.deepEqual(Array.from(guestA.paint.gridOrderSeq), Array.from(host.paint.gridOrderSeq));
  assert.deepEqual([...guestA.paint.coverage()], [...host.paint.coverage()]);
  assert.ok(areaA > 0 && areaB > 0);
  assert.equal(guestA.actors.get('guestA').creditCalls, 1);
  assert.equal(guestA.actors.get('guestA').stats.turf, areaA, 'host echo does not double the predicted owner credit');
  assert.equal(guestB.actors.get('guestB').creditCalls, 1);
  assert.equal(guestB.actors.get('guestB').stats.turf, areaB);
});

test('out-of-order canonical events converge per cell and stale growth cannot repaint newer cells', async () => {
  const { canonical } = await ownerGeneratedPair();
  assert.equal(canonical.length, 2);
  assert.equal(canonical[0][16], 1);
  assert.equal(canonical[1][16], 2);
  const forwardF = await fixture(), reverseF = await fixture();
  const forward = peer(forwardF, 'observer'), reverse = peer(reverseF, 'observer');
  playOneCanonical(forward, canonical[0], 20);
  playOneCanonical(forward, canonical[1], 20.1);
  playOneCanonical(reverse, canonical[1], 20);
  playOneCanonical(reverse, canonical[0], 20.1);
  settle(forward); settle(reverse);

  assert.deepEqual(Array.from(reverse.paint.grid), Array.from(forward.paint.grid));
  assert.deepEqual(Array.from(reverse.paint.gridOrderEpoch), Array.from(forward.paint.gridOrderEpoch));
  assert.deepEqual(Array.from(reverse.paint.gridOrderSeq), Array.from(forward.paint.gridOrderSeq));
  assert.deepEqual([...reverse.paint.coverage()], [...forward.paint.coverage()]);
  assertAtlasMatchesGrid(forward.paint);
  assertAtlasMatchesGrid(reverse.paint);
  assert.equal(reverse.paint.grid[cellAt(reverse.paint, CENTER[0], CENTER[2])], 2, 'order 1 cannot take the contested cells back from order 2');

  const quads = reverse.paint._netQuads.length;
  playOneCanonical(reverse, canonical[1], 20.2);
  settle(reverse);
  assert.equal(reverse.paint._netQuads.length, quads, 'a duplicate canonical receipt is neither replayed nor redrawn');
});

test('host rejects unauthenticated, wrong-team, wrong-match, malformed, and future paint requests', async () => {
  const hf = await fixture(), host = peer(hf, 'host');
  const gf = await fixture(), guest = peer(gf, 'guestA');
  primeOwner(host,guest);
  ownerSplat(guest, 'guestA', 1); // guestA is rostered on team 0
  const wrongTeam = flushTick(guest);
  receive(host,'guestA',wrongTeam);

  ownerSplat(guest, 'guestA', 0);
  const validShape = flushTick(guest);
  const wrongMatch = wire(validShape); wrongMatch.ts += 0.1; wrongMatch.e[0][14] = 'another-match';
  receive(host,'guestA',wrongMatch);
  const malformed = wire(validShape); malformed.ts += 0.2; malformed.e[0][16] = null;
  receive(host,'guestA',malformed);
  const future = wire(validShape); future.ts += 0.3; future.u = future.e[0][26] - 1;
  receive(host,'guestA',future);
  const outsider = wire(validShape); outsider.ts += 0.4;
  receive(host,'intruder',outsider);

  assert.equal(host.paint.grid.some((cell) => cell !== 0), false, 'rejected requests do not mutate host gameplay paint');
  assert.equal(host.nm.out.filter((e) => e[1] === 's').length, 0, 'rejected requests produce no canonical relay');
});

test('host authority includes Boss paint while guests remain bound to their roster team', async () => {
  const bossRoster = MEMBERS.map(([owner], index) => ({ owner, bot:false, team:index === 3 ? 1 : 0 }));
  const hf = await fixture(), host = peer(hf, 'host', 'host', { mode:'boss', roster:bossRoster });
  const gf = await fixture(), guest = peer(gf, 'guestA', 'host', { mode:'boss', roster:bossRoster });
  primeOwner(host,guest);
  host.paint.splat(new host.f.THREE.Vector3(...CENTER), RADIUS, 1, { seed:0.42 });
  const canonical = flushTick(host);
  playThroughNetMatch(guest, 'host', canonical);
  assert.equal(guest.paint.grid[cellAt(guest.paint, CENTER[0], CENTER[2])], 2, 'host-owned Boss team ink reaches guests');

  const mf = await fixture(), malicious = peer(mf, 'guestA', 'host', { mode:'boss', roster:bossRoster });
  const authorityF = await fixture(), authority = peer(authorityF, 'host', 'host', { mode:'boss', roster:bossRoster });
  primeOwner(authority,malicious);
  ownerSplat(malicious, 'guestA', 1);
  const request = flushTick(malicious);
  receive(authority,'guestA',request);
  assert.equal(authority.paint.grid.some((cell) => cell !== 0), false, 'Boss mode does not let a guest claim the boss team');
});

test('host migration advances paint epoch, cancels old predictions, and admits only the new host timeline', async () => {
  const oldHostF = await fixture(), oldHost = peer(oldHostF, 'host');
  ownerSplat(oldHost, 'host', 0);
  const oldHostPacket = flushTick(oldHost);
  const oldCanonical = oldHostPacket.e.find((e) => e[1] === 's');

  const observerF = await fixture(), observer = peer(observerF, 'observer');
  playThroughNetMatch(observer, 'host', oldHostPacket);
  const pendingArea = ownerSplat(observer, 'observer', 1);
  const pendingRequest = flushTick(observer);
  assert.ok(pendingArea > 0 && observer.paint.gridPrediction.some((request) => request >= 0));
  observer.paint.flush(1/60);
  observer.paint._netQuads.length=0;

  const newHostF = await fixture(), newHost = peer(newHostF, 'guestA');
  observer.paint.renderer.setViewport(1,2,33,44);
  for (const p of [observer, newHost]) {
    p.session.hostId = 'guestA';
    p.session.isHost = p.session.myId === 'guestA';
    p.session._members.delete('host');
    p.nm.onLeave('host', true);
  }
  assert.equal(observer.nm._paintState.epoch, 1);
  assert.equal(newHost.nm._paintState.epoch, 1);
  assert.equal(newHost.actors.get('hostBot').owner, 'guestA', 'the new host adopts paint ownership of the departed host bot');
  assert.equal(observer.paint.gridPrediction.some((request) => request >= 0), false);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(observer.paint.gridCanonical), 'host change rolls back only unconfirmed local paint');
  assert.ok(observer.paint._netClearCalls.length>0, 'rollback clears the affected GPU atlas face');
  assert.deepEqual(Array.from(observer.paint._netClearCalls.at(-1).rect.toArray()), [observer.paint.paintFaces[0].atlas.x,observer.paint.paintFaces[0].atlas.y,observer.paint.paintFaces[0].atlas.w,observer.paint.paintFaces[0].atlas.h]);
  assert.equal(observer.paint.renderer.getRenderTarget(),null,'atlas recovery restores the caller render target');
  assert.deepEqual(Array.from(observer.paint.renderer.getViewport(new observer.f.THREE.Vector4()).toArray()),[1,2,33,44],'atlas recovery restores the caller viewport');
  assert.equal(observer.paint.renderer.autoClear,false,'atlas recovery restores renderer autoClear');
  assert.equal(observer.paint.renderer.getScissorTest(),false,'atlas recovery restores scissor state');
  const rebuilt=observer.paint._netQuads.filter(q=>q.clearGeneration===observer.paint._netClearCalls.length);
  assert.ok(rebuilt.length>0 && rebuilt.every((q)=>q.team===0), 'atlas rebuild draws only retained canonical ownership');
  assert.equal(observer.paint.growing.some((g)=>g._netContext?.prediction),false,'rollback removes pending prediction growth before it can replay');

  newHost.nm.onMessage('observer', pendingRequest);
  assert.equal(newHost.paint.grid.some((cell) => cell !== 0), false, 'a pre-migration request carries the old epoch and is refused');
  playOneCanonical(observer, oldCanonical, 30);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(observer.paint.gridCanonical), 'a late packet from the departed host cannot paint');

  ownerSplat(newHost, 'hostBot', 1);
  const newHostPacket = flushTick(newHost);
  const newEvent = newHostPacket.e.find((e) => e[1] === 's');
  assert.equal(newEvent[15], 1);
  assert.equal(newEvent[6], 1, 'the new host can relay paint from a transferred opposite-team bot');
  playThroughNetMatch(observer, 'guestA', newHostPacket);
  settle(observer); settle(newHost);
  assert.deepEqual(Array.from(observer.paint.grid), Array.from(newHost.paint.grid));

  observer.paint.clear();
  const emptyAfterReconnect = Array.from(observer.paint.grid);
  const receiptState = observer.nm._paintState;
  observer.nm.dispose();
  const reconnected = observer.f.makeNetMatch(observer.session, { id:MATCH, roster:ROSTER });
  observer.f.bind(reconnected, [...observer.actors.values()]);
  observer.nm = reconnected;
  assert.strictEqual(reconnected._paintState, receiptState, 'same room state survives NetMatch reconstruction');
  playThroughNetMatch(observer, 'guestA', { ...newHostPacket, ts:newHostPacket.ts + 0.2 });
  assert.deepEqual(Array.from(observer.paint.grid), emptyAfterReconnect, 'a duplicate pre-clear receipt stays deduplicated after grid clear');
});

test('host canonical receipt survives real owner leave after session membership is removed', async () => {
  const hostF=await fixture(), host=peer(hostF,'host');
  const guestF=await fixture(), guest=peer(guestF,'guestA');
  const observerF=await fixture(), observer=peer(observerF,'observer');
  primeOwner(host,guest);
  ownerSplat(guest,'guestA',0);
  const request=flushTick(guest);
  receive(host,'guestA',request);
  const canonical=host.nm.out.find(e=>e[1]==='s');
  assert.ok(canonical,'host produced one canonical receipt before disconnect');
  const relay=flushTick(host);
  observer.nm.onMessage('host',wire(relay));
  const departed=observer.actors.get('guestA'), credits=departed.creditCalls, turf=departed.stats.turf;
  observer.session._members.delete('guestA');
  observer.nm.onLeave('guestA',false); // Session removes membership before this real hook.
  assert.equal(departed.owner,'host','the departed actor is now controlled by the host');
  observer.nm._peer('host').tr=Infinity;
  observer.nm._playEvents();
  assert.equal(observer.paint.grid[cellAt(observer.paint,CENTER[0],CENTER[2])],1,'the historical team paint still applies');
  assert.ok(observer.paint.gridOrderSeq.some(sequence=>sequence===canonical[16]));
  assert.equal(departed.creditCalls,credits,'canonical playback never credits the departed owner or its replacement bot');
  assert.equal(departed.stats.turf,turf,'late paint does not rewrite a nonexistent owner life score');
  const order=Array.from(observer.paint.gridOrderSeq), cells=Array.from(observer.paint.grid);
  receive(observer,'host',{...relay,ts:relay.ts+0.2});
  observer.nm._playEvents();
  assert.deepEqual(Array.from(observer.paint.gridOrderSeq),order,'duplicate host receipt does not change per-cell order');
  assert.deepEqual(Array.from(observer.paint.grid),cells,'duplicate host receipt does not paint twice');
});

test('former owner cannot request paint after NetMatch transfers its actor to the host', async () => {
  const hostF=await fixture(), host=peer(hostF,'host');
  const guestF=await fixture(), guest=peer(guestF,'guestA');
  primeOwner(host,guest);
  ownerSplat(guest,'guestA',0);
  const oldOwnerRequest=flushTick(guest);
  host.session._members.delete('guestA');
  host.nm.onLeave('guestA',false);
  assert.equal(host.actors.get('guestA').owner,'host');
  receive(host,'guestA',oldOwnerRequest);
  assert.equal(host.paint.grid.some(cell=>cell!==0),false,'departed owner input cannot paint through the host-adopted actor');
  assert.equal(host.nm.out.some(e=>e[1]==='s'),false,'ownership transfer creates no second owner credit or canonical receipt');
});

test('host rejects forged oversized paint and stale owner clock fields but admits a real late fired impact', async () => {
  const deadHostF=await fixture(), deadHost=peer(deadHostF,'host');
  const largeGuestF=await fixture(), largeGuest=peer(largeGuestF,'guestA');
  primeOwner(deadHost,largeGuest);
  largeGuest.actors.get('guestA').alive=false; largeGuest.actors.get('guestA').hp=0;
  ownerSplat(largeGuest,'guestA',0,CENTER,64);
  const oversized=flushTick(largeGuest);
  assert.equal(oversized.u,oversized.e[0][26],'the forged request has internally matching event and source tick fields');
  receive(deadHost,'guestA',oversized);
  assert.equal(deadHost.paint.grid.some(cell=>cell!==0),false,'a dead host-observed owner cannot supply a large paint request');
  assert.equal(deadHost.nm.out.some(e=>e[1]==='s'),false,'forged shape receives no canonical authority');

  const batchedHostF=await fixture(), batchedHost=peer(batchedHostF,'host');
  const batchedGuestF=await fixture(), batchedGuest=peer(batchedGuestF,'guestA');
  primeOwner(batchedHost,batchedGuest);
  ownerSplat(batchedGuest,'guestA',0);
  const batched=flushTick(batchedGuest,0.05);
  assert.equal(batched.u-batched.e[0][26],3,'the 20 Hz sender can flush an event a few simulation frames after it was recorded');
  receive(batchedHost,'guestA',batched);
  assert.ok(batchedHost.nm.out.some(e=>e[1]==='s'),'a current host-observed source admits the bounded packet-batched splat');

  const quietHostF=await fixture(), quietHost=peer(quietHostF,'host');
  const quietGuestF=await fixture(), quietGuest=peer(quietGuestF,'guestA');
  primeOwner(quietHost,quietGuest);
  ownerSplat(quietGuest,'guestA',0);
  quietGuest.actors.get('guestA').weaponRunner.firingT=0;
  receive(quietHost,'guestA',flushTick(quietGuest));
  assert.equal(quietHost.paint.grid.some(cell=>cell!==0),false,'matching small paint fields without a live attack state do not establish source authority');
  assert.equal(quietHost.nm.out.some(e=>e[1]==='s'),false);

  const activeHostF=await fixture(), activeHost=peer(activeHostF,'host');
  const activeGuestF=await fixture(), activeGuest=peer(activeGuestF,'guestA');
  activeGuest.actors.get('guestA').weaponRunner.firingT=0.3;
  primeOwner(activeHost,activeGuest,CENTER);
  assert.ok(activeHost.actors.get('guestA').net.buf.at(-1).f&4096,'guest supplied a matching host-observed firing state');
  ownerSplat(activeGuest,'guestA',0,[4,0,7],4);
  const forgedAttack=flushTick(activeGuest);
  assert.equal(forgedAttack.u,forgedAttack.e[0][26]);
  receive(activeHost,'guestA',forgedAttack);
  assert.equal(activeHost.paint.grid.some(cell=>cell!==0),false,'a guest firing flag and matching tick do not authorize wide paint without a host-created projectile');
  assert.equal(activeHost.nm.out.some(e=>e[1]==='s'),false);

  const staleHostF=await fixture(), staleHost=peer(staleHostF,'host');
  const staleGuestF=await fixture(), staleGuest=peer(staleGuestF,'guestA');
  primeOwner(staleHost,staleGuest);
  ownerSplat(staleGuest,'guestA',0);
  const oldRequest=flushTick(staleGuest), oldTick=oldRequest.u;
  staleGuest.f.G.time=3;
  staleGuest.f.clock.advance(1);
  receive(staleHost,'guestA',flushTick(staleGuest));
  const stale={...wire(oldRequest),ts:staleGuest.f.clock.now()+0.02,u:oldTick};
  receive(staleHost,'guestA',stale);
  assert.equal(staleHost.paint.grid.some(cell=>cell!==0),false,'guest-authored matching tick fields cannot rewind host-observed simulation time');
  assert.equal(staleHost.nm.out.some(e=>e[1]==='s'),false,'stale source authority creates no canonical receipt');

  const shotHostF=await fixture(), shotHost=peer(shotHostF,'host');
  const shotGuestF=await fixture(), shotGuest=peer(shotGuestF,'guestA');
  primeOwner(shotHost,shotGuest,[3.4,0,4]);
  const shooter=shotGuest.actors.get('guestA');
  shooter.weaponRunner.firingT=0.12;
  shotGuest.f.flickPacket(shotGuest.nm,shooter);
  const fired=flushTick(shotGuest);
  receive(shotHost,'guestA',fired);
  shotHost.nm._peer('guestA').tr=Infinity;
  shotHost.nm._playEvents();
  const ghost=shotHost.f.projectiles.list.find(projectile=>projectile.ghost&&projectile._netOwnerAliveAtSource===true);
  assert.ok(ghost,'actual NetMatch replay retained a host-observed live volley as bounded source authority');
  assert.ok(ghost._netSourceClockValid,'the projectile birth has a fresh owner snapshot and a bounded flight payload');
  shotHost.nm._remoteSplat(shotHost.actors.get('guestA'),null,'test');
  shooter.alive=false; shooter.hp=0;
  const localShot=shotGuest.f.projectiles.list.find(projectile=>!projectile.ghost&&projectile.owner===shooter);
  assert.ok(localShot,'the owner fired an actual local projectile before death');
  localShot.pos.set(4,0.14,4.6); ghost.pos.set(4,0.14,4.6); // owner and host timelines reach the same impact point.
  shotGuest.f.projectiles._impact(localShot,{point:new shotGuest.f.THREE.Vector3(4,0,4.6),normal:new shotGuest.f.THREE.Vector3(0,1,0)});
  const lateImpact=flushTick(shotGuest);
  receive(shotHost,'guestA',lateImpact);
  assert.ok(shotHost.nm.out.some(e=>e[1]==='s'),'a bounded impact near the still-live authoritative ghost volley remains accepted after owner death');
  assert.equal(shotHost.paint.grid[cellAt(shotHost.paint,CENTER[0],CENTER[2])],1);
  const canonicalCount=shotHost.nm.out.filter(e=>e[1]==='s').length;
  shooter.alive=true; shooter.hp=100;
  receive(shotHost,'guestA',flushTick(shotGuest));
  assert.equal(shotHost.nm._peer('guestA')._paintLife,1,'the host advances source life on the accepted dead-to-alive owner snapshot');
  ownerSplat(shotGuest,'guestA',0,CENTER,3.0);
  receive(shotHost,'guestA',flushTick(shotGuest));
  assert.equal(shotHost.nm.out.filter(e=>e[1]==='s').length,canonicalCount,'an old projectile cannot authorize paint for the replacement life');
});

test('a guest-authored projectile origin or ballistic payload cannot authorize remote paint', async () => {
  const hostF=await fixture(), host=peer(hostF,'host');
  const guestF=await fixture(), guest=peer(guestF,'guestA');
  primeOwner(host,guest,[3.4,0,4]);
  guest.actors.get('guestA').weaponRunner.firingT=0.12;
  guest.f.flickPacket(guest.nm,guest.actors.get('guestA'));
  const forgedBirth=flushTick(guest);
  const births=forgedBirth.e.filter(event=>event[1]==='p');
  assert.ok(births.length>0,'the fixture generated real owner projectile events to mutate');
  for(const birth of births) { birth[5]=7.5; birth[6]=0.14; birth[7]=7.5; }
  receive(host,'guestA',forgedBirth);
  host.nm._peer('guestA').tr=Infinity;
  host.nm._playEvents();
  const ghost=host.f.projectiles.list.find(projectile=>projectile.ghost&&projectile._netOwnerAliveAtSource===true);
  assert.ok(ghost,'the guest projectile is presented to remote viewers');
  assert.ok(Math.hypot(ghost._netOrigin.x-ghost._netShooterPosition.x,ghost._netOrigin.y-ghost._netShooterPosition.y,ghost._netOrigin.z-ghost._netShooterPosition.z)>5);

  const area=guest.paint.splat(new guest.f.THREE.Vector3(7.5,0,7.5),3,0,{seed:0.42});
  guest.actors.get('guestA').addTurf(area);
  const forgedPaint=flushTick(guest);
  receive(host,'guestA',forgedPaint);
  assert.equal(host.paint.grid.some(cell=>cell!==0),false,'a matching live projectile visual cannot authorize paint from a remote fabricated origin');
  assert.equal(host.nm.out.some(event=>event[1]==='s'),false,'the forged source receives no host canonical receipt');

  const speedHostF=await fixture(), speedHost=peer(speedHostF,'host');
  const speedGuestF=await fixture(), speedGuest=peer(speedGuestF,'guestA');
  primeOwner(speedHost,speedGuest,[3.4,0,4]);
  speedGuest.actors.get('guestA').weaponRunner.firingT=0.12;
  speedGuest.f.flickPacket(speedGuest.nm,speedGuest.actors.get('guestA'));
  const forgedSpeed=flushTick(speedGuest), projectiles=forgedSpeed.e.filter(event=>event[1]==='p');
  assert.ok(projectiles.length>0);
  for(const projectile of projectiles) { projectile[8]=1000; projectile[9]=0; projectile[10]=1000; }
  receive(speedHost,'guestA',forgedSpeed);
  speedHost.nm._peer('guestA').tr=Infinity; speedHost.nm._playEvents();
  const ghosts=speedHost.f.projectiles.list.filter(projectile=>projectile.ghost);
  assert.ok(ghosts.length>0 && ghosts.every(projectile=>projectile._netSourceClockValid===false),'projectile velocity is checked against a bounded flight envelope');
  for(const projectile of ghosts) projectile.pos.set(7.5,0.14,7.5);
  const speedArea=speedGuest.paint.splat(new speedGuest.f.THREE.Vector3(7.5,0,7.5),3,0,{seed:0.42});
  speedGuest.actors.get('guestA').addTurf(speedArea);
  receive(speedHost,'guestA',flushTick(speedGuest));
  assert.equal(speedHost.paint.grid.some(cell=>cell!==0),false,'a forged projectile flight cannot supply source authority');
  assert.equal(speedHost.nm.out.some(event=>event[1]==='s'),false,'an unphysical projectile creates no canonical paint receipt');
});

test('a projectile born before owner clock calibration cannot authorize later paint', async () => {
  const hostF=await fixture(), host=peer(hostF,'host');
  const guestF=await fixture(), guest=peer(guestF,'guestA');
  const shooter=guest.actors.get('guestA');
  shooter.pos.set(3.4,0,4); shooter.weaponRunner.firingT=0.12;
  guest.f.flickPacket(guest.nm,shooter);
  receive(host,'guestA',flushTick(guest));
  host.nm._peer('guestA').tr=Infinity; host.nm._playEvents();
  const ghosts=host.f.projectiles.list.filter(projectile=>projectile.ghost&&projectile._netOwner===host.actors.get('guestA'));
  assert.ok(ghosts.length>0,'the uncalibrated birth still plays as remote visual presentation');
  assert.ok(ghosts.every(projectile=>projectile._netSourceClockValid===false),'visual playback alone has no calibrated paint authority');

  for(let i=0;i<2;i++) receive(host,'guestA',flushTick(guest));
  for(const projectile of ghosts) projectile.pos.set(7.5,0.14,7.5);
  ownerSplat(guest,'guestA',0,[7.5,0,7.5],3);
  receive(host,'guestA',flushTick(guest));
  assert.equal(host.paint.grid.some(cell=>cell!==0),false,'later clock calibration cannot retroactively authorize the old visual ghost');
  assert.equal(host.nm.out.some(event=>event[1]==='s'),false,'an uncalibrated source produces no canonical paint receipt');
});
