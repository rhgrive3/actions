import {preparePreviewRoot,clearPreviewRoot} from './menu-preview.mjs';
import {getPlatformLifecycle} from './platform-lifecycle.mjs';
// One UI animation owner. The game already drives Menus.update each frame;
// do not also dispatch a second requestAnimationFrame just to early-return.
// Independent UI labs recover their native loop after the same 80ms lease.
const INSTALLED=Symbol.for('inkwave.local-quality.menu.v1');
export function installMenuQuality(Menus, env=globalThis){
  const P=Menus.prototype;if(Object.hasOwn(P,INSTALLED))return;
  const records=new WeakMap(),retired=new WeakSet(),lifecycle=getPlatformLifecycle(env);Object.defineProperty(P,INSTALLED,{value:records});
  const update=P.update,dispose=P.dispose,settings=P._scr_settings,swap=P._swap,loop=P._loop,show=P.show,nav=P._nav;
  const active=m=>!!(m.current||m._scr);
  const focus=P._setFocus, inputMode=P.setInputMode, cursor=P._updateCursor;
  // A CSS opacity fade must not leave a retired ring over the old item.
  // Keep native fade-in and pulse; hide only the logically off ring.
  const syncRingVisibility=m=>{const style=m.cursorEl.style,want=m._cur.on?'':'hidden';if(style.visibility!==want)style.visibility=want;};
  // The ring IS the selection display: its geometry is the focused item's
  // geometry, never a spring travelling toward it. Native springs (k 560,
  // c 34: under-damped, ~0.2 s to settle) made the outline trail every
  // keyboard/pad/touch move and chase rapid input from behind while the
  // item's own focus state had already changed. Each owner tick re-reads the
  // geometry (scrolling lists, entrance layout); selection changes commit it
  // in the same input task. Opacity fade-in and the CSS pulse stay.
  const place=(m,dt)=>{
    if(!m._focus?.isConnected)m._cur.targetEl=null;
    m._cur.snapNext=true;
    const result=cursor.call(m,dt);syncRingVisibility(m);return result;
  };
  if(cursor)P._updateCursor=function(dt){return place(this,dt);};
  // Logical selection, geometric target and the painted ring all commit in
  // this task, including touch's own-row highlight and deselection.
  if(focus&&cursor)P._setFocus=function(...args){
    const old=this._focus,result=focus.apply(this,args);
    if(old!==this._focus)place(this,0);
    return result;
  };
  if(inputMode&&cursor)P.setInputMode=function(...args){
    const old=this._input,result=inputMode.apply(this,args);
    // Input-mode callbacks can reflow the same focused element.
    if(old!==this._input){this._cur.targetEl=null;place(this,0);}
    return result;
  };
  // Screen ownership of input. show() changes the logical screen at once but
  // a wiped transition (results→null/main, title→main…) mounts the next one
  // only at the wipe's midpoint, and the following screen mounts while its
  // items are still invisible (entrance animation). Taps kept landing on
  // both: the closed results screen stayed live for ~0.4 s (a second tap
  // could REMATCH after MAIN MENU), and a tap begun there — or an impatient
  // tap on the not-yet-visible next screen — activated whatever item ended
  // up under the finger (LOADOUT, ONLINE…). A pending screen is inert; a
  // click needs a press that began on the same live screen, on a visible item.
  const pending=m=>!!(m._scr&&m.current!==m._scr.name);
  const closing=m=>{const el=m._scr?.el;if(!el||!pending(m))return;el.inert=true;el.style.pointerEvents='none';el.classList.add('is-closing');};
  // Delayed title/Mode transitions are owned by the transformed native Menus
  // methods. Do not override _titleGo here: that would create a second timer
  // owner and bypass their screen-generation and timer-identity checks.
  if(show)P.show=function(...args){
    if(retired.has(this))return;
    const result=show.apply(this,args);closing(this);return result;
  };
  if(nav)P._nav=function(dir){if(pending(this))return true;return nav.call(this,dir);};
  const visibleItem=(t,root)=>{
    let k=1;
    for(let e=t.closest?.('[data-nav]')||t;e&&e!==root.parentNode;e=e.parentElement){
      const o=+env.getComputedStyle?.(e)?.opacity;if(Number.isFinite(o))k*=o;
      if(e===root)break;
    }
    return k>0.6;
  };
  const guardInput=m=>{
    if(m._qualityInputGuard||!m.el?.addEventListener)return;
    m._qualityInputGuard=true;
    m.el.addEventListener('pointerdown',e=>{m._qualityPress={screen:m._scr?.el||null,target:e.target};},{capture:true,passive:true});
    m.el.addEventListener('click',e=>{
      const scr=m._scr;if(!scr?.el?.contains?.(e.target))return;
      const press=m._qualityPress;m._qualityPress=null;
      if(!pending(m)&&!scr.el.inert&&(!press||press.screen===scr.el)&&visibleItem(e.target,scr.el))return;
      e.stopImmediatePropagation();e.preventDefault();
    },true);
  };
  if(settings)P._scr_settings=function(...args){preparePreviewRoot(this.el,env);return settings.apply(this,args);};
  if(swap)P._swap=function(...args){
    clearPreviewRoot(this.el);guardInput(this);
    const result=swap.apply(this,args),r=ensure(this);
    if(active(this))r.arm();else stop(this,r);
    return result;
  };
  function stop(m,r){
    if(m._raf){env.cancelAnimationFrame(m._raf);m._raf=0;}
    if(r?.timer!==null&&r?.timer!==undefined){env.clearTimeout(r.timer);r.timer=null;}
  }
  if(loop)P._loop=function(t){
    if(retired.has(this)||this._platformDriven||!lifecycle.active||env.document?.hidden||!active(this)){stop(this,records.get(this));return;}
    return loop.call(this,t);
  };
  function ensure(m){
    let r=records.get(m);if(r)return r;
    r={timer:null,off:null};records.set(m,r);
    const arm=()=>{if(r.timer===null&&!m._platformDriven&&!retired.has(m)&&active(m)&&lifecycle.active&&!env.document?.hidden)r.timer=env.setTimeout(watch,80);};
    const watch=()=>{
      r.timer=null;if(m._platformDriven||retired.has(m)||!lifecycle.active||env.document?.hidden||!active(m))return;
      const age=env.performance.now()-m._extTick;
      if(age>=80){
        // The external owner stopped. Hand animation back without a burst of
        // stale elapsed time or duplicate callbacks.
        m._lastT=Math.max(m._lastT,m._extTick);
        if(!m._raf)m._raf=env.requestAnimationFrame(m._loop);
      }else r.timer=env.setTimeout(watch,Math.max(1,80-age));
    };
    r.arm=arm;
    r.off=lifecycle.subscribe({
      suspend(){stop(m,r);},
      prepareResume(){stop(m,r);m._lastT=env.performance.now();m._extTick=-Infinity;},
      resume:arm,
    });
    return r;
  }
  P.setPlatformDriven=function(on){
    this._platformDriven=!!on;
    const r=ensure(this);stop(this,r);
    if(!on)r.arm();
  };
  P.update=function(dt){
    if(retired.has(this)||!lifecycle.active)return;
    const r=ensure(this);
    if(env.document?.hidden){stop(this,r);this._extTick=env.performance.now();return;}
    if(this._raf){env.cancelAnimationFrame(this._raf);this._raf=0;}
    if(!active(this)){stop(this,r);this._extTick=env.performance.now();return;}
    const result=update.call(this,dt);r.arm();return result;
  };
  P.dispose=function(...args){
    retired.add(this);clearPreviewRoot(this.el,true);const r=records.get(this);
    if(r){stop(this,r);r.off?.();records.delete(this);}
    return dispose.apply(this,args);
  };
}
