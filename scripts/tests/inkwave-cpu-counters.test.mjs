import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {installCpuCounters} from '../lib/inkwave-cpu-counters.mjs';
const api=()=>{const r=vm.createContext({});vm.runInContext('('+installCpuCounters.toString()+')()',r);return r;};
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(frame=10,geometries=50,textures=5){
 const texture={isTexture:true},geometry={attributes:{position:{count:12}},index:{count:18}},material={map:texture,uniforms:{same:{value:texture}}};
 const objects=[{},{isMesh:true,geometry,material,skeleton:{bones:[{},{}]}},{isMesh:true,geometry,material}];
 return {objects,scene:{traverse:fn=>objects.forEach(fn)},renderer:{info:{render:{frame,calls:7,triangles:10,points:0,lines:0},memory:{geometries,textures}}}};
}
test('window counters exclude startup totals, preserve every raw value and retain active scene workload',()=>{
 const a=api(),outputs=[];
 for(const f of [fixture(),fixture(500,800,20)]){
  const snapshot=JSON.stringify(f.objects),before=a.__iwReadCpuCounters(f.renderer,f.scene);
  f.renderer.info.render.frame+=3;f.renderer.info.memory.geometries+=2;f.renderer.info.memory.textures++;
  const after=a.__iwReadCpuCounters(f.renderer,f.scene),out=plain(a.__iwCpuCounterWindow(before,after));
  assert.equal(JSON.stringify(f.objects),snapshot,'observer does not mutate live scene');
  assert.deepEqual(out.resources,{geometries:2,textures:1});assert.equal(out.draw.frame,3);
  assert.deepEqual(out.scene,{objects:3,meshes:2,visibleMeshes:2,vertices:24,visibleVertices:24,indices:36,bones:2,geometries:1,materials:1,textures:1});
  assert.deepEqual(out.raw,plain({before,after}));outputs.push(out);
 }
 assert.notDeepEqual(outputs[0].raw,outputs[1].raw);
 const measured=({raw,...rest})=>rest;assert.deepEqual(measured(outputs[0]),measured(outputs[1]));
});
test('hidden parent quality reductions remain visible even when allocation and geometry totals are unchanged',()=>{
 const a=api(),f=fixture(),before=plain(a.__iwReadCpuCounters(f.renderer,f.scene));
 f.objects[2].parent={visible:false};
 const after=plain(a.__iwReadCpuCounters(f.renderer,f.scene));
 assert.deepEqual(after.draw,before.draw);assert.deepEqual(after.resources,before.resources);
 assert.equal(after.scene.meshes,before.scene.meshes);assert.equal(after.scene.vertices,before.scene.vertices);
 assert.equal(after.scene.visibleMeshes,1);assert.equal(after.scene.visibleVertices,12);
 assert.notDeepEqual(after.scene,before.scene);
});
test('actual live scene reductions, rendered work and allocation changes remain observable',()=>{
 const a=api(),f=fixture(),before=a.__iwReadCpuCounters(f.renderer,f.scene);
 f.objects.pop();f.renderer.info.render.calls--;f.renderer.info.memory.textures++;
 const after=a.__iwReadCpuCounters(f.renderer,f.scene),out=plain(a.__iwCpuCounterWindow(before,after));
 assert.notDeepEqual(after.scene,before.scene);assert.equal(out.draw.calls,6);assert.equal(out.resources.textures,1);
});
