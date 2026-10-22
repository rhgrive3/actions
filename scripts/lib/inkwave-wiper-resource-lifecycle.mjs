// Read-only QA observation of renderer-sharing owners. Never reset memory or dispose resources.
export function createWiperResourceLifecycle(G, game) {
 const owner=game.showcase, records=[], ids=new WeakMap();let next=1;
 const id=x=>{if(!x||typeof x!=='object')return null;if(!ids.has(x))ids.set(x,next++);return ids.get(x);};
 const inventory=scene=>{
  const geometries=new Set(),textures=new Set();
  scene?.traverse?.(o=>{
   if(o.geometry)geometries.add(id(o.geometry));
   for(const m of (Array.isArray(o.material)?o.material:[o.material]))if(m){
    for(const v of Object.values(m))if(v?.isTexture)textures.add(id(v));
    for(const u of Object.values(m.uniforms||{}))if(u?.value?.isTexture)textures.add(id(u.value));
   }
  });
  for(const t of [scene?.background,scene?.environment])if(t?.isTexture)textures.add(id(t));
  return {geometries:[...geometries].sort((a,b)=>a-b),textures:[...textures].sort((a,b)=>a-b)};
 };
 const snapshot=phase=>{
  if(game.showcase!==owner)throw Error('Renderer-sharing showcase owner changed');
  const l=owner?.lob;
  const row={phase,memory:{...G.renderer.info.memory},showcase:{mode:owner?.mode??null,warmState:owner?._warmState??null,warmPresent:!!owner?._warmChar,lobbyPresent:!!l,lobbyReady:l?.ready??null,lobbyFailed:l?.failed??null,lobbyPreload:l?.preload??null,lobbySetPresent:!!l?.set},owners:{main:inventory(G.scene),showcase:inventory(owner?.scene),lobby:inventory(l?.scene)}};
  records.push(row);return row;
 };
 const pending=()=>{if(game.showcase!==owner)throw Error('Renderer-sharing showcase owner changed');const l=owner?.lob;if(l?.failed)throw Error('Renderer-sharing lobby preload failed');return owner?._warmState==='busy'||!!owner?._warmChar||!!(l&&!l.ready);};
 const settle=async(phase,{timeoutMs=180000,now=()=>performance.now(),yieldTurn=()=>new Promise(r=>setTimeout(r,25))}={})=>{
  const start=now(),lobby=owner?.lob??null,warm=owner?._warmChar??null;
  snapshot(phase+':before');
  const checkOwners=()=>{
   if((owner?.lob??null)!==lobby)throw Error('Renderer-sharing lobby owner changed during settle: '+phase);
   const current=owner?._warmChar??null;
   // Native done() disposes and clears this same warm object, then sets done.
   // Clearing while busy or installing a different object is not completion.
   if(current!==warm&&!(warm&&current===null&&owner?._warmState==='done'))
    throw Error('Renderer-sharing warm owner changed before completion: '+phase);
  };
  while(true){checkOwners();if(!pending())break;if(now()-start>=timeoutMs)throw Error('Renderer-sharing resource readiness timeout: '+phase);await yieldTurn();}
  checkOwners();
  return snapshot(phase+':settled');
 };
 return {snapshot,settle,records};
}
// These exact warning labels are emitted by c093 Showcase compile rejection paths.
// State 'done' alone cannot distinguish successful compilation from caught rejection.
export function isWiperResourceLifecycleWarning(text){
 return typeof text==='string'&&/^\[showcase\] (?:warm-up|lobby set warm-up)(?:\s|$)/.test(text);
}
