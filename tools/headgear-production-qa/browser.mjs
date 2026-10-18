import * as THREE from 'three';
const check=(v,m)=>{if(!v)throw Error(m);};
const diff=(a,b,mask)=>{let n=0;for(let i=0;i<a.length;i+=4)if((!mask||mask[i/4])&&Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])))>3)n++;return n;};
export async function run(config){
 const p=globalThis.__headgearProductionQA={stage:'init',rows:[],lodRows:[],cycles:[]};
 const {G}=await import(config.prefix+'src/core/ctx.js');const profile=await fetch(config.prefix+'patches/splatoon3/profile.json').then(r=>r.json());const {install}=await import(config.prefix+'patches/splatoon3/runtime/install.mjs');install(profile);
 const {Character}=await import(config.prefix+'src/game/character.js');const {headgearState}=await import(config.prefix+'patches/local-quality/headgear/lifecycle.mjs');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#79828c');const camera=new THREE.OrthographicCamera(-.46,.46,.46,-.46,.01,100);const perspective=new THREE.PerspectiveCamera(45,1,.01,150);
 Object.assign(G,{scene,camera,renderer,physics:null,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});scene.add(new THREE.HemisphereLight('#f4f6ff','#485266',2.2));const sun=new THREE.DirectionalLight('#fff2dd',2.5);sun.position.set(3,5,4);scene.add(sun);const gl=renderer.getContext();
 const anim={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};const live=new Set();
 function make(hat,lod='game'){const c=new Character({name:'production-headgear-qa',sourceMotion:false,style:{hair:0,skin:2,outfit:0,eyes:0,hat,brows:0}});c.onEvent=null;c.setLod(lod);c.setColor('#19ae96');scene.add(c.root);for(let i=0;i<30;i++)c.update(1/60,anim);live.add(c);check(c.skeleton.bones.length===87,'87 bones');return c;}
 function active(c){const s=headgearState(c);check(s&&s.active,'real lifecycle attachment');const a=s.groups.filter(x=>x.group.visible);check(a.length===1,'one active gear LOD');check(a[0].lod===s.active,'active gear state');check(a[0].group.parent===c.bones.head,'native head attachment');return a[0].group;}
 function memory(){return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}
 function render(cam=G.camera){renderer.info.reset();renderer.render(scene,cam);gl.finish();check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'WebGL error at '+p.stage);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,...memory()};}
 function pixels(){const a=new Uint8Array(720*720*4);gl.readPixels(0,0,720,720,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;}
 function view(c,angle='oblique'){const target=c.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.18,0));camera.position.copy(target).add(new THREE.Vector3(...(angle==='front'?[0,.03,3]:[2.3,1.1,2.3])));camera.lookAt(target);camera.updateMatrixWorld(true);G.camera=camera;}
 async function save(name){await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL('image/png'));}
 function remove(c){scene.remove(c.root);c.dispose();live.delete(c);check(headgearState(c)===null,'disposed lifecycle state');renderer.renderLists.dispose();render(camera);}
 async function effects(hat){const c=make(hat);try{for(const angle of ['front','oblique']){view(c,angle);await renderer.compileAsync(scene,camera);const gear=active(c);c.setHurt(0);c.u.uFlash.value.set(0,0,0);render();const neutral=pixels();gear.visible=false;render();const hidden=pixels();gear.visible=true;const mask=new Uint8Array(720*720);for(let i=0;i<neutral.length;i+=4)mask[i/4]=Math.max(...[0,1,2].map(k=>Math.abs(neutral[i+k]-hidden[i+k])))>8?1:0;check(mask.reduce((a,b)=>a+b,0)>100,'gear mask');
 for(const effect of ['neutral','hurt','flash']){p.stage=`effects-${hat}-${angle}-${effect}`;c.setHurt(effect==='hurt'?.85:0,'#ed3faa');c.u.uFlash.value.setScalar(effect==='flash'?.7:0);const counts=render();const rgba=pixels();await save(p.stage);gear.visible=false;render();const bare=pixels();await save(p.stage+'-gear-hidden');gear.visible=true;const effectPixels=diff(rgba,neutral,mask);if(effect!=='neutral')check(effectPixels>30,'native signal changes gear pixels '+p.stage);p.rows.push({hat,angle,effect,...counts,gearVisiblePixels:diff(rgba,bare),effectPixels,maskPixels:mask.reduce((a,b)=>a+b,0)});}
 } }finally{remove(c);}}
 async function lod(hat){const c=make(hat);try{view(c);await c.warmAll(renderer,camera,scene);const record=async(name)=>{p.stage=`lod-${hat}-${name}`;active(c);view(c);const counts=render();await save(p.stage);p.lodRows.push({hat,name,native:c.lodTier,gear:headgearState(c).active,quality:G.settings.quality,groups:headgearState(c).groups.map(x=>({lod:x.lod,visible:x.group.visible})),...counts});check(c.lodTier===headgearState(c).active,'gear follows native tier');};
 for(const tier of ['hero','game','far']){c.setLod(tier);await record('forced-'+tier);}
 for(const [name,distance]of [['auto-near',1],['auto-far',100]]){G.camera=perspective;perspective.position.set(0,1.2,distance);perspective.lookAt(0,1.2,0);perspective.updateMatrixWorld(true);c.setLod(null);c.inWorld=true;for(let i=0;i<40;i++)c._updateLod(1/60);check(c.lodTier===(name==='auto-near'?'hero':'far'),'actual automatic tier '+name);await record(name);}
 for(const quality of ['low','high']){G.settings.quality=quality;c.inWorld=false;c.setLod('game');for(let i=0;i<3;i++)c._updateLod(1/60);await record('quality-'+quality);}
 }finally{G.settings.quality='high';G.camera=camera;remove(c);}}
 async function batch(count){const chars=[];try{for(let i=0;i<count;i++){const c=make(4+i%4);c.root.position.set((i%4)*.8-1.2,0,-Math.floor(i/4)*.8);chars.push(c);for(const tier of ['hero','far','game'])c.setLod(tier);active(c);}camera.position.set(0,3,5);camera.lookAt(0,1,0);G.camera=camera;await renderer.compileAsync(scene,camera);render();return memory();}finally{for(const c of chars)remove(c);render(camera);}}
 // Bounded same-head Standard-versus-Physical comparison. Only temporary QA
 // materials are swapped; geometry, native signals, lights and camera stay fixed.
 async function coatingCost(count){
  const chars=[],swaps=[],samples={standard:[],physical:[]},pairs=[];const readback=new Uint8Array(4);
  const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  const completedRender=()=>{const counts=render();gl.readPixels(360,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,readback);check(gl.getError()===gl.NO_ERROR,'coating readback barrier');return counts;};
  const frustum=[camera.left,camera.right,camera.top,camera.bottom];let expected=null;
  const select=variant=>{for(const s of swaps)s.mesh.material=s[variant];};
  const quantile=(values,q)=>{if(!values.length)return null;const a=[...values].sort((a,b)=>a-b);return a[Math.ceil(q*a.length)-1];};
  try{
   for(let i=0;i<count;i++){
    const c=make(4);if(count>1)c.root.position.set((i%4-1.5)*.75,0,-Math.floor(i/4)*.9);chars.push(c);
    const mesh=active(c).children.find(x=>x.name==='shell');check(mesh?.material.isMeshPhysicalMaterial,'coating candidate physical shell');
    const physical=mesh.material,standard=new THREE.MeshStandardMaterial().copy(physical);
    standard.onBeforeCompile=physical.onBeforeCompile;standard.customProgramCacheKey=physical.customProgramCacheKey;
    check(!standard.isMeshPhysicalMaterial&&standard.defines.STANDARD!==undefined&&standard.defines.PHYSICAL===undefined,'true Standard baseline');
    check(standard.roughness===physical.roughness&&standard.metalness===physical.metalness&&standard.color.equals(physical.color),'same substrate');
    swaps.push({mesh,physical,standard});
   }
   if(count===1)view(chars[0]);else{camera.left=-1.9;camera.right=1.9;camera.top=1.9;camera.bottom=-1.9;camera.updateProjectionMatrix();camera.position.set(0,2.5,6);camera.lookAt(0,.8,-.45);camera.updateMatrixWorld(true);G.camera=camera;}
   for(const variant of ['standard','physical']){select(variant);await renderer.compileAsync(scene,camera);for(let i=0;i<12;i++){await frame();completedRender();}await frame();await frame();}
   for(let pair=0;pair<24;pair++){
    const order=pair%2?['physical','standard']:['standard','physical'],values={};
    for(const variant of order){
     select(variant);await frame();p.stage=`coating-cost-${count}-${pair}-${variant}`;
     const start=performance.now();const counts=completedRender();const syncWallMs=performance.now()-start;
     if(!expected)expected={calls:counts.calls,triangles:counts.triangles};check(counts.calls===expected.calls&&counts.triangles===expected.triangles,'coating variants share geometry and draw counts');
     samples[variant].push({pair,order:order.join('-'),syncWallMs});values[variant]=syncWallMs;
    }
    pairs.push({pair,order:order.join('-'),...values,physicalMinusStandardMs:values.physical-values.standard});
   }
   const summary={};for(const variant of ['standard','physical']){const a=samples[variant].map(x=>x.syncWallMs);summary[variant]={sampleCount:a.length,syncWallP50Ms:quantile(a,.5),syncWallP95Ms:quantile(a,.95),minMs:Math.min(...a),maxMs:Math.max(...a)};}
   const debug=gl.getExtension('WEBGL_debug_renderer_info');
   return{methodVersion:2,count,lod:'game',comparison:'same scene and substrate; original Standard shell versus Physical clearcoat .55/.18',draws:expected,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),gpuTiming:'not requested: previous SwiftShader run timed out on all 96 timer queries',warmupPerVariant:12,syncBarrier:'render + gl.finish + 1-pixel readPixels; RAF outside timed samples',summary,samples,pairs,pairedMedianDeltaMs:quantile(pairs.map(x=>x.physicalMinusStandardMs),.5),discardedSamples:0,limitations:'Synchronized render/readback wall time includes JavaScript, driver, GPU/software completion and readback. No GPU-only timer measurement. Headless SwiftShader is not physical-device GPU performance or gameplay FPS. Single fixed camera per count; all samples retained; no performance acceptance threshold.'};
  }finally{for(const s of swaps){s.mesh.material=s.physical;s.standard.dispose();}for(const c of chars)remove(c);[camera.left,camera.right,camera.top,camera.bottom]=frustum;camera.updateProjectionMatrix();G.camera=camera;}
 }
 try{for(const hat of [4,5,6,7]){await effects(hat);await lod(hat);}p.stage='memory-warm';await batch(8);await batch(8);const baseline=memory();for(let cycle=0;cycle<6;cycle++){p.stage='memory-'+cycle;const count=cycle%2?8:1,loaded=await batch(count),after=memory();check(after.geometries===baseline.geometries&&after.textures===baseline.textures,'post-warm GPU retained counts stable');p.cycles.push({cycle,count,loaded,after,baseline});}p.coatingCost=[];for(const count of [1,8])p.coatingCost.push(await coatingCost(count));p.stage='complete';return{status:'passed-awaiting-pixel-review',threeRevision:THREE.REVISION,rows:p.rows,lodRows:p.lodRows,cycles:p.cycles,coatingCost:p.coatingCost,limitations:'Production Character and lifecycle modules; hurt uses public setHurt, flash directly sets existing shader uniform. Automatic LOD drives native _updateLod with perspective camera, no full gameplay physics. Pixel evidence is not all animation coverage. Bounded coating-cost measurements are separate headless diagnostics, not device FPS.'};}finally{for(const c of live)remove(c);renderer.dispose();}
}
