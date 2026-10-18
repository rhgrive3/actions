import * as THREE from 'three';
const check=(v,m)=>{if(!v)throw Error(m);};
const delta=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(k=>Math.abs(a[i+k]-b[i+k])))>3)n++;return n;};
export async function run(config){
 const progress=globalThis.__headgearQA={stage:'init',rows:[]};
 const {G}=await import(config.prefix+'src/core/ctx.js');
 const profile=await fetch(config.prefix+'patches/splatoon3/profile.json').then(r=>r.json());
 const {install}=await import(config.prefix+'patches/splatoon3/runtime/install.mjs');install(profile);
 const {createFittedCharacter}=await import('/qa/registry.mjs');
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,720);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#79828c');
 const camera=new THREE.OrthographicCamera(-.46,.46,.46,-.46,.01,30);
 Object.assign(G,{scene,camera,renderer,settings:{quality:'high',shadows:false},mode:'match',actors:[],time:0});
 scene.add(new THREE.HemisphereLight('#f4f6ff','#485266',2.2));const sun=new THREE.DirectionalLight('#fff2dd',2.5);sun.position.set(3,5,4);scene.add(sun);
 const gl=renderer.getContext(),rows=progress.rows;let active=null;
 const state={form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},firing:false,charge:0,ink:1,hp:1,vy:0};
 function render(){renderer.info.reset();renderer.render(scene,camera);gl.finish();check(!gl.isContextLost()&&gl.getError()===gl.NO_ERROR,'WebGL error');return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}
 function pixels(){const p=new Uint8Array(720*720*4);gl.readPixels(0,0,720,720,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
 function cameraView(view,target){const v={front:[0,.045,3],back:[0,.045,-3],left:[-3,.045,0],right:[3,.045,0],under:[0,-3,.0001],top:[0,3,.0001],oblique:[2.3,1.1,2.3]}[view];camera.position.copy(target).add(new THREE.Vector3(...v));camera.up.set(0,1,0);if(view==='top')camera.up.set(0,0,-1);if(view==='under')camera.up.set(0,0,1);camera.lookAt(target);camera.updateMatrixWorld(true);}

 // New tall gear only: fit a sphere around the complete rigid attachment and head.
 // The old four use their original target/frustum verbatim for regression comparison.
 function frameNewGear(c,gear,target){
  const head=c.bones.head.getWorldPosition(new THREE.Vector3()),box=new THREE.Box3().setFromObject(gear);
  box.expandByPoint(head.clone().add(new THREE.Vector3(-.26,-.13,-.25)));
  box.expandByPoint(head.clone().add(new THREE.Vector3(.26,.40,.25)));
  const sphere=box.getBoundingSphere(new THREE.Sphere()),half=Math.max(.50,Math.ceil((sphere.radius*1.12+.025)/.025)*.025);
  target.copy(sphere.center);camera.left=camera.bottom=-half;camera.right=camera.top=half;camera.updateProjectionMatrix();
  return {halfExtent:half,target:target.toArray(),min:box.min.toArray(),max:box.max.toArray()};
 }
 async function capture(gearId,lod,hair,view,pose='neutral',ink=0x19ae96){
  if(active){scene.remove(active.character.root);active.dispose();active=null;}
  progress.stage=[gearId,lod,hair,view,pose,ink.toString(16)].join('-');
  active=await createFittedCharacter({prefix:config.prefix,hat:gearId,lod,inkColor:ink,name:'headgear-qa-fixed',sourceMotion:false,style:{hat:gearId,hair,skin:2,outfit:0,eyes:0,brows:0}});
  const {character:c,gear}=active;check(gear?.isGroup,'fitted gear Group');check(c.style.hat===gearId,'native new hat id not wrapped');check(c.skeleton.bones.length===87,'canonical 87 bone native Character');check(gear.parent===c.bones.head,'head-bone attachment');
  c.onEvent=null;c.setLod(lod);c.setColor(ink);active.setInkColor(ink);scene.add(c.root);for(let i=0;i<60;i++)c.update(1/60,state);
  if(pose==='look-left')c.bones.head.rotation.set(-.20,.45,0,'YXZ');if(pose==='look-right')c.bones.head.rotation.set(.20,-.45,0,'YXZ');c.root.updateMatrixWorld(true);
  const target=c.bones.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.15,0));camera.left=camera.bottom=-.46;camera.right=camera.top=.46;camera.updateProjectionMatrix();const framing=gearId>=8?frameNewGear(c,gear,target):null;cameraView(view,target);camera.near=.01;if(gearId>=8&&view==='under'){const cutY=Math.min(c.bones.head.getWorldPosition(new THREE.Vector3()).y-.13,framing.min[1]-.025);camera.near=Math.max(.01,cutY-camera.position.y);framing.underCutY=cutY;}camera.updateProjectionMatrix();
  await renderer.compileAsync(scene,camera);render();const timings=[];let fitted;
  for(let f=0;f<6;f++){const t=performance.now();fitted=render();timings.push(performance.now()-t);}timings.sort((a,b)=>a-b);
  const withGear=pixels(),name=progress.stage;
  await globalThis.__saveHeadgearFrame(name,renderer.domElement.toDataURL('image/png'));
  gear.visible=false;const bare=render(),without=pixels();await globalThis.__saveHeadgearFrame(name+'-gear-hidden',renderer.domElement.toDataURL('image/png'));gear.visible=true;
  const changedPixels=delta(withGear,without);if(![8,10].includes(gearId)||!['back','top','under'].includes(view))check(changedPixels>100,'gear contributed visible pixels '+name);
  let vertices=0,triangles=0,meshes=0;gear.traverse(o=>{if(o.isMesh){meshes++;vertices+=o.geometry.attributes.position.count;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
  rows.push({name,gearId,framing,lod,hair,view,pose,inkColor:'#'+ink.toString(16).padStart(6,'0'),changedPixels,fitted,bare,deltaCalls:fitted.calls-bare.calls,deltaTriangles:fitted.triangles-bare.triangles,gearMeshes:meshes,gearVertices:vertices,gearTriangles:triangles,p50Ms:timings[3],p95Ms:timings[5],headWorld:c.bones.head.getWorldPosition(new THREE.Vector3()).toArray(),fit:gear.userData.fit||null});
 }
 try{
  for(const gearId of config.gearIds){
   for(const lod of ['hero','game'])for(const view of ['front','back','left','right','top','under','oblique'])await capture(gearId,lod,0,view);
   for(const hair of [5,6])await capture(gearId,'game',hair,'oblique');
   if(gearId===7)for(const hair of [5,6])for(const view of ['back','top'])await capture(gearId,'game',hair,view);
   for(const pose of ['look-left','look-right'])await capture(gearId,'game',0,'oblique',pose);
   await capture(gearId,'game',0,'front','neutral',0xe637ab);
   await capture(gearId,'far',0,'oblique');
  }
  progress.stage='complete';const debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {status:'rendered-awaiting-visual-review',threeRevision:THREE.REVISION,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),rows,caseCount:rows.length,limits:'Native emitted production Character with production lifecycle attachment. Same-frame gear-hidden comparison retains tucked hair. Reference top or opposite angles may be reconstructed. Software-renderer timings are not gameplay FPS. Render completion is not visual acceptance.'};
 }finally{if(active){scene.remove(active.character.root);active.dispose();}renderer.dispose();}
}
