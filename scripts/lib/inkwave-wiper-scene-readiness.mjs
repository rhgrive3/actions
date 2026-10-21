// Native range dummies have no source-motion rig. Admit only the exact native class and session owner.
export async function awaitWiperSceneSources(G,TargetDummyCharacter,timeoutMs=180000){
 if(typeof TargetDummyCharacter!=='function')throw Error('Native dummy class required');
 const scene=G.scene,match=G.match,actors=G.actors,local=G.local,range=match?.range,targets=range?.targets;
 const records=actors.map(a=>{const ch=a.character,owner=ch?.sourceMotion;return {a,ch,owner,ready:owner?.ready,warm:null,warmAwaited:false,dummy:ch instanceof TargetDummyCharacter};});
 if(!records.length||records.length>64)throw Error('Unexpected scene actor count');let timer;
 const valid=r=>{
  if(G.scene!==scene||G.match!==match||G.actors!==actors||G.local!==local||match?.range!==range||range?.targets!==targets)throw Error('Native scene/session ownership changed');
  if(r.a.character!==r.ch)throw Error('Native scene character ownership changed');
  if(r.dummy){
   const targets=G.match?.range?.targets,t=r.a.rangeTarget;
   if(r.a===G.local||!(r.ch instanceof TargetDummyCharacter)||!Array.isArray(targets)||!Number.isInteger(t?.index)||targets[t.index]!==r.a||
    r.ch.actor!==r.a||r.ch.root?.parent!==G.scene||r.ch.sourceMotion!=null)throw Error('Invalid native range dummy ownership');
   return;
  }
  const o=r.owner;
  if(r.ch.sourceMotion!==o||!o||o.ready!==r.ready||o.status!=='ready'||o.error||o.disposed||o.character!==r.ch||!o.bank||!o.squidBank)
   throw Error('Native scene source did not become ready or changed ownership');
 };
 try{
  await Promise.race([Promise.all(records.map(async r=>{
   if(r.dummy)valid(r);
   else{const ready=r.ready;if(!ready||typeof ready.then!=='function')throw Error('Missing native scene source loader');
    await ready;if(r.ch.sourceMotion!==r.owner||r.owner.ready!==ready)throw Error('Native source promise ownership changed');}
   r.warm=r.ch._warmed;if(r.warm&&typeof r.warm.then==='function'){await r.warm;r.warmAwaited=true;}
   valid(r);
  })),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native scene source readiness timeout')),timeoutMs);})]);
 }finally{clearTimeout(timer);}
 if(records.length!==G.actors.length||records.some((r,i)=>G.actors[i]!==r.a))throw Error('Scene actor ownership changed while waiting');
 for(const r of records){valid(r);if(r.ch._warmed!==r.warm)throw Error('Scene warm ownership changed while waiting');}
 return records.map((r,i)=>({index:i,local:r.a===G.local,kind:r.dummy?'native-range-target-dummy':'source-motion-character',
  variant:r.owner?.variant??null,status:r.dummy?'native-no-rig':r.owner.status,existingWarmAwaited:r.warmAwaited}));
}
export function wiperSceneCensus(G,scene,TargetDummyCharacter){
 const actors=G.actors.map((a,i)=>({a,root:a.character?.root,key:a===G.local?'local-character':(typeof TargetDummyCharacter==='function'&&a.character instanceof TargetDummyCharacter?'range-target-':'other-character-')+i}));
 const roots=new Map(actors.filter(x=>x.root).map(x=>[x.root,x.key]));
 const categories=new Map(),geometries=new Map();
 const classify=o=>{for(let p=o;p;p=p.parent){if(roots.has(p))return roots.get(p);
  if(Object.values(G.projectiles).includes(p))return 'projectiles';if(G.fx&&Object.values(G.fx).includes(p))return 'effects';}return 'background';};
 scene.traverse(o=>{
  if(!(o.isMesh||o.isPoints||o.isLine))return;
  const owner=classify(o),key=owner+':'+o.type;
  let c=categories.get(key);if(!c){c={owner,type:o.type,objects:0,visibleObjects:0,positionEntries:0,indexEntries:0,drawRangeEntries:0,instances:0};categories.set(key,c);geometries.set(key,new Set());}
  c.objects++;let visible=true;for(let p=o;p;p=p.parent)if(!p.visible){visible=false;break;}if(visible)c.visibleObjects++;
  const g=o.geometry;if(g){geometries.get(key).add(g);c.positionEntries+=g.attributes?.position?.count||0;c.indexEntries+=g.index?.count||0;const count=g.index?.count??g.attributes?.position?.count??0;c.drawRangeEntries+=Math.max(0,Math.min(count,(g.drawRange?.start??0)+(g.drawRange?.count??Infinity))-(g.drawRange?.start??0));}
  c.instances+=o.isInstancedMesh?o.count:0;
 });
 return {scope:'Read-only scene inventory; not frustum/shadow/GPU draw totals',
  actors:actors.map(({a,key})=>({key,weapon:a.weapon?.id??a.weaponId,style:a.character.style,lodTier:a.character.lodTier,warmStarted:!!a.character._warmed,source:{status:a.character.sourceMotion?.status,variant:a.character.sourceMotion?.variant,active:a.character.sourceMotion?.active,clips:a.character.sourceMotion?.currentClips?.map(c=>c.name).slice(0,16)}})),
  categories:[...categories.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,c])=>({...c,uniqueGeometries:geometries.get(key).size}))};
}


export function validWiperProfileStyle(style){
 const expected={hair:0,skin:7,outfit:5,eyes:1,hat:0,brows:3};
 return !!style&&typeof style==='object'&&Object.keys(style).length===6&&Object.entries(expected).every(([key,value])=>Object.hasOwn(style,key)&&style[key]===value);
}
