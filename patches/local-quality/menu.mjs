import {preparePreviewRoot,clearPreviewRoot} from './menu-preview.mjs';
import {getPlatformLifecycle} from './platform-lifecycle.mjs';
const INSTALLED=Symbol.for('inkwave.local-quality.menu.v1');
export function installMenuQuality(Menus, env=globalThis){
  const P=Menus.prototype;if(Object.hasOwn(P,INSTALLED))return;
  const records=new WeakMap(),retired=new WeakSet(),lifecycle=getPlatformLifecycle(env);
  Object.defineProperty(P,INSTALLED,{value:records});
  const update=P.update,dispose=P.dispose,settings=P._scr_settings,swap=P._swap;
  if(settings)P._scr_settings=function(...args){preparePreviewRoot(this.el,env);return settings.apply(this,args);};
  if(swap)P._swap=function(...args){clearPreviewRoot(this.el);return swap.apply(this,args);};
  function ensure(m){
    let r=records.get(m);if(r)return r;
    r={timer:null,off:null};records.set(m,r);
    const cancel=()=>{if(r.timer!==null)env.clearTimeout(r.timer);r.timer=null;if(m._raf){env.cancelAnimationFrame(m._raf);m._raf=0;}};
    const arm=()=>{if(!m._platformDriven&&r.timer===null&&lifecycle.active&&!retired.has(m))r.timer=env.setTimeout(watch,80);};
    const watch=()=>{r.timer=null;if(m._platformDriven||retired.has(m)||!lifecycle.active)return;const age=env.performance.now()-m._extTick;if(!Number.isFinite(age)||age>=80){m._lastT=env.performance.now();if(!m._raf)m._raf=env.requestAnimationFrame(m._loop);}else r.timer=env.setTimeout(watch,Math.max(1,80-age));};
    r.arm=arm;r.cancel=cancel;
    r.off=lifecycle.subscribe({suspend:cancel,prepareResume(){m._lastT=env.performance.now();m._extTick=-Infinity;},resume:arm});
    return r;
  }
  P.setPlatformDriven=function(on){this._platformDriven=!!on;const r=ensure(this);r.cancel();if(!on)r.arm();};
  P._loop=function(now){this._raf=0;ensure(this);if(retired.has(this)||this._platformDriven||!lifecycle.active)return;this._raf=env.requestAnimationFrame(this._loop);const elapsed=(now-this._lastT)/1000;this._lastT=now;if(now-this._extTick<80)return;const dt=Number.isFinite(elapsed)&&elapsed>=0&&elapsed<=.25?Math.min(.1,elapsed):0;if(this.current&&this._scr)this._tick(dt);};
  P.update=function(dt){if(retired.has(this)||!lifecycle.active)return;const r=ensure(this);r.cancel();const result=update.call(this,dt);r.arm();return result;};
  P.dispose=function(...args){retired.add(this);clearPreviewRoot(this.el,true);const r=records.get(this);if(r){r.cancel();r.off();records.delete(this);}return dispose.apply(this,args);};
}
