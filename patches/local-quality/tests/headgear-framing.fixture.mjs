import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import * as THREE from 'three';
const site=process.env.INKWAVE_HEADGEAR_SITE,load=rel=>import(pathToFileURL(path.join(site,rel)).href);
const {G}=await load('src/core/ctx.js'),{install}=await load('patches/splatoon3/runtime/install.mjs');install(JSON.parse(fs.readFileSync(path.join(site,'patches/splatoon3/profile.json'))));
const {Character}=await load('src/game/character.js'),{headgearState}=await load('patches/local-quality/headgear/lifecycle.mjs');
const text=fs.readFileSync(new URL('../../../tools/headgear-production-multiview/browser.mjs',import.meta.url),'utf8');const helper=text.slice(text.indexOf(' function frameNewGear('),text.indexOf(' async function capture('));
test('new gear framing contains all attachment bounds at all views, LODs and head poses; underside clips only below gear',()=>{
 const camera=new THREE.OrthographicCamera(-.46,.46,.46,-.46,.01,30),frame=new Function('THREE','camera',helper+';return frameNewGear;')(THREE,camera);
 G.settings={quality:'high'};
 for(const hat of [8,9,10,11]){const c=new Character({sourceMotion:false,style:{hat,hair:0,brows:0}});c.onEvent=null;try{for(const lod of ['hero','game','far'])for(const pose of [0,-.2,.2]){
  c.setLod(lod);c.bones.head.rotation.set(pose,pose,0);c.root.updateMatrixWorld(true);const gear=headgearState(c).groups.find(x=>x.lod===lod).group,target=new THREE.Vector3(),meta=frame(c,gear,target);
  for(const [view,v]of Object.entries({front:[0,.045,3],back:[0,.045,-3],left:[-3,.045,0],right:[3,.045,0],top:[0,3,.0001],under:[0,-3,.0001],oblique:[2.3,1.1,2.3]})){
   camera.position.copy(target).add(new THREE.Vector3(...v));camera.up.set(0,1,0);if(view==='top')camera.up.set(0,0,-1);if(view==='under')camera.up.set(0,0,1);camera.lookAt(target);camera.near=.01;
   if(view==='under'){const cutY=Math.min(c.bones.head.getWorldPosition(new THREE.Vector3()).y-.13,meta.min[1]-.025);assert(cutY<meta.min[1]);camera.near=Math.max(.01,cutY-camera.position.y);}
   camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
   for(const x of [meta.min[0],meta.max[0]])for(const y of [meta.min[1],meta.max[1]])for(const z of [meta.min[2],meta.max[2]]){const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<.95&&Math.abs(p.y)<.95,`${hat}/${lod}/${view} full bounds`);assert(p.z>-1&&p.z<1,`${hat}/${lod}/${view} depth`);}
  }
 }}finally{c.dispose();}}
 assert(text.includes('gearId>=8?frameNewGear(c,gear,target):null'));assert(text.includes('camera.left=camera.bottom=-.46;camera.right=camera.top=.46;'));
});
