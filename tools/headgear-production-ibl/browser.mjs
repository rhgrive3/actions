import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG,PRODUCTION_EXPOSURE} from './lighting.mjs';
const check=(v,m)=>{if(!v)throw Error(m);};
export async function run(config){
 const progress=globalThis.__headgearQA={stage:'init',rows:[]};
 const {G}=await import(config.prefix+'src/core/ctx.js');const {install}=await import(config.prefix+'patches/splatoon3/runtime/install.mjs');install(await fetch(config.prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
 const {Environment}=await import(config.prefix+'src/world/environment.js');const {createFittedCharacter}=await import('/qa/registry.mjs');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=PRODUCTION_EXPOSURE;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(25,1,.01,5000);Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
 const environmentConfig=PRODUCTION_LIGHTING_CONFIG,env=createProductionLighting(Environment,renderer,scene);G.env=env;
 const lightingReceipt={label:'actual-emitted-Environment-day-illumination',projection:'perspective',orientations:['default-backlit-character','sun-facing-character'],module:'src/world/environment.js',constructor:'Environment',config:environmentConfig,theme:Environment.THEMES.day,environmentIntensity:scene.environmentIntensity,envMap:{type:env.envMap.type,mapping:env.envMap.mapping,width:env.envMap.image?.width,height:env.envMap.image?.height},sun:{color:env.sun.color.toArray(),intensity:env.sun.intensity,position:env.sun.position.toArray()},hemi:{sky:env.hemi.color.toArray(),ground:env.hemi.groundColor.toArray(),intensity:env.hemi.intensity},exposure:renderer.toneMappingExposure,shadows:false,scope:'Actual production sky PMREM and theme lights, environment scenery present; isolated character camera without a playable stage. Not a full gameplay capture or a fabricated metallic studio.'};
 const gl=renderer.getContext(),rows=progress.rows,cycles=[];let active=null;const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};
 const resources=()=>({geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures});
 function render(){renderer.info.reset();renderer.render(scene,camera);gl.finish();check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'WebGL error');return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,...resources()};}
 function disposeActive(){if(active){scene.remove(active.character.root);active.dispose();active=null;}}
 async function make(hat){active=await createFittedCharacter({prefix:config.prefix,hat,lod:'hero',inkColor:0x19ae96,name:'headgear-qa-fixed',sourceMotion:false,style:{hat,hair:0,skin:2,outfit:0,eyes:0,brows:0}});const c=active.character;c.onEvent=null;c.setLod('hero');scene.add(c.root);for(let i=0;i<60;i++)c.update(1/60,state);c.root.updateMatrixWorld(true);return c;}
 function frame(c,gear,view){
  const sunFacing=view.startsWith('sunlit-'),angle=sunFacing?Math.atan2(env.sun.position.x,env.sun.position.z):0;c.root.rotation.y=angle;c.root.updateMatrixWorld(true);
  const target=c.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.15,0));let half=.46;
  if(c.style.hat>=8){const head=c.bones.head.getWorldPosition(new THREE.Vector3()),box=new THREE.Box3().setFromObject(gear);box.expandByPoint(head.clone().add(new THREE.Vector3(-.26,-.13,-.25)));box.expandByPoint(head.clone().add(new THREE.Vector3(.26,.40,.25)));const sphere=box.getBoundingSphere(new THREE.Sphere());half=Math.max(.50,Math.ceil((sphere.radius*1.12+.025)/.025)*.025);target.copy(sphere.center);}
  const baseView=view.replace('sunlit-',''),offset=new THREE.Vector3(...{front:[0,.045,3],oblique:[2.3,1.1,2.3]}[baseView]).applyAxisAngle(new THREE.Vector3(0,1,0),angle);
  camera.position.copy(target).add(offset);camera.fov=(360/Math.PI)*Math.atan(half/offset.length());camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  check(camera.isPerspectiveCamera&&Math.abs(camera.projectionMatrix.elements[11]+1)<1e-9,'production sky requires perspective projection');
  return{projection:'perspective',fov:camera.fov,target:target.toArray(),halfExtent:half,characterYaw:angle,orientation:sunFacing?'sun-facing-character':'default-backlit-character',cameraPosition:camera.position.toArray()};
 }

 try{
  // Stabilize shared native caches before measuring one-character ownership returns.
  for(const id of config.gearIds){const c=await make(id);for(const view of ['front','oblique','sunlit-front','sunlit-oblique']){frame(c,active.gear,view);await renderer.compileAsync(scene,camera);render();}disposeActive();render();}
  const baseline=resources();
  for(const gearId of config.gearIds){
   const c=await make(gearId),gear=active.gear;check(gear.parent===c.bones.head,'native head attachment');
   for(const view of ['front','oblique','sunlit-front','sunlit-oblique']){const name=`ibl-${gearId}-hero-${view}`;progress.stage=name;const framing=frame(c,gear,view);await renderer.compileAsync(scene,camera);const fitted=render();await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL('image/png'));gear.visible=false;const bare=render();await globalThis.__saveHeadgearFrame(name+'-gear-hidden',renderer.domElement.toDataURL('image/png'));gear.visible=true;const materials=[];gear.traverse(o=>{if(o.isMesh)materials.push({name:o.name,type:o.material.type,color:o.material.color?.toArray(),metalness:o.material.metalness,roughness:o.material.roughness,clearcoat:o.material.clearcoat||0,hasLocalEnvMap:!!o.material.envMap,hasMetalnessMap:!!o.material.metalnessMap,hasRoughnessMap:!!o.material.roughnessMap});});rows.push({name,gearId,lod:'hero',view,framing,fitted,bare,deltaCalls:fitted.calls-bare.calls,materials,lightingReceipt});}
   disposeActive();render();const after=resources();cycles.push({gearId,baseline,after});check(after.geometries===baseline.geometries&&after.textures===baseline.textures,'one-character resources returned '+gearId);
  }
  progress.stage='complete';return{status:'rendered-awaiting-visual-review',rows,caseCount:rows.length,lightingReceipt,cycles,limits:'Additional production illumination suite. Historical controlled496 remains separate; no gold palette or shader compensation.'};
 }finally{disposeActive();scene.environment=null;env.dispose();G.env=null;renderer.dispose();}
}
