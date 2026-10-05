import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './robustness-fixture.mjs';

async function pair(charge = .5) {
  const owner = await fixture(), remote = await fixture();
  const nm = owner.makeNetMatch(owner.makeSession('me', 'me'));
  const rn = remote.makeNetMatch(remote.makeSession('p2', 'me'));
  const a = owner.makeActor({nid:0,owner:'me',remote:false});
  const b = remote.makeActor({nid:0,owner:'me',remote:true});
  for (const [f,actor] of [[owner,a],[remote,b]]) {
    actor.weapon=f.WEAPONS.charger;
    actor.character.getMuzzle=out=>out.copy(actor.pos);
    f.G.time=1000; f.clock.set(1000);
  }
  owner.bind(nm,[a]);remote.bind(rn,[b]);
  nm.unsubs.push(owner.on('weapon:fire',e=>nm._onLocalEvent('weapon:fire',e)));
  owner.projectiles.fireCharger(a,a.weapon,charge);
  const event=JSON.parse(JSON.stringify(nm.out.find(e=>e[1]==='ev'&&e[2]==='weapon:fire')));
  const peer={tr:1000,lastTs:1000};rn.peers.set('me',peer);rn._play('me',event);
  return {owner,remote,nm,rn,peer};
}

test('finite Charger flight and native beam use the same delayed owner clock',async()=>{
  const h=await pair();
  try {
    for(let i=0;i<6;i++)h.owner.projectiles.update(1/60);
    h.peer.tr=h.peer.lastTs=1000+5/60;
    h.remote.projectiles.update(1/144);
    const a=h.owner.projectiles.beams[0],b=h.remote.projectiles.beams[0];
    assert.equal(b.mesh.scale.z,a.mesh.scale.z);
    assert(Math.abs(b.t-a.t)<1e-10);
    const length=b.mesh.scale.z,time=b.t;
    for(let i=0;i<20;i++)h.remote.projectiles.update(i%2?1/30:1/144);
    assert.equal(b.mesh.scale.z,length,'unchanged packet does not advance flight');
    assert.equal(b.t,time,'unchanged packet does not advance beam');
  } finally {h.nm.dispose();h.rn.dispose();}
});

test('retiring a peer beam also retires its pending finite-flight job',async()=>{
  const h=await pair(1);
  try {
    assert.equal(h.remote.projectiles._fidelityChargerFlights.length,1);
    h.remote.projectiles.beams.splice(0);
    h.peer.tr=h.peer.lastTs=1001;
    h.remote.projectiles.update(1/60);
    assert.equal(h.remote.projectiles._fidelityChargerFlights.length,0);
    assert.equal(h.remote.projectiles.beams.length,0);
  } finally {h.nm.dispose();h.rn.dispose();}
});

test('finite Charger flight accepts integer owner ticks and clears with the world',async()=>{
  const h=await pair(1);
  try {
    const beam=h.remote.projectiles.beams[0];beam._netBornTick=20;h.peer.sim=22;
    for(let i=0;i<3;i++)h.owner.projectiles.update(1/60);
    h.remote.projectiles.update(1/30);
    assert.equal(beam.mesh.scale.z,h.owner.projectiles.beams[0].mesh.scale.z);
    h.remote.projectiles.clear();
    assert.equal(h.remote.projectiles._fidelityChargerFlights.length,0);
  } finally {h.nm.dispose();h.rn.dispose();}
});
