import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let THREE,modelSpec,buildWeaponModel,Pieces,pistolGrip;test.before(async()=>{const f=await fixture({extraExports:`export {Pieces,pistolGrip} from './patches/splatoon3/runtime/weapon-models/kit.mjs';export {weaponModelSpec,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});THREE=f.THREE;Pieces=f.Pieces;pistolGrip=f.pistolGrip;modelSpec=f.weaponModelSpec;buildWeaponModel=f.buildWeaponModel;});
const fresh=()=>({kind:'shooter',parts:{}}),geos=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)];
const palette={"Shooter_TripleQuick_01": {"#1e1f23": "#e6e9e9"}, "Shooter_TripleMiddle_01": {"#1e1f23": "#e6e9e9", "#26282d": "#e6e9e9", "#3b3d44": "#bbc4ce"}};
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
   baseBytes+=a.array.byteLength;candidateBytes+=c.array.byteLength;if(name!=='color')assert.deepEqual(bytes(c),bytes(a));
  }
  assert.equal(y.index.itemSize,x.index.itemSize);assert.equal(y.index.array.constructor,x.index.array.constructor);assert.deepEqual(bytes(y.index),bytes(x.index));
  baseBytes+=x.index.array.byteLength;candidateBytes+=y.index.array.byteLength;baseTriangles+=x.index.count/3;candidateTriangles+=y.index.count/3;
  const fixed=j===0||(j>1&&b.parts[names[j]].mat==='body'&&!b.parts[names[j]].hidden),a=x.attributes.color,c=y.attributes.color;
  for(let i=0;i<a.count;i++){
   let expected=[a.getX(i),a.getY(i),a.getZ(i)];
   if(j===0&&i<a.count-358)for(const [from,to]of colors)if(expected.every((v,k)=>Math.abs(v-[from.r,from.g,from.b][k])<1e-6)){
    const target=to;
    expected=Array.from(new Float32Array([target.r,target.g,target.b]));changed++;break;
   }
   assert.deepEqual([c.getX(i),c.getY(i),c.getZ(i)],expected,`${row}/${names[j]}/${i} palette`);
  }
 }
 assert.ok(changed>0);assert.equal(candidateBytes,baseBytes);assert.equal(candidateTriangles,baseTriangles);
 return {row,triangles:candidateTriangles,baseGeometryBytes:baseBytes,candidateGeometryBytes:candidateBytes,deltaTriangles:candidateTriangles-baseTriangles,deltaGeometryBytes:candidateBytes-baseBytes,deltaChannels:dg.length-bg.length,changedVertices:changed};
}

const rows=['Shooter_TripleQuick_01','Shooter_TripleMiddle_01'];
function equalGeometry(a,b){assert.equal(geos(a).length,geos(b).length);for(let i=0;i<geos(a).length;i++){const x=geos(a)[i],y=geos(b)[i];assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));for(const k of Object.keys(x.attributes))assert.deepEqual(bytes(x.attributes[k]),bytes(y.attributes[k]));assert.deepEqual(bytes(x.index),bytes(y.index));}}
function contract(d){const r={};for(const [k,v] of Object.entries(d))if(!['body','ink','parts','variantSourceRow','baseModelId'].includes(k))r[k]=v;r.parts=Object.fromEntries(Object.entries(d.parts).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).filter(([x])=>x!=='src'))]));return r;}
for(const row of rows){
 test(row+' keeps full geometry, material channels, ink and exact fixed palette',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),b=base.build(fresh()),d=spec.build(fresh());assert.equal(spec.sourceRow,row);const registered=buildWeaponModel(row,fresh());assert.equal(registered.modelVariantId,row);assert.equal(registered.modelId,spec.baseId);equalGeometry(d,registered);console.log(JSON.stringify(verifyGeometryAndPalette(row,b,d)));assert.deepEqual(contract(d),contract(b));assert.equal(spec.animate,base.animate);assert.equal(spec.pose,base.pose);assert.equal(spec.sourceModel,base.sourceModel);for(const g of geos(d))for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));});
 test(row+' rebuild isolation and native trigger/can channels remain unchanged',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),before=base.build(fresh());const d=spec.build(fresh());const after=base.build(fresh());equalGeometry(before,after);for(const [name,part]of Object.entries(d.parts)){assert.deepEqual(contract(d).parts[name],contract(before).parts[name]);assert.notEqual(part.src,before.parts[name].src);}const again=spec.build(fresh());equalGeometry(d,again);d.body.attributes.color.setX(0,.123456);equalGeometry(before,after);equalGeometry(again,spec.build(fresh()));assert.equal(spec.animate,undefined,'both bases rely on unchanged shared native animation');assert.equal(spec.pose,undefined);});
 test(row+' rejects wrong color, geometry corruption, missing attributes and a base-only fallback',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId);for(const corrupt of [d=>d.body.attributes.color.setX(0,.123456),d=>d.body.attributes.position.setX(0,123),d=>d.body.deleteAttribute('normal')]){const b=base.build(fresh()),d=spec.build(fresh());corrupt(d);assert.throws(()=>verifyGeometryAndPalette(row,b,d));}assert.throws(()=>verifyGeometryAndPalette(row,base.build(fresh()),base.build(fresh())));});
}
for(const [row,rake,w,color] of [['Shooter_TripleQuick_01',.21,.014,'#1e1f23'],['Shooter_TripleMiddle_01',.39,.0125,'#2b43b8']])test(row+' protects exact native grip, guard, trigger and all original blue vertices',()=>{
 const p=new Pieces(),tr=pistolGrip(p,{rake:rake-Math.atan2(.25,1),w,color,triggerColor:'#1e1f23',guardColor:'#1e1f23'}),g=p.build(),spec=modelSpec(row),b=modelSpec(spec.baseId).build(fresh()),d=spec.build(fresh());
 assert.equal(g.attributes.position.count,358);for(const name of Object.keys(g.attributes)){const a=g.attributes[name],x=b.body.attributes[name],y=d.body.attributes[name];assert.deepEqual(bytes(x).subarray(bytes(x).length-bytes(a).length),bytes(a));assert.deepEqual(bytes(y).subarray(bytes(y).length-bytes(a).length),bytes(a));}
 for(const name of Object.keys(b.parts.trigger.src.attributes))assert.deepEqual(bytes(d.parts.trigger.src.attributes[name]),bytes(b.parts.trigger.src.attributes[name]));
 let blue=0;for(const hex of ['#2a3ec2','#2b43b8']){const col=new THREE.Color(hex),x=b.body.attributes.color,y=d.body.attributes.color;for(let i=0;i<x.count;i++)if(Math.abs(x.getX(i)-col.r)<1e-6&&Math.abs(x.getY(i)-col.g)<1e-6&&Math.abs(x.getZ(i)-col.b)<1e-6){assert.deepEqual([y.getX(i),y.getY(i),y.getZ(i)],[x.getX(i),x.getY(i),x.getZ(i)]);blue++;}}assert.ok(blue>0);
});
