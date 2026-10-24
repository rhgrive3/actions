// Validated equipment receipts must not inherit Dualies' colliding turret bit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
let clock=1000, serial=0, shared;
const FLAG=134217728;
function scene() {
  return shared ||= fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    vmPerformance:{now:()=>clock},
    extraExports:`export {objectShredderEquipped,objectGearRate,withObjectHitGear} from './patches/splatoon3/runtime/object-gear.mjs';
      export {installDisconnectFidelity} from './patches/splatoon3/runtime/disconnect-fidelity.mjs';`});
}
async function pair(id,run) {
  const f=await scene(), owner=f.make(id), proxy=f.make(id), nid=++serial;
  owner.owner=proxy.owner='sender';owner.nid=proxy.nid=nid;
  owner.isLocal=true;proxy.isLocal=false;owner.form=proxy.form='kid';
  owner.pos.set(1,0,1);proxy.pos.copy(owner.pos);
  let wire;
  const cfg={id:'private-object-gear-receipt',map:'standard'};
  const tx=new f.NetMatch({myId:'sender',isHost:false,hostId:'host',tr:{broadcast(p){wire=JSON.stringify(p);return true;}}},cfg);
  const rx=new f.NetMatch({myId:'receiver',isHost:false,hostId:'host'},cfg);
  tx.byNid.set(nid,owner);rx.byNid.set(nid,proxy);tx._setupActor(owner);rx._setupActor(proxy);
  for(const [net,actor] of [[tx,owner],[rx,proxy]]) {
    net.s._members=new Map([['sender',{}],['receiver',{}]]);
    net.match={actors:[actor],state:'playing',time:300,duration:400,mode:'turf',opts:{range:true},
      removeActor(a){this.actors=this.actors.filter(x=>x!==a);}};
  }
  const gear=equipped=>{
    owner.s3.loadout=[{main:'none',subs:['none','none','none']},{main:'none',subs:['none','none','none']},
      {main:equipped?'objectShredder':'none',subs:['none','none','none']}];
    owner.s3RefreshGear();assert.equal(f.objectShredderEquipped(owner),equipped);
  };
  const turret=value=>{
    if(owner.weapon.catalogRecord?.family==='dualies') {
      owner.weaponRunner.catalogState||={id};
      Object.assign(owner.weaponRunner.catalogState,{roll:null,turret:value?1:0,turretHeld:value});
      owner.weaponRunner.s3Turret=false;
    } else owner.weaponRunner.s3Turret=value;
  };
  const send=()=>{clock+=50;f.G.time=clock/1000;assert.equal(tx._sendTick(),true);return JSON.parse(wire);};
  const accept=(p,from=proxy.owner)=>rx._tick(from,p);
  const play=p=>{rx._peer(proxy.owner).tr=p.ts;rx._sample(proxy,p.ts,1/60);rx.applyRemote(proxy,1/60);};
  try {await run({f,owner,proxy,nid,tx,rx,gear,turret,send,accept,play});}
  finally {tx.dispose();rx.dispose();f.G.actors.length=0;f.G.projectiles.clear();}
}

test('native/catalogue Dualies: four equipment/turret states stay independent',async()=>{
  for(const id of ['dualies','s3-maneuver-short'])for(const equipped of [false,true])for(const pose of [false,true])
    await pair(id,async({f,proxy,nid,gear,turret,send,accept,play})=>{
      gear(equipped);turret(pose);const p=send();
      assert.equal(!!(p.a[0][10]&FLAG),pose,'unchanged Dualies writer still owns the colliding wire bit');
      accept(p);const proof=proxy.s3.objectGearSnapshot;
      assert.equal(proof.source,'accepted-gear');assert.equal(proof.sequence,p.a[0][23][2]);
      assert.equal(proof.owner,'sender');assert.equal(proof.life,p.l[nid]);
      assert.equal(f.objectShredderEquipped(proxy),equipped);play(p);
      assert.equal(f.objectShredderEquipped(proxy),equipped);
      assert.equal(f.objectGearRate(proxy,'sprinkler'),equipped?10:1);
      assert.equal(proxy.character.s3RemoteTurretPose,pose,'turret presentation unchanged');
    });
});

test('non-Dualies controls preserve equipment for either turret-like value',async()=>{
  for(const id of ['roller','shooter','charger','s3-roller-compact'])for(const equipped of [false,true])for(const pose of [false,true])
    await pair(id,async({f,proxy,gear,turret,send,accept,play})=>{
      gear(equipped);turret(pose);const p=send();assert.equal(!!(p.a[0][10]&FLAG),equipped);
      accept(p);play(p);assert.equal(f.objectShredderEquipped(proxy),equipped);
      assert.equal(proxy.s3.objectGearSnapshot.source,'accepted-gear');
    });
});

const invalidSidecars={
  omitted:(p,n)=>{delete p.gg;},
  missingActor:(p,n)=>{delete p.gg[n];},
  malformed:(p,n)=>{p.gg[n]=false;},
  wrongTag:(p,n)=>{p.gg[n][0]='invalid';},
  wrongMatch:(p,n)=>{p.gg[n][1]='other-match';},
  wrongActor:(p,n)=>{p.gg[n][2]=n+10000;},
  wrongLife:(p,n)=>{p.gg[n][3]++;},
  staleSequence:(p,n)=>{p.gg[n][4]--;},
  futureSequence:(p,n)=>{p.gg[n][4]++;},
  illegalAbility:(p,n)=>{p.gg[n][5][0][1]=5;},
  missingPiece:(p,n)=>{p.gg[n][5].pop();},
};
test('new missing/invalid sidecar replaces prior valid proof with explicit legacy fallback, never stale loadout',async t=>{
  for(const id of ['dualies','s3-maneuver-short','roller'])for(const fallback of [false,true])
    for(const [label,mutate] of Object.entries(invalidSidecars))await pair(id,async({f,proxy,nid,gear,turret,send,accept,play})=>{
      gear(!fallback);turret(fallback);let p=send();accept(p);play(p);
      const previous=proxy.s3.objectGearSnapshot;assert.equal(f.objectShredderEquipped(proxy),!fallback);
      // For non-Dualies the genuine equipment bit is the fallback source.
      if(id==='roller')gear(fallback);
      p=send();mutate(p,nid);accept(p);const proof=proxy.s3.objectGearSnapshot;
      assert.notEqual(proof,previous,label);assert.equal(proxy.net.buf.at(-1).adoption.gear,null,label);
      assert.equal(proof.source,'legacy-flag',label);assert.equal(proof.equipped,fallback,label);
      play(p);assert.equal(f.objectShredderEquipped(proxy),fallback,label);
      assert.equal(proxy.s3.loadout[2].main,!fallback?'objectShredder':'none','retained presentation loadout is not used as fresh evidence');
    });
  t.diagnostic('66 accepted missing/invalid sidecars; both fallback bit values retained, including knowingly ambiguous Dualies cases');
});

test('replayed timestamps/sequences and wrong sender cannot replace an admitted receipt',async()=>{
  await pair('dualies',async({f,proxy,gear,turret,send,accept})=>{
    gear(true);turret(false);const first=send();accept(first);const proof=proxy.s3.objectGearSnapshot, count=proxy.net.buf.length;
    gear(false);turret(true);
    const replay=JSON.parse(JSON.stringify(first));replay.gg[proxy.nid][5][2][1]=0;accept(replay);
    assert.equal(proxy.s3.objectGearSnapshot,proof);assert.equal(proxy.net.buf.length,count);
    const stale=send();stale.a[0][23][2]=first.a[0][23][2];stale.gg[proxy.nid][4]=first.a[0][23][2];accept(stale);
    assert.equal(proxy.s3.objectGearSnapshot,proof);assert.equal(proxy.net.buf.length,count);
    const malformed=send();malformed.a[0][23][0]='invalid-adoption';accept(malformed);
    assert.equal(proxy.s3.objectGearSnapshot,proof);assert.equal(proxy.net.buf.length,count);
    accept(send(),'intruder');assert.equal(proxy.s3.objectGearSnapshot,proof);
    assert.equal(f.objectShredderEquipped(proxy),true);
  });
});

test('latest accepted equipment receipt wins over delayed playback of an older loadout',async()=>{
  await pair('dualies',async({f,proxy,gear,turret,send,accept,play})=>{
    gear(true);turret(false);const first=send();accept(first);play(first);
    assert.equal(f.objectShredderEquipped(proxy),true);
    gear(false);turret(true);const second=send();accept(second);
    assert.equal(f.objectShredderEquipped(proxy),false,'newly accepted unequipped identity wins immediately');
    play(first);assert.equal(proxy.s3.loadout[2].main,'objectShredder','delayed frame still carries older presentation loadout');
    assert.equal(f.objectShredderEquipped(proxy),false,'older sampled loadout cannot promote current receipt');
    assert.equal(f.objectGearRate(proxy,'sprinkler'),1);play(second);
    assert.equal(f.objectShredderEquipped(proxy),false);
  });
});

test('owner/life replacement rejects old proof and accepted new identity is authoritative',async()=>{
  await pair('dualies',async({f,owner,proxy,nid,gear,turret,send,accept})=>{
    gear(true);turret(false);accept(send());const old=proxy.s3.objectGearSnapshot;
    proxy.owner='replacement';assert.equal(f.objectShredderEquipped(proxy),false,'old owner proof invalid immediately');
    accept(send(),'sender');assert.equal(proxy.s3.objectGearSnapshot,old,'former owner packet rejected');
    gear(false);turret(true);accept(send(),'replacement');assert.equal(proxy.s3.objectGearSnapshot.owner,'replacement');
    assert.equal(f.objectShredderEquipped(proxy),false,'new owner unequipped despite turret');
    gear(true);turret(false);accept(send(),'replacement');assert.equal(f.objectShredderEquipped(proxy),true);
    const life=proxy.net.lastLife;proxy.netLife=proxy.net.lastLife=life+1;
    assert.equal(f.objectShredderEquipped(proxy),false,'old life proof invalid immediately');
    const before=proxy.s3.objectGearSnapshot;accept(send(),'replacement');assert.equal(proxy.s3.objectGearSnapshot,before,'old life row rejected');
    owner.netLife=life+1;gear(false);turret(true);const next=send();accept(next,'replacement');
    assert.equal(proxy.s3.objectGearSnapshot.life,next.l[nid]);assert.equal(f.objectShredderEquipped(proxy),false);
    gear(true);turret(false);accept(send(),'replacement');assert.equal(f.objectShredderEquipped(proxy),true);
    proxy.net._adoptionSeq++;assert.equal(f.objectShredderEquipped(proxy),false,'superseded sequence proof cannot persist');
  });
});

test('legacy actor row without adoption overwrites receipt, keeps historical bit interpretation explicit',async()=>{
  for(const bit of [false,true])await pair('dualies',async({f,proxy,gear,turret,send,accept})=>{
    gear(!bit);turret(bit);accept(send());assert.equal(proxy.s3.objectGearSnapshot.source,'accepted-gear');
    const p=send();p.a[0]=p.a[0].slice(0,23);delete p.gg;accept(p);
    assert.equal(proxy.net.buf.at(-1).adoption,undefined);
    assert.equal(proxy.s3.objectGearSnapshot.source,'legacy-flag');assert.equal(proxy.s3.objectGearSnapshot.sequence,undefined);
    assert.equal(f.objectShredderEquipped(proxy),bit,'compatibility fallback is not a claim of recovered equipment truth');
  });
});

test('hit-scoped explicit os override and finally restoration are unchanged',async()=>{
  await pair('dualies',async({f,proxy,gear,turret,send,accept})=>{
    gear(false);turret(true);accept(send());assert.equal(f.objectShredderEquipped(proxy),false);
    assert.throws(()=>f.withObjectHitGear(proxy,true,()=>{
      assert.equal(f.objectShredderEquipped(proxy),true);assert.equal(f.objectGearRate(proxy,'sprinkler'),10);
      f.withObjectHitGear(proxy,false,()=>assert.equal(f.objectShredderEquipped(proxy),false));
      assert.equal(f.objectShredderEquipped(proxy),true);throw Error('sentinel');
    }),/sentinel/);
    assert.equal(proxy.s3.objectHitGear,undefined);assert.equal(f.objectShredderEquipped(proxy),false);
  });
});


test('actual native onLeave hands remote ownership off, then _adopt preserves accepted local loadout',async()=>{
  for(const equipped of [false,true])await pair('dualies',async({f,owner,proxy,tx,rx,gear,turret,send,accept,play})=>{
    gear(!equipped);turret(equipped);const first=send();accept(first);play(first);
    const old=proxy.s3.objectGearSnapshot;
    rx.s.hostId='next';rx.s._members.set('next',{});rx.onLeave('sender',true);
    assert.equal(proxy.owner,'next');assert.equal(proxy.remote,true);assert.equal(proxy.net.buf.length,0);
    assert.equal(proxy.net.ready,true,'native handoff retains current/ready');
    assert.equal(proxy.s3.objectGearSnapshot,old,'guard invalidates old proof without mutating it');
    assert.equal(f.objectShredderEquipped(proxy),false,'old owner receipt cannot survive actual onLeave');
    rx.applyRemote(proxy,1/60);assert.equal(f.objectShredderEquipped(proxy),false,'retained current frame cannot revive old proof');
    accept(send(),'sender');assert.equal(proxy.s3.objectGearSnapshot,old,'departed sender still rejected');
    tx.myId=tx.s.myId='next';owner.owner='next';gear(equipped);turret(!equipped);
    const next=send();accept(next,'next');assert.equal(f.objectShredderEquipped(proxy),equipped);
    // Do not play the new sample: _adopt must use existing latestAdoptionTransfer/applyAcceptedGear.
    rx.s.hostId=rx.myId;rx.onLeave('next',true);
    assert.equal(proxy.owner,'receiver');assert.equal(proxy.remote,false);assert.equal(proxy.isBot,true);
    assert.equal(proxy.net.buf.length,0);assert.equal(proxy.s3.loadout[2].main,equipped?'objectShredder':'none');
    assert.equal(f.objectShredderEquipped(proxy),equipped,'local takeover continues existing loadout semantics');
    accept(send(),'next');assert.equal(f.objectShredderEquipped(proxy),equipped,'departed owner cannot change local takeover');
  });
});

test('actual bootstrap disconnect policy deactivates live humans and removes pre-match actors separately',async()=>{
  const f=await scene();f.installDisconnectFidelity(f);
  for(const state of ['playing','intro'])await pair('dualies',async({proxy,nid,rx,gear,turret,send,accept,play})=>{
    gear(true);turret(false);const first=send();accept(first);play(first);
    assert.equal(f.objectShredderEquipped(proxy),true);rx.match.state=state;
    rx.onLeave('sender',false);
    if(state==='playing') {
      assert.equal(proxy.owner,null);assert.equal(proxy.remote,true);assert.equal(proxy.alive,false);
      assert.equal(proxy.s3.disconnected,true);assert.equal(proxy.net.buf.length,0);
      assert.equal(f.objectShredderEquipped(proxy),false,'live disconnect invalidates admitted owner proof');
      rx.applyRemote(proxy,1/60);assert.equal(f.objectShredderEquipped(proxy),false);
    } else {
      assert.equal(rx.byNid.has(nid),false);assert.equal(rx.match.actors.includes(proxy),false);
      // The removed object is not reclassified as unequipped; it is no longer an active network actor.
    }
    const proof=proxy.s3.objectGearSnapshot;accept(send(),'sender');
    assert.equal(proxy.s3.objectGearSnapshot,proof,'disconnect wrapper rejects delayed owner packets');
  });
});
