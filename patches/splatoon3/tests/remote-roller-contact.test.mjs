// CPU-only production-source replication regression. No Character/model/render
// changes or asset loads. A tiny native Level/Physics produces the owner state.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const mode = process.env.ROLLER_CONTACT_MODE || 'candidate';
const sourceRoot = mode === 'frozen' ? path.resolve(ROOT, '../pr1872-roller-review-fe98b0a-20261024-1933') : ROOT;
const { fixture } = await import(pathToFileURL(path.join(sourceRoot, 'patches/splatoon3/tests/source-fixture.mjs')));
const { adaptBuildSource } = await import(pathToFileURL(path.join(sourceRoot, 'scripts/inkwave-source-composition.mjs')));
const SUSPENDED = 1 << 28, GEAR_TURRET = 1 << 27, ALIVE = 1, GROUNDED = 16, ROLLING = 256;
let clock = 1000, serial = 0, shared;
function scene() {
  return shared ||= fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true,
    vmPerformance: { now: () => clock },
    adaptRuntime(rel, raw) {
      let source = adaptBuildSource(rel, raw);
      if (mode === 'no-epoch' && rel === 'patches/network-replication/roller-contact.mjs') {
        const guard = '    && sample.rollerContactEpoch === (net.rollerContactEpoch ?? null)\n';
        assert.equal(source.split(guard).length - 1, 1, 'counterfactual is exact');
        source = source.replace(guard, '');
      }
      return source;
    },
    extraExports: `export { MAIN_WEAPON_CATALOG } from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';
      export { Transport, COMPAT, PROTO } from './inkwave-public/src/net/transport.js';
      export { beginOwnerClock, ownerClockStatus } from './patches/network-replication/owner-clock.mjs';
      export { objectShredderEquipped } from './patches/splatoon3/runtime/object-gear.mjs';
      export { installDisconnectFidelity } from './patches/splatoon3/runtime/disconnect-fidelity.mjs';` });
}
async function pair(id = 'roller') {
  const f = await scene(), owner = f.make(id), proxy = f.make(id), nid = ++serial;
  owner.owner = proxy.owner = 'sender'; owner.nid = proxy.nid = nid;
  owner.isLocal = true; proxy.isLocal = false; owner.form = proxy.form = 'kid';
  owner.netLife = proxy.netLife = 0; owner.netTp = 0;
  for (const actor of [owner, proxy]) actor._nearCamera = () => true;
  const level = new f.Level({ bounds: { minX:-4, maxX:4, minZ:-7, maxZ:4 },
    spawnPads:[[-3,0,0],[3,0,0]], spawnBarrier:0, half:[],
    single:[{kind:'box', min:[-4,-.5,-7], max:[0,0,4]}] });
  f.G.level = level; f.G.physics = new f.Physics(level);
  const queue = [], wires = [], handles = [];
  f.G.audio = { loopWeapon(weapon, action) { const h = {weapon,action,stopped:false,sets:[],
    set(p){this.sets.push(p);}, stop(){this.stopped=true;} }; handles.push(h); return h; }, playWeapon(){} };
  const txTransport = new f.Transport(), rxTransport = new f.Transport();
  const members = () => new Map([['sender',{}],['receiver',{}]]);
  const tx = new f.NetMatch({myId:'sender',isHost:false,hostId:'host',ownerClockVersion:1,_members:members(),tr:txTransport}, {id:'roller-contact-'+nid,map:'standard'});
  const rx = new f.NetMatch({myId:'receiver',isHost:false,hostId:'host',ownerClockVersion:1,_members:members(),tr:rxTransport}, tx.cfg);
  for (const [net, actor] of [[tx,owner],[rx,proxy]]) {
    net.s.match = net; net.byNid.set(nid,actor); net._setupActor(actor);
    net.match = {actors:[actor],state:'playing',time:300,duration:400,mode:'turf',opts:{range:true},
      playing:()=>true,canRespawn:()=>false,removeActor(a){this.actors=this.actors.filter(x=>x!==a);}};
  }
  const activate = net => {f.G.netm=net;f.G.match=net.match;f.G.actors=net.match.actors;};
  txTransport.ws = {readyState:1,bufferedAmount:0,send(frame){queue.push([tx,frame]);wires.push([tx.myId,frame]);}};
  rxTransport.ws = {readyState:1,bufferedAmount:0,send(frame){queue.push([rx,frame]);wires.push([rx.myId,frame]);}};
  function drain(transform) {
    while(queue.length) {
      const [from,frame]=queue.shift(); let target,payload;
      if(frame.startsWith('b|')) {target=from===tx?rx:tx;payload=frame.slice(2);}
      else if(frame.startsWith('s|')) {const split=frame.indexOf('|',2),to=frame.slice(2,split);target=to===rx.myId?rx:to===tx.myId?tx:null;payload=frame.slice(split+1);}
      else continue;
      if(!target)continue;
      const message=JSON.parse(payload);
      if(message.k==='t'&&transform)transform(message);
      activate(target);target.onMessage(from.myId,message);
    }
  }
  f.beginOwnerClock(tx,clock/1000);f.beginOwnerClock(rx,clock/1000);drain();
  assert.ok(f.ownerClockStatus(rx,'sender').origin,'current mandatory owner-clock handshake completed');
  const suspended = () => {
    activate(tx);owner.pos.set(-1.5,0,0);owner.yaw=owner.aimYaw=Math.PI/2;
    owner.grounded=true;owner.ink=100;owner.intent.move.set(1,0,0);owner.intent.fire=true;owner.vel.set(2,0,0);
    owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});
    assert.equal(owner.weaponRunner.rolling,true,'native owner establishes supported hold');
    owner.pos.set(-.25,0,0);owner.grounded=true;
    owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});
    assert.equal(owner.weaponRunner.s3RollerSuspendedHold,true,'native capsule support produces suspended hold');
  };
  function send(transform) {
    activate(tx);clock+=50;f.G.time=clock/1000;
    const before=wires.length;assert.equal(tx._sendTick(),true,'real Transport accepts serialized owner tick');
    const wire=wires.slice(before).find(([from,s])=>from===tx.myId&&s.startsWith('b|')&&JSON.parse(s.slice(2)).k==='t');
    assert.ok(wire,'actual JSON wire frame exists'); const packet=JSON.parse(wire[1].slice(2));
    const prior=proxy.net.buf.length;drain(transform);
    assert.ok(proxy.net.buf.some(s=>s.t===packet.ts),'real _tick admits serialized actor snapshot');
    assert.equal(packet.a[0].length,26,'no new wire columns');
    assert.equal(f.PROTO,2);assert.equal(f.COMPAT,'iw-gameplay-20261024-spawn-start-admission-v1');
    return packet;
  }
  function sample(t,apply=true) {
    activate(rx);rx._peer(proxy.owner).tr=t;rx._sample(proxy,t,1/60);
    // This is the production ordering: NetMatch samples/voices before Match applies actors.
    rx._voices(1/60);if(apply)rx.applyRemote(proxy,1/60);
    return proxy.net.cur;
  }
  function audio(){activate(rx);rx._voices(1/60);return !!proxy.net.loops.roll;}
  function close(){tx.dispose();rx.dispose();f.G.actors.length=0;f.G.projectiles.clear();}
  return {f,owner,proxy,tx,rx,send,sample,suspended,audio,close,activate,drain,wires,handles};
}

// Run this same regression against ROLLER_CONTACT_MODE=frozen for before-negative evidence.
test('serialized owner suspension reaches remote state and silences roll audio without changing grounded or held',async t=>{
  const p=await pair();try {
    p.suspended();const packet=p.send();p.sample(packet.ts);
    const audible=p.audio();t.diagnostic(JSON.stringify({mode,ownerSuspended:p.owner.weaponRunner.s3RollerSuspendedHold,remoteSuspended:p.proxy.weaponRunner.s3RollerSuspendedHold??false,grounded:p.proxy.grounded,held:p.proxy.weaponRunner.rolling,flags:packet.a[0][10],flagsWithoutSuspension:packet.a[0][10]&~SUSPENDED,rollLoopActive:audible,volume:p.proxy.net.loops.roll?.sets?.at(-1)?.volume??0}));
    assert.equal(packet.rf,undefined,'no attack sidecar is manufactured');
    assert.equal(JSON.stringify(packet).includes('rollerContact'),false,'owner/weapon epoch metadata is receiver-local only');
    assert.equal(p.owner.grounded,true);assert.equal(p.proxy.grounded,true);
    assert.equal(p.owner.weaponRunner.rolling,true);assert.equal(p.proxy.weaponRunner.rolling,true);
    assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true,'owner suspension must survive the real JSON, accepted buffer and apply path');
    assert.equal(packet.a[0][10]&SUSPENDED,SUSPENDED);
    assert.equal(p.audio(),false,'grounded suspended drum must not play remote contact loop');
    assert.equal(p.proxy.net.cur.f&(ALIVE|GROUNDED|ROLLING),ALIVE|GROUNDED|ROLLING);
  } finally {p.close();}
});

test('support recovery, release and legacy absence clear the optional state on the sampled timeline',async()=>{
  const p=await pair();try {
    p.suspended();const first=p.send();p.sample(first.ts);assert.equal(p.audio(),false);
    p.activate(p.tx);p.owner.pos.set(-1.5,0,0);p.owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});
    assert.equal(p.owner.weaponRunner.s3RollerSuspendedHold,false,'native contact recovery');
    const recovered=p.send();p.sample((first.ts+recovered.ts)/2);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true,'discrete state remains earlier sample');
    p.sample(recovered.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),true,'contact loop resumes');
    p.activate(p.tx);p.owner.pos.set(-.25,0,0);p.owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});
    const suspendedAgain=p.send();p.sample(suspendedAgain.ts,false);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'runner still holds previous frame until apply');assert.equal(p.audio(),false,'new sampled suspension stops audio before applyRemote');
    p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    p.activate(p.tx);p.owner.intent.fire=false;p.owner.weaponRunner.update(1/60,{fire:false,firePressed:false,sub:false,subReleased:false});
    const released=p.send();p.sample(released.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
    p.owner.weaponRunner.reset();p.suspended();const legacy=p.send(packet=>{packet.a[0][10]&=~SUSPENDED;});p.sample(legacy.ts);
    assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'absent optional bit uses old peer behavior');assert.equal(p.proxy.weaponRunner.rolling,true);assert.equal(p.proxy.grounded,true);assert.equal(p.audio(),true);
  } finally {p.close();}
});

test('unready, invalid, dead and spawn-pending early returns do not retain suspension or audio',async()=>{
  const p=await pair();try {
    p.suspended();const first=p.send();p.sample(first.ts);
    p.proxy.net.ready=false;p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
    p.proxy.net.ready=true;const x=p.proxy.net.cur.x;p.proxy.net.cur.x=NaN;
    p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
    p.proxy.net.cur.x=x;p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    p.proxy.alive=false;p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
    p.proxy.alive=true;p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    p.rx._remoteSplat(p.proxy,null,'roller');assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
    p.rx._remoteRespawn(p.proxy);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
    p.proxy.net.ready=true;p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'old pose cannot bypass late spawn gate');assert.equal(p.audio(),false);
    p.owner.netLife=1;p.owner.netTp=1;const next=p.send();p.sample(next.ts);assert.equal(p.proxy.net.spawnPending,false);assert.equal(p.proxy.netLife,1);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
  } finally {p.close();}
});

test('weapon ABA invalidates already accepted old buffers through interpolation and extrapolation',async()=>{
  const p=await pair();try {
    p.suspended();const first=p.send(),second=p.send();p.sample(first.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    const buf=p.proxy.net.buf,cur=p.proxy.net.cur;
    p.proxy.setWeapon('shooter');assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
    p.proxy.setWeapon('roller');assert.equal(p.proxy.net.buf,buf);assert.equal(p.proxy.net.cur,cur);assert.equal(buf.length,2,'do not destroy unrelated transport data');
    p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'same owner/life old sample must not reappear after ABA');
    p.sample((first.ts+second.ts)/2);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'interpolation keeps old acceptance epoch');assert.equal(p.audio(),false);
    p.sample(second.ts+.03);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,'extrapolation keeps old acceptance epoch');
    const fresh=p.send();p.sample((second.ts+fresh.ts)/2);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
    p.sample(fresh.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true,'new accepted discrete sample can restore suspension');
  } finally {p.close();}
});

test('native owner handoff rejects retained ready old-owner sample until a new owner snapshot is accepted',async()=>{
  const p=await pair();try {
    p.suspended();const first=p.send();p.sample(first.ts);
    p.rx.s.hostId='next';p.rx.s._members.set('next',{});p.rx.onLeave('sender',true);
    assert.equal(p.proxy.owner,'next');assert.equal(p.proxy.net.buf.length,0);assert.equal(p.proxy.net.ready,true,'native handoff retains ready/current');
    p.sample(first.ts+.01);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
    p.tx.myId=p.tx.s.myId='next';p.owner.owner='next';p.tx.s._members.delete('sender');p.tx.s._members.set('next',{});
    clock+=300;p.f.beginOwnerClock(p.rx,clock/1000);p.drain();assert.ok(p.f.ownerClockStatus(p.rx,'next').origin);
    const next=p.send();p.sample(next.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    p.rx.s.hostId=p.rx.myId;p.rx.onLeave('next',true);assert.equal(p.proxy.remote,false,'native local adoption');assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
  } finally {p.close();}
});

test('unrelated families preserve exact bit27 and turret behavior while validated equipment identity is independent',async()=>{
  const api=await scene(), additional=['brush','brella','stringer','splatana'].map(family=>api.MAIN_WEAPON_CATALOG.records.find(r=>r.family===family).id);
  for(const id of ['shooter','charger','blaster','slosher','splatling','dualies','s3-maneuver-short',...additional]) {
    const p=await pair(id);try {
      p.owner.weaponRunner.s3RollerSuspendedHold=true;p.owner.weaponRunner.rolling=true;
      for(const equipped of [false,true])for(const turret of [false,true]) {
        p.owner.s3.loadout=[{main:'none',subs:['none','none','none']},{main:'none',subs:['none','none','none']},{main:equipped?'objectShredder':'none',subs:['none','none','none']}];p.owner.s3RefreshGear();
        if(p.owner.weapon.catalogRecord?.family==='dualies'){p.owner.weaponRunner.catalogState||={id};Object.assign(p.owner.weaponRunner.catalogState,{roll:null,turret:turret?1:0,turretHeld:turret});p.owner.weaponRunner.s3Turret=false;}
        else p.owner.weaponRunner.s3Turret=turret;
        const packet=p.send();p.sample(packet.ts);assert.equal(packet.a[0][10]&SUSPENDED,0,id+' cannot acquire Roller flag');assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
        const dualies=id==='dualies'||id==='s3-maneuver-short';const existing=dualies?turret:equipped;
        assert.equal(!!(packet.a[0][10]&GEAR_TURRET),existing,'wire bit27 remains exactly the pre-existing gear/turret encoding');
        if(dualies)assert.equal(p.proxy.character.s3RemoteTurretPose,turret,'remote turret presentation remains unchanged');
        assert.equal(p.proxy.net.cur.adoption?.gear?.loadout?.[2]?.main,equipped?'objectShredder':'none','actual receiver accepted the independent shoes-main sidecar');
        assert.equal(p.f.objectShredderEquipped(p.proxy),equipped,'validated equipment identity must no longer alias turret');
      }
    } finally {p.close();}
  }
});

test('non-Roller roll audio retains its existing gate with missing or stale contact metadata',async()=>{
  for(const id of ['s3-brush-normal','s3-brush-heavy']){const p=await pair(id);try {
    p.activate(p.tx);p.owner.pos.set(-1.5,0,0);p.owner.grounded=true;p.owner.intent.fire=true;p.owner.intent.move.set(0,0,1);p.owner.vel.set(0,0,2);
    p.owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});assert.equal(p.owner.weaponRunner.rolling,true);
    const packet=p.send();p.sample(packet.ts);assert.equal(p.audio(),true,id+' existing admitted loop');
    const S=p.proxy.net.cur,owner=S.rollerContactOwner,epoch=S.rollerContactEpoch,life=S.life,x=S.x;
    delete S.rollerContactOwner;delete S.rollerContactEpoch;assert.equal(p.audio(),true,id+' absent metadata remains unrelated');
    S.rollerContactOwner='stale-owner';S.rollerContactEpoch={};assert.equal(p.audio(),true,id+' stale metadata remains unrelated');
    S.rollerContactOwner=owner;S.rollerContactEpoch=epoch;S.life=life+1;assert.equal(p.audio(),true,id+' unrelated lifecycle gate unchanged');S.life=life;
    p.proxy.net.ready=false;assert.equal(p.audio(),true,id+' existing readiness behavior unchanged');p.proxy.net.ready=true;
    S.x=NaN;assert.equal(p.audio(),true,id+' no new unrelated pose-validation gate');S.x=x;
  }finally{p.close();}}
});

test('native and catalogue Roller owners replicate their existing airborne hold and landing state',async()=>{
  const f=await scene(),records=f.MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='roller');assert.equal(records.length,5);
  for(const record of records){const p=await pair(record.id);try {
    p.activate(p.tx);p.owner.pos.set(-1.5,0,0);p.owner.grounded=true;p.owner.intent.fire=true;p.owner.intent.move.set(0,0,1);p.owner.vel.set(0,0,2);
    const step=()=>p.owner.weaponRunner.update(1/60,{fire:true,firePressed:false,sub:false,subReleased:false});
    step();assert.equal(p.owner.weaponRunner.rolling,true,record.id+' native established hold');
    p.owner.pos.y=1.5;p.owner.grounded=false;step();assert.equal(p.owner.weaponRunner.s3RollerSuspendedHold,true,record.id+' native air hold');
    const air=p.send();p.sample(air.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true,record.id+' family-aware wire state');assert.equal(p.proxy.grounded,false);assert.equal(p.proxy.weaponRunner.rolling,true);assert.equal(p.audio(),false);
    p.activate(p.tx);p.owner.pos.y=0;p.owner.grounded=true;step();assert.equal(p.owner.weaponRunner.s3RollerSuspendedHold,false);
    const land=p.send();p.sample(land.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.proxy.grounded,true);assert.equal(p.audio(),true);
  }finally{p.close();}}
});

test('remove and dispose explicitly clear the derived remote state',async()=>{
  for(const operation of ['remove','dispose']) {const p=await pair();try {
    p.suspended();const packet=p.send();p.sample(packet.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    if(operation==='remove')p.rx._remove(p.proxy);else p.rx.dispose();
    assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false,operation);
  } finally {p.close();}}
});

test('bootstrap disconnect policy clears and cannot revive a suspended remote actor',async()=>{
  const f=await scene();f.installDisconnectFidelity(f);const p=await pair();try {
    p.suspended();const packet=p.send();p.sample(packet.ts);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,true);
    p.rx.onLeave('sender',false);assert.equal(p.proxy.alive,false);assert.equal(p.proxy.owner,null);assert.equal(p.proxy.s3.disconnected,true);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);
    p.rx.applyRemote(p.proxy,1/60);assert.equal(p.proxy.weaponRunner.s3RollerSuspendedHold,false);assert.equal(p.audio(),false);
  } finally {p.close();}
});
