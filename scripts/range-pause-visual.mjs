// Browser-side diagnostic only. No clock, animation, DOM or runtime mutation.
export function collectPauseVisualState(){
 const active=[...document.querySelectorAll('.iwr-pausescr:not(.is-leaving)')];
 const root=active[0],viewport={width:innerWidth,height:innerHeight};
 const inspect=(name,el)=>{
  if(!el)return {name,missing:true};
  const rect=el.getBoundingClientRect(),chain=[];
  const motion=p=>p.getAnimations({subtree:false}).map(a=>({name:a.animationName||null,playState:a.playState,pending:a.pending,currentTime:a.currentTime,timing:a.effect.getComputedTiming()}));
  for(let p=el;p;p=p.parentElement){const s=getComputedStyle(p);chain.push({tag:p.tagName,classes:p.className,display:s.display,visibility:s.visibility,opacity:Number(s.opacity),transform:s.transform,filter:s.filter,clipPath:s.clipPath,expectedSettledOpacity:1,animations:motion(p)});}
  const animations=motion(el);
  return {name,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},chain,animations};
 };
 return {clock:{performance:performance.now(),timeline:document.timeline.currentTime},viewport,activeCount:active.length,paused:window.__G?.match?.paused,root:inspect('root',root),opacityContract:'Exact13c CSS: tested container and ancestor element opacity defaults to1; rgba background/text alpha is separate; .99 is only diagnostic tolerance, not product acceptance',elements:[inspect('header',root?.querySelector('.iw-head')),inspect('panel',root?.querySelector('.iwr-pause')),inspect('menu',root?.querySelector('.iwr-pause__menu')),...[...(root?.querySelectorAll('.iwr-pause__menu .iw-in')||[])].map((e,i)=>inspect('button'+i,e))]};
}
export function assertPauseVisualState(r){
 if(!r||!r.viewport||!['width','height'].every(k=>Number.isFinite(r.viewport[k])&&r.viewport[k]>0)||!Array.isArray(r.elements)||!r.root)throw Error('Pause visual: malformed receipt');
 if(r.activeCount!==1||r.paused!==true)throw Error('Pause visual: active paused screen absent/ambiguous');
 if(!Number.isFinite(r.clock?.performance)||!Number.isFinite(r.clock?.timeline))throw Error('Pause visual: invalid clocks');
 for(const e of [r.root,...r.elements]){
  if(!e||!Array.isArray(e.chain)||!Array.isArray(e.animations)||e.chain.some(s=>!s||!Array.isArray(s.animations)))throw Error('Pause visual: malformed element/ancestor arrays');
  if(e.missing||!e.rect||!['x','y','width','height'].every(k=>Number.isFinite(e.rect[k])))throw Error('Pause visual: missing/invalid '+e.name);
  const b=e.rect,area=Math.max(0,Math.min(b.x+b.width,r.viewport.width)-Math.max(b.x,0))*Math.max(0,Math.min(b.y+b.height,r.viewport.height)-Math.max(b.y,0));
  if(!(area>100))throw Error('Pause visual: clipped '+e.name);
  if(!e.chain.length||e.chain.some(s=>s.display==='none'||s.visibility!=='visible'||!Number.isFinite(s.opacity)||s.expectedSettledOpacity!==1||Math.abs(s.opacity-s.expectedSettledOpacity)>.01))throw Error('Pause visual: hidden/translucent '+e.name);
  if([...e.animations,...e.chain.flatMap(s=>s.animations)].some(a=>a.pending||a.playState==='running'||a.playState==='paused'))throw Error('Pause visual: unsettled animation '+e.name);
 }
 if(r.elements.slice(0,3).map(e=>e.name).join(',')!=='header,panel,menu'||r.elements.length<6)throw Error('Pause visual: incomplete elements');
 return true;
}
export function assertArtifactDigest(key,actual,artifacts,manifestDigest){
 if(typeof key!=='string'||(!Object.hasOwn(artifacts,key)&&key!=='inkwave-build.json'))throw Error('Unlisted artifact '+key);
 if(typeof actual!=='string'||actual!==(key==='inkwave-build.json'?manifestDigest:artifacts[key]))throw Error('Served artifact mismatch '+key);
}
