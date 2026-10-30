// QA-only candidate-internal alpha sensitivity; no product method replacement.
export function installPairedBlastDiagnostics(){
 const G=()=>globalThis.__G,g=()=>globalThis.__inkwave;
 const assert=(x,m)=>{if(!x)throw Error(m);};
 const values=o=>Object.fromEntries(Object.entries(o).filter(([,v])=>typeof v==='number'||typeof v==='boolean'||ArrayBuffer.isView(v)||typeof v?.toArray==='function').map(([k,v])=>[k,ArrayBuffer.isView(v)?Array.from(v):typeof v?.toArray==='function'?v.toArray():v]));
 const plain=(v,seen=new Set())=>{if(v===null||typeof v!=='object')return typeof v==='function'?undefined:v;if(seen.has(v))throw Error('cyclic QA plain observation');seen.add(v);let r;if(ArrayBuffer.isView(v))r=Array.from(v);else if(v.toArray)r=v.toArray();else if(Array.isArray(v))r=v.map(x=>plain(x,seen));else r=Object.fromEntries(Object.entries(v).filter(([,x])=>typeof x!=='function').map(([k,x])=>[k,plain(x,seen)]));seen.delete(v);return r;};
 const geometries=()=>{const rows=[];G().fx.root.traverse(o=>{if(o.geometry)rows.push({name:o.name,type:o.type,geo:o.geometry});});return rows;};
 const gpu=skip=>geometries().map(({name,type,geo})=>({name,type,instanceCount:Number.isFinite(geo.instanceCount)?geo.instanceCount:null,drawRange:{...geo.drawRange},attributes:Object.fromEntries(Object.entries(geo.attributes).map(([k,a])=>{const arr=Array.from(a.array);if(a===skip?.attribute)arr[skip.index]='paired-alpha-only';return[k,{itemSize:a.itemSize,normalized:a.normalized,array:arr}];})),index:geo.index?Array.from(geo.index.array):null}));
 const uniformValue=(v,seen=new Set())=>{if(v?.isTexture)return {textureId:v.id,uuid:v.uuid,version:v.version,sourceVersion:v.source?.version??null,width:v.image?.width??null,height:v.image?.height??null};if(v===null||typeof v!=='object')return typeof v==='function'?'function-binding':v;if(seen.has(v))throw Error('cyclic shader uniform');seen.add(v);let r;if(ArrayBuffer.isView(v))r=Array.from(v);else if(v.toArray)r=v.toArray();else if(Array.isArray(v))r=v.map(x=>uniformValue(x,seen));else r=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,uniformValue(x,seen)]));seen.delete(v);return r;};
 const graph=()=>{const rows=[];G().fx.root.traverse(o=>{rows.push({name:o.name,type:o.type,visible:o.visible??null,renderOrder:o.renderOrder??null,layers:o.layers?.mask??null,frustumCulled:o.frustumCulled??null,position:o.position?.toArray()??null,quaternion:o.quaternion?.toArray()??null,scale:o.scale?.toArray()??null,matrix:o.matrix?.toArray()??null,matrixWorld:o.matrixWorld?.toArray()??null,materials:(o.material?(Array.isArray(o.material)?o.material:[o.material]):[]).map(m=>({id:m.id,uuid:m.uuid,type:m.type,flags:values(m),defines:plain(m.defines??null),uniforms:uniformValue(m.uniforms??null)}))});});return rows;};
 const cpu=()=>{const f=G().fx,p=G().paint;return {fx:values(f),pools:Object.fromEntries(['puffs','glows','rings','shells','beams','marks','pillars'].map(k=>[k,values(f[k])])),paint:values(p),paintQueue:plain(p._q),paintGrowing:plain(p.growing),paintFaces:plain(p.paintFaces),clock:{game:G().time,local:g().time,fx:globalThis.__iwFxClock(),env:{time:G().env.time,shader:G().env.U.uTime.value},surface:globalThis.__iwSurfaceClock()},rng:globalThis.__iwBlastRng.snapshot(),camera:{world:G().camera.matrixWorld.toArray(),projection:G().camera.projectionMatrix.toArray()},lighting:globalThis.__iwBlastLighting(),actor:{pos:g().match.local.pos.toArray(),roll:plain(g().match.local.s3?.actions?.roll??null)},fxGraph:graph()};};
 const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof x==='string'?new TextEncoder().encode(x):x)),v=>v.toString(16).padStart(2,'0')).join('');
 globalThis.__iwObserveFXInputs=()=>{const f=G().fx,S=f.shells;return {shells:{n:S.n,P:Array.from(S.P.slice(0,S.n*3)),V:Array.from(S.V.slice(0,S.n*3)),C:Array.from(S.C.slice(0,S.n*3)),X:Array.from(S.X.slice(0,S.n*9)),A:Array.from(S.A.slice(0,S.n*4)),gpu:Object.fromEntries(Object.entries(S.geo.attributes).filter(([k])=>k.startsWith('a')).map(([k,a])=>[k,Array.from(a.array.slice(0,S.n*a.itemSize))]))},constructorMoteSeeds:Array.from(f.motes.geometry.attributes.aSeed.array),rng:globalThis.__iwBlastRng.snapshot()};};
 globalThis.__iwMarkBlastShell=()=>{const S=G().fx.shells;assert(S.n===1,'blast-only birth must have exactly one shell');globalThis.__iwPairedShellToken={seed:S.X[7],life:S.X[3],kind:S.X[6],r0:S.X[0],r1:S.X[1],axis:Array.from(S.A.slice(0,4))};};
 globalThis.__iwCapturePairedBlast=async frame=>{
  assert([0,3,9].includes(frame),'paired frame restricted');
  const f=G().fx,S=f.shells,t=globalThis.__iwPairedShellToken;
  assert(t&&S.n===1,'same unique live shell required');
  assert(S.X[7]===t.seed&&S.X[3]===t.life&&S.X[6]===t.kind&&S.X[0]===t.r0&&S.X[1]===t.r1&&JSON.stringify(Array.from(S.A.slice(0,4)))===JSON.stringify(t.axis),'shell identity changed');
  const a=S.geo.attributes.aColA,index=3,original=a.array[index],canvas=G().renderer.domElement,rt=G().paint.rt;
  assert(original===Math.fround(.92)&&S.X[5]===original,'candidate CPU/GPU alpha required');
  assert(rt?.texture?.type===1009&&rt.texture.format===1023,'RGBA8 paint target required');
  assert(Number.isInteger(rt.width)&&Number.isInteger(rt.height)&&rt.width*rt.height<=16777216,'bounded paint target required');
  const paint=new Uint8Array(rt.width*rt.height*4),check=new Uint8Array(paint.length);
  G().renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,paint);
  const beforeCPU=JSON.stringify(cpu()),beforeGPU=JSON.stringify(gpu({attribute:a,index}));
  const validate=(label,expectedAlpha)=>{assert(a.array[index]===expectedAlpha,label+': target alpha changed unexpectedly');assert(JSON.stringify(cpu())===beforeCPU,label+': CPU/clock/RNG/paint input changed');assert(JSON.stringify(gpu({attribute:a,index}))===beforeGPU,label+': other GPU attributes changed');G().renderer.readRenderTargetPixels(rt,0,0,rt.width,rt.height,check);assert(paint.every((x,i)=>x===check[i]),label+': paint atlas changed');assert(G().renderer.getContext().getError()===0,label+': WebGL error');};
  const draw=()=>{g().R.render();const png=canvas.toDataURL('image/png');assert(png.startsWith('data:image/png;base64,'),'real PNG required');return png;};
  // No await, game/FX update, paint flush, or random reset between these real renders.
  const initial=draw();validate('original',original);
  let alpha1,alpha092,restored,err;
  try{a.array[index]=1;a.needsUpdate=true;alpha1=draw();validate('alpha1',1);a.array[index]=Math.fround(.92);a.needsUpdate=true;alpha092=draw();validate('alpha092',Math.fround(.92));}
  catch(e){err=e;}
  finally{a.array[index]=original;a.needsUpdate=true;restored=draw();validate('restored',original);assert(restored===initial,'restored PNG bytes differ');}
  if(err)throw err;
  assert(alpha092===initial,'same-alpha repeat PNG differs');
  const dimensions={width:canvas.width,height:canvas.height,format:'image/png'},inputs=globalThis.__iwObserveFXInputs();
  // Hash work is asynchronous only AFTER the synchronous pair and full restoration.
  return {scope:'same-scene same-frame candidate-internal GPU-alpha sensitivity; not separate-build equivalence',frame,dimensions,token:t,originalAlpha:original,alpha1,alpha092,restoration:{exactPixels:true,originalPngSHA256:await sha(Uint8Array.from(atob(initial.split(',')[1]),c=>c.charCodeAt(0))),restoredPngSHA256:await sha(Uint8Array.from(atob(restored.split(',')[1]),c=>c.charCodeAt(0))),cpuSHA256:await sha(beforeCPU),nonTargetGPU_SHA256:await sha(beforeGPU),paintAtlasSHA256:await sha(paint),paintAtlasBytes:paint.length},inputs};
 };
}
