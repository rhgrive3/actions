import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformLifecycle, PlatformFrameDriver, getPlatformLifecycle } from '../../patches/local-quality/platform-lifecycle.mjs';
import { GyroPermission, gyroCapability, gyroStatusMessage } from '../../patches/local-quality/gyro-permission.mjs';
import { resetPlatformInput } from '../../patches/local-quality/platform-input.mjs';
import { installAudioPlatform } from '../../patches/local-quality/platform-audio.mjs';
import { installTransportPlatform } from '../../patches/local-quality/platform-transport.mjs';
import { installMenuQuality } from '../../patches/local-quality/menu.mjs';
import { gyroDiagnosticText } from '../../patches/local-quality/mobile-platform.mjs';

function fakeEnv(hidden=false){
  const listeners=new Map(), docListeners=new Map();
  let now=0, wall=0, rafId=0, timerId=0;
  const timers=new Map();
  const env={
    performance:{now:()=>now},
    Date:{now:()=>wall},
    document:{
      hidden,
      documentElement:{lang:'ja'},
      addEventListener(t,f){(docListeners.get(t)||docListeners.set(t,new Set()).get(t)).add(f);},
      removeEventListener(t,f){docListeners.get(t)?.delete(f);},
    },
    navigator:{},
    screen:{orientation:{addEventListener(){},removeEventListener(){}}},
    matchMedia:()=>({matches:false}),
    addEventListener(t,f){(listeners.get(t)||listeners.set(t,new Set()).get(t)).add(f);},
    removeEventListener(t,f){listeners.get(t)?.delete(f);},
    requestAnimationFrame(cb){env._raf={id:++rafId,cb};return rafId;},
    cancelAnimationFrame(id){if(env._raf?.id===id)env._raf=null;},
    setTimeout(fn,ms=0){const id=++timerId;timers.set(id,{fn,ms,interval:false});return id;},
    clearTimeout(id){timers.delete(id);},
    setInterval(fn,ms=0){const id=++timerId;timers.set(id,{fn,ms,interval:true});return id;},
    clearInterval(id){timers.delete(id);},
    console,
    _emit(target,type,event={}){for(const fn of [...((target==='document'?docListeners:listeners).get(type)||[])])fn(event);},
    _advance(ms){now+=ms;wall+=ms;},
    _timerCount(){return timers.size;},
    _listenerCount(type){return (listeners.get(type)?.size||0)+(docListeners.get(type)?.size||0);},
  };
  return env;
}

test('lifecycle converges across 24 hide/show cycles without duplicate frame loops or listener growth',()=>{
  const env=fakeEnv(false), owner=new PlatformLifecycle(env);
  const initialListeners=owner.snapshot().listeners;
  let frames=0, rebases=0; const dts=[];
  const driver=new PlatformFrameDriver(owner,dt=>{frames++;dts.push(dt);},()=>rebases++);
  driver.start();
  assert.equal(driver.snapshot().pendingRAF,1);
  for(let i=0;i<24;i++){
    env.document.hidden=true; env._emit('document','visibilitychange');
    assert.equal(owner.state,'SUSPENDED');
    assert.equal(driver.snapshot().pendingRAF,0);
    env.document.hidden=false; env._emit('document','visibilitychange');
    assert.equal(owner.state,'ACTIVE');
    assert.equal(driver.snapshot().pendingRAF,1);
    assert.equal(owner.snapshot().listeners,initialListeners);
    assert.equal(owner.snapshot().subscribers,1);
  }
  // First resumed frame rebases to zero. A later 30 s active wall-clock gap also
  // rebases to zero rather than feeding a catch-up delta to simulation.
  let cb=env._raf.cb; cb(env.performance.now());
  assert.equal(dts.at(-1),0);
  env._advance(30000); cb=env._raf.cb; cb(env.performance.now());
  assert.equal(dts.at(-1),0);
  assert.equal(driver.snapshot().gaps,1);
  assert.equal(driver.snapshot().pendingRAF,1);
  assert.equal(owner.snapshot().listeners,initialListeners);
  driver.dispose(); owner.dispose();
});

test('gyro capability distinguishes unsupported/secure context and never invents settings guidance',()=>{
  const env={isSecureContext:true,DeviceOrientationEvent:function(){},DeviceMotionEvent:function(){},document:{}};
  const cap=gyroCapability(env);
  assert.equal(cap.supported,true);
  const msg=gyroStatusMessage({state:'supported-denied',availability:'idle',reason:'permission-denied',permission:'denied'},'en');
  assert.doesNotMatch(msg,/Safari settings/i);
  const bad=gyroCapability({...env,isSecureContext:false});
  assert.equal(bad.supported,false);
  assert.equal(bad.reason,'insecure-context');
});

test('standalone is diagnostic only, not permission proof',()=>{
  const env=fakeEnv(false);
  env.navigator.standalone=true;
  const owner=new PlatformLifecycle(env);
  assert.equal(owner.standalone,true);
  assert.equal(owner.active,true);
  owner.dispose();
});


function permissionHarness({ motion = true } = {}) {
  const orientation = [], motionRequests = [], timers = new Map();
  let timerId = 0, now = 100;
  class Orientation {
    static requestPermission() { return new Promise((resolve,reject)=>orientation.push({resolve,reject})); }
  }
  class Motion {
    static requestPermission() { return new Promise((resolve,reject)=>motionRequests.push({resolve,reject})); }
  }
  const lifecycle={active:true,epoch:0,state:'ACTIVE',lastEvent:'initial',standalone:false};
  const env={
    isSecureContext:true, DeviceOrientationEvent:Orientation,
    DeviceMotionEvent:motion?Motion:undefined, document:{},
    performance:{now:()=>now}, setTimeout(fn){const id=++timerId;timers.set(id,fn);return id;},
    clearTimeout(id){timers.delete(id);},
  };
  return {env,lifecycle,orientation,motionRequests,timers,tick(ms=1){now+=ms;},
    fireTimers(){const entries=[...timers.values()];timers.clear();for(const fn of entries)fn();}};
}
const flush = () => new Promise(resolve=>queueMicrotask(resolve));

test('new gyro permission generation supersedes an older unresolved browser promise',async()=>{
  const h=permissionHarness(), access=new GyroPermission(h.env,h.lifecycle);
  const older=access.request(), aO=h.orientation.shift(), aM=h.motionRequests.shift();
  const newer=access.request(), bO=h.orientation.shift(), bM=h.motionRequests.shift();
  assert.equal(await older,false);
  bO.resolve('granted'); bM.resolve('denied');
  assert.equal(await newer,true);
  aO.resolve('denied'); aM.resolve('granted'); await flush();
  assert.equal(access.permission,'granted');
  assert.equal(access.motionPermission,'denied');
  assert.equal(access.allowed,true);
  assert.equal(access.snapshot().lastRequest.result,'granted');
});

test('obsolete deny before the newer grant cannot own final gyro permission',async()=>{
  const h=permissionHarness(), access=new GyroPermission(h.env,h.lifecycle);
  const older=access.request(), aO=h.orientation.shift(), aM=h.motionRequests.shift();
  const newer=access.request(), bO=h.orientation.shift(), bM=h.motionRequests.shift();
  assert.equal(await older,false);
  aO.resolve('denied'); aM.resolve('denied'); await flush();
  assert.notEqual(access.permission,'denied');
  bO.resolve('granted'); bM.resolve('granted');
  assert.equal(await newer,true);
  assert.equal(access.permission,'granted');
});

test('orientation permission is authoritative while motion permission remains optional',async()=>{
  const granted=permissionHarness(), a=new GyroPermission(granted.env,granted.lifecycle);
  const p=a.request(), o=granted.orientation.shift(), m=granted.motionRequests.shift();
  o.resolve('granted');m.resolve('denied');
  assert.equal(await p,true);await flush();
  assert.equal(a.allowed,true);assert.equal(a.motionPermission,'denied');

  const denied=permissionHarness(), b=new GyroPermission(denied.env,denied.lifecycle);
  const q=b.request(), o2=denied.orientation.shift(), m2=denied.motionRequests.shift();
  o2.resolve('denied');m2.resolve('granted');
  assert.equal(await q,false);await flush();
  assert.equal(b.allowed,false);assert.equal(b.permission,'denied');assert.equal(b.motionPermission,'granted');
});

test('off, lifecycle epoch change, timeout and dispose invalidate pending gyro ownership',async()=>{
  // OFF while pending.
  let h=permissionHarness(), access=new GyroPermission(h.env,h.lifecycle);
  let p=access.request(), o=h.orientation.shift(), m=h.motionRequests.shift();
  access.cancelRequest(false); assert.equal(await p,false);
  o.resolve('granted');m.resolve('granted');await flush();
  assert.notEqual(access.permission,'granted');

  // Lifecycle epoch change makes the old browser result obsolete. Production
  // lifecycle also cancels immediately; the timer proves an orphan cannot grant.
  h=permissionHarness(); access=new GyroPermission(h.env,h.lifecycle);
  p=access.request();o=h.orientation.shift();m=h.motionRequests.shift();
  h.lifecycle.epoch++;h.lifecycle.state='SUSPENDED';h.lifecycle.lastEvent='visibilitychange';
  o.resolve('granted');m.resolve('granted');await flush();
  assert.notEqual(access.permission,'granted');
  assert.equal(access.motionPermission,'prompt','stale optional motion permission cannot cross a lifecycle epoch');
  h.fireTimers();assert.equal(await p,false);
  assert.equal(access.state,'temporarily-unavailable');
  assert.equal(access.reason,'permission-timeout');

  // Dispose while pending.
  h=permissionHarness();access=new GyroPermission(h.env,h.lifecycle);
  p=access.request();o=h.orientation.shift();m=h.motionRequests.shift();
  access.dispose();assert.equal(await p,false);
  o.resolve('granted');m.resolve('granted');await flush();
  assert.notEqual(access.permission,'granted');
});

test('permission rejection is unknown/error, while timeout stays retryable temporary unavailability',async()=>{
  let h=permissionHarness(), access=new GyroPermission(h.env,h.lifecycle);
  let p=access.request(), o=h.orientation.shift();
  o.reject(new Error('browser failure'));
  assert.equal(await p,false);assert.equal(access.state,'unknown-error');assert.equal(access.reason,'permission-error');

  h=permissionHarness();access=new GyroPermission(h.env,h.lifecycle);
  p=access.request();h.fireTimers();
  assert.equal(await p,false);
  assert.equal(access.permission,'prompt');
  assert.equal(access.state,'temporarily-unavailable');
  assert.equal(access.reason,'permission-timeout');
});

test('gyro snapshot exposes production-safe device acceptance diagnostics',()=>{
  const h=permissionHarness(), access=new GyroPermission(h.env,h.lifecycle);
  access.permission='granted';access.sample(1234.5);
  const s=access.snapshot();
  assert.equal(s.orientationRequestAvailable,true);
  assert.equal(s.motionRequestAvailable,true);
  assert.equal(s.lastSampleAt,1234.5);
  assert.equal(s.lifecycleState,'ACTIVE');
  assert.equal(s.lifecycleEpoch,0);
  assert.equal(s.lifecycleLastEvent,'initial');
});


test('platform input reset clears stale held actions but preserves active gameplay progression',()=>{
  let mobileResets=0, gyroResyncs=0;
  const move={x:1,y:0,z:-1,set(x,y,z){this.x=x;this.y=y;this.z=z;}};
  const dodge={t:.11,dur:.3}, projectile={age:.4};
  const weapon={charging:false,aimingSub:true,cooldown:.42,dodge,rolling:true,rollT:.88};
  const actor={
    intent:{move,fire:true,jump:true,squid:true,sub:true,special:true},
    jumpBuffer:.08,fireBuffer:.12,weaponRunner:weapon,
    _prevIntent:{fire:true,jump:true,squid:true,sub:true,special:true},
  };
  const input={
    keys:new Set(['KeyW']),pressed:new Set(['Space']),padPressed:new Set([0]),padMenuPressed:new Set([9]),
    padMenuBlocked:new Set([1]),padPrev:[true],pad:{buttons:[{pressed:true}],axes:[.7,0]},
    mouse:{dx:3,dy:-2,left:true,right:true,leftPressed:true,rightPressed:true},
    mobile:{reset(){mobileResets++;},gyro:{resync(){gyroResyncs++;}}},
  };
  const controller={a:actor,mapHeld:true,edgeT:.2,padLook:{x:1,y:-1},assist:{target:{},has:true,prevValid:true},_gyro:{yaw:.3,pitch:-.2}};
  resetPlatformInput(input,controller);
  assert.deepEqual([...input.keys],[]);assert.deepEqual([...input.pressed],[]);
  assert.deepEqual([move.x,move.y,move.z],[0,0,0]);
  for(const key of ['fire','jump','squid','sub','special'])assert.equal(actor.intent[key],false,key);
  assert.equal(actor.jumpBuffer,0);assert.equal(actor.fireBuffer,0);assert.equal(weapon.aimingSub,false);
  assert.equal(mobileResets,1);assert.equal(gyroResyncs,1);
  // Lifecycle suspension is an input boundary, not a gameplay-state reset.
  assert.equal(weapon.cooldown,.42);assert.equal(weapon.dodge,dodge);assert.equal(weapon.rolling,true);assert.equal(weapon.rollT,.88);
  assert.equal(projectile.age,.4);
});

test('audio, network ping and menu owners stay singular through 24 suspend/resume cycles',async()=>{
  const env=fakeEnv(false), owner=getPlatformLifecycle(env);

  class Audio {}
  installAudioPlatform(Audio,env);
  const audio=new Audio();
  audio.offline=false;
  audio.ctx={state:'running',suspend(){this.state='suspended';return Promise.resolve();},resume(){this.state='running';return Promise.resolve();}};
  audio._installUnlock();const audioOwner=audio._platformAudio;audio._installUnlock();assert.equal(audio._platformAudio,audioOwner);

  class Transport {
    constructor(){this.ws={readyState:1,close(){this.readyState=3;}};this._pingSent=0;this.starts=0;this.stops=0;}
    _startPing(){this.starts++;}
    _stopPing(){this.stops++;}
    close(){}
  }
  installTransportPlatform(Transport,env);
  const tr=new Transport();tr._startPing();const transportOwner=tr._platformTransport;

  class Menus {
    constructor(){this.el={};this._platformDriven=false;this._raf=0;this._extTick=-Infinity;this._lastT=0;this.current=true;this._scr=true;}
    update(){}
    _tick(){}
    dispose(){}
  }
  installMenuQuality(Menus,env);
  const menus=new Menus();menus.update(1/60);

  const subscribers=owner.snapshot().subscribers;
  assert.equal(subscribers,3);
  for(let i=0;i<24;i++){
    env.document.hidden=true;env._emit('document','visibilitychange');await Promise.resolve();
    env.document.hidden=false;env._emit('document','visibilitychange');await Promise.resolve();
    assert.equal(owner.snapshot().subscribers,subscribers);
    assert.equal(audio._platformAudio,audioOwner);
    assert.equal(tr._platformTransport,transportOwner);
    assert(env._timerCount()<=2,'at most one transport watch and one menu watchdog');
    assert(menus._raf===0||menus._raf>0);
  }
  assert.equal(tr.starts,25,'initial ping plus one restart per resume');
  audio.disposePlatform();tr.close();menus.dispose();
  assert.equal(owner.snapshot().subscribers,0);
  owner.dispose();
});

test('long-press gyro diagnostic is concise and includes physical-device acceptance fields',()=>{
  const text=gyroDiagnosticText({
    standalone:true,orientationRequestAvailable:true,motionRequestAvailable:true,
    permission:'granted',motionPermission:'denied',received:true,lastSampleAt:900,
    lifecycleState:'ACTIVE',lifecycleEpoch:4,lifecycleLastEvent:'pageshow',
    lastRequest:{generation:3,result:'granted'},
  },1000);
  for(const token of ['standalone=yes','orientationRequest=yes','motionRequest=yes','permission=granted',
    'motion=denied','request=granted#3','sample=100ms','lifecycle=ACTIVE@4','last=pageshow'])assert.match(text,new RegExp(token));
  assert.doesNotMatch(text,/settings/i);
});
