import test from 'node:test';import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
let THREE,modelSpec,buildWeaponModel,M,Pieces,slab,smoothOutline;test.before(async()=>{const f=await fixture({extraExports:`export {M,Pieces,slab,smoothOutline} from './patches/splatoon3/runtime/weapon-models/kit.mjs';export {weaponModelSpec,buildWeaponModel} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});THREE=f.THREE;M=f.M;Pieces=f.Pieces;slab=f.slab;smoothOutline=f.smoothOutline;modelSpec=f.weaponModelSpec;buildWeaponModel=f.buildWeaponModel;});
const fresh=()=>({kind:'dualies',dual:true,parts:{}}),geos=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)];
const palette={"Maneuver_Stepper_01": {"#702891": "#d3423c"}, "Maneuver_Long_01": {"#c4272b": "#d9b42e"}};
const bytes=a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);

function shellSignatures(){
 const rear=[[-.050,.065],[-.041,.096],[-.022,.108],[.012,.100],[.019,.071],[.006,.032],[-.001,-.025],[-.022,-.065],[-.059,-.079],[-.064,-.064],[-.043,-.048],[-.043,.004]],cheek=[[-.035,.088],[-.020,.099],[.015,.091],[.016,.060],[.002,.026],[-.007,-.034],[-.026,-.065],[-.055,-.077],[-.052,-.059],[-.031,-.043],[-.026,.005]];
 const gs=[slab(smoothOutline(rear,36),.027,0,.003),...[-1,1].map(sx=>slab(smoothOutline(cheek,30),.003,0,.0015).translate(sx*.015,0,0))],set=new Set();let count=0;
 for(const raw of gs){const p=new Pieces();p.add(raw,'#202328',M.satin);const g=p.build();for(let i=0;i<g.attributes.position.count;i++){set.add(signature(g,i));count++;}g.dispose();}return {set,count};
}
function signature(g,i){return ['position','normal'].flatMap(k=>[g.attributes[k].getX(i),g.attributes[k].getY(i),g.attributes[k].getZ(i)]).join(',');}

function verifyGeometryAndPalette(row,b,d){
 const shell=row==='Maneuver_Stepper_01'?shellSignatures():null;let shellChanged=0;const bg=geos(b),dg=geos(d);assert.equal(dg.length,bg.length);
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
    const target=to;
    expected=Array.from(new Float32Array([target.r,target.g,target.b]));changed++;break;
   }
   if(shell&&j===0&&shell.set.has(signature(x,i))&&x.attributes.aMat.getX(i)===M.satin){const col=new THREE.Color('#e5e5df');expected=Array.from(new Float32Array([col.r,col.g,col.b]));shellChanged++;changed++;}
   assert.deepEqual([c.getX(i),c.getY(i),c.getZ(i)],expected,`${row}/${names[j]}/${i} palette`);
  }
 }
 if(shell)assert.equal(shellChanged,shell.count);assert.ok(changed>0);assert.equal(candidateBytes,baseBytes);assert.equal(candidateTriangles,baseTriangles);
 return {row,triangles:candidateTriangles,baseGeometryBytes:baseBytes,candidateGeometryBytes:candidateBytes,deltaTriangles:candidateTriangles-baseTriangles,deltaGeometryBytes:candidateBytes-baseBytes,deltaChannels:dg.length-bg.length,changedVertices:changed};
}

const rows=['Maneuver_Stepper_01','Maneuver_Long_01'];
function equalGeometry(a,b){assert.equal(geos(a).length,geos(b).length);for(let i=0;i<geos(a).length;i++){const x=geos(a)[i],y=geos(b)[i];assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));for(const k of Object.keys(x.attributes))assert.deepEqual(bytes(x.attributes[k]),bytes(y.attributes[k]));assert.deepEqual(bytes(x.index),bytes(y.index));}}
function contract(d){const r={};for(const [k,v] of Object.entries(d))if(!['body','ink','parts','variantSourceRow','baseModelId'].includes(k))r[k]=v;r.parts=Object.fromEntries(Object.entries(d.parts).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).filter(([x])=>x!=='src'))]));return r;}
for(const row of rows){
 test(row+' keeps full geometry, material channels, ink and exact fixed palette',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),b=base.build(fresh()),d=spec.build(fresh());assert.equal(spec.sourceRow,row);const registered=buildWeaponModel(row,fresh());assert.equal(registered.modelVariantId,row);assert.equal(registered.modelId,spec.baseId);equalGeometry(d,registered);console.log(JSON.stringify(verifyGeometryAndPalette(row,b,d)));assert.deepEqual(contract(d),contract(b));assert.equal(spec.animate,base.animate);assert.equal(spec.pose,base.pose);assert.equal(spec.sourceModel,base.sourceModel);for(const g of geos(d))for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));});
 test(row+' rebuild isolation and native trigger/can channels remain unchanged',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId),before=base.build(fresh());const d=spec.build(fresh());const after=base.build(fresh());equalGeometry(before,after);for(const [name,part]of Object.entries(d.parts)){assert.deepEqual(contract(d).parts[name],contract(before).parts[name]);assert.notEqual(part.src,before.parts[name].src);}const again=spec.build(fresh());equalGeometry(d,again);d.body.attributes.color.setX(0,.123456);equalGeometry(before,after);equalGeometry(again,spec.build(fresh()));assert.equal(spec.animate,undefined,'both bases rely on unchanged shared native animation');assert.equal(spec.pose,undefined);});
 test(row+' rejects wrong color, geometry corruption, missing attributes and a base-only fallback',()=>{const spec=modelSpec(row),base=modelSpec(spec.baseId);for(const corrupt of [d=>d.body.attributes.color.setX(0,.123456),d=>d.body.attributes.position.setX(0,123),d=>d.body.deleteAttribute('normal')]){const b=base.build(fresh()),d=spec.build(fresh());corrupt(d);assert.throws(()=>verifyGeometryAndPalette(row,b,d));}assert.throws(()=>verifyGeometryAndPalette(row,base.build(fresh()),base.build(fresh())));});
}