import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
let modelSpec,buildWeaponModel,THREE;
const rows=['Shelter_Wide_01','Shelter_Wide_02','Shelter_Focus_01'];
const oldKeys={Shelter_Wide_01:['#d8262c'],Shelter_Wide_02:['#5c6440','#2c302c','#d8262c'],Shelter_Focus_01:['#d9532a']};
test.before(async()=>{const f=await fixture({extraExports:`export {weaponModelSpec,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});modelSpec=f.weaponModelSpec;buildWeaponModel=f.buildWeaponModel;THREE=f.THREE;});
const fresh=()=>({kind:'shooter',parts:{}}),geos=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)];
const hash=(g,attrs)=>crypto.createHash('sha256').update(Buffer.concat([...attrs.map(n=>Buffer.from(g.attributes[n].array.buffer)),Buffer.from(g.index.array.buffer)])).digest('hex');

const palette={Shelter_Wide_01:{'#b72328':'#dcc536'},Shelter_Wide_02:{'#48503b':'#c5c4b3','#30352e':'#646c69','#b72328':'#545c54'},Shelter_Focus_01:{'#bd4728':'#ad723b'}};
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
   if(fixed)for(const [from,to]of colors)if(expected.every((v,k)=>Math.abs(v-[from.r,from.g,from.b][k])<1e-6)){
    const target=row==='Shelter_Focus_01'&&j===0&&x.attributes.position.getZ(i)>.53?new THREE.Color('#885294'):to;
    expected=Array.from(new Float32Array([target.r,target.g,target.b]));changed++;break;
   }
   assert.deepEqual([c.getX(i),c.getY(i),c.getZ(i)],expected,`${row}/${names[j]}/${i} palette`);
  }
 }
 assert.ok(changed>0);assert.equal(candidateBytes,baseBytes);assert.equal(candidateTriangles,baseTriangles);
 return {row,triangles:candidateTriangles,baseGeometryBytes:baseBytes,candidateGeometryBytes:candidateBytes,deltaTriangles:candidateTriangles-baseTriangles,deltaGeometryBytes:candidateBytes-baseBytes,deltaChannels:dg.length-bg.length,changedVertices:changed};
}
for(const row of rows)test(row+' repairs zero-hit stale palette without geometry/channel/ink changes',()=>{
 const spec=modelSpec(row);assert.equal(spec.sourceRow,row);const base=modelSpec(spec.baseId),b=base.build(fresh()),d=spec.build(fresh());
 const oldColors=oldKeys[row].map(x=>new THREE.Color(x));let oldMatches=0;for(const g of geos(b)){const c=g.attributes.color;for(let i=0;i<c.count;i++)for(const k of oldColors)if(Math.abs(c.getX(i)-k.r)<1e-6&&Math.abs(c.getY(i)-k.g)<1e-6&&Math.abs(c.getZ(i)-k.b)<1e-6)oldMatches++;}assert.equal(oldMatches,0,'old palette had no target vertices');
 assert.deepEqual(geos(d).map(g=>hash(g,['position','normal','aMat'])),geos(b).map(g=>hash(g,['position','normal','aMat'])));
 assert.notDeepEqual(geos(d).map(g=>hash(g,['color'])),geos(b).map(g=>hash(g,['color'])));assert.equal(spec.animate,base.animate);
 assert.deepEqual(d.muzzle,b.muzzle);assert.deepEqual(d.gripL,b.gripL);assert.deepEqual(Object.keys(d.parts),Object.keys(b.parts));
 assert.equal(hash(d.ink,['color']),hash(b.ink,['color']));for(const k of Object.keys(d.parts)){assert.deepEqual(d.parts[k].pivot,b.parts[k].pivot);assert.equal(d.parts[k].mat,b.parts[k].mat);if(b.parts[k].mat!=='body')assert.equal(hash(d.parts[k].src,['color']),hash(b.parts[k].src,['color']));}
 for(const g of geos(d))for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));
 console.log(JSON.stringify(verifyGeometryAndPalette(row,b,d)));
});

for(const row of rows)test(row+' keeps native open/fold/launch/naked and all animation channels',()=>{
 const spec=modelSpec(row),base=modelSpec(spec.baseId);
 const make=(builder)=>{const def=builder.build(fresh());def.modelId=spec.baseId;return {def,ps:{},ink:new THREE.Object3D(),parts:Object.fromEntries(Object.keys(def.parts).map(k=>[k,new THREE.Object3D()]))};};const a=make(base),b=make(spec);
 for(const canopy of [{open:true,launched:false},{open:false,launched:false},{open:true,launched:true},null])for(let i=0;i<60;i++){
  const st={dt:1/60,runner:{catalogState:{canopy,naked:canopy?0:1}}};base.animate(a,st);spec.animate(b,st);assert.deepEqual(a.ps,b.ps);assert.deepEqual(a.ink.position,b.ink.position);assert.deepEqual(a.ink.scale,b.ink.scale);assert.equal(a.ink.visible,b.ink.visible);assert.deepEqual(a.ink.rotation.toArray(),b.ink.rotation.toArray());assert.deepEqual(a.ink.quaternion.toArray(),b.ink.quaternion.toArray());
  for(const k of Object.keys(a.parts)){for(const field of ['position','rotation','quaternion','scale'])assert.deepEqual(a.parts[k][field].toArray(),b.parts[k][field].toArray());assert.equal(a.parts[k].visible,b.parts[k].visible);}
 }
});

for(const row of rows)test(row+' canonical variant keeps nonzero native guard pose through base definition identity',()=>{
 const spec=modelSpec(row),base=modelSpec(spec.baseId),C={ANC:0,ANCR:3,AFOLT:6,AFOLR:7,IKR:8,IKL:9,LTW:10,HIPS:11,SPINE:14,CHEST:17,CLAVL:20,CLAVR:23};
 const make=(id)=>{const def=buildWeaponModel(id,fresh());assert.equal(def.modelId,spec.baseId);return {weaponModel:id,weapon:{def},_runner:()=>({catalogState:{canopy:{open:true,launched:false,pos:new THREE.Vector3(1,2,3),dir:new THREE.Vector3(0,0,1)}}}),kid:new THREE.Object3D(),kidForm:true,dance:false,wSub:0,wTwo:0,P:new Float64Array(32)};};
 const a=make(spec.baseId),b=make(row);assert.equal(b.weapon.def.modelVariantId,row);
 for(let i=0;i<30;i++){base.pose(a,1/60,{},C);spec.pose(b,1/60,{},C);assert.deepEqual(b.P,a.P);}
 assert.ok(a.P.some(v=>v!==0));assert.ok(b.P[C.IKR]>.9);
});

for(const row of rows)test(row+' rejects wrong palette, noncolor bytes and missing attributes',()=>{
 const spec=modelSpec(row),base=modelSpec(spec.baseId);
 for(const corrupt of [d=>d.body.attributes.color.setX(0,.123456),d=>d.body.attributes.position.setX(0,123),d=>d.body.deleteAttribute('normal')]){const b=base.build(fresh()),d=spec.build(fresh());corrupt(d);assert.throws(()=>verifyGeometryAndPalette(row,b,d));}
});
