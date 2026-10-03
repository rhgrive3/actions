import test from 'node:test';
import assert from 'node:assert/strict';
import { PlatformLifecycle, PlatformFrameDriver } from '../../patches/local-quality/platform-lifecycle.mjs';
import { gyroCapability, gyroStatusMessage } from '../../patches/local-quality/gyro-permission.mjs';

function fakeEnv(hidden=false){
  const listeners=new Map(), docListeners=new Map();
  let now=0, wall=0, rafId=0;
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
    setTimeout(fn){ return setTimeout(fn,0); },
    clearTimeout(id){ clearTimeout(id); },
    console,
    _emit(target,type,event={}){for(const fn of [...((target==='document'?docListeners:listeners).get(type)||[])])fn(event);},
    _advance(ms){now+=ms;wall+=ms;},
  };
  return env;
}

test('lifecycle converges across repeated hide/show without duplicate frame loops',()=>{
  const env=fakeEnv(false), owner=new PlatformLifecycle(env);
  let frames=0, rebases=0;
  const driver=new PlatformFrameDriver(owner,()=>frames++,()=>rebases++);
  driver.start();
  assert.equal(driver.snapshot().pendingRAF,1);
  for(let i=0;i<20;i++){
    env.document.hidden=true; env._emit('document','visibilitychange');
    assert.equal(owner.state,'SUSPENDED');
    assert.equal(driver.snapshot().pendingRAF,0);
    env.document.hidden=false; env._emit('document','visibilitychange');
    assert.equal(owner.state,'ACTIVE');
    assert.equal(driver.snapshot().pendingRAF,1);
  }
  env._advance(30000);
  const cb=env._raf.cb; cb(env.performance.now());
  assert.equal(driver.snapshot().pendingRAF,1);
  assert.equal(driver.snapshot().gaps>=0,true);
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
