import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';

test('all four procedural stages retain finite complete geometry and render/collision agreement on exposed faces',async()=>{
 const f=await fixture({productionComposition:true,extraExports:"export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';"}),{THREE}=f;
 for(const id of ['tidewater','kelpline','halyard','cargo']){
  const L=new f.Level(f.MAP_LAYOUTS[id]),P=new f.Physics(L),geometry=L.buildGeometry(1024),p=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
  assert(p.count>0&&geometry.index.count%3===0,id);assert(p.array.every(Number.isFinite)&&normal.array.every(Number.isFinite),id+' finite attributes');assert(geometry.index.array.every(i=>i<p.count),id+' local indices');
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material),ray=new THREE.Raycaster();mesh.updateMatrixWorld(true);let samples=0;
  for(const face of L.faces){
   const b=L.blocks[face.block];if(b.grate||b.hidden||face.su<.4||face.sv<.4)continue;
   const point=face.origin.clone().addScaledVector(face.u,face.su*.5).addScaledVector(face.v,face.sv*.5),origin=point.clone().addScaledVector(face.n,.2),direction=face.n.clone().negate();
   const physical=P.raycast(origin,direction,.4,new f.Hit(),true);ray.set(origin,direction);ray.far=.4;const drawn=ray.intersectObject(mesh);
   // Authored render-only trim can sit in front of a solid face. The solid
   // surface must still exist behind it; trim is not a replacement collider.
   assert(physical.hit&&drawn.length,id+' exposed surface '+face.id);assert(drawn.some(h=>h.point.distanceTo(physical.point)<.14),id+' existing rounded-edge tolerance '+face.id);samples++;
  }
  assert(samples>50,id+' nonvacuous coverage');console.log(JSON.stringify({id,vertices:p.count,triangles:geometry.index.count/3,exposedSurfaceSamples:samples}));geometry.dispose();material.dispose();
 }
});
