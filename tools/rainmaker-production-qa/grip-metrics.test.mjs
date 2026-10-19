import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';

const {THREE}=await fixture();
const context=vm.createContext({});
const module=new vm.SourceTextModule(fs.readFileSync(new URL('./browser.mjs',import.meta.url),'utf8'),{context});
await module.link(spec=>{
 assert.equal(spec,'./shared/production-scene.mjs');
 return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('metrics test cannot render');});},{context});
});
await module.evaluate();
const measure=module.namespace.worldReachResidual;
function sample({scale=[1,1,1],error=[0,0,.01],parentScale=[1,1,1],rotated=false}={}){
 const root=new THREE.Group(),kid=new THREE.Group(),hand=new THREE.Group();root.add(kid);kid.add(hand);
 root.scale.fromArray(parentScale);kid.scale.fromArray(scale);
 if(rotated){root.rotation.set(.3,-.7,.2);kid.rotation.set(-.4,.5,.8);}
 const target=new THREE.Vector3(.12,.2,.3);hand.position.copy(target).sub(new THREE.Vector3(...error));
 const input=target.toArray(),out=new THREE.Vector3(),actual=new THREE.Vector3();
 const value=measure({kid,bones:{handL:hand}},target,out,actual);
 assert.deepEqual(target.toArray(),input,'measurement does not mutate solver target');
 return {value,root,kid,hand,target};
}
test('scale-one real 0.01 world reach failure still fails the unchanged 0.001 gate',()=>{
 const {value}=sample();assert.ok(Math.abs(value-.01)<1e-12);assert.equal(value<.001,false);
});
test('tiny displayed form measures world residual while raw kid-space error remains available',()=>{
 const raw=.05718520819319256,{value}=sample({scale:[.001,.001,.001],error:[raw,0,0]});
 assert.ok(raw>.001);assert.ok(Math.abs(value-raw*.001)<1e-12);assert.ok(value<.001);
});
test('nonuniform kid scale transforms the error direction rather than using one scale factor',()=>{
 const {value}=sample({scale:[2,3,4],error:[.01,.02,.03]});
 assert.ok(Math.abs(value-Math.hypot(.02,.06,.12))<1e-12);assert.equal(value<.001,false);
});
test('rotated hierarchy and nonuniform parent scale use the actual world matrices',()=>{
 const x=sample({scale:[.2,1.3,.5],parentScale:[2,3,4],error:[.01,.02,.03],rotated:true});
 x.root.updateMatrixWorld(true);
 const expected=x.target.clone().applyMatrix4(x.kid.matrixWorld).distanceTo(new THREE.Vector3().setFromMatrixPosition(x.hand.matrixWorld));
 assert.ok(Math.abs(x.value-expected)<1e-12);assert.equal(x.value<.001,false);
});
