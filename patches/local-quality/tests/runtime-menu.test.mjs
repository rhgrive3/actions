import test from 'node:test';
import assert from 'node:assert/strict';
import {installMenuQuality} from '../menu.mjs';
import {getPlatformLifecycle} from '../platform-lifecycle.mjs';
function fixture(){
 let now=0,id=1,ticks=0,callbacks=0;
 const timers=new Map(),rafs=new Map(),listeners=new Map();
 const env={performance:{now:()=>now},document:{hidden:false,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)},setTimeout:(f,ms)=>{const n=id++;timers.set(n,{f,at:now+ms});return n;},clearTimeout:n=>timers.delete(n),requestAnimationFrame:f=>{const n=id++;rafs.set(n,f);return n;},cancelAnimationFrame:n=>rafs.delete(n)};
 class Menus{
  constructor(){this.current=null;this._scr=null;this._lastT=0;this._extTick=0;this._loop=this._loop.bind(this);this._raf=env.requestAnimationFrame(this._loop);}
  update(){this._extTick=now;ticks++;}
  _swap(name){this.current=name;this._scr=name?{}:null;}
  _loop(t){callbacks++;this._raf=env.requestAnimationFrame(this._loop);this._lastT=t;if(t-this._extTick<80)return;if(this.current||this._scr)ticks++;}
  dispose(){env.cancelAnimationFrame(this._raf);this._raf=0;}
 }
 installMenuQuality(Menus,env);const m=new Menus();
 const advance=ms=>{now+=ms;for(const [n,x]of [...timers])if(x.at<=now){timers.delete(n);x.f();}for(const [n,f]of [...rafs]){rafs.delete(n);f(now);}};
 return{m,env,timers,rafs,listeners,advance,ticks:()=>ticks,callbacks:()=>callbacks};
}
test('no screen performs no hidden menu tick, fallback timer or animation callback',()=>{
 const f=fixture();for(let i=0;i<600;i++){f.m.update(1/60);f.advance(1000/60);}
 assert.equal(f.ticks(),0);assert.equal(f.callbacks(),0);assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);
});
test('show recovers standalone animation, external owner cancels duplicates, hide stops it again',()=>{
 const f=fixture();f.m.update(1/60);f.m._swap('settings');f.advance(81);assert.equal(f.callbacks(),1);assert.equal(f.ticks(),1);
 f.m.update(1/60);assert.equal(f.rafs.size,0);f.advance(16);assert.equal(f.callbacks(),1);
 f.m._swap(null);f.advance(100);assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
 f.m._swap('title');f.advance(81);assert.equal(f.callbacks(),2);
});
test('visibility and disposal release callbacks and timers; visible screen resumes once',()=>{
 const f=fixture();f.m._swap('settings');f.advance(81);
 f.env.document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
 f.advance(5000);assert.equal(f.callbacks(),1);
 f.env.document.hidden=false;f.listeners.get('visibilitychange')();f.advance(81);assert.equal(f.callbacks(),2);
 const lifecycle=getPlatformLifecycle(f.env),sharedListeners=f.listeners.size;
 assert.equal(lifecycle.snapshot().subscribers,1);
 f.m.dispose();
 assert.equal(lifecycle.snapshot().subscribers,0,'menu disposal releases its shared lifecycle subscription');
 assert.equal(f.listeners.size,sharedListeners,'shared page lifecycle listeners outlive a menu and do not grow');
 assert.equal(f.rafs.size,0);assert.equal(f.timers.size,0);
 f.m.update(1/60);f.advance(100);assert.equal(f.callbacks(),2);assert.equal(f.listeners.size,sharedListeners);
});

test('external engine ticks do no hidden-document menu work and visible owner recovers',()=>{
 const f=fixture();f.m._swap('settings');f.m.update(1/60);assert.equal(f.ticks(),1);
 f.env.document.hidden=true;f.listeners.get('visibilitychange')();for(let i=0;i<600;i++)f.m.update(1/60);
 assert.equal(f.ticks(),1);assert.equal(f.timers.size,0);assert.equal(f.rafs.size,0);assert.equal(f.m.current,'settings');
 f.env.document.hidden=false;f.listeners.get('visibilitychange')();f.m.update(1/60);assert.equal(f.ticks(),2);f.advance(81);assert.equal(f.callbacks(),1);
});
