// Cache DOM geometry only while its layout is observable and stationary.
// Mutation records are drained synchronously before each sample, so a style or
// text change in the current input task cannot serve a stale rectangle.
export class LayoutSample {
  constructor(root, ignored = null, env = globalThis, ignoreMutation = null) {
    this.root = root; this.ignored = ignored; this.env = env;
    this.dirty = true; this.rows = new Map(); this.unsubs = [];
    const changed = records => {
      for (const r of records) if (!ignoreMutation?.(r) && !ignored?.contains?.(r.target) && r.target !== ignored) { this.dirty = true; break; }
    };
    this.changed = changed;
    if (env.MutationObserver && root) {
      this.mutations = new env.MutationObserver(changed);
      this.mutations.observe(root, {subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});
      // Ancestor transforms and sibling layout can move the root. Observe the
      // ancestor subtree too; cursor/SVG-only mutations are filtered above.
      const top = root.ownerDocument?.documentElement;
      if (top && top !== root) this.mutations.observe(top,{subtree:true,childList:true,characterData:true,attributes:true,attributeOldValue:true});
    }
    if (env.ResizeObserver) this.resize = new env.ResizeObserver(() => { this.dirty = true; });
    const listen = (target, name) => {
      if (!target?.addEventListener) return;
      const cb = () => { this.dirty = true; };
      target.addEventListener(name,cb,true); this.unsubs.push(() => target.removeEventListener(name,cb,true));
    };
    for (const name of ['resize','scroll','orientationchange','fullscreenchange','animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel']) listen(env,name);
    for (const name of ['resize','scroll']) listen(env.visualViewport,name);
    for (const name of ['loadingdone','loadingerror']) listen(root?.ownerDocument?.fonts,name);
    // Without complete observation, retain live sampling rather than guess.
    this.observable = !!(this.mutations && this.resize && root?.getAnimations);
  }
  begin() {
    this.changed(this.mutations?.takeRecords?.() || []);
    const e=this.env,v=e.visualViewport;
    if(this.width!==e.innerWidth||this.height!==e.innerHeight||this.dpr!==e.devicePixelRatio||this.scale!==v?.scale||this.vx!==v?.offsetLeft||this.vy!==v?.offsetTop){
      this.width=e.innerWidth;this.height=e.innerHeight;this.dpr=e.devicePixelRatio;this.scale=v?.scale;this.vx=v?.offsetLeft;this.vy=v?.offsetTop;this.dirty=true;
    }
    // Include sibling/ancestor animations because a moving panel can reflow
    // the target even if its own animation list is empty. Ignore our SVG/ring.
    const top=this.root?.ownerDocument?.documentElement || this.root;
    const animations=top?.getAnimations?.({subtree:true}) || this.root?.getAnimations?.({subtree:true}) || [];
    this.active = animations.some(a => (a.playState==='running'||a.pending) && !this.ignored?.contains?.(a.effect?.target) && a.effect?.target!==this.ignored);
    this.refresh = this.dirty || this.active || !this.observable;
    this.dirty = false;
  }
  rect(el) {
    let row=this.rows.get(el);
    if(!row){row={};this.rows.set(el,row);this.resize?.observe(el);}
    if(this.refresh||!row.rect)row.rect=el.getBoundingClientRect();
    return row.rect;
  }
  clientSize(el) {
    let row=this.rows.get(el);
    if(!row){row={};this.rows.set(el,row);this.resize?.observe(el);}
    if(this.refresh||row.width===undefined){row.width=el.clientWidth;row.height=el.clientHeight;}
    return row;
  }
  opacity(el) {
    let row=this.rows.get(el);
    if(!row){row={};this.rows.set(el,row);this.resize?.observe(el);}
    if(this.refresh||row.opacity===undefined)row.opacity=this.env.getComputedStyle(el).opacity;
    return row.opacity;
  }
  dispose(){this.mutations?.disconnect();this.resize?.disconnect();for(const unsub of this.unsubs)unsub();this.unsubs.length=0;this.rows.clear();this.root=this.ignored=null;}
}
export function menuLayoutSample(menu, target, env=globalThis) {
  const root=menu._modal||menu._scr?.el||menu.el;
  let sample=menu._queueLayoutSample;
  if(sample&&(sample.root!==root||sample.target!==target)){sample.dispose();sample=null;}
  if(!sample){sample=menu._queueLayoutSample=new LayoutSample(root,menu.cursorEl,env);sample.target=target;}
  sample.begin();return sample;
}

// Client dimensions exclude transforms. The tank's explicit CSS dimensions
// depend on its ancestors and stylesheet rules, not the animated marker DOM.
// Keep class/rule mutations conservative; omit unrelated style/text traffic.
const NON_SIZE_STYLE=/(?:^|;)(?:transform|translate|rotate|scale|opacity|filter|pointer-events)\s*:[^;]*/gi;
export function ignoreClientSizeMutation(record,canvas) {
  const target=record.target;
  if(target===canvas&&(record.attributeName==='width'||record.attributeName==='height'))return true;
  if(record.type==='attributes'&&record.attributeName==='style'){
    if(target!==canvas&&!target?.contains?.(canvas))return true;
    return (record.oldValue||'').replace(NON_SIZE_STYLE,'')===(target.getAttribute?.('style')||'').replace(NON_SIZE_STYLE,'');
  }
  if(record.type==='attributes')return false;
  const element=target?.nodeType===3?target.parentElement:target;
  if(element?.closest?.('style,link'))return false;
  if(record.type==='childList')for(const node of [...(record.addedNodes||[]),...(record.removedNodes||[])])if(node.nodeType===1&&(node.matches?.('style,link')||node.querySelector?.('style,link')))return false;
  return target!==canvas&&!target?.contains?.(canvas);
}
export function canvasCssSize(owner,canvas,env=globalThis) {
  let sample=owner._queueCanvasLayout;
  if(sample&&sample.canvas!==canvas){sample.dispose();sample=null;}
  if(!sample){sample=owner._queueCanvasLayout=new LayoutSample(canvas.parentElement||canvas,null,env,r=>ignoreClientSizeMutation(r,canvas));sample.canvas=canvas;}
  sample.begin();return sample.clientSize(canvas);
}
