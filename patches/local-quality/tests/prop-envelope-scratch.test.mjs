import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import {loadNative} from './prop-retention-fixture.mjs';
const {THREE,SRC,PropKit}=await loadNative(true);
const {setPropInstanceEnvelope}=await import(pathToFileURL(SRC+'src/world/render-bounds.js'));

test('prop bounds reuse scratch across affine placements with exactly the old extrema and sphere',()=>{
  for(const count of [0,1,256]){
    const geometry=new THREE.BoxGeometry(2,3,4),recs=[];
    for(let i=0;i<count;i++){
      const m=new THREE.Matrix4().compose(new THREE.Vector3(i-32,Math.sin(i),-i),new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.13,i*.37,-i*.21)),new THREE.Vector3(i%2?-1:2,.3+i%5,1.7));
      m.elements[4]+=.17; // include shear, reflection and nonuniform scaling
      recs.push({m});
    }
    const mesh={geometry,userData:{recs},frustumCulled:false};
    geometry.computeBoundingBox();
    const expected=new THREE.Box3(),local=geometry.boundingBox.clone();
    for(const {m} of recs)expected.union(local.clone().applyMatrix4(m));
    const clone=THREE.Box3.prototype.clone;let calls=0;
    THREE.Box3.prototype.clone=function(){calls++;return clone.call(this);};
    try{setPropInstanceEnvelope(mesh);}finally{THREE.Box3.prototype.clone=clone;}
    assert.equal(calls,1,'only the geometry-local box is cloned, regardless of placement count');
    assert.deepEqual(geometry.boundingBox,local,'scratch must never overwrite the source bounds');
    if(!count){assert.equal(mesh.frustumCulled,false);assert.equal(mesh.boundingSphere,undefined);}
    else{
      expected.expandByScalar(2e-6*(Math.max(expected.min.length(),expected.max.length())+1));
      assert.deepEqual(mesh.boundingSphere,expected.getBoundingSphere(new THREE.Sphere()));
      assert.equal(mesh.frustumCulled,true);
    }
    geometry.dispose();
  }
});

// Exact public parent dd90aa241aabd5f0b972cc3471386ba3d4da86dc;
// retain the pre-scratch helper as a counterfactual independent of current code.
const baseline=fs.readFileSync(new URL('./fixtures/prop-envelope-before-scratch.js.txt',import.meta.url),'utf8');
const before=new Function('THREE',baseline.replace(/^import .*;\n/m,'').replace(/^export /gm,'')+'\nreturn setPropInstanceEnvelope;')(THREE);

test('real PropKit fan, turbine, blink, flags and banners retain baseline culling spheres',()=>{
  const kit=new PropKit(new THREE.Scene());
  for(const [type,opts] of [['acunit',{}],['acunit',{variant:1}],['vent',{variant:1}],['banner',{}],['bunting',{}],['speaker',{}],['buoy',{}]])
    kit.add(type,{pos:[3,2,-5],rotY:.7,scale:1.3,...opts});
  try{
    kit.build();assert.ok(kit._inst.length>=5);
    for(const mesh of kit._inst){
      mesh.frustumCulled=false;mesh.boundingSphere=null;
      before(mesh);const expected={culled:mesh.frustumCulled,sphere:mesh.boundingSphere?.clone()};
      mesh.frustumCulled=false;mesh.boundingSphere=null;
      setPropInstanceEnvelope(mesh);
      assert.deepEqual({culled:mesh.frustumCulled,sphere:mesh.boundingSphere?.clone()},expected,mesh.name);
    }
  }finally{kit.dispose();}
});
