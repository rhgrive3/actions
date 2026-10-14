import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fixture } from './source-fixture.mjs';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const identity = JSON.parse(fs.readFileSync(path.join(ROOT,'patches/splatoon3/reference/shooter-blaster-variant-identity-1130.json'),'utf8'));
let loaded;
async function load() {
  if (loaded) return loaded;
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const sourceHash=sha(fs.readFileSync(new URL('../runtime/weapon-models/tentatek-shell.mjs',import.meta.url)));
  assert.equal(sourceHash,'3ec929ae9b51cd55dbb51a9bffe12e96d6e3efe87e90c1143a7cd61cf967c51d');
  if(process.env.INKWAVE_BUILT_SITE){
    const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
    assert.equal(sha(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact manifest hash');
    assert.equal(manifest.files['patch/runtime/weapon-models/tentatek-shell.mjs'],sourceHash);
    for(const relative of ['runtime/weapon-models/registry.mjs','runtime/weapon-models/shooter-blaster-variants.mjs'])
      assert.equal(manifest.files['patch/'+relative],sha(fs.readFileSync(path.join(ROOT,'patches/splatoon3',relative))));
    const registryHash=sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs')));
    assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],registryHash);
    assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/kit.mjs'],sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/kit.mjs'))));
    for(const name of ['registry','kit']){const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';assert.equal(manifest.artifacts['_versions/'+manifest.build.revision+'/'+rel],manifest.artifacts[rel],'capture and fixture artifact identity');}
    console.log('TENTATEK_EMITTED_REGISTRY_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,registryHash}));
  }
  const f=await fixture({extraExports:`export * as K from './patches/splatoon3/runtime/weapon-models/kit.mjs';
    export {weaponVariantSpec,weaponModelSpec,registeredWeaponVariants,registeredWeaponModels} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
  const variantIds=f.registeredWeaponVariants().filter(id=>id.startsWith('Shooter_')||id.startsWith('Blaster_'));
  assert.deepEqual([...variantIds].sort(),identity.records.map(r=>r.sourceRow).sort(),'all shooter/blaster appearances resolve through the production registry');
  return loaded={K:f.K,VARIANT_MODELS:Object.fromEntries(variantIds.map(id=>[id,f.weaponVariantSpec(id)])),
    A:Object.fromEntries(f.registeredWeaponModels().map(id=>[id,f.weaponModelSpec(id)])),B:{},C:{}};
}
const PARTITIONS = { Shooter_Normal_01:'can', Shooter_Normal_02:'can', Shooter_Expert_02:'can', Shooter_Long_01:'ink', Blaster_Short_01:'ink', Blaster_Middle_02:'ink', Blaster_LightLong_02:'ink' };
function channels(d) {return [['body',d.body],['ink',d.ink],...Object.entries(d.parts).map(([n,p])=>[n,p.src])];}
function sig(d) {return channels(d).map(([n,g])=>n+':'+JSON.stringify([...g.attributes.color.array])).join('|');}
function fresh(K, kind) {return {kind, body:K.emptyGeometry(),ink:K.emptyGeometry(),muzzle:K.V(),gripR:K.GRIP_PISTOL,gripL:K.GRIP_PISTOL,
  parts:Object.fromEntries((kind==='shooter'?['trigger','bolt','can','led']:['trigger','pump','needle','bulb','front','lever']).map(n=>[n,{src:K.emptyGeometry(),pivot:K.V(),mat:'body'}]))};}
function dispose(d) {for(const [,g]of channels(d))g.dispose();}
test('all derived identity records exist in pinned11.3 data and preserve base descriptors',async()=>{
 const f=await load(),base={...f.A,...f.B,...f.C};assert.equal(identity.records.length,31);assert.equal(Object.keys(f.VARIANT_MODELS).length,31);
 for(const [id,s]of Object.entries(f.VARIANT_MODELS)) {
  const r=identity.records.find(x=>x.sourceRow===id);assert.ok(r,id);assert.equal(s.baseId,r.baseId);assert.equal(s.name,r.name);
  assert.equal(s.sourceModel,base[s.baseId].sourceModel);assert.equal(s.hold,base[s.baseId].hold);assert.equal(s.nativeCarry,base[s.baseId].nativeCarry);
 }
});
test('derived models differ while preserving base isolation, ink, grips, muzzle and native channels',async()=>{
 const f=await load(),base={...f.A,...f.B,...f.C};
 for(const [id,s]of Object.entries(f.VARIANT_MODELS)) {
  const kind=id.startsWith('Shooter')?'shooter':'blaster', a=base[s.baseId].build(fresh(f.K,kind)), before=sig(a),d=s.build(fresh(f.K,kind));
  assert.equal(d.kind,a.kind);assert.equal(JSON.stringify(d.muzzle),JSON.stringify(a.muzzle),id+' muzzle');
  assert.equal(JSON.stringify(d.gripR),JSON.stringify(a.gripR),id+' gripR');assert.equal(JSON.stringify(d.gripL),JSON.stringify(a.gripL),id+' gripL');
  assert.equal(d.muzzlePart,a.muzzlePart,id+' socket owner');
  let triangles=0;
  for(const [n,g]of channels(d)) {
    assert.ok(g.index.count>0);for(const attr of Object.values(g.attributes))for(const v of attr.array)assert.ok(Number.isFinite(v),id+' finite');
    for(const v of g.index.array)assert.ok(v<g.attributes.position.count);triangles+=g.index.count/3;
  }
  assert.ok(triangles<18000,id+' bounded triangles');
  for(const [n,g]of channels(a)) {
   const other=channels(d).find(([x])=>x===n)?.[1];assert.ok(other,id+' retains '+n);
   if(PARTITIONS[id]===n)continue;
   if(id==='Shooter_Normal_01'&&n==='body')continue; // Targeted strap removal checked below. // Exact triangle/color partition proved separately below.
   // Added body decorations may append vertices; existing source prefix stays identical.
   for(const key of ['position','normal','aMat'])assert.deepEqual(Array.from(other.attributes[key].array.slice(0,g.attributes[key].array.length)),Array.from(g.attributes[key].array),id+' '+n+'.'+key);
   assert.deepEqual(Array.from(other.index.array.slice(0,g.index.count)),Array.from(g.index.array),id+' '+n+' topology');
   if(n==='ink'||a.parts[n]?.mat==='ink')assert.deepEqual(Array.from(other.attributes.color.array),Array.from(g.attributes.color.array),id+' team ink unchanged');
   if(a.parts[n]){assert.equal(d.parts[n].mat,a.parts[n].mat);assert.equal(JSON.stringify(d.parts[n].pivot),JSON.stringify(a.parts[n].pivot));}
  }
  assert.notEqual(sig(d),before,id+' has real visual changes');assert.equal(sig(a),before,id+' existing base isolated');
  const again=base[s.baseId].build(fresh(f.K,kind));assert.equal(sig(again),before,id+' subsequent base isolated');
  dispose(a);dispose(d);dispose(again);
 }
});
test('fixed tank surfaces track native can transforms after base animation',async()=>{
 const f=await load();
 for(const id of ['Shooter_Normal_01','Shooter_Normal_02','Shooter_Expert_02']) {
  const spec=f.VARIANT_MODELS[id],w={parts:{can:new f.K.THREE.Object3D(),variantSkin:new f.K.THREE.Object3D()}};
  for(const dt of [1/30,1/60,1/120]){w.parts.can.position.set(.1,dt,.2);w.parts.can.rotation.set(dt,.3,.4);w.parts.can.scale.set(1+dt,1,1);spec.animate(w,{dt});
   assert.ok(w.parts.can.position.equals(w.parts.variantSkin.position));assert.ok(w.parts.can.quaternion.equals(w.parts.variantSkin.quaternion));assert.ok(w.parts.can.scale.equals(w.parts.variantSkin.scale));}
 }
});
test('all inherited animations preserve native channel motion at30/60/120Hz',async()=>{
 const f=await load(),base={...f.A,...f.B,...f.C};
 for(const [id,s]of Object.entries(f.VARIANT_MODELS)) {
  const d=s.build(fresh(f.K,id.startsWith('Shooter')?'shooter':'blaster'));
  for(const dt of [1/30,1/60,1/120])for(const sinceShoot of [0,.04,.12,.3,.8]) {
   const make=()=>({parts:Object.fromEntries(Object.keys(d.parts).map(n=>[n,new f.K.THREE.Object3D()]))});
   const a=make(),b=make();for(const w of [a,b])for(const p of Object.values(w.parts)){p.position.set(.01,.03,.06);p.scale.set(1.03,.98,1.02);}
   const st={dt,sinceShoot};base[s.baseId].animate?.(a,st);s.animate?.(b,st);
   for(const n of Object.keys(a.parts).filter(n=>!['variantSkin','variantCharm'].includes(n)))for(const k of ['position','quaternion','scale'])assert.ok(a.parts[n][k].equals(b.parts[n][k]),id+' '+n+'.'+k);
   for(const key of ['variantSkin','variantCharm'])if(b.parts[key])for(const k of ['position','quaternion','scale'])assert.ok(b.parts[key][k].equals(b.parts.can[k]),id+' accessory follows tank');
  }
  dispose(d);
 }
});

function triangles(g, start=0, end=g.index.count) {
 const out=[],p=g.attributes.position,n=g.attributes.normal;
 for(let i=start;i<end;i+=3){const ids=[g.index.array[i],g.index.array[i+1],g.index.array[i+2]];
  const a=ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j)]);
  // Native empty channels use a zero-area triangle; it has no visible surface.
  const u=a[1].map((x,k)=>x-a[0][k]),v=a[2].map((x,k)=>x-a[0][k]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  if(cross.every(x=>Math.abs(x)<1e-18))continue;
  out.push(JSON.stringify(ids.map(j=>[p.getX(j),p.getY(j),p.getZ(j),n.getX(j),n.getY(j),n.getZ(j)])));
 }
 return out.sort();
}
test('source-backed fixed/ink partitions conserve exact oriented triangles without duplicate skins',async()=>{
 const f=await load(),base={...f.A,...f.B,...f.C};
 for(const [id,s]of Object.entries(f.VARIANT_MODELS)){
  const kind=id.startsWith('Shooter')?'shooter':'blaster',d=s.build(fresh(f.K,kind));
  if(id==='Shooter_Normal_01'){assert.ok(d.variantGeometryRevision);dispose(d);continue;}
  if(!PARTITIONS[id]){assert.equal(d.variantFixedInk,undefined,id+' no unexpected ink reassignment');dispose(d);continue;}
  const a=base[s.baseId].build(fresh(f.K,kind)),source=PARTITIONS[id],record=d.variantFixedInk;
  assert.equal(record.length,1);assert.equal(record[0].source,source);
  const old=source==='ink'?a.ink:a.parts[source].src,remaining=source==='ink'?d.ink:d.parts[source].src;
  const target=source==='ink'?d.body:d.parts.variantSkin.src;
  // Static transfers precede any later accessory: exactly the original source
  // triangleCount is appended immediately after the base body.
  const start=source==='ink'?a.body.index.count:0,end=start+record[0].triangleCount*3;
  assert.deepEqual([...triangles(remaining),...triangles(target,start,end)].sort(),triangles(old),id+' exact triangle union');
  if(source!=='ink'){assert.equal(d.parts[source].mat,'ink');assert.equal(d.parts.variantSkin.mat,'body');assert.equal(JSON.stringify(d.parts.variantSkin.pivot),JSON.stringify(a.parts[source].pivot));}
  const expected=id==='Blaster_Short_01'?old.index.count/3-record[0].triangleCount:0;
  assert.equal(triangles(remaining).length>0,expected>0,id+' only Luna retains partial team ink');
  const col=new f.K.THREE.Color(record[0].color);
  for(let i=start;i<end;i++){
   const j=target.index.array[i],c=target.attributes.color;
   assert.ok(Math.abs(c.getX(j)-col.r)<1e-6&&Math.abs(c.getY(j)-col.g)<1e-6&&Math.abs(c.getZ(j)-col.b)<1e-6,id+' fixed color');
   assert.equal(target.attributes.aMat.getX(j),record[0].material,id+' fixed surface class');
  }
  if(id==='Blaster_Short_01'){
   for(const j of remaining.index.array)assert.ok(remaining.attributes.position.getZ(j)>-.07,'front shell remains team ink');
   for(let i=start;i<end;i++)assert.ok(target.attributes.position.getZ(target.index.array[i])<-.07,'only rear antenna moved');
  }
  dispose(a);dispose(d);
 }
});

test('inspected icons preserve N-ZAP gray receiver, Clawz black stock and Jet white labels',async()=>{
 const f=await load(),base={...f.A,...f.B,...f.C};
 for(const [id,hex]of [['Shooter_QuickMiddle_01','#9a9b9e'],['Shooter_QuickMiddle_01','#7c7d81'],['Shooter_Heavy_02','#2b2c2f'],['Shooter_Long_01','#eceee8']]){
  const s=f.VARIANT_MODELS[id],a=base[s.baseId].build(fresh(f.K,'shooter')),b=s.build(fresh(f.K,'shooter')),t=new f.K.THREE.Color(hex),ac=a.body.attributes.color,bc=b.body.attributes.color;let matched=0;
  for(let i=0;i<ac.count;i++)if(Math.abs(ac.getX(i)-t.r)<1e-6&&Math.abs(ac.getY(i)-t.g)<1e-6&&Math.abs(ac.getZ(i)-t.b)<1e-6){
   assert.equal(bc.getX(i),ac.getX(i));assert.equal(bc.getY(i),ac.getY(i));assert.equal(bc.getZ(i),ac.getZ(i));matched++;
  }
  assert.ok(matched>0,id+' test targets actual base vertices');dispose(a);dispose(b);
 }
});

test('Tentatek HD reconstruction preserves base and native channels while correcting bilateral plates, curved frame and fore-end',async()=>{
 const f=await load(),a=f.A.shooter.build(fresh(f.K,'shooter'));
 const fingerprint=d=>JSON.stringify(channels(d).map(([n,g])=>[n,Array.from(g.index.array),Object.fromEntries(Object.entries(g.attributes).map(([k,v])=>[k,Array.from(v.array)]))]));
 const before=fingerprint(a),d=f.VARIANT_MODELS.Shooter_Normal_01.build(fresh(f.K,'shooter'));
 assert.equal(fingerprint(a),before);assert.equal(fingerprint(f.A.shooter.build(fresh(f.K,'shooter'))),before);
 const revision=d.variantGeometryRevision;assert.equal(revision.removedBandTriangles,0);
 assert.equal(revision.removedForeEnd,1004);assert.equal(revision.removedPlate,68);assert.ok(revision.removedPurple>500);
 assert.ok(revision.bandVertices>500);assert.equal(JSON.stringify(revision.emblemSides),'[-1,1]');assert.equal(revision.reverseSideVerified,true);
 // Only the verified forward-lower band tip follows the corrected endcap.
 // Every other inherited position, and all Z registrations, remain exact.
 const sourcePosition=a.body.attributes.position,variantPosition=d.body.attributes.position;let fittedTipVertices=0;
 for(let i=0;i<sourcePosition.count;i++){
  const x=sourcePosition.getX(i),y=sourcePosition.getY(i),z=sourcePosition.getZ(i);assert.equal(variantPosition.getZ(i),z);
  if(x!==variantPosition.getX(i)||y!==variantPosition.getY(i)){
   assert.ok(z>.1243&&z<.15&&y<.10725&&y>.0589,'only the verified front-lower band tip moves');fittedTipVertices++;
  } else {
   assert.deepEqual(Array.from(new Uint8Array(variantPosition.array.buffer,variantPosition.array.byteOffset+i*12,12)),Array.from(new Uint8Array(sourcePosition.array.buffer,sourcePosition.array.byteOffset+i*12,12)),'non-target position bytes');
  }
 }
 assert.equal(fittedTipVertices,104);assert.equal(revision.frontBandTipVertices,104);
 const retained=new Set(Array.from(d.body.index.array)),ac=a.body.attributes.color,ap=a.body.attributes.position,yellow=new f.K.THREE.Color('#efbf2a');let preservedBandFaces=0;
 for(let i=0;i<a.body.index.count;i+=3){
  const ids=Array.from(a.body.index.array.slice(i,i+3));
  if(ids.every(j=>Math.abs(ac.getX(j)-yellow.r)<1e-6&&Math.abs(ac.getY(j)-yellow.g)<1e-6&&Math.abs(ac.getZ(j)-yellow.b)<1e-6&&ap.getY(j)>(ap.getZ(j)<0?.0584:.0589)&&ap.getZ(j)>-.04&&ap.getZ(j)<.15)){
   preservedBandFaces++;assert.ok(ids.every(j=>retained.has(j)),'HD-confirmed pink band retained');
  }
 }
 assert.equal(preservedBandFaces,872);
 assert.equal(triangles(d.parts.can.src).length,0,'old capsule no longer drawn');
 for(const n of ['ink','trigger','bolt','led']) {
  const ga=n==='ink'?a.ink:a.parts[n].src,gd=n==='ink'?d.ink:d.parts[n].src;
  assert.deepEqual(Array.from(gd.index.array),Array.from(ga.index.array));
  for(const key of Object.keys(ga.attributes))assert.deepEqual(Array.from(gd.attributes[key].array),Array.from(ga.attributes[key].array));
 }
 const skin=d.parts.variantSkin.src,cream=new f.K.THREE.Color('#eeeee7');let creamCount=0,normalOut=0,centers=new Set();
 for(let i=0;i<skin.attributes.position.count;i++)if(Math.abs(skin.attributes.color.getX(i)-cream.r)<1e-6&&skin.attributes.aMat.getX(i)===f.K.M.satin){
  creamCount++;const outward=Math.sign(skin.attributes.position.getX(i))*skin.attributes.normal.getX(i);assert.ok(outward>0,'each plate normal faces its own side');normalOut+=outward;
  assert.equal(skin.attributes.aMat.getX(i),f.K.M.satin);
 }
 assert.equal(creamCount,9024);console.log({normalOut});assert.ok(normalOut>0,'both plates face outward');
 for(let i=0;i<skin.index.count;i+=3) {
  const ids=Array.from(skin.index.array.slice(i,i+3));
  if(!ids.every(j=>Math.abs(skin.attributes.color.getX(j)-cream.r)<1e-6&&skin.attributes.aMat.getX(j)===f.K.M.satin))continue;
  const v=ids.map(j=>[skin.attributes.position.getZ(j)-.038,skin.attributes.position.getY(j)-(.11/120*117)]);
  const cross=(a,b)=>a[0]*b[1]-a[1]*b[0],signs=v.map((a,k)=>cross(a,v[(k+1)%3]));
  if(signs.every(x=>x>=-1e-12)||signs.every(x=>x<=1e-12))centers.add(Math.sign(skin.attributes.position.getX(ids[0])));
 }
 assert.equal(centers.size,2,'solid filled center on both sides');
 let printed=0;for(let i=0;i<skin.attributes.position.count;i++)if(skin.attributes.aMat.getX(i)===f.K.M.print){
  printed++;assert.ok(Math.sign(skin.attributes.position.getX(i))*skin.attributes.normal.getX(i)>0,'wordmark faces outward');
 }assert.equal(printed,117*4*2,'pixel-traced wordmark on both sides');assert.ok(revision.removedOldPins>0);
 console.log(JSON.stringify({revision,baseBodyTriangles:a.body.index.count/3,variantBodyTriangles:d.body.index.count/3,newShellAndEmblemTriangles:skin.index.count/3,baseCanTriangles:a.parts.can.src.index.count/3,creamVertices:creamCount,normalOut}));
 if(process.env.TENTATEK_GEOMETRY_EXPORT)fs.writeFileSync(process.env.TENTATEK_GEOMETRY_EXPORT,JSON.stringify(Object.fromEntries([['base',a],['corrected',d]].map(([name,model])=>[name,channels(model).map(([n,g])=>({n,p:Array.from(g.attributes.position.array),c:Array.from(g.attributes.color.array),idx:Array.from(g.index.array)}))]))));
});

test('wordmark stays surface-close, outward and occluded from the upper capture camera',async()=>{
 const f=await load(),d=f.VARIANT_MODELS.Shooter_Normal_01.build(fresh(f.K,'shooter')),T=f.K.THREE;
 const meshes=channels(d).map(([name,g])=>{const m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.name=name;m.updateMatrixWorld(true);return m;});
 const bounds=new T.Box3();for(const m of meshes){m.geometry.computeBoundingBox();bounds.union(m.geometry.boundingBox);}
 const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),span=Math.max(...size.toArray()),g=d.parts.variantSkin.src;
 const tankGeo=g.clone().setIndex(Array.from(g.index.array.slice(0,d.variantGeometryRevision.tankTriangleCount*3))),tank=new T.Mesh(tankGeo,new T.MeshBasicMaterial({side:T.DoubleSide}));tank.updateMatrixWorld(true);let actualMin=Infinity,actualMax=0;
 const data={};for(const [view,dir]of [['front',[-1,.3,.5]],['upper',[-.6,1,.6]],['opposite',[1,.3,.5]]]) {
  const camera=center.clone().add(new T.Vector3(...dir).normalize().multiplyScalar(span*2.5)),counts={visible:0,hidden:0,backFacingVisible:0,visibleSides:{},minClearance:Infinity,maxClearance:0};
  for(let i=0;i<g.index.count;i+=3){const ids=Array.from(g.index.array.slice(i,i+3));if(!ids.every(j=>g.attributes.aMat.getX(j)===f.K.M.print))continue;
   const pt=new T.Vector3(),normal=new T.Vector3();for(const j of ids){pt.add(new T.Vector3().fromBufferAttribute(g.attributes.position,j));normal.add(new T.Vector3().fromBufferAttribute(g.attributes.normal,j));}pt.multiplyScalar(1/3);normal.normalize();
   const ray=new T.Raycaster(camera,pt.clone().sub(camera).normalize()),hits=ray.intersectObjects(meshes),dist=camera.distanceTo(pt);
   const visible=hits.length&&hits[0].distance>=dist-.00001;
   if(visible){counts.visible++;counts.visibleSides[Math.sign(pt.x)]=(counts.visibleSides[Math.sign(pt.x)]||0)+1;if(normal.dot(camera.clone().sub(pt))<0)counts.backFacingVisible++;}else counts.hidden++;
   if(view==='front'){const normalRay=new T.Vector3(pt.x,pt.y-117*.11/120,0).normalize(),rayOrigin=pt.clone().addScaledVector(normalRay,.01),contact=new T.Raycaster(rayOrigin,normalRay.clone().negate()).intersectObject(tank);assert.ok(contact.length,'wordmark has tank beneath it');const gap=contact[0].distance-.01;actualMin=Math.min(actualMin,gap);actualMax=Math.max(actualMax,gap);}
   const R=52*.11/120,cy=117*.11/120,rad=Math.sqrt(pt.x*pt.x+(pt.y-cy)**2),gap=rad-R;counts.minClearance=Math.min(counts.minClearance,gap);counts.maxClearance=Math.max(counts.maxClearance,gap);
  }data[view]=counts;
 }assert.equal(data.upper.visible,0,'upper camera cannot see through tank to either wordmark');for(const x of Object.values(data))assert.equal(x.backFacingVisible,0);assert.ok(actualMin>0&&actualMax<.0006,'wordmark is outside actual triangulated tank and less than0.6mm away');console.log('WORDMARK_OCCLUSION',JSON.stringify({views:data,actualSurfaceGap:{min:actualMin,max:actualMax}}));
});

test('Tentatek verified front-lower outer band has positive bounded clearance from its actual tank',async()=>{
 const f=await load(),T=f.K.THREE,a=f.A.shooter.build(fresh(f.K,'shooter')),d=f.VARIANT_MODELS.Shooter_Normal_01.build(fresh(f.K,'shooter'));
 const tank=d.parts.variantSkin.src.clone();tank.setIndex(Array.from(tank.index.array.slice(0,d.variantGeometryRevision.tankTriangleCount*3)));
 const material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(tank,material);mesh.updateMatrixWorld(true);
 const p=d.body.attributes.position,n=a.body.attributes.normal,c=d.body.attributes.color,pink=new T.Color('#ed3886'),cy=.10725;let samples=0;
 try{for(let i=0;i<a.body.attributes.position.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(z<=.1243||z>=.15||y>=cy||y<=.0589)continue;
  if(Math.abs(c.getX(i)-pink.r)>1e-6||Math.abs(c.getY(i)-pink.g)>1e-6||Math.abs(c.getZ(i)-pink.b)>1e-6)continue;
  const dir=new T.Vector3(x,y-cy,0).normalize();if(n.getX(i)*dir.x+n.getY(i)*dir.y<=.7)continue;
  const hit=new T.Raycaster(new T.Vector3(0,cy,z).addScaledVector(dir,.2),dir.clone().negate()).intersectObject(mesh)[0];assert.ok(hit);
  const gap=Math.hypot(x,y-cy)-Math.hypot(hit.point.x,hit.point.y-cy);
  assert.ok(gap>=.0025&&gap<=.004,`front outer band clearance ${gap}`);samples++;
 }assert.equal(samples,24);}finally{tank.dispose();material.dispose();dispose(a);dispose(d);}
});
