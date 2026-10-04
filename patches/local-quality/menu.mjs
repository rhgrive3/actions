import {preparePreviewRoot,clearPreviewRoot} from './menu-preview.mjs';
// One UI animation owner. The game already drives Menus.update each frame;
// do not also dispatch a second requestAnimationFrame just to early-return.
// Independent UI labs recover their native loop after the same 80ms lease.
const INSTALLED=Symbol.for('inkwave.local-quality.menu.v1');
export function installMenuQuality(Menus, env=globalThis){
  const P=Menus.prototype;if(Object.hasOwn(P,INSTALLED))return;
  const records=new WeakMap(),retired=new WeakSet();Object.defineProperty(P,INSTALLED,{value:records});
  const update=P.update,dispose=P.dispose,settings=P._scr_settings,swap=P._swap,loop=P._loop;
  const active=m=>!!(m.current||m._scr);
  const focus=P._setFocus, inputMode=P.setInputMode, cursor=P._updateCursor;
  // A CSS opacity fade must not leave a retired ring over the old item.
  // Keep native fade-in and the moving spring; hide only the logically off ring.
  const syncRingVisibility=m=>{const style=m.cursorEl.style,want=m._cur.on?'':'hidden';if(style.visibility!==want)style.visibility=want;};
  // One spring clock: an input task can spend the elapsed part of the current
  // frame immediately; the engine's next cursor tick subtracts that credit.
  // This starts visual motion now without an extra rAF or double advancement.
  if(cursor)P._updateCursor=function(dt){
    if(!this._cur.on||this._cur.snapNext)this._qualityCursorCredit=0;
    if(dt>0&&this._qualityCursorCredit){
      const credit=this._qualityCursorCredit;
      this._qualityCursorCredit=Math.max(0,credit-dt);dt=Math.max(0,dt-credit);
    }
    if(!this._focus?.isConnected)this._cur.targetEl=null;
    const result=cursor.call(this,dt);syncRingVisibility(this);this._qualityCursorAt=env.performance.now();return result;
  };
  function retarget(m){
    const now=env.performance.now();
    const elapsed=m._qualityCursorAt==null?0:Math.max(0,(now-m._qualityCursorAt)/1000);
    const step=m._frozen?.()?0:Math.min(1/60,elapsed)*(m.timeScale>0?m.timeScale:1);
    if(!m._focus?.isConnected)m._cur.targetEl=null;
    const springClock=m._cur.on&&!m._cur.snapNext,advancing=step>0&&springClock;
    cursor.call(m,step);syncRingVisibility(m);m._qualityCursorAt=now;
    if(advancing&&m._cur.on)m._qualityCursorCredit=(m._qualityCursorCredit||0)+step;
    else if(!m._cur.on||!springClock)m._qualityCursorCredit=0;
  }
  // Logical selection, geometric target and first visual step all commit in
  // this task, including touch's own-row highlight and deselection.
  if(focus&&cursor)P._setFocus=function(...args){
    const old=this._focus,result=focus.apply(this,args);
    if(old!==this._focus)retarget(this);
    return result;
  };
  if(inputMode&&cursor)P.setInputMode=function(...args){
    const old=this._input,result=inputMode.apply(this,args);
    // Input-mode callbacks can reflow the same focused element.
    if(old!==this._input){this._cur.targetEl=null;retarget(this);}
    return result;
  };
  if(settings)P._scr_settings=function(...args){preparePreviewRoot(this.el,env);return settings.apply(this,args);};
  if(swap)P._swap=function(...args){
    clearPreviewRoot(this.el);this._qualityCursorCredit=0;
    const result=swap.apply(this,args),r=ensure(this);
    if(active(this))r.arm();else stop(this,r);
    return result;
  };
  function stop(m,r){
    if(m._raf){env.cancelAnimationFrame(m._raf);m._raf=0;}
    if(r?.timer!==null&&r?.timer!==undefined){env.clearTimeout(r.timer);r.timer=null;}
    m._qualityCursorCredit=0;
  }
  if(loop)P._loop=function(t){
    if(retired.has(this)||env.document?.hidden||!active(this)){stop(this,records.get(this));return;}
    return loop.call(this,t);
  };
  function ensure(m){
    let r=records.get(m);if(r)return r;
    r={timer:null,visible:null};records.set(m,r);
    const arm=()=>{if(r.timer===null&&!retired.has(m)&&active(m)&&!env.document?.hidden)r.timer=env.setTimeout(watch,80);};
    const watch=()=>{
      r.timer=null;if(retired.has(m)||env.document?.hidden||!active(m))return;
      const age=env.performance.now()-m._extTick;
      if(age>=80){
        // The external owner stopped. Hand animation back without a burst of
        // stale elapsed time or duplicate callbacks.
        m._lastT=Math.max(m._lastT,m._extTick);
        if(!m._raf)m._raf=env.requestAnimationFrame(m._loop);
      }else r.timer=env.setTimeout(watch,Math.max(1,80-age));
    };
    r.arm=arm;r.visible=()=>{
      if(env.document?.hidden)stop(m,r);
      else arm();
    };
    env.document?.addEventListener('visibilitychange',r.visible);
    return r;
  }
  P.update=function(dt){
    if(retired.has(this))return;
    const r=ensure(this);
    if(this._raf){env.cancelAnimationFrame(this._raf);this._raf=0;}
    if(!active(this)||env.document?.hidden){stop(this,r);this._extTick=env.performance.now();return;}
    const result=update.call(this,dt);r.arm();return result;
  };
  P.dispose=function(...args){
    retired.add(this);clearPreviewRoot(this.el,true);const r=records.get(this);
    if(r){if(r.timer!==null)env.clearTimeout(r.timer);env.document?.removeEventListener('visibilitychange',r.visible);records.delete(this);}
    return dispose.apply(this,args);
  };
}
