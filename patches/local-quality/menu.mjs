import {preparePreviewRoot,clearPreviewRoot} from './menu-preview.mjs';
// One UI animation owner. The game already drives Menus.update each frame;
// do not also dispatch a second requestAnimationFrame just to early-return.
// Independent UI labs recover their native loop after the same 80ms lease.
const INSTALLED=Symbol.for('inkwave.local-quality.menu.v1');
export function installMenuQuality(Menus, env=globalThis){
  const P=Menus.prototype;if(Object.hasOwn(P,INSTALLED))return;
  const records=new WeakMap(),retired=new WeakSet();Object.defineProperty(P,INSTALLED,{value:records});
  const update=P.update,dispose=P.dispose,settings=P._scr_settings,swap=P._swap;
  if(settings)P._scr_settings=function(...args){preparePreviewRoot(this.el,env);return settings.apply(this,args);};
  if(swap)P._swap=function(...args){clearPreviewRoot(this.el);return swap.apply(this,args);};
  function ensure(m){
    let r=records.get(m);if(r)return r;
    r={timer:null,visible:null};records.set(m,r);
    const arm=()=>{if(r.timer===null&&!env.document?.hidden)r.timer=env.setTimeout(watch,80);};
    const watch=()=>{
      r.timer=null;if(retired.has(m)||env.document?.hidden)return;
      const age=env.performance.now()-m._extTick;
      if(age>=80){
        // The external owner stopped. Hand animation back without a burst of
        // stale elapsed time or duplicate callbacks.
        m._lastT=Math.max(m._lastT,m._extTick);
        if(!m._raf)m._raf=env.requestAnimationFrame(m._loop);
      }else r.timer=env.setTimeout(watch,Math.max(1,80-age));
    };
    r.arm=arm;r.visible=()=>{
      if(env.document?.hidden){if(r.timer!==null)env.clearTimeout(r.timer);r.timer=null;}
      else arm();
    };
    env.document?.addEventListener('visibilitychange',r.visible);
    return r;
  }
  P.update=function(dt){
    if(retired.has(this))return;
    const r=ensure(this);
    if(this._raf){env.cancelAnimationFrame(this._raf);this._raf=0;}
    const result=update.call(this,dt);r.arm();return result;
  };
  P.dispose=function(...args){
    retired.add(this);clearPreviewRoot(this.el,true);const r=records.get(this);
    if(r){if(r.timer!==null)env.clearTimeout(r.timer);env.document?.removeEventListener('visibilitychange',r.visible);records.delete(this);}
    return dispose.apply(this,args);
  };
}
