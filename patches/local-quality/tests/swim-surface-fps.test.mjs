import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';

test('continuous film keeps its shape/time at 30/60/120Hz and remains film at low quality',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,extraExports:"export {FX} from './src/fx/fx.js';"});
  const {G,THREE}=f;let reference;
  for(const wall of [false,true])for(const quality of ['low','high'])for(const hz of [30,60,120]){
    G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.camera.updateMatrixWorld();G.time=0;
    const fx=new f.FX(G.scene,{quality});
    const a={alive:true,isLocal:true,form:'squid',submerged:true,grounded:true,climbing:false,pos:new THREE.Vector3(),vel:new THREE.Vector3(0,0,8),groundN:new THREE.Vector3(0,1,0),color:new THREE.Color('#e4e900'),s3:{modifiers:{}}};
    if(wall){a.climbing=true;a.grounded=false;a.submerged=false;a.vel.set(0,8,-1.2);a.anim={wallNormal:new THREE.Vector3(0,0,1)};a.wallHit={hit:true,point:new THREE.Vector3()};}
    G.actors=[a];
    try{
      for(let n=0;n<hz*2;n++){G.time+=1/hz;fx.wake(a.pos,a.vel,a.color,8,a.groundN,a);fx.update(1/hz,G.camera);}
      const s=fx.swimSurface.slots[0];assert(s.mesh.visible);assert.equal(fx.dN,0);assert.equal(fx.glows.n,0);
      const p=Array.from(s.mesh.geometry.attributes.position.array);assert(p.every(Number.isFinite));
      if(reference){assert.equal(p.length,reference.length);assert(Math.max(...p.map((x,i)=>Math.abs(x-reference[i])))<1e-5,quality+' '+hz+'Hz temporal shape');}else reference=p;
    }finally{fx.dispose();G.actors=[];}
  }
});
