import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './robustness-fixture.mjs';
import {nativeMainBirth} from './native-main-birth-fixture.mjs';

// Real composed NetMatch -> native Boss.remoteHit/applyDamage/_hitCrab.
// Display, flat world and Boss placement are controlled component inputs;
// this is neither a socket/browser test nor a trusted action simulation.
async function setup(t,{kind='shooter'}={}) {
  const f=await fixture({productionComposition:true,transformSource(rel,code){
    return rel==='src/net/netmatch.js'?code+"\nexport { Boss } from '../boss/boss.js';\n":code;
  }});
  const nm=f.makeNetMatch(f.makeSession('me','me',[['me','Me'],['peer','Peer']]));
  const actor=f.makeActor({nid:17,owner:'peer',remote:true,team:0,roller:false});
  actor.weapon=f.WEAPONS[kind];actor.netLife=0;actor.pos.set(0,0,0);
  actor.character.getMuzzle=out=>out.copy(actor.pos).add(new f.THREE.Vector3(0,1,0));
  const match=f.bind(nm,[actor]);nm.match=null;nm.bind(match);f.G.match=nm.match;f.G.actors=[actor];
  const boss=Object.assign(Object.create(f.Boss.prototype),{
    sim:true,dead:false,visible:true,invuln:false,pos:new f.THREE.Vector3(0,0,7),
    hp:1000,maxHp:1000,match:nm.match,flashN:0,weakN:0,log:{recv:0,recvDmg:0},
    // The real producer launches at y=1.05; native sphere centre is y+.35.
    crabs:new Map([[3,{id:3,x:0,y:.7,z:7,hp:1000,dead:false}],
      [4,{id:4,x:0,y:.7,z:9,hp:1000,dead:false}]]),
    model:{flash(){},hitShapes:[{active:true,weak:false,pos:new f.THREE.Vector3(0,1,7),r:1}]},
  });
  nm.match.boss=boss;f.clock.set(100);t.after(()=>nm.dispose());
  const claim=(extra={})=>({k:'bhit',m:nm.cfg.id,a:17,l:0,q:1,d:36,w:kind,c:-1,weak:0,...extra});
  const send=(extra={})=>nm.onMessage('peer',claim(extra));
  function fire(ts=1000,{slot='main'}={}) {
    if(slot==='sub') {
      // Use the installed launch, native recorder and actor serializer. A raw
      // legacy bomb row no longer authorizes this completed receiver birth.
      const remote=actor.remote,clock=f.clock.now(),broadcast=nm.s.tr.broadcast;
      let packet;
      try {
        actor.remote=false;actor.weaponRunner.charge=0;f.clock.set(ts);nm.out.length=0;nm.match.boss=null;
        f.projectiles.throwBomb(actor);
        assert.ok(nm.out.some(e=>e[1]==='b'),'actual native bomb producer records a birth');
        nm.s.tr.broadcast=message=>{packet=JSON.parse(JSON.stringify(message));};
        nm._sendTick();
      } finally {
        actor.remote=remote;f.clock.set(clock);nm.s.tr.broadcast=broadcast;nm.match.boss=boss;
        f.projectiles.clear();nm.out.length=0;
      }
      nm.onMessage('peer',packet);
      for(const event of nm.peers.get('peer')?.events.splice(0)||[])nm._play('peer',event);
      const proof=nm._combatProvenance.proofs.get('peer')?.at(-1);
      assert.ok(proof,'completed native ghost creation commits the bomb proof');
      return proof;
    }
    const event=kind==='shooter'?nativeMainBirth(f,nm,actor,actor.weapon,ts):[ts,'ev','weapon:fire',{
      actor:{n:17},weapon:actor.weapon.id,muzzle:[0,1,0],dir:[0,0,1],
    }];
    nm.onMessage('peer',{k:'t',ts,u:60000+Math.round((ts-1000)*60),
      a:[f.packActor(actor,{f:1})],l:{17:0},e:[event]});
    return nm._combatProvenance.proofs.get('peer').at(-1);
  }
  return {f,nm,actor,boss,claim,send,fire};
}

for(const c of [-1,3])test(`one straight-fire proof cannot damage Boss target ${c} twice with fresh nonces`,async t=>{
  const x=await setup(t),p=x.fire(),target=c<0?x.boss:x.boss.crabs.get(c);
  x.send({c,w:c<0?'shooter':'crab'});
  assert.equal(target.hp,964);assert.equal(p.uses,1);
  x.send({c,w:c<0?'shooter':'crab',q:2});
  assert.equal(target.hp,964,'a new transport nonce cannot invent another collision');
  assert.equal(x.nm.peers.get('peer').lastBossHit,1,'rejection preserves the native nonce');
  assert.equal(p.uses,1,'rejection preserves remaining cross-target proof capacity');
  x.fire(1000.1);x.send({c,w:c<0?'shooter':'crab',q:2});
  assert.equal(target.hp,928,'a separate admitted attack keeps its original damage');
  assert.equal(x.nm.peers.get('peer').lastBossHit,2);
});

test('Charger proof retains distinct Boss and crablet targets, one contact per target',async t=>{
  const x=await setup(t,{kind:'charger'}),p=x.fire();
  x.send({d:80});x.send({q:2,c:3,w:'crab',d:80});
  assert.equal(x.boss.hp,920);assert.equal(x.boss.crabs.get(3).hp,920);
  assert.equal(p.uses,2,'existing two-target capacity is preserved');
});

test('main shot cannot borrow the equipped bomb damage ceiling through the crab marker',async t=>{
  const x=await setup(t),p=x.fire();
  assert.ok(x.actor.weapon.sub,'positive fixture has an equipped sub');
  x.send({c:3,w:'crab',d:100});
  assert.equal(x.boss.crabs.get(3).hp,1000);
  assert.equal(x.actor.stats.bossDmg??0,0);assert.equal(x.boss.log.recv,0);
  assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);assert.equal(p.uses,0);
  x.send({c:3,w:'crab',d:36});
  assert.equal(x.boss.crabs.get(3).hp,964);assert.equal(p.uses,1);
  assert.equal(x.nm.peers.get('peer').lastBossHit,1);
});

test('queued crab inflation stays rejected when the weaker main proof later arrives',async t=>{
  const x=await setup(t);
  x.send({c:3,w:'crab',d:100});
  assert.equal(x.nm._combatProvenance.pending.get('peer').length,1);
  const p=x.fire();
  assert.equal(x.boss.crabs.get(3).hp,1000);assert.equal(p.uses,0);
  assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);
  x.send({c:3,w:'crab',d:36});
  assert.equal(x.boss.crabs.get(3).hp,964);assert.equal(p.uses,1);
});

test('an equipped bomb proof retains its damage and independent crablet contacts',async t=>{
  const x=await setup(t),p=x.fire(1000,{slot:'sub'});
  assert.equal(p.kind,'sub');assert.equal(p.cause,x.actor.weapon.sub);
  x.send({c:3,w:'crab',d:100});x.send({q:2,c:4,w:'crab',d:100});
  assert.equal(x.boss.crabs.get(3).hp,900);assert.equal(x.boss.crabs.get(4).hp,900);
  assert.equal(p.uses,2);
});

test('a legacy bomb row cannot grant Boss proof without completed native birth',async t=>{
  const x=await setup(t);
  x.nm.onMessage('peer',{k:'t',r:2,ts:1000,u:60000,a:[x.f.packActor(x.actor,{f:1})],l:{17:0},
    e:[[1000,'b',17,'bomb',0,1,0,0,0,10,60000,1]]});
  for(const event of x.nm.peers.get('peer')?.events.splice(0)||[])x.nm._play('peer',event);
  x.send({c:3,w:'crab',d:100});
  assert.equal(x.boss.crabs.get(3).hp,1000);
  assert.equal(x.nm._combatProvenance.proofs.get('peer')?.length??0,0);
  assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);
});

for(const phase of ['invuln','hidden'])test(`Boss ${phase} rejection does not consume proof before body becomes vulnerable`,async t=>{
  const x=await setup(t),p=x.fire();
  if(phase==='invuln')x.boss.invuln=true;else x.boss.visible=false;
  x.send();assert.equal(x.boss.hp,1000);
  assert.equal(p.uses,0);assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);
  assert.equal(x.nm._combatProvenance.pending.get('peer')?.length??0,0,
    'a fully classified blocked body claim must not become future damage');
  x.boss.invuln=false;x.boss.visible=true;
  x.send();assert.equal(x.boss.hp,964);assert.equal(p.uses,1);
});

test('deferred body damage retires if the host becomes invulnerable before proof arrives',async t=>{
  const x=await setup(t);x.send();
  assert.equal(x.nm._combatProvenance.pending.get('peer').length,1);
  x.boss.invuln=true;const p=x.fire();
  assert.equal(x.boss.hp,1000);assert.equal(p.uses,0);
  assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);
  assert.equal(x.nm._combatProvenance.pending.get('peer')?.length??0,0);
  x.boss.invuln=false;x.fire(1000.1);
  assert.equal(x.boss.hp,1000,'phase change cannot revive the classified claim');
  x.send();assert.equal(x.boss.hp,964);
});

test('Roller contact cannot borrow an equipped bomb ceiling under the crab marker',async t=>{
  const x=await setup(t,{kind:'roller'});x.boss.crabs.get(3).z=1;
  x.actor.weaponRunner.rolling=true;
  x.nm.onMessage('peer',{k:'t',ts:1000,u:60000,
    a:[x.f.packActor(x.actor,{f:257})],l:{17:0},e:[]});
  x.send({c:3,w:'crab',d:180});
  assert.equal(x.boss.crabs.get(3).hp,1000);
  assert.equal(x.nm._combatProvenance.contacts.size,0);
  assert.equal(x.nm.peers.get('peer').lastBossHit,undefined);
  x.send({c:3,w:'crab',d:140});
  assert.equal(x.boss.crabs.get(3).hp,860);
  assert.equal(x.nm._combatProvenance.contacts.size,1);
});

for(const dt of [1/30,1/60,1/120])test(`native Shooter launch and Boss contact retain damage at ${Math.round(1/dt)}Hz`,async t=>{
  const x=await setup(t),{f,nm,actor,boss}=x;
  // Run the actual native launch/flight/contact before replaying its real
  // emitted owner rows through the receiver. Only this contact's final damage
  // routing is captured; receiver admission and native Boss HP stay installed.
  const contacts=[],nativeHit=boss.hit;
  boss.hit=(a,d,target,w)=>contacts.push({a,d,target,w});
  f.G.boss=boss;actor.remote=false;actor.aimPoint.set(0,1,7);nm.out.length=0;
  actor.character.getMuzzle=out=>out.copy(actor.pos).add(new f.THREE.Vector3(0,1.05,.3));
  f.projectiles.fireShooter(actor,actor.weapon,0);
  const events=nm.out.slice(),p=f.projectiles.list[0];
  assert.ok(p,'real native launch created a round');
  for(let frame=0;frame<120&&!contacts.length;frame++) {
    f.G.time+=dt;f.projectiles._step(p,dt);
  }
  actor.remote=true;boss.hit=nativeHit;f.G.boss=null;
  assert.equal(contacts.length,1,'native flight intersects one Boss hit sphere');
  assert.equal(contacts[0].target,boss.model.hitShapes[0]);
  assert.ok(events.some(e=>e[1]==='p'),'real launch recorded its projectile birth');
  nm.onMessage('peer',{k:'t',ts:100,r:2,u:events[0].at(-2),
    a:[f.packActor(actor,{f:1})],l:{17:0},e:events});
  assert.equal(nm._combatProvenance.proofs.get('peer').length,1,'real launch creates one attack proof');
  x.send({d:contacts[0].d,w:contacts[0].w});
  assert.equal(boss.hp,1000-contacts[0].d);
  assert.equal(actor.stats.bossDmg,contacts[0].d);
  assert.equal(nm.peers.get('peer').lastBossHit,1);
});
