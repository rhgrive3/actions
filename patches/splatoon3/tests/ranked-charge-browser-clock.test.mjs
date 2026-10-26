import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sourceLoadedActorFixture } from './source-loaded-actor-fixture.mjs';
import { releaseFullRankedRainmaker, readRainmakerChargeProbe, installRainmakerChargeProbe, restoreRainmakerChargeProbe } from '../../../scripts/lib/ranked-rainmaker-charge.mjs';

// Actual composed Input -> Player -> Actor -> fixed clock -> 20Hz NetMatch ->
// Transport JSON -> native host admission -> Rainmaker rule. Only socket delivery,
// rendering and Playwright's RPC surface are controlled; no gameplay state is
// rewritten while the helper charges or releases.
const stage = { id: 'ranked-charge-clock', rainmaker: { center: [0,0,0], goals: [[0,0,100],[0,0,-100]], checkpoints: [[],[]], retreatZ: [-90,90] } };
const extraExports = `
 export { Input } from './src/core/input.js';
 export { Transport } from './src/net/transport.js';
 export { runSimulation } from './patches/splatoon3/runtime/clock.mjs';
 export { rankedInputFor } from './patches/splatoon3/runtime/ranked/pose-admission.mjs';
 export const configurePeer = values => Object.assign(globalThis, values);
 export const pageEvaluate = (source, arg) => (0, eval)('(' + source + ')')(arg);
`;
const plain = value => JSON.parse(JSON.stringify(value));
async function pair() {
  const queue = [], peers = [], deliveries = [];
  for (const host of [true, false]) {
    const f = await sourceLoadedActorFixture({ extraExports });
    let now = 10;
    const classes = { add(){}, remove(){}, toggle(){}, contains(){return false;} };
    const doc = { baseURI: 'https://fixture.invalid/', documentElement: { classList: classes }, addEventListener(){}, removeEventListener(){}, querySelector(){return null;}, pointerLockElement: null, hasFocus:()=>true };
    const win = new EventTarget();
    f.configurePeer({ document: doc, window: win, navigator: { userAgent:'ranked clock fixture', maxTouchPoints:0, getGamepads:()=>[] },
      screen:{width:1280,height:720,orientation:{angle:0}}, performance:{now:()=>now*1000}, AbortController,
      requestAnimationFrame:()=>0, cancelAnimationFrame(){},
      __rankedInputModule: { rankedInputFor: f.rankedInputFor }, rankedWeaponEvents: [] });
    const a = await f.make(0), b = await f.make(1), actors = [a,b];
    for (const [i, actor] of actors.entries()) Object.assign(actor, { nid:i+1, owner:i===0?'guest':'host', netLife:7, slot:0, invuln:0, isLocal:(i===1)===host });
    b.pos.set(20,0,0);
    const local = host ? b : a;
    const m = Object.assign(Object.create(f.Match.prototype), { mode:'rainmaker', state:'playing', stateT:0, duration:300, time:300,
      actors, local, follower:!host, ranked:new f.RankedEngine('rainmaker',stage), rankedGains:[0,0], rankedBarrierHits:[],
      rankedWorld:{zoneCoverage:()=>[],floorAt:()=>0,blocked:()=>false,update(){}}, rankedEffects:{event(){},update(){},dispose(){}}, canRespawn:()=>false });
    Object.assign(m.ranked.rule.state, { carrier:'1', carrierTeam:0, lastCarrierTeam:0, pickupZ:0, lastGroundedPos:[0,0,0] });
    m.ranked.rule.state.barrier.active=false;
    const tr = new f.Transport();
    tr.ws={readyState:1,bufferedAmount:0,send(text){queue.push({from:host?'host':'guest',to:host?'guest':'host',text});}};
    const s={myId:host?'host':'guest',hostId:'host',isHost:host,_members:new Set(['host','guest']),tr};
    const nm=new f.NetMatch(s,{id:stage.id,mode:'rainmaker',map:'tidewater'});nm.bind(m);
    const input=new f.Input({}),rig={yaw:0,pitch:0,mode:'follow',target:local,follow(){}};
    const controller=new f.PlayerController(local,rig,input);controller.computeAim=()=>{};controller.enabled=true;m.controller=controller;
    const events=[];
    m.playRankedEvents=function(values){for(const e of values)if(e.kind==='rainmaker-shot')events.push(plain(e));};
    const game={frozen:false,_skipRender:true,input,match:m,rig,_padMenus(){},showcase:{fullFrame:false},_updateAttract(){},
      _frame(dt){now+=dt;f.runSimulation(game,dt);},debug:{freeze(){game.frozen=true;},unfreeze(){game.frozen=false;}}};
    Object.assign(f.G,{game,match:m,actors,local,input,rig,netm:nm,net:{update:dt=>nm.update(dt)},time:now,settings:{aimAssist:0}});
    f.configurePeer({RG:f.G,rankedWeaponEvents:events});
    const peer={f,nm,m,game,input,events,host,actor:a,doc};
    peer.evaluate=async(fn,arg)=>{
      let source=fn.toString();
      if(fn===installRainmakerChargeProbe) source=source.replace("await import(new URL('patches/splatoon3/runtime/ranked/pose-admission.mjs', document.baseURI))",'globalThis.__rankedInputModule');
      return f.pageEvaluate(source,arg);
    };
    peers.push(peer);
  }
  const deliver=()=>{
    for(const packet of queue.splice(0)) {
      if(!packet.text.startsWith('b|'))continue;
      const data=JSON.parse(packet.text.slice(2)),peer=peers.find(p=>(p.host?'host':'guest')===packet.to);
      peer.nm.onMessage(packet.from,data);deliveries.push({to:packet.to,k:data.k,seq:data.rki?.seq,fire:data.rki?.fire});
    }
  };
  // Establish the same initial owner/life admission already completed by the
  // live browser room before installing a proof bound to that epoch.
  for (const peer of peers) for (let i=0;i<6;i++) peer.game._frame(1/60);
  deliver();
  for (const peer of peers) peer.game._frame(1/60);
  deliver();
  for (const peer of peers) {
    const s=peer.m.ranked.rule.state;
    Object.assign(s,{carrier:'1',carrierTeam:0,lastCarrierTeam:0,pickupZ:0,lastGroundedPos:[0,0,0],respawnRemaining:0,holderTime:0,holderRemaining:60});
    s.barrier.active=false;
  }
  for(const peer of peers) peer.waitForFunction=async(fn,arg)=>{
    const before=peer.f.G.time;
    // A delayed receipt advances wall time only. The frozen host's game clock
    // must stay unchanged until the actual native packet is admitted.
    await new Promise(resolve=>setImmediate(resolve));deliver();
    assert.equal(peer.f.G.time,before);
    const value=await peer.evaluate(fn,arg);
    assert(value,'one delayed receipt must admit this batch; no retry/synthetic packet');
    return{jsonValue:async()=>value,dispose:async()=>{}};
  };
  return{host:peers[0],guest:peers[1],deliver,deliveries,close(){for(const p of peers){p.nm.dispose();p.input.dispose();p.f.reset();}}};
}

test('receipt-paced native Rainmaker keeps a stalled peer from expiring the hold and releases one full shot', async t => {
  const f=await pair();
  try {
    const states=[];
    const receipt=await releaseFullRankedRainmaker(f.host,f.guest,'1',value=>states.push(plain(value)));
    assert.equal(receipt.status,'passed');assert.equal(f.host.events.length,1);
    assert.deepEqual(f.host.events.map(e=>[e.charge,e.damage,e.blastDamage]),[[1,60,180]]);
    assert(receipt.phases.length>10);assert(receipt.phases.every(p=>p.accepted.age===0));
    assert(receipt.phases.slice(0,-1).every(p=>p.accepted.fire===true&&p.state.shots.length===0));
    assert.equal(receipt.phases.at(-1).accepted.fire,false);
    f.deliver();assert.deepEqual(f.guest.events.map(e=>[e.charge,e.damage,e.blastDamage]),[[1,60,180]]);
    assert.equal(f.host.game.frozen,false);assert.equal(f.guest.game.frozen,false);
    assert.equal(f.guest.input.mouse.left,false);assert.equal(await f.host.evaluate(()=>globalThis.__rankedChargeProof),undefined);
    await t.test('native receipt rejects stale sequences, wrong fire and unbranded replacements', async () => {
      const args={token:'negative-admission',id:'1',host:true};
      await f.host.evaluate(installRainmakerChargeProbe,args);
      try {
        const current=f.host.nm.rankedInputs.get('1'),seq=current.seq;
        assert(await f.host.evaluate(readRainmakerChargeProbe,{token:args.token,seq,fire:false}));
        assert.equal(await f.host.evaluate(readRainmakerChargeProbe,{token:args.token,seq:seq+1,fire:false}),false);
        assert.equal(await f.host.evaluate(readRainmakerChargeProbe,{token:args.token,seq,fire:true}),false);
        f.host.nm.rankedInputs.set('1',{...current});
        assert.equal(await f.host.evaluate(readRainmakerChargeProbe,{token:args.token,seq,fire:false}),false);
        f.host.nm.rankedInputs.set('1',current);
        const time=f.host.f.G.time;f.host.f.G.time=current.at+.75;
        assert.equal(await f.host.evaluate(readRainmakerChargeProbe,{token:args.token,seq,fire:false}),false);
        f.host.f.G.time=time;
      } finally {await f.host.evaluate(restoreRainmakerChargeProbe,{token:args.token});}
    });
    await t.test('changed owner, life, match, session and unfreezing fail before another host step', async () => {
      const token='negative-epoch';await f.host.evaluate(installRainmakerChargeProbe,{token,id:'1',host:true});
      const cases=[
        [f.host.actor,'owner','intruder'],[f.host.actor.net,'lastLife',8],
        [f.host.f.G,'match',{}],[f.host.nm,'s',{}],[f.host.game,'frozen',false],
      ];
      try {for(const [object,key,value]of cases){const previous=object[key];object[key]=value;
        try {await assert.rejects(f.host.evaluate(readRainmakerChargeProbe,{token}),/changed|frozen simulation clock/);}
        finally {object[key]=previous;}}}
      finally {await f.host.evaluate(restoreRainmakerChargeProbe,{token});}
    });
    await t.test('cleanup restores the captured mouse without touching a replacement input owner', async () => {
      const token='negative-mouse',owned=f.host.input.mouse;
      await f.host.evaluate(installRainmakerChargeProbe,{token,id:'1',host:true});
      owned.left=true;const replacement={mouse:{left:'replacement'}};f.host.f.G.input=replacement;
      try {await f.host.evaluate(restoreRainmakerChargeProbe,{token});assert.equal(owned.left,false);assert.equal(replacement.mouse.left,'replacement');}
      finally {f.host.f.G.input=f.host.input;}
    });
    await t.test('an earlier partial shot fails admission and survives cleanup unchanged', async () => {
      const previous=f.host.events[0].charge;f.host.events[0].charge=.733333333333334;
      f.host.game.frozen=true;f.guest.input.mouse.left=true;
      let failure;
      try {await assert.rejects(releaseFullRankedRainmaker(f.host,f.guest,'1',value=>{failure=plain(value);}),/did not start idle/);
        assert.equal(f.host.events.length,1);assert.equal(f.host.events[0].charge,.733333333333334);
        assert.equal(f.host.game.frozen,true);assert.equal(f.guest.game.frozen,false);assert.equal(f.guest.input.mouse.left,true);
        assert.equal(failure.status,'failed');assert.equal(failure.failureStates.length,2);
      } finally {f.host.events[0].charge=previous;f.host.game.frozen=false;f.guest.input.mouse.left=false;}
    });
    // Unpaced negative control uses the same native rule/accepted command lease.
    const rule=f.host.m.ranked.rule, actor={id:'1',team:0,alive:true,pos:[0,0,0]}, shots=[];
    const previous=rule.engine.event;rule.engine.event=(kind,data)=>{if(kind==='rainmaker-shot')shots.push(data);};
    rule.state.charge={seconds:0,value:0,firing:false,delay:0,recovery:0,pending:null,wasSwimming:false};
    for(let tick=0;tick<=45;tick++)rule._updateShot(1/60,actor,tick/60<.75?{fire:true,aim:[0,0,1]}:null);
    assert.equal(shots[0].charge,.733333333333334);assert.equal(shots[0].damage,39.000000000000014);assert.equal(shots[0].blastDamage,0);
    rule.engine.event=previous;
  } finally {f.close();}
});

test('partial probe installation waits for its peer and preserves primary failure through cleanup failure', async () => {
  const calls=[],primary=new Error('original install failure');
  const page=late=>({async evaluate(fn){
    if(fn===installRainmakerChargeProbe){if(!late)throw primary;await new Promise(resolve=>setImmediate(resolve));calls.push('installed');return;}
    if(fn===restoreRainmakerChargeProbe){calls.push(late?'late cleanup':'failed cleanup');if(late)throw Error('cleanup failure');return;}
    return{diagnostic:true};
  }});
  let receipt;
  await assert.rejects(releaseFullRankedRainmaker(page(true),page(false),'1',value=>{receipt=plain(value);}),error=>error===primary);
  assert.deepEqual(calls,['installed','late cleanup','failed cleanup']);assert.equal(receipt.status,'failed');assert.equal(receipt.cleanupErrors.length,1);
});

const checker=fs.readFileSync(new URL('../../../scripts/check-inkwave-ranked-browser.mjs',import.meta.url),'utf8');
test('browser charge pacing retains all exact shot, replication and native wall assertions and four-mode default',()=>{
  for(const text of ["['zones','tower','rainmaker','clams']",'rankedWeaponEvents.length===1','onlineWeapon[0][0].charge,1','onlineWeapon[0][0].damage,60','onlineWeapon[0][0].blastDamage,180',
    'assert.deepEqual({...onlineWeapon[0][0],visualOnly:true},onlineWeapon[1][0])','assert.deepEqual(onlineWall[0].drops,[60,360])',"assert.deepEqual(onlineWall[1].packets.map(e=>e.damage),[60,180])"])
    assert(checker.includes(text),text);
});
