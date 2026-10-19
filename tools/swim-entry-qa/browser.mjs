import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG} from '../squid-production-qa/lighting.mjs';
import {collectSwimEntryFrames} from './probe.mjs';
export async function run({prefix}){
 const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
 api.Level=(await import(prefix+'src/world/level.js')).Level;api.swimMotionSnapshot=(await import(prefix+'patches/splatoon3/runtime/swim-motion.mjs')).swimMotionSnapshot;
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(25,1,.01,5000);Object.assign(api.G,{scene,camera,renderer});
 const {Environment}=await import(prefix+'src/world/environment.js'),env=createProductionLighting(Environment,renderer,scene),images=[];
 const grid=new THREE.GridHelper(4,16,0x52617a,0x8793a4);grid.position.y=-.004;scene.add(grid);
 const travel=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(),.9,0x2266ff,.15,.08);scene.add(travel);
 try{
  const result=await collectSwimEntryFrames(api,async({actor:a,row})=>{
   const target=a.character.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.3,0));grid.position.x=a.pos.x;grid.position.z=a.pos.z;travel.position.copy(a.pos).add(new THREE.Vector3(0,.025,0));
   for(const [view,offset]of [['front',[0,.35,-2]],['oblique',[1.3,.9,-1.3]],['top',[0,2,0]]]){
    camera.up.set(...(view==='top'?[0,0,-1]:[0,1,0]));camera.position.copy(target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(4.8));camera.lookAt(target);camera.updateMatrixWorld(true);
    const coverage={count:0,maxX:0,maxY:0};const p=new THREE.Vector3();a.character.root.traverseVisible(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld).project(camera);if(p.z< -1||p.z>1)throw Error('swim actor depth clipped');coverage.maxX=Math.max(coverage.maxX,Math.abs(p.x));coverage.maxY=Math.max(coverage.maxY,Math.abs(p.y));coverage.count++;}});if(coverage.maxX>.98||coverage.maxY>.98)throw Error('swim actor clipped');
    await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();const name=row.name+'-'+view;await globalThis.__saveSwimEntryFrame(name,renderer.domElement.toDataURL());images.push({name,view,state:row.name,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),fov:camera.fov},coverage});
   }
  });
  return {...result,status:'rendered-awaiting-visual-review',images,lighting:{config:PRODUCTION_LIGHTING_CONFIG,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,sunColor:env.sun.color.toArray(),sunIntensity:env.sun.intensity,sunPosition:env.sun.position.toArray()},guides:'grid and +X travel arrow are diagnostic scene objects; native body geometry/materials unchanged'};
 }finally{scene.remove(grid,travel);grid.geometry.dispose();grid.material.dispose();travel.line.geometry.dispose();travel.line.material.dispose();travel.cone.geometry.dispose();travel.cone.material.dispose();scene.environment=null;env.dispose();renderer.dispose();}
}
