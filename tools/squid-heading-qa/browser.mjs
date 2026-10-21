import * as THREE from 'three';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG} from '../squid-production-qa/lighting.mjs';
import {collectHeadingFrames} from './probe.mjs';
// Diagnostic guide geometry only. Production Three intentionally omits the
// convenience Helper classes; build equivalent lines/cone from existing exports.
export function createHeadingGuides(){
 const vertices=[],colors=[],center=new THREE.Color(0x52617a),minor=new THREE.Color(0x8793a4);
 for(let i=0;i<=16;i++){const k=-2+i*.25,c=i===8?center:minor;vertices.push(-2,0,k,2,0,k,k,0,-2,k,0,2);for(let j=0;j<4;j++)colors.push(c.r,c.g,c.b);}
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const grid=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,toneMapped:false}));
 const travel=new THREE.Group(),lineGeometry=new THREE.BufferGeometry();lineGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,1,0],3));
 travel.line=new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({color:0x2266ff,toneMapped:false}));travel.line.matrixAutoUpdate=false;travel.line.scale.set(1,.75,1);travel.line.updateMatrix();
 const coneGeometry=new THREE.ConeGeometry(.5,1,5,1);coneGeometry.translate(0,-.5,0);travel.cone=new THREE.Mesh(coneGeometry,new THREE.MeshBasicMaterial({color:0x2266ff,toneMapped:false}));travel.cone.matrixAutoUpdate=false;travel.cone.scale.set(.08,.15,.08);travel.cone.position.y=.9;travel.cone.updateMatrix();
 travel.add(travel.line,travel.cone);travel.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,-1),Math.PI/2);return{grid,travel};
}
export async function run({prefix}){
 const {install}=await import(prefix+'patches/splatoon3/runtime/install.mjs'),api=install(await fetch(prefix+'patches/splatoon3/profile.json').then(r=>r.json()));
 api.Level=(await import(prefix+'src/world/level.js')).Level;
 const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(900,900);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=.94;document.body.appendChild(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(25,1,.01,5000);Object.assign(api.G,{scene,camera,renderer});
 const {Environment}=await import(prefix+'src/world/environment.js'),env=createProductionLighting(Environment,renderer,scene),images=[];
 const {grid,travel}=createHeadingGuides();grid.position.y=-.004;scene.add(grid,travel);
 try{
  const result=await collectHeadingFrames(api,async({actor:a,row})=>{
   const target=a.character.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.3,0));grid.position.x=a.pos.x;grid.position.z=a.pos.z;travel.position.copy(a.pos).add(new THREE.Vector3(0,.025,0));
   for(const [view,offset]of [['front',[0,.35,-2]],['oblique',[1.3,.9,-1.3]],['top',[0,2,0]]]){
    camera.up.set(...(view==='top'?[0,0,-1]:[0,1,0]));camera.position.copy(target).add(new THREE.Vector3(...offset).normalize().multiplyScalar(4.8));camera.lookAt(target);camera.updateMatrixWorld(true);
    const coverage={count:0,maxX:0,maxY:0};const p=new THREE.Vector3();a.character.root.traverseVisible(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld).project(camera);if(p.z< -1||p.z>1)throw Error('heading actor depth clipped');coverage.maxX=Math.max(coverage.maxX,Math.abs(p.x));coverage.maxY=Math.max(coverage.maxY,Math.abs(p.y));coverage.count++;}});if(coverage.maxX>.98||coverage.maxY>.98)throw Error('heading actor clipped');
    await renderer.compileAsync(scene,camera);renderer.render(scene,camera);renderer.getContext().finish();const name=row.name+'-'+view;await globalThis.__saveHeadingFrame(name,renderer.domElement.toDataURL());images.push({name,view,state:row.name,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),up:camera.up.toArray(),fov:camera.fov},coverage});
   }
  });
  return {...result,status:'rendered-awaiting-visual-review',images,lighting:{config:PRODUCTION_LIGHTING_CONFIG,exposure:renderer.toneMappingExposure,environmentIntensity:scene.environmentIntensity,sunColor:env.sun.color.toArray(),sunIntensity:env.sun.intensity,sunPosition:env.sun.position.toArray()},guides:'grid and +X travel arrow are diagnostic scene objects; native body geometry/materials unchanged'};
 }finally{scene.remove(grid,travel);grid.geometry.dispose();grid.material.dispose();travel.line.geometry.dispose();travel.line.material.dispose();travel.cone.geometry.dispose();travel.cone.material.dispose();scene.environment=null;env.dispose();renderer.dispose();}
}
