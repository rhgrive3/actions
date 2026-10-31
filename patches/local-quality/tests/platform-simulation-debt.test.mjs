import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../reliability/tests/controls-fixture.mjs';
import { installRankedDocument } from '../../splatoon3/tests/ranked-dom-fixture.mjs';
import { installPlatformGame } from '../platform-game.mjs';
import { PLATFORM_DEBT_TICK_BUDGET, PLATFORM_ONLINE_DEBT_LIMIT } from '../platform-simulation-debt.mjs';

const f=await fixture({match:true,network:true,session:true,ranked:true,production:true});
installRankedDocument(f.context.document);f.context.structuredClone=structuredClone;f.installRanked(f);f.installClock(f);
const {G}=f,plain=x=>JSON.parse(JSON.stringify(x));
const nativeShotEndpoints={...G.projectiles};
const stage={id:'foreground-debt',zones:[{center:[0,0,0],size:[6,6]}],tower:{path:[[0,0,-10],[0,0,0],[0,0,10]],centerIndex:1,checkpoints:[[],[]],speed:1.2,halfSize:1.4},rainmaker:{center:[0,0,0],goals:[[0,0,10],[0,0,-10]],checkpoints:[[[0,0,5]],[[0,0,-5]]],retreatZ:[-8,8]},clams:{spawns:[],goals:[[0,0,10],[0,0,-10]]}};
function setup({mode='turf',duration=mode==='turf'?180:300,online=false,impact=null,weapon=null}={}){
  let ms=0,id=0,physics=0,controllerCalls=0,fireSteps=0,jumpSteps=0,age=0,hits=0,reads=0,aborted=0,closed=0;
  let coverage=[.51,.49],receipt=null,receivedValue=0,bombs=0;
  const ras=new Map(),timers=new Map(),stale=[],receives=[],trace=[],sends=[];
  const env=new EventTarget();env.document=new EventTarget();Object.assign(env.document,{hidden:false,hasFocus:()=>true});
  Object.assign(env,{performance:{now:()=>ms},Date:{now:()=>ms},screen:{orientation:new EventTarget()},console,
    requestAnimationFrame(fn){ras.set(++id,fn);return id;},cancelAnimationFrame(key){if(ras.has(key))stale.push(ras.get(key));ras.delete(key);},
    setTimeout(fn,delay){timers.set(++id,{fn,at:ms+delay});return id;},clearTimeout(key){if(timers.has(key))stale.push(timers.get(key).fn);timers.delete(key);}});
  const m=new f.Match({mode:mode==='boss'?'turf':mode,duration});m.setState('playing');m.actors=[];if(mode==='boss')m.mode='boss';
  const local=weapon?f.make(weapon):{alive:false,intent:{move:new f.THREE.Vector3(),fire:false,jumpPressed:false,throw:false},_prevIntent:{},weaponRunner:{cancelPendingInput(){}}};m.local=local;if(weapon)m.actors=[local];
  if(!['turf','boss'].includes(mode))Object.assign(m,{ranked:new f.RankedEngine(mode,stage),rankedGains:[0,0],rankedBarrierHits:[],
    rankedWorld:{beforeActors(){},update(){},zoneCoverage:()=>[[0,0]],floorAt:()=>0,blocked:()=>false},rankedEffects:{update(){},event(){}}});
  const input={padPressed:new Set(),pressed:new Set(),mouse:{dx:0},fire:false,sub:false,jump:false,pollPad(){},endFrame(){this.pressed.clear();this.mouse.dx=0;this.jump=false;}};
  m.updateController=()=>{controllerCalls++;if(m.state==='playing'&&!m.paused){local.intent.fire=input.fire;local.intent.sub=input.sub;local.intent.jumpPressed=input.jump;}else{local.intent.fire=false;local.intent.jumpPressed=false;}};
  m.controller={computeAim(){}};
  Object.assign(G,{time:0,match:m,mode:'match',actors:m.actors,net:null,netm:null,paint:{useFixedPaintClock(){},advanceSimulation(){},sample:()=>1,splat:()=>0,coverage(){reads++;return coverage;}},
    projectiles:{...nativeShotEndpoints,throwBomb(){bombs++;},update(dt){physics++;if(local.intent.fire)fireSteps++;if(local.intent.jumpPressed)jumpSteps++;const before=age;age+=dt;if(impact!==null&&before<impact&&age>=impact){hits++;coverage=[.4,.6];}trace.push([G.time,receivedValue]);}}});
  let session=null,net=null;
  if(online){
    session=new f.NetSession();Object.assign(session,{myId:'host',hostId:'host',state:'match',_members:new Map([['host','host'],['guest','guest']])});
    net={s:session,cfg:{id:'epoch'},match:m,isHost:true,out:[],_sendTick:()=>true,_sendNow(d){sends.push(d);return true;},
      onMessage(from,d){receives.push({from,time:G.time,receipt:this.s.tr.relayReceipt(from)});receivedValue=d.value;},
      dispose(){if(G.netm===this)G.netm=null;},update(){}};
    if(online==='nativeGuest'){
      session.myId='guest';m.follower=true;G.projectiles=Object.assign(new f.Projectiles(new f.THREE.Scene()),G.projectiles);
      net=new f.NetMatch(session,{id:'epoch',mode,map:'reef'});session.match=net;net.bind(m);
      const incoming=net.onMessage;net.onMessage=function(from,d){receives.push({from,time:G.time,receipt:this.s.tr.relayReceipt(from)});return incoming.call(this,from,d);};
    }
    session.match=net;session.update=()=>{};session.tr={relayReceipt:()=>receipt,close(){closed++;}};G.net=session;G.netm=net;
  }
  class Game{_loop(){} _dynRes(){} _padMenus(){} _updateAttract(){} _frame(dt){f.runSimulation(this,dt);}}
  const game=new Game();Object.assign(game,{match:m,input,settings:{frameRate:'display'},fpsAcc:0,fpsN:0,showcase:{},rig:{mode:'follow',target:local},menus:{setPlatformDriven(){}},netMatchAborted(){aborted++;this.match=null;}});G.game=game;
  installPlatformGame(Game,G,env);game._loop();
  const frame=time=>{ms=time;const entry=ras.entries().next().value;assert(entry);ras.delete(entry[0]);entry[1](time);};
  const timer=()=>{const entry=[...timers].find(([,value])=>value.at<=ms);if(!entry)return false;timers.delete(entry[0]);entry[1].fn();return true;};
  const drain=()=>{for(let n=0;timer();n++)assert(n<100000,'bounded pending debt queue terminates');};
  frame(0);
  return {game,m,env,input,net,session,frame,drain,timer,trace,receives,sends,stale,timers,setTime:n=>ms=n,setReceipt:n=>receipt=n,
    counters:()=>({physics,controllerCalls,fireSteps,jumpSteps,age,hits,reads,aborted,closed,bombs}),
    summary:()=>({time:m.time,ticks:game.s3Clock.ticks,global:G.time,state:m.state,ranked:m.ranked?plain(m.ranked.snapshot()):null,finish:m.s3FinishCoverage?plain(m.s3FinishCoverage):null}),
    close(){game.disposePlatform();if(online==='nativeGuest')net.dispose();G.netm=null;G.net=null;}};
}

test('native Turf 180s and every Ranked 300s keep all legal fixed ticks at 1/2/3/4/5/15/30/60/120 FPS',()=>{
  for(const mode of ['turf','zones','tower','rainmaker','clams']){
    let baseline;
    for(const [hz,online]of [...[60,1,2,3,4,5,15,30,120].map(hz=>[hz,false]),...[1,2,3].map(hz=>[hz,true])]){
      const x=setup({mode,online}),duration=mode==='turf'?180:300;
      try{
        for(let i=1;i<=hz*duration;i++){x.frame(i*1000/hz);x.drain();}
        const s=x.summary();assert.equal(s.ticks,duration*60);assert(Math.abs(s.global-duration)<1e-7);assert.equal(s.time,0);assert.equal(s.state,s.ranked&&s.ranked.winner===null?'playing':'finish');
        const canonical={...s,global:Math.round(s.global*1e8)/1e8};
        if(baseline)assert.deepEqual(canonical,baseline,mode+'/'+hz+'/'+online);else baseline=canonical;
        if(online)assert.equal(x.session.state,'match','sustained low FPS remains recoverable when yielded slices keep up');
        assert(x.game.platform.simulation.snapshot().maxTicks<=PLATFORM_DEBT_TICK_BUDGET);assert.equal(x.timers.size,0);
      }finally{x.close();}
    }
  }
});
test('continuous 1 FPS admits endpoint commands and native held Charger/SUB releases happen only after debt completes',()=>{
  const x=setup();try{x.input.fire=true;x.input.jump=true;x.frame(1000);x.drain();assert.equal(x.counters().fireSteps,0);x.frame(2000);x.drain();assert.equal(x.counters().fireSteps,60);assert.equal(x.counters().jumpSteps,1);}finally{x.close();}
  for(const weapon of ['charger','shooter']){
    const y=setup({weapon}),shots=f.shots.length;
    try{
      y.input[weapon==='charger'?'fire':'sub']=true;
      for(let i=1;i<=12;i++)y.frame(i*1000/60);
      y.input[weapon==='charger'?'fire':'sub']=false;y.frame(1200);y.drain();
      assert.equal(f.shots.length,shots);assert.equal(y.counters().bombs,0,'release observed at present cannot be inserted in past ticks');
      for(let i=1;i<=12;i++)y.frame(1200+i*1000/60);
      if(weapon==='charger')assert.equal(f.shots.length,shots+1);else assert.equal(y.counters().bombs,1);
      y.frame(1200+13000/60);if(weapon==='charger')assert.equal(f.shots.length,shots+1);else assert.equal(y.counters().bombs,1);
    }finally{y.close();}
  }
});
test('300/500/1000/2000 ms stalls retain existing fractional debt and sample new commands only at their present boundary',()=>{
  for(const gap of [300,500,1000,2000]){
    const x=setup();try{
      x.frame(8);assert(Math.abs(x.game.s3Clock.accumulator-.008)<1e-12);
      x.input.fire=true;x.input.jump=true;x.input.pressed.add('KeyF');x.frame(8+gap);
      assert(x.game.s3Clock.ticks<=15);assert.equal(x.counters().fireSteps,0);assert(x.input.pressed.has('KeyF'),'new edge survives older debt');
      x.drain();assert.equal(x.game.s3Clock.ticks,Math.floor((.008+gap/1000)*60+1e-9));assert(Math.abs(x.game.s3Clock.accumulator-.008)<1e-8);
      assert.equal(x.counters().fireSteps,0);assert.equal(x.counters().jumpSteps,0);
      x.frame(8+gap+1000/60);assert.equal(x.counters().fireSteps,1);assert.equal(x.counters().jumpSteps,1,'committed endpoint edge is consumed once');
      x.frame(8+gap+2000/60);assert.equal(x.counters().jumpSteps,1);
    }finally{x.close();}
  }
});
test('native final Turf paint and the result snapshot include only legal pre-deadline integration during a stall',()=>{
  for(const impact of [.5,.52])for(const hz of [60,1]){
    const x=setup({duration:.51,impact});try{
      for(let i=1;i<=hz*4;i++){x.frame(i*1000/hz);x.drain();}
      assert.equal(x.counters().hits,1);assert.equal(x.counters().reads,1);
      assert.deepEqual(plain(x.m.s3FinishCoverage),impact<.51?[.4,.6]:[.51,.49]);
      assert.equal(x.m.result.winner,impact<.51?1:0);
    }finally{x.close();}
  }
});
test('new owner snapshots and authenticated receive receipts are replayed at their completed elapsed boundaries',()=>{
  const x=setup({online:true});try{
    x.setTime(500);x.setReceipt(9000);x.net.onMessage('guest',{value:1,relayReceipt:999999});x.setReceipt(null);
    assert.equal(x.receives.length,0);x.timer();assert.equal(x.receives.length,0);assert.equal(x.game.s3Clock.ticks,15);
    x.setTime(750);x.setReceipt(9250);x.net.onMessage('guest',{value:2});x.setReceipt(null);x.drain();
    assert.deepEqual(x.receives.map(r=>r.receipt),[9000,9250]);
    assert(Math.abs(x.receives[0].time-.5)<1e-9);assert(Math.abs(x.receives[1].time-.75)<1e-9);
    assert(x.trace.filter(([time])=>time<=.5+1e-9).every(([,value])=>value===0));
    assert(x.trace.filter(([time])=>time>.5+1e-9).every(([,value])=>value===1));
    assert.equal(x.session.tr.relayReceipt('guest'),null);assert.equal(x.game.platform.simulation.snapshot().messages,0);
    x.frame(1000);x.drain();assert.equal(x.game.s3Clock.ticks,60,'network-triggered debt is not counted twice by the next RAF');
  }finally{x.close();}
});
test('the real composed Ranked receiver still validates host, epoch and revision after deferred delivery',()=>{
  const x=setup({mode:'zones',online:'nativeGuest'});try{
    const host=new f.RankedEngine('zones',stage);host.time=299.5;host.elapsed=.5;host.revision=30;host.setCount(0,60);
    const packet={k:'rkstate',rk:{match:'epoch',host:'host',state:host.snapshot(),gains:[0,0]}};
    x.setTime(500);x.setReceipt(7000);x.net.onMessage('host',packet);x.setReceipt(null);
    assert.equal(x.m.ranked.counts[0],100);x.drain();assert.equal(x.m.ranked.counts[0],60);assert.equal(x.m.ranked.revision,30);
    assert.equal(x.receives[0].receipt,7000);assert(Math.abs(x.receives[0].time-.5)<1e-9);
    for(const [from,change]of [['old-host',{}],['host',{match:'old-epoch'}],['host',{state:{...host.snapshot(),revision:29,counts:[1,100]}}]]){
      x.setTime(900+x.receives.length*400);x.setReceipt(8000);x.net.onMessage(from,{k:'rkstate',rk:{...packet.rk,...change}});x.setReceipt(null);x.drain();
      assert.equal(x.m.ranked.counts[0],60);assert.equal(x.m.ranked.revision,30);
    }
  }finally{x.close();}
});
test('only a natively accepted host conclusion supersedes a follower debt queue',()=>{
  const x=setup({mode:'zones',online:'nativeGuest'});try{
    const host=new f.RankedEngine('zones',stage);host.time=299.5;host.elapsed=.5;host.revision=30;host.setCount(0,60);
    const wrap=state=>({k:'rkstate',rk:{match:'epoch',host:'host',state,gains:[0,0]}});
    x.setTime(500);x.net.onMessage('host',wrap(host.snapshot()));assert.equal(x.game.platform.simulation.snapshot().pending,1);
    x.net.onMessage('host',wrap({...host.snapshot(),winner:9,counts:[-1,100]}));
    assert.equal(x.m.ranked.winner,null);assert.equal(x.game.platform.simulation.snapshot().pending,1,'an invalid conclusion cannot discard legal debt');
    host.revision++;host.setCount(0,0);x.net.onMessage('host',wrap(host.snapshot()));
    assert.equal(x.m.ranked.winner,0);assert.equal(x.game.platform.simulation.snapshot().pending,0);
    x.drain();assert.equal(x.m.ranked.winner,0);assert.equal(x.m.ranked.counts[0],0,'older queued state cannot roll back the accepted result');
  }finally{x.close();}
});
test('pause freezes gameplay and lifecycle/epoch replacement retires pending debt and its deferred messages',()=>{
  const x=setup();try{x.m.paused=true;x.frame(1000);x.drain();assert.equal(G.time,0);assert.equal(x.m.time,180);assert.equal(x.counters().physics,0);x.m.paused=false;x.frame(2000);x.drain();assert(Math.abs(G.time-1)<1e-9);}finally{x.close();}
  const paused=setup();try{paused.setTime(1000);paused.m.paused=true;paused.drain();assert(Math.abs(G.time-1)<1e-9,'late pause cannot erase the preceding foreground second');paused.setTime(11000);paused.m.paused=false;paused.frame(11000+1000/60);assert(Math.abs(G.time-(1+1/60))<1e-9,'intentional paused wall time never becomes gameplay debt');}finally{paused.close();}
  for(const boundary of ['hidden','freeze','replacement','transport','clock','dispose']){
    const y=setup({online:true});try{
      y.setTime(500);y.setReceipt(10);y.net.onMessage('guest',{value:5});y.setReceipt(null);
      const before=y.game.s3Clock.ticks;
      if(boundary==='hidden'){y.env.document.hidden=true;y.env.document.dispatchEvent(new Event('visibilitychange'));}
      if(boundary==='freeze')y.env.document.dispatchEvent(new Event('freeze'));
      if(boundary==='replacement')y.net.cfg.id='new-epoch';
      if(boundary==='transport')y.session.tr={};
      if(boundary==='clock')y.game.s3Clock=new f.FixedClock();
      if(boundary==='dispose')y.game.disposePlatform();
      y.drain();for(const callback of y.stale)callback(500);
      assert.equal(y.receives.length,0);assert.equal(y.game.s3Clock.ticks,before);
    }finally{y.close();}
  }
});
test('only unrecoverable online debt above the explicit budget leaves; Turf, Ranked and solo Boss never invent a result',()=>{
  for(const mode of ['turf','zones','tower','rainmaker','clams','boss']){
    const x=setup({mode,online:true});try{
      x.frame(PLATFORM_ONLINE_DEBT_LIMIT*1000);x.drain();assert.equal(x.session.state,'match','two seconds remain recoverable');
      const before=x.m.time;x.session._members=new Map([['host','host']]);x.frame(2*PLATFORM_ONLINE_DEBT_LIMIT*1000+1);
      assert.equal(x.session.state,'offline');assert.equal(x.counters().closed,1);assert.equal(x.counters().aborted,1);assert.equal(x.m.time,before);
      assert.equal(x.m.result??null,null);assert.equal(x.game.platform.simulation.snapshot().pending,0);
    }finally{x.close();}
  }
});
