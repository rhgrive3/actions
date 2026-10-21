import { isDeepStrictEqual } from 'node:util';
// Diagnostic read-only census, not a rendered triangle attribution or GPU timer.
export async function awaitExplosherSceneSources(G,timeoutMs=180000){
 const records=G.actors.map(a=>({a,ch:a.character,owner:null,warm:null,warmAwaited:false}));
 if(!records.length||records.length>64)throw Error('Unexpected scene actor count');let timer;
 const valid=r=>{
  const o=r.owner;
  if(r.a.character!==r.ch||r.ch.sourceMotion!==o||!o||o.status!=='ready'||o.error||o.disposed||o.character!==r.ch||!o.bank||!o.squidBank)
   throw Error('Native scene source did not become ready or changed ownership');
 };
 try{
  await Promise.race([Promise.all(records.map(async r=>{
   const ready=r.ch?.sourceMotion?.ready;
   if(!ready||typeof ready.then!=='function')throw Error('Missing native scene source loader');
   await ready;r.owner=r.ch.sourceMotion;r.warm=r.ch._warmed;
   if(r.warm&&typeof r.warm.then==='function'){await r.warm;r.warmAwaited=true;}
   valid(r);
  })),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Native scene source readiness timeout')),timeoutMs);})]);
 }finally{clearTimeout(timer);}
 if(records.length!==G.actors.length||records.some((r,i)=>G.actors[i]!==r.a))throw Error('Scene actor ownership changed while waiting');
 for(const r of records){valid(r);if(r.ch._warmed!==r.warm)throw Error('Scene warm ownership changed while waiting');}
 return records.map((r,i)=>({index:i,local:r.a===G.local,variant:r.owner.variant,status:r.owner.status,existingWarmAwaited:r.warmAwaited}));
}
export function explosherSceneCensus(G,scene){
 const actors=G.actors.map((a,i)=>({a,root:a.character?.root,key:a===G.local?'local-character':'other-character-'+i}));
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

export function compareExplosherCaptures(before,after){
 const mismatches=[],checked=[];
 const equal=isDeepStrictEqual;
 if(before.length!==18||after.length!==18)mismatches.push({domain:'coverage',before:before.length,after:after.length});
 for(let i=0;i<Math.max(before.length,after.length);i++){
  const a=before[i],b=after[i];if(!a||!b){mismatches.push({domain:'missing-frame',index:i});continue;}
  const frame={tick:a.tick,view:a.view};
  if(!equal([a.tick,a.view],[b.tick,b.view]))mismatches.push({...frame,domain:'identity'});
  for(const k of ['aimTrace','nativeReset','physical','camera','palette','inkHex','time','sparkles','lighting','viewport']){
   const pass=equal(b.measurement[k],a.measurement[k]);checked.push({...frame,domain:k,pass});if(!pass)mismatches.push({...frame,domain:k});
  }
  for(const [domain,keys] of [['render',['calls','triangles','points','lines']],['memory',['geometries','textures']]]){
   for(const key of keys){const av=a.measurement[domain][key],bv=b.measurement[domain][key],pass=Number.isFinite(av)&&Number.isFinite(bv)&&bv<=av;
    checked.push({...frame,domain:domain+'.'+key,pass});if(!pass)mismatches.push({...frame,domain:domain+'.'+key,before:av,after:bv});}
  }
 }
 return {status:mismatches.length?'failed':'physical-and-resource-gates-passed',captures:before.length,checked,mismatches,visualReview:'pending',gpuElapsed:'not measured'};
}
