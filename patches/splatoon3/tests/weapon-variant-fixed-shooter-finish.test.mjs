import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let THREE,modelSpec,buildWeaponModel,scaleWeaponDef;test.before(async()=>{const f=await fixture({extraExports:`export {scaleWeaponDef} from './patches/splatoon3/runtime/weapon-models/kit.mjs';export {weaponModelSpec,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});THREE=f.THREE;modelSpec=f.weaponModelSpec;buildWeaponModel=f.buildWeaponModel;scaleWeaponDef=f.scaleWeaponDef;});
const fresh=()=>({kind:'shooter',parts:{}}),geos=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)];
const palette={Shooter_Blaze_01:{'#a8acb2':'#d0a646','#6e737a':'#8e6927'},Shooter_QuickMiddle_01:{'#3d3e42':'#e8652c','#c8262b':'#242529'}};
const bytes=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);
function verifyGeometryAndPalette(row,b,d){
 const bg=geos(b),dg=geos(d);assert.equal(dg.length,bg.length);
 let baseBytes=0,candidateBytes=0,baseTriangles=0,candidateTriangles=0,changed=0;
 const names=['body','ink',...Object.keys(b.parts)];
 const colors=Object.entries(palette[row]).map(([x,y])=>[new THREE.Color(x),new THREE.Color(y)]);
 for(let j=0;j<bg.length;j++){
  const x=bg[j],y=dg[j];assert.deepEqual(Object.keys(y.attributes).sort(),Object.keys(x.attributes).sort());
  for(const name of Object.keys(x.attributes)){
   const a=x.attributes[name],c=y.attributes[name];assert.equal(c.itemSize,a.itemSize);assert.equal(c.normalized,a.normalized);assert.equal(c.array.constructor,a.array.constructor);assert.equal(c.array.length,a.array.length);
   baseBytes+=a.array.byteLength;candidateBytes+=c.array.byteLength;if(name!=='color')assert.ok(bytes(c).equals(bytes(a)),'exact unchanged '+name+' bytes');
  }
  assert.equal(y.index.itemSize,x.index.itemSize);assert.equal(y.index.array.constructor,x.index.array.constructor);assert.ok(bytes(y.index).equals(bytes(x.index)),'exact index bytes');
  baseBytes+=x.index.array.byteLength;candidateBytes+=y.index.array.byteLength;baseTriangles+=x.index.count/3;candidateTriangles+=y.index.count/3;
  const fixed=j===0||(j>1&&b.parts[names[j]].mat==='body'&&!b.parts[names[j]].hidden),a=x.attributes.color,c=y.attributes.color;
  for(let i=0;i<a.count;i++){
   let expected=[a.getX(i),a.getY(i),a.getZ(i)];
   if(fixed)for(const [from,to]of colors)if(expected.every((v,k)=>Math.abs(v-[from.r,from.g,from.b][k])<1e-6)){
    const target=to;
    expected=Array.from(new Float32Array([target.r,target.g,target.b]));changed++;break;
   }
   assert.deepEqual([c.getX(i),c.getY(i),c.getZ(i)],expected,`${row}/${names[j]}/${i} palette`);
  }
 }
 assert.ok(changed>0);assert.equal(candidateBytes,baseBytes);assert.equal(candidateTriangles,baseTriangles);
 return {row,triangles:candidateTriangles,baseGeometryBytes:baseBytes,candidateGeometryBytes:candidateBytes,deltaTriangles:candidateTriangles-baseTriangles,deltaGeometryBytes:candidateBytes-baseBytes,deltaChannels:dg.length-bg.length,changedVertices:changed};
}

const rows=['Shooter_Blaze_01','Shooter_QuickMiddle_01'];
function equalGeometry(a,b){assert.equal(geos(a).length,geos(b).length);for(let i=0;i<geos(a).length;i++){const x=geos(a)[i],y=geos(b)[i];assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));for(const k of Object.keys(x.attributes))assert.ok(bytes(x.attributes[k]).equals(bytes(y.attributes[k])),'exact '+k+' bytes');assert.ok(bytes(x.index).equals(bytes(y.index)),'exact index bytes');}}
function contract(d){const r={};for(const [k,v] of Object.entries(d))if(!['body','ink','parts','variantSourceRow','baseModelId'].includes(k))r[k]=v;r.parts=Object.fromEntries(Object.entries(d.parts).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).filter(([x])=>x!=='src'))]));return r;}
for(const row of rows){
 test(row+' keeps full geometry, material channels, ink and exact fixed palette',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),b=base.build(fresh()),d=spec.build(fresh());assert.equal(spec.sourceRow,row);const registered=buildWeaponModel(row,fresh());assert.equal(registered.modelVariantId,row);assert.equal(registered.modelId,spec.baseId);assert.equal(registered.modelScale,1.3);equalGeometry(scaleWeaponDef(spec.build(fresh()),1.3),registered);console.log(JSON.stringify(verifyGeometryAndPalette(row,b,d)));assert.deepEqual(contract(d),contract(b));assert.equal(spec.animate,base.animate);assert.equal(spec.pose,base.pose);assert.equal(spec.sourceModel,base.sourceModel);for(const g of geos(d))for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));});
 test(row+' rebuild isolation and native trigger/can channels remain unchanged',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),before=base.build(fresh());const d=spec.build(fresh());const after=base.build(fresh());equalGeometry(before,after);for(const [name,part]of Object.entries(d.parts)){assert.deepEqual(contract(d).parts[name],contract(before).parts[name]);assert.notEqual(part.src,before.parts[name].src);}const again=spec.build(fresh());equalGeometry(d,again);d.body.attributes.color.setX(0,.123456);equalGeometry(before,after);equalGeometry(again,spec.build(fresh()));assert.equal(spec.animate,undefined,'both bases rely on unchanged shared native animation');assert.equal(spec.pose,undefined);});
 test(row+' rejects wrong color, geometry corruption, missing attributes and a base-only fallback',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId);for(const corrupt of [d=>d.body.attributes.color.setX(0,.123456),d=>d.body.attributes.position.setX(0,123),d=>d.body.deleteAttribute('normal')]){const b=base.build(fresh()),d=spec.build(fresh());corrupt(d);assert.throws(()=>verifyGeometryAndPalette(row,b,d));}assert.throws(()=>verifyGeometryAndPalette(row,base.build(fresh()),base.build(fresh())));});
}