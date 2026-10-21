import * as THREE from 'three';
const APIs=new Map();
export async function productionScene(prefix,{fov=25,theme='day',background=0xc5d3e3}={}){
 let api=APIs.get(prefix);if(!api){const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs');api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
  // Public bootstrap installs ranked wrappers after the shared runtime. Keep
  // that final owner order in every suite, including the historical namespace.
  const {installRanked}=await import(prefix+'patches/splatoon3/runtime/ranked/install.mjs');installRanked(api);APIs.set(prefix,api);}
 const {G}=api,{DEFAULT_SETTINGS}=await import(prefix+'src/config.js'),{Renderer}=await import(prefix+'src/core/renderer.js'),{Environment}=await import(prefix+'src/world/environment.js');
 const settings={...DEFAULT_SETTINGS,quality:'high',shadows:true,bloom:true},container=document.createElement('div');document.body.appendChild(container);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(fov,1,.01,5000);Object.assign(G,{scene,camera,settings,mode:'match',actors:[],local:null,time:0});
 const post=new Renderer(container,settings),renderer=post.renderer;renderer.toneMappingExposure=.94;G.renderer=renderer;G.post=post;
 const env=new Environment(renderer,scene,{theme,bounds:{minX:-25,maxX:25,minZ:-44,maxZ:44},shadowSize:512});G.env=env;
 if(!env.envMap||scene.environment!==env.envMap)throw Error('Missing native PMREM');
 // A diagnostic background only: preserve the real sun/hemi/PMREM and native
 // grading/MSAA/bloom/output. The distant sea and skyline would obscure models.
 env.root.visible=false;scene.background=new THREE.Color(background);scene.fog=null;post.setScene(scene,camera);
 const lighting=()=>({theme,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,pmrem:{width:env.envMap.image?.width,height:env.envMap.image?.height},sun:{color:env.sun.color.toArray(),intensity:env.sun.intensity,position:env.sun.position.toArray()},hemi:{color:env.hemi.color.toArray(),intensity:env.hemi.intensity},grade:Object.fromEntries(['uSat','uVib','uContrast','uLift','uVignette','uExposure'].map(k=>[k,post.grade.uniforms[k].value])),postPasses:post.composer.passes.map(p=>({name:p.constructor.name,enabled:p.enabled})),bloom:post.bloom?{strength:post.bloom.strength,radius:post.bloom.radius,threshold:post.bloom.threshold}:null});
 const capture=async name=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);await renderer.compileAsync(scene,camera);renderer.info.reset();renderer.render(scene,camera);const sceneRender={...renderer.info.render};renderer.info.reset();post.render();renderer.getContext().finish();const postRender={...renderer.info.render};await globalThis.__saveObjectFrame(name,renderer.domElement.toDataURL());return{name,sceneRender,postRender,lighting:lighting(),camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},memory:{...renderer.info.memory,programs:renderer.info.programs.length}};};
 const dispose=()=>{scene.environment=null;env.dispose();post._disposeComposer();renderer.dispose();renderer.forceContextLoss();container.remove();};
 return{api,G,THREE,scene,camera,renderer,post,env,capture,lighting,dispose};
}
