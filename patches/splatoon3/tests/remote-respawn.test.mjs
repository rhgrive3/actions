import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';

function remoteOwner(f, actor) {
  actor.nid = 17; actor.owner = 'remote';
  const owner = new f.NetMatch({ myId:'local', hostId:'local', isHost:false,
    _members:new Map([['local','Local'],['remote','Remote']]) }, {map:'tidewater'});
  owner.bind({actors:[actor],state:'playing',time:180});
  assert.equal(actor.remote,true);
  assert.equal(owner.byNid.get(actor.nid),actor);
  assert.equal(typeof owner._retirePendingHitsForVictim,'function');
  return owner;
}

function pendingRespawnHits(owner, actor) {
  // Real delivery/receipt shapes; exercise the production retirement helpers,
  // including preservation of a different victim's pending transaction.
  const retired=[{h:101,v:actor.nid},'remote'],kept=[{h:102,v:actor.nid+1},'remote'];
  owner.hitPending.set(1,retired);owner.hitPending.set(2,kept);
  owner._pendingHits=new Map([[101,{v:actor.nid,delivery:['remote',1]}],[102,{v:actor.nid+1,delivery:['remote',2]}]]);
  return () => {
    assert.equal(owner.hitPending.has(1),false);
    assert.equal(owner._pendingHits.has(101),false);
    assert.equal(owner.hitPending.get(2),kept);
    assert.equal(owner._pendingHits.get(102).v,actor.nid+1);
  };
}

function withoutRemoteMovementCleanup(source) {
  // Retain the original source anchor assertion; emitted names/whitespace are
  // checked structurally below, and both paths must remove exactly one owner.
  if(!process.env.INKWAVE_BUILT_SITE) {
    const connection="  if (remoteRespawn) api.NetMatch.prototype._remoteRespawn = function (actor, ...args) {\n    const result = remoteRespawn.call(this, actor, ...args); clearMovement(actor); return result;\n  };";
    assert.equal(source.split(connection).length,2);
  }
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),matches=[];
  function visit(n) {
    if(!n||typeof n!=='object')return;
    if(n.type==='AssignmentExpression'&&n.left?.type==='MemberExpression'&&
      (n.left.property.name??n.left.property.value)==='_remoteRespawn'&&n.right?.type==='FunctionExpression')matches.push(n);
    for(const [key,value] of Object.entries(n))if(key!=='start'&&key!=='end') {
      if(Array.isArray(value))value.forEach(visit);else visit(value);
    }
  }
  visit(ast);assert.equal(matches.length,1,'unique actual movement respawn wrapper');
  const n=matches[0];return source.slice(0,n.start)+'(void 0)'+source.slice(n.end);
}
for (const [cause, expected] of [['shooter', 8.5], ['water', 7], ['fall', 5.5]]) {
  test(`remote ${cause} splat uses the same cause timing as its owner`, async () => {
    const f = await fixture(), victim = f.make();
    victim.remote = true; victim.net = { buf: [], tp: 0 };
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, victim, null, cause);
    assert.equal(victim.respawnTimer, expected);
    assert.equal(victim.alive, false);
    assert.equal(victim.stats.deaths, 1);
    // Repeated packets cannot restart the countdown or count another death.
    victim.respawnTimer -= .25;
    f.NetMatch.prototype._remoteSplat.call({ _stopLoops() {} }, victim, null, cause);
    assert.equal(victim.respawnTimer, expected - .25);
    assert.equal(victim.stats.deaths, 1);
  });
}

test('proxy respawn clears real wall Surge charge and roll armor like owner reset', async () => {
  const f = await fixture({productionComposition:true,realProjectiles:true}), proxy = f.make(), owner=remoteOwner(f,proxy);
  try {
    proxy._updateClimb = () => {}; proxy._ledgePop = () => {};
    proxy.form = 'squid'; proxy.climbing = true; proxy.intent.squid = true; proxy.intent.jump = true;
    f.G.actors = [proxy];
    for (let i = 0; i < 6; i++) { f.G.time += 1 / 60; proxy.update(1 / 60); }
    assert.ok(proxy.s3.surge?.charge > 0, 'charge created through actual Actor movement');
    proxy.s3.actions.roll = { armorTime: .3, armorHP: 100 }; proxy.s3.roll = proxy.s3.actions.roll;
    owner._remoteSplat(proxy,null,'shooter');
    const retired=pendingRespawnHits(owner,proxy);
    owner._remoteRespawn(proxy);retired();
    assert.equal(proxy.alive, true); assert.equal(proxy.net.spawnPending, true);
    assert.equal(proxy.s3.surge, null); assert.equal(proxy.s3.roll, null);
    assert.equal(proxy.s3.actions, undefined); assert.equal(proxy.anim.surgeCharge, 0);
  } finally {owner.dispose();}
});

test('old missing remote movement cleanup retains the prior-life Surge after native respawn',async()=>{
 let removed=0;
 const remove=(rel,source)=>{if(rel!=='patches/splatoon3/runtime/movement.mjs')return source;removed++;return withoutRemoteMovementCleanup(source);};
 const f=await fixture({productionComposition:true,realProjectiles:true,adaptRuntime:remove,adaptEmittedRuntime:remove});
 assert.equal(removed,1,'negative control mutates the actual source/emitted movement module');
 const a=f.make(),owner=remoteOwner(f,a);
 try {
 a._updateClimb=()=>{};a.form='squid';a.climbing=true;a.intent.squid=a.intent.jump=true;
 f.tick(a,6);const old=a.s3.surge;assert.ok(old?.charge>0);
 owner._remoteSplat(a,null,'shooter');const retired=pendingRespawnHits(owner,a);owner._remoteRespawn(a);retired();
 assert.equal(a.alive,true);assert.equal(a.s3.surge,old,'native reset alone does not retire the added movement owner');
 } finally {owner.dispose();}
});
