import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createProductionLighting,PRODUCTION_LIGHTING_CONFIG,PRODUCTION_EXPOSURE} from '../../../tools/headgear-production-ibl/lighting.mjs';
test('production illumination guard requires actual environment and official intensity/exposure',()=>{
 const official=fs.readFileSync(new URL('../../../inkwave-public/src/world/environment.js',import.meta.url),'utf8'),main=fs.readFileSync(new URL('../../../inkwave-public/src/main.js',import.meta.url),'utf8');assert(official.includes('this._pmrem.fromScene(this._envScene'));assert(official.includes('this.scene.environmentIntensity = T.envK ?? 0.66'));assert(main.includes('G.renderer.toneMappingExposure = 0.94'));assert.equal(PRODUCTION_EXPOSURE,.94);assert.equal(PRODUCTION_LIGHTING_CONFIG.theme,'day');
 let mode='',disposed=0;class FixtureEnvironment{static THEMES={day:{envK:.45,sunIntensity:3.3,hemiIntensity:.45}};constructor(renderer,scene,cfg){assert.equal(cfg,PRODUCTION_LIGHTING_CONFIG);this.envMap=mode==='missing'?null:{};scene.environment=this.envMap;scene.environmentIntensity=mode==='intensity'?0:.45;this.sun={intensity:3.3};this.hemi={intensity:.45};}dispose(){disposed++;}}
 const scene={},renderer={toneMappingExposure:.94};assert(createProductionLighting(FixtureEnvironment,renderer,scene).envMap);for(mode of ['missing','intensity'])assert.throws(()=>createProductionLighting(FixtureEnvironment,renderer,scene));mode='';renderer.toneMappingExposure=1;assert.throws(()=>createProductionLighting(FixtureEnvironment,renderer,scene));assert.equal(disposed,3);
 const browser=fs.readFileSync(new URL('../../../tools/headgear-production-ibl/browser.mjs',import.meta.url),'utf8');assert(browser.includes("config.prefix+'src/world/environment.js'"));assert(!browser.includes('new THREE.HemisphereLight'));assert(!browser.includes('new THREE.DirectionalLight'));assert(browser.includes('scene.environment=null;env.dispose()'));
});

test('production sky uses perspective projection and explicit sun-facing yaw cases',()=>{const browser=fs.readFileSync(new URL('../../../tools/headgear-production-ibl/browser.mjs',import.meta.url),'utf8');assert(browser.includes('new THREE.PerspectiveCamera'));assert(!browser.includes('new THREE.OrthographicCamera'));assert(browser.includes('camera.projectionMatrix.elements[11]+1'));assert(browser.includes("['front','oblique','sunlit-front','sunlit-oblique']"));assert(browser.includes('Math.atan2(env.sun.position.x,env.sun.position.z)'));});

test('perspective framing contains raised gear and rotates view with actual sun yaw',async()=>{
 const THREE=await import('../../../inkwave-public/vendor/three/build/three.module.js');
 const source=fs.readFileSync(new URL('../../../tools/headgear-production-ibl/browser.mjs',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('function frame('),source.indexOf('\n try{'));
 const camera=new THREE.PerspectiveCamera(25,1,.01,5000),env={sun:{position:new THREE.Vector3(-92.4051199835844,100.69126256797398,-83.20194374704654)}};
 const frame=Function('THREE','camera','env','check',body+';return frame;')(THREE,camera,env,(v,m)=>assert(v,m));
 const root=new THREE.Group(),head=new THREE.Group();head.position.y=1.05;root.add(head);
 const gear=new THREE.Mesh(new THREE.BoxGeometry(.72,.76,.64),new THREE.MeshBasicMaterial());gear.position.y=.24;head.add(gear);const c={root,bones:{head},style:{hat:9}};
 for(const view of ['front','oblique','sunlit-front','sunlit-oblique']){const receipt=frame(c,gear,view);assert.equal(receipt.projection,'perspective');assert(receipt.fov>0&&receipt.fov<90);const box=new THREE.Box3().setFromObject(gear);for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1,'full raised crown and brim bounds visible');}if(view.startsWith('sunlit')){const forward=new THREE.Vector3(0,0,1).applyQuaternion(root.quaternion),sun=env.sun.position.clone().setY(0).normalize();assert(forward.dot(sun)>.999999);}else assert.equal(root.rotation.y,0);}
 gear.geometry.dispose();gear.material.dispose();
});
