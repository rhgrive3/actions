import test from 'node:test';
import assert from 'node:assert/strict';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';
import { withObjectDamageCause } from '../runtime/sub-resistance.mjs';
import { fixture } from './source-fixture.mjs';

test('native hit JSON and retained retry message carry exact blast phase to victim-owned armor',async()=>{
  const f=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true});
  f.G.match={range:true,state:'playing',playing:()=>true};
  const rf=await fixture({fullRuntime:true,realProjectiles:true,productionComposition:true});
  const outgoing=[],acks=[],ticks=[];
  const session=(myId,records)=>({myId,hostId:'A',isHost:myId==='A',_members:new Map([['A',{}],['B',{}]]),tr:{broadcast(data){if(data.k==='t')ticks.push(JSON.parse(JSON.stringify(data)));return true;},sendTo(to,data){records.push({to,data:JSON.parse(JSON.stringify(data))});return true;}}});
  const sender=new f.NetMatch(session('A',outgoing),{id:'parity-round'}),receiver=new rf.NetMatch(session('B',acks),{id:'parity-round'});
  const shooter=f.make('shooter'),proxy=rf.make('shooter'),victim=rf.make('shooter'),ghost=f.make('shooter');
  for(const a of [shooter,proxy])Object.assign(a,{nid:1,owner:'A',team:1,netLife:1,weapon:{...a.weapon,special:'inkjet'}});
  for(const a of [victim,ghost])Object.assign(a,{nid:2,owner:'B',team:0,netLife:1,weapon:{...a.weapon,special:'booyahBomb'},invuln:0});
  proxy.remote=true;ghost.remote=true;victim.remote=false;shooter.remote=false;
  for(const [world,nm,actors]of [[f,sender,[shooter,ghost]],[rf,receiver,[proxy,victim]]]){
    world.G.level=new world.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});
    world.G.physics=new world.Physics(world.G.level);
    const match={actors,state:'playing',playing:()=>true,time:180};
    nm.bind(match);nm.s.match=nm;world.G.match=match;world.G.netm=nm;world.G.actors=actors;
    actors[0].pos.set(0,0,0);actors[1].pos.set(2,0,0);actors[0].aimDir.set(0,0,1);
  }
  function admitBirth(kind){
    assert.equal(sender._sendTick(),true,'native owner tick emitted');
    const tick=ticks.at(-1),birth=tick.e?.find(e=>e[1]==='ev'&&e[2]===kind);
    assert.ok(birth,'real producer event present');
    receiver.onMessage('A',tick);
    assert.ok(receiver.peers.get('A')?.events.some(e=>e[1]==='ev'&&e[2]===kind&&e._netSeq===birth.at(-1)),'native receiver admitted producer event');
  }
  try {
  victim.special=victim.specialCost();victim._startSpecial();for(let i=0;i<30;i++)victim._updateSpecial(1/60);
  assert.equal(victim._s3AllSpecialState.armorHP,470);
  shooter.special=shooter.specialCost();shooter._startSpecial();
  assert.equal(shooter.specialActive?.id,'inkjet');admitBirth('special:use');
  shooter._s3AllSpecialDamageCause='Jetpack_BombCore';
  const originalTransport=sender.s.tr.sendTo;
  assert.equal(sender.sendHit(shooter,ghost,100,'inkjet'),true);
  assert.equal(sender.s.tr.sendTo,originalTransport,'transport is restored after synchronous delivery');
  const packet=outgoing.find(e=>e.data.k==='hit').data;
  assert.equal(packet.w,'inkjet');assert.equal(packet.oc,'Jetpack_BombCore');
  assert.equal(sender.hitPending.get(packet.seq)[0].oc,'Jetpack_BombCore','handoff retry retains the same phase');
  rf.G.netm=receiver;rf.G.actors=[proxy,victim];
  receiver._hit({...packet,oc:'ObjectEffect_Up'},'A');
  assert.doesNotThrow(()=>receiver._hit({...packet,w:'__proto__'},'A'));
  receiver._hit(packet,'foreign');
  assert.equal(victim._s3AllSpecialState.armorHP,470,'invalid phase and foreign sender consume no HP/receipt');
  receiver._hit(packet,'A');
  assert.equal(victim._s3AllSpecialState.armorHP,270,'Jetpack blast applies 2× to armor, rather than bullet 1.3334×');
  assert.equal(proxy._s3AllSpecialDamageCause,undefined,'receive scope is restored');
  receiver._hit(packet,'A');
  assert.equal(victim._s3AllSpecialState.armorHP,270,'native duplicate receipts still reject a second hit');
  const r=MAIN_WEAPON_CATALOG.records.find(r=>r.sourceRow==='Charger_Long_00');
  assert.ok(r);
  // Independent raw-cause cases share the victim armor ledger, not active
  // special state. Use native actor reset, then produce a new main event.
  shooter.reset();f.G.time+=1/60;
  assert.equal(shooter.specialActive,null);assert.equal(shooter.superJumpState,null);
  delete shooter._s3AllSpecialDamageCause;
  for(const a of [shooter,proxy])a.setWeapon(r.id);
  f.G.projectiles.fireCharger(shooter,shooter.weapon,1);
  admitBirth('weapon:fire');
  withObjectDamageCause({owner:shooter,catalog:{r,descriptor:{charge:1}}},()=>sender.sendHit(shooter,ghost,100,r.id));
  const mainPacket=outgoing.at(-1).data;assert.equal(mainPacket.oc,'ChargerFull_Long');
  receiver._hit({...mainPacket,oc:'RollerCore'},'A');
  assert.equal(victim._s3AllSpecialState.armorHP,270,'a cause from another weapon family is rejected');
  receiver._hit(mainPacket,'A');
  assert.equal(victim._s3AllSpecialState.armorHP,135,'source ChargerFull_Long armor factor 1.35 survives native wire');
  for(const a of [shooter,proxy])a.weapon={...a.weapon,special:'crabTank'};
  f.G.time+=1/60;shooter.special=shooter.specialCost();shooter._startSpecial();
  assert.equal(shooter.specialActive?.id,'crabTank');admitBirth('special:use');
  withObjectDamageCause(shooter,()=>sender.sendHit(shooter,ghost,10,'crabTank'),'Default');
  const crabPacket=outgoing.at(-1).data;assert.equal(crabPacket.oc,'Default');
  receiver._hit(crabPacket,'A');
  assert.equal(victim._s3AllSpecialState.armorHP,125,'Crab direct contact uses authored Default=1, not Shooter=.7');
  }finally{sender.dispose();receiver.dispose();f.G.projectiles.clear();rf.G.projectiles.clear();}
});
