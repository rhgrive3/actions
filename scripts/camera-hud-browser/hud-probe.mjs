// Runs unchanged emitted HUD methods against native DOM/CSS. Controlled component inputs.
export async function hudProbe(){
 const {G}=await import(new URL('src/core/ctx.js',document.baseURI));
 const {HUD}=await import(new URL('src/ui/hud.js',document.baseURI));
 const native=G.game.hud,holder=Object.create(HUD.prototype),root=native.el.cloneNode(false),layer=native.ddLayer.cloneNode(false);
 root.className='iw-hud is-live';root.style.zIndex='10000';root.append(layer);document.body.append(root);
 Object.assign(holder,{_dd:[],_L:{cb:'#2f5bff'},ddLayer:layer});
 const savedCamera=G.camera,tracked=new Set(),originals=[],writes=[],events=[],frames=[];let activeRestart=false;
 const check=(v,m)=>{if(!v)throw Error('HUD DOM: '+m);};
 const actors=Array.from({length:7},(_,i)=>({team:1,alive:true,pos:{x:i+1,z:8}}));
 // CSSStyleDeclaration exposes exotic named properties in Chromium, not per-property accessors.
 function observeNativeStyle(el,onWrite){
  const native=el.style,own=Object.getOwnPropertyDescriptor(el,'style');
  if(!native||typeof native.getPropertyValue!=='function'||typeof native.setProperty!=='function'||(own&&!own.configurable))throw Error('Unobservable native element style');
  const methods=new Map(),proxy=new Proxy(native,{get(target,key){const v=Reflect.get(target,key,target);if(typeof v!=='function')return v;if(!methods.has(key))methods.set(key,v.bind(target));return methods.get(key);},set(target,key,value){const ok=Reflect.set(target,key,value,target);if(ok&&(key==='transform'||key==='opacity'))onWrite(key,String(value));return ok;}});
  Object.defineProperty(el,'style',{configurable:true,enumerable:own?.enumerable??true,get:()=>proxy});
  const restore=()=>{if(own)Object.defineProperty(el,'style',own);else delete el.style;if(el.style!==native)throw Error('Native style restoration failed');};
  try{if(el.style!==proxy||el.style.getPropertyValue('transform')!==native.getPropertyValue('transform'))throw Error('Native style proxy readback failed');}catch(error){restore();throw error;}
  return restore;
 }
 function instrument(){for(const d of holder._dd)if(!tracked.has(d.el)){tracked.add(d.el);originals.push(observeNativeStyle(d.el,(key,v)=>writes.push([key,v])));}}

 function snapshot(label){const rootStyle=getComputedStyle(root);check(rootStyle.display!=='none'&&rootStyle.visibility==='visible'&&Number(rootStyle.opacity)>0,'fixture root visible');const rows=holder._dd.map(d=>{const c=getComputedStyle(d.el),r=d.el.getBoundingClientRect();check([r.x,r.y,r.width,r.height].every(Number.isFinite)&&r.width>0&&r.height>0,'nonzero real DOM geometry');if(label.startsWith('static'))check(Number(c.opacity)>0&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight,'stable arc intersects viewport with positive opacity');const paths=[...d.el.querySelectorAll('path')].map(p=>{const s=getComputedStyle(p);return{fill:s.fill,stroke:s.stroke,length:p.getTotalLength()};});check(paths.length===2&&paths.every(p=>p.length>0),'native SVG paths');check(c.visibility==='visible'&&c.display!=='none','arc visible');return {t:d.t,x:d.px,z:d.pz,transform:d.el.style.transform,opacity:d.el.style.opacity,computedTransform:c.transform,computedOpacity:c.opacity,visibility:c.visibility,display:c.display,width:r.width,height:r.height,paths};});frames.push({label,rows});}
 function hit(a){const prior=holder._dd.find(d=>d.a===a),old=prior?.el,oldAnimations=old?.getAnimations({subtree:true})||[];holder._addDamageDir(a);instrument();const d=holder._dd.find(d=>d.a===a);check(!old||old===d.el,'re-hit keeps node');const animations=d.el.getAnimations({subtree:true});check(animations.some(a=>a.animationName==='iw-dd-hit'),'real hit animation started');check(!old||animations.some(a=>a.animationName==='iw-dd-hit'&&!oldAnimations.includes(a)),'re-hit starts a new native animation');events.push({kind:'hit',reused:!!old,count:holder._dd.length,animations:animations.map(a=>a.animationName)});if(!activeRestart){const running=animations.find(a=>a.animationName==='iw-dd-hit');running.currentTime=100;check(running.playState!=='finished','active animation precondition');holder._addDamageDir(a);const restarted=d.el.getAnimations({subtree:true}).find(a=>a.animationName==='iw-dd-hit'&&a!==running);check(!!restarted&&holder._dd.find(x=>x.a===a).el===d.el,'active re-hit restarts animation on same node');activeRestart=true;}for(const a of d.el.getAnimations({subtree:true}))a.finish();}
 function tick(dt,label){holder._updDamageDirs(dt);snapshot(label);}
 try{
  G.camera=null;
  for(const a of actors.slice(0,6))hit(a);
  const countStart=writes.length;for(let i=0;i<60;i++)tick(1/60,'static'+i);const stationaryWrites=writes.length-countStart;
  for(let i=0;i<20;i++)tick(1/60,'fade'+i);
  hit(actors[0]);tick(1/60,'rehit');check(holder._dd.find(d=>d.a===actors[0]).el.style.opacity==='1','native opacity reset');
  const oldest=holder._dd[0].el;hit(actors[6]);check(!oldest.isConnected&&holder._dd.length===6,'six arc cap eviction');
  for(let i=0;i<20;i++){actors[1].pos.x=Math.sin(i/9)*8;actors[1].alive=i<10;const t=i/40;G.camera={position:{x:i/100,z:1},matrixWorld:{elements:[Math.cos(t),0,-Math.sin(t),0,0,1,0,0,Math.sin(t),0,Math.cos(t),0,0,0,0,1]}};tick(1/60,'motion'+i);}
  holder._clearDamageDirs();check(layer.childElementCount===0,'clear removes actual nodes');snapshot('clear');hit(actors[0]);tick(1/60,'recreate');for(let i=0;i<110;i++)tick(1/60,'expire'+i);check(layer.childElementCount===0&&holder._dd.length===0,'expiry removes actual nodes');
  return{activeRestart,frames,events,stationaryWrites,totalWrites:writes.length,scope:'Native emitted HUD component DOM/CSS parity; deterministic sampled hit animation endpoint; no full Game damage admission or device/FPS claim'};
 }finally{for(const restore of originals.reverse())restore();holder._clearDamageDirs();root.remove();G.camera=savedCamera;check(G.camera===savedCamera&&!root.isConnected,'fixture restored');}
}
