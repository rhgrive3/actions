import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../network-replication/tests/robustness-fixture.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function sessions(fixtures, id) {
  const clients = new Map(), wire = [];
  for (const [index, name] of ['A', 'B'].entries()) {
    const f = fixtures[index];
    f.clock.set(name === 'A' ? 92.3055 : 138.3587);
    f.G.game = { settings: {}, netMatchGo() {} };
    const s = new f.NetSession();
    assert.equal(s.ownerClockVersion, 1, 'real public session enables the current protocol');
    s.myId = name; s.hostId = 'A'; s.state = 'lobby';
    s._members = new Map([['A', 'A'], ['B', 'B']]);
    s.lobby.players = [{ id: 'A', ready: false }, { id: 'B', ready: false }];
    f.G.net = s;
    const send = (to, data) => { wire.push({ from: name, to, data: clone(data) }); return true; };
    s.tr = { sendTo: send, broadcast(data) { send(name === 'A' ? 'B' : 'A', data); return true; }, lock() { return true; }, close() {} };
    clients.set(name, { name, f, s, net: null, actors: [], triggers: 0 });
  }
  const cfg = { id, proto: fixtures[0].PROTO, compat: fixtures[0].COMPAT,
    mode: 'turf', map: 'reef', difficulty: 'normal', roster: [
    { owner: 'A', nid: 1, bot: false, weapon: 'shooter', team: 0, slot: 0 },
    { owner: 'B', nid: 2, bot: false, weapon: 'shooter', team: 1, slot: 0 },
  ] };
  async function begin(name, hold = false) {
    const c = clients.get(name), entered = deferred(), release = deferred();
    c.f.G.game.startNetMatch = async (_cfg, net) => {
      c.net = net; entered.resolve();
      if (hold) await release.promise;
      class Display {
        constructor() { this.root = new c.f.THREE.Group(); }
        trigger() {} setVisible(v) { this.root.visible = v; }
        setHurt() {} setWeapon() {} _owner() { return null; }
      }
      c.actors = ['A', 'B'].map((owner, i) => {
        const actor = new c.f.Actor({ team: i, name: owner, weapon: 'shooter', CharacterClass: Display });
        actor.nid = i + 1; actor.owner = owner; actor.isLocal = owner === name;
        // Stage/mesh allocation is this fixture's boundary. Keep the real
        // Actor/WeaponRunner defaults, without starting a rendered spawn clip.
        actor.pos.set(i * 2, 0, 0); actor.invuln = 0;
        actor._nearCamera = () => false; actor._finishFrame = () => {};
        return actor;
      });
      c.remote = c.actors.find(a => a.owner !== name); c.local = c.actors.find(a => a.owner === name);
      c.remote.character._netTrig = () => { c.triggers++; };
      const match = { actors: c.actors, state: 'intro', time: 180, playing: () => true, follower: false };
      c.f.G.match = match; c.f.G.actors = c.actors; net.bind(match);
    };
    const pending = c.s._begin(cfg);
    await Promise.race([entered.promise, pending.then(() => {
      if (!c.net) throw new Error('Real session rejected the integration START');
    })]);
    if (!hold) { await pending; assert.notEqual(c.s.state, 'error', c.s.error); }
    return { async release() { release.resolve(); await pending; assert.ok(c.net.match); } };
  }
  function flush(select = () => true) {
    let count = 0;
    for (;;) {
      const index = wire.findIndex(select);
      if (index < 0) return;
      assert.ok(count++ < 200, 'protocol/codec negotiation must converge');
      const message = wire.splice(index, 1)[0];
      clients.get(message.to).s._message(message.from, clone(message.data));
    }
  }
  function takeTick(name, position) {
    const c = clients.get(name); c.local.pos.x = position;
    c.net._sendTick();
    const index = wire.findIndex(x => x.from === name && x.data.k === 't');
    assert.ok(index >= 0); return wire.splice(index, 1)[0];
  }
  return { clients, wire, begin, flush, takeTick,
    advance(dt) { for (const c of clients.values()) { c.f.clock.advance(dt); c.f.G.time += dt; } },
    pause(dt) { for (const c of clients.values()) c.f.clock.advance(dt); },
    restart(id) {
      for (const c of clients.values()) { clearTimeout(c.s._goT); c.s._goT = null; c.s.endMatch(); }
      wire.length = 0; cfg.id = id;
    },
    dispose() { for (const c of clients.values()) { clearTimeout(c.s._goT); c.s.match?.dispose(); c.s.match = null; c.f.G.net = null; } },
  };
}

async function runScenario(resetSource){
const fixtures=[await fixture({productionComposition:true,includeSession:true}),await fixture({productionComposition:true,includeSession:true})];const p=await sessions(fixtures,'combat-test');await p.begin('A');await p.begin('B');p.flush();const a=p.clients.get('A'),b=p.clients.get('B'),events=[];let scenario='init';
for(const c of [a,b]){const{G,THREE}=c.f;G.actors=c.actors;G.local=c.local;G.projectiles=c.f.projectiles;G.match=c.net.match;c.net.match.state='playing';c.wall=false;G.physics.los=(u,v)=>{if(!c.wall||(u.z-6)*(v.z-6)>=0)return true;const k=(6-u.z)/(v.z-u.z),x=u.x+(v.x-u.x)*k,y=u.y+(v.y-u.y)*k;return !(Math.abs(x)<4&&y<4);};for(const actor of c.actors){actor.invuln=0;actor.netLife=1;actor._spawnBarrier=()=>{};actor.character.actor=actor;actor.character._runner=()=>actor.weaponRunner;actor.character._owner=()=>actor;actor.character.getMuzzle=out=>out.copy(actor.pos).add(new THREE.Vector3(0,1.05,.3));}const hit=G.projectiles.applyHit;G.projectiles.applyHit=function(...args){const before=args[1].hp,r=hit.apply(this,args);events.push({scenario,client:c.name,kind:'applyHit',ts:c.f.clock.now(),damage:args[2],before,after:args[1].hp,result:r});return r;};for(const method of ['sendTo','broadcast']){const send=c.s.tr[method];c.s.tr[method]=function(...args){const d=args.at(-1);if(d.k==='hit'||d.k==='hit_ack')events.push({scenario,client:c.name,kind:'send',ts:c.f.clock.now(),d:clone(d)});return send.apply(this,args);};}}
function frames(n){for(let i=0;i<n;i++){p.advance(1/60);for(const c of [a,b])c.net.update(1/60);p.flush();}}
function place(c,x,z){const [at,v]=c.actors;at.pos.set(0,0,0);v.pos.set(x,0,z);at.aimDir.set(x,0,z).normalize();at.aimPoint.set(x,1,z);c.f.projectiles.clear();}
const pages=[a,b].map(c=>({evaluate:async(fn,args)=>{const previous={G:globalThis.G,place:globalThis.place,wall:Object.getOwnPropertyDescriptor(globalThis,'wall')};globalThis.G=c.f.G;globalThis.place=(x,z)=>place(c,x,z);Object.defineProperty(globalThis,'wall',{configurable:true,get:()=>c.wall,set:v=>{c.wall=v;}});try{return fn(args);}finally{globalThis.G=previous.G;globalThis.place=previous.place;if(previous.wall)Object.defineProperty(globalThis,'wall',previous.wall);else delete globalThis.wall;}}}));
const reset=new Function('pages','guest','frames','assert','return ('+resetSource+');')(pages,pages[1],frames,assert);
function claim(d){a.f.projectiles.fireShooter(a.local,a.local.weapon,0);a.f.projectiles.clear();a.net.sendHit(a.local,a.remote,d,a.local.weapon.id);frames(20);events.push({scenario,kind:'afterClaim',hp:b.local.hp,pending:[...(b.net._combatProvenance?.pending.values()||[])].flat().map(x=>x.d)});}
scenario='A';await reset();const sent=[],send=a.net.sendHit;a.net.sendHit=function(...args){sent.push(args[2]);return send.apply(this,args);};a.f.projectiles.fireShooter(a.local,a.local.weapon,0);for(let i=0;i<60&&!sent.length;i++)a.f.projectiles.update(1/60);frames(20);assert.equal(sent.length,1);assert(Math.abs(b.local.hp-(100-sent[0]))<.11);
scenario='B';await reset();claim(220);assert.equal(b.local.hp,100);
scenario='C';await reset();b.wall=true;claim(36);assert.equal(b.local.hp,100);
scenario='D';await reset(5,7);b.wall=true;claim(36);

const result={hp:b.local.hp,events};p.dispose();return result;
}

const checker=fs.readFileSync(new URL('../../../scripts/check-inkwave-combat-trust.mjs',import.meta.url),'utf8');
const begin=checker.indexOf('  const reset=');
const end=checker.indexOf('\n  await frames(12);',begin);
assert(begin>=0&&end>begin,'checker reset boundary remains identifiable');
const resetSource=checker.slice(begin,end).trim().slice('const reset='.length,-1);
test('combat trust checker drains rejected claims in the old scene; exact hits remain once-only',async()=>{
 const stale=await runScenario('async(victimX=0,victimZ=10)=>{await Promise.all(pages.map(p=>p.evaluate(([x,z])=>{place(x,z);G.actors[1].hp=100;wall=false;},[victimX,victimZ])));await frames(80);}');
 assert.equal(stale.hp,28,'negative control reproduces the exact old browser failure');
 const staleAcks=stale.events.filter(e=>e.scenario==='D'&&e.d?.k==='hit_ack');
 assert.deepEqual(staleAcks.map(e=>[e.d.h,e.d.hp]),[[3,64],[4,28]],'two distinct claims, not duplicate admission of one ID');
 const fixed=await runScenario(resetSource);
 assert.equal(fixed.hp,64,'new scenario admits exactly the intended legal36');
 const fixedAcks=fixed.events.filter(e=>e.scenario==='D'&&e.d?.k==='hit_ack');
 assert.deepEqual(fixedAcks.map(e=>[e.d.h,e.d.hp]),[[4,64]],'expired occluded h3 never becomes legal after opening the wall');
 assert.equal(fixed.events.filter(e=>e.scenario==='D'&&e.kind==='applyHit'&&e.result==='accepted').length,1);
});
