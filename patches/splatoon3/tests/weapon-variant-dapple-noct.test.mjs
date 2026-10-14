import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from './source-fixture.mjs';
let loaded;
const production=()=>loaded??=(async()=>{
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
  const sourceHash=sha(fs.readFileSync(new URL('../runtime/weapon-models/variants-dapple-noct-followup.mjs',import.meta.url)));
  const registryHash=sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs')));
  assert.equal(manifest.files['patch/runtime/weapon-models/variants-dapple-noct-followup.mjs'],sourceHash);
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],registryHash);
  console.log('NOCT_EMITTED_REGISTRY_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,registryHash}));
 }
 const f=await fixture({extraExports:`export {weaponVariantSpec,weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';export {M} from './patches/splatoon3/runtime/weapon-models/kit.mjs';`});
 return {...f,NOCT:{Maneuver_Short_02:f.weaponVariantSpec('Maneuver_Short_02')},DUALIES:{'s3-maneuver-short':f.weaponModelSpec('s3-maneuver-short')}};
})();
const fresh=()=>({kind:'dualies',dual:true,parts:{},gripR:{pos:[0,0,0]},gripL:{pos:[0,0,0]}});
const hash=g=>crypto.createHash('sha256').update(Buffer.concat([...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),Buffer.from(g.index.array.buffer)])).digest('hex');
const shape=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)].map(hash);
test('NOC-T preserves native identity, muzzle, trigger, grips, dual flag and base isolation',async()=>{
 const f=await production(),b=f.DUALIES['s3-maneuver-short'],v=f.NOCT.Maneuver_Short_02,base=b.build(fresh()),before=shape(base),d=v.build(fresh());
 assert.deepEqual(shape(base),before);assert.deepEqual(shape(b.build(fresh())),before);assert.deepEqual(shape(v.build(fresh())),shape(d));assert.notDeepEqual(shape(d),before);
 assert.equal(d.dual,true);assert.deepEqual(d.muzzle.toArray(),base.muzzle.toArray());assert.deepEqual(d.gripR,base.gripR);assert.deepEqual(d.gripL,base.gripL);
 assert.equal(v.animate,b.animate);assert.equal(v.hold,b.hold);assert.deepEqual(Object.keys(d.parts),Object.keys(base.parts));
 assert.equal(hash(d.parts.trigger.src),hash(base.parts.trigger.src));assert.deepEqual(d.parts.trigger.pivot.toArray(),base.parts.trigger.pivot.toArray());
});
test('team ink is confined to rear bristle bundles, upper white inlays stay fixed',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());d.ink.computeBoundingBox();assert.ok(d.ink.boundingBox.max.z<-.12);assert.ok(d.ink.boundingBox.min.y>.01);
 const c=d.body.attributes.color,p=d.body.attributes.position,white=new f.THREE.Color('#e4e8d9');let stripe=0;
 for(let i=0;i<c.count;i++)if(Math.abs(c.getX(i)-white.r)<1e-6&&Math.abs(c.getY(i)-white.g)<1e-6&&p.getY(i)>.075&&p.getY(i)<.105&&p.getZ(i)>-.03)stripe++;
 assert.ok(stripe>30);
});
test('large forward cup optic has yellow lens above distinct firing nozzle',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh()),p=d.body.attributes.position,c=d.body.attributes.color,yellow=new f.THREE.Color('#c8d171');let lens=0,minY=1,maxY=-1;
 for(let i=0;i<c.count;i++)if(Math.abs(c.getX(i)-yellow.r)<1e-6&&Math.abs(c.getY(i)-yellow.g)<1e-6){lens++;minY=Math.min(minY,p.getY(i));maxY=Math.max(maxY,p.getY(i));assert.ok(p.getZ(i)<.13);}
 assert.ok(lens>100);assert.ok(minY>.13);assert.ok(maxY-minY>.065);assert.equal(d.muzzle.y,.066);
});
test('lower skid retains two actual open windows, not painted black rectangles',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 for(const [z,y]of [[-.065,-.087],[-.02,-.087]]){
  const ray=new f.THREE.Raycaster(new f.THREE.Vector3(-.1,y,z),new f.THREE.Vector3(1,0,0));assert.equal(ray.intersectObject(mesh).length,0,`window ${z},${y}`);
 }
});
test('all attributes/indexes are finite, deterministic and within geometry budget',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());let triangles=0;
 for(const g of [d.body,d.ink,...Object.values(d.parts).map(p=>p.src)]){triangles+=g.index.count/3;for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));for(const i of g.index.array)assert.ok(i<g.attributes.position.count);}
 assert.ok(triangles<16000);console.log(JSON.stringify({noctTriangles:triangles,inkVertices:d.ink.attributes.position.count,bodyVertices:d.body.attributes.position.count}));
});

test('v2 compact broad brush, smooth grip and rounded upper openings retain real geometry',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());
 d.ink.computeBoundingBox();const b=d.ink.boundingBox;assert.ok(b.max.x-b.min.x>.033);assert.ok(b.min.z>-.195);assert.ok(b.max.z<-.12);
 const p=d.body.attributes.position,m=d.body.attributes.aMat;let gripVertices=0;
 for(let i=0;i<p.count;i++)if(p.getY(i)>-.05&&p.getY(i)<.035&&Math.abs(p.getZ(i))<.025&&Math.abs(p.getX(i))<.025){
  gripVertices++;assert.notEqual(m.getX(i),f.M.rubber,'grip must not use the rubber knurl surface');
 }assert.ok(gripVertices>100);
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 for(const [z,y] of [[-.017,.088],[.021,.085]])assert.equal(new f.THREE.Raycaster(new f.THREE.Vector3(-.1,y,z),new f.THREE.Vector3(1,0,0)).intersectObject(mesh).length,0);
});

test('grip shoulder remains continuous into the raised upper frame',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 for(const y of [.055,.060,.065,.070,.075])assert.ok(new f.THREE.Raycaster(new f.THREE.Vector3(-.1,y,0),new f.THREE.Vector3(1,0,0)).intersectObject(mesh).length>0,`air gap at shoulder y=${y}`);
});

test('dense upper-window occupancy preserves the published contour',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 // Golden c6bf79 side-ray mask: 1 mm grid around both windows, excluding
 // only the central frame spine where the shoulder intentionally joins.
 let mask='';
 for(let iy=74;iy<=103;iy++)for(let iz=-30;iz<=42;iz++){
  if(iz>-5&&iz<6)continue;
  mask+=new f.THREE.Raycaster(new f.THREE.Vector3(-.1,iy/1000,iz/1000),new f.THREE.Vector3(1,0,0)).intersectObject(mesh).length?'1':'0';
 }
 assert.equal(mask.length,1890);
 assert.equal(crypto.createHash('sha256').update(mask).digest('hex'),'aac82a873d849b9141906379ee09d9f121873e169fd66b7cd111a6ee2c590d76');
});

test('optic bracket foot continuously joins the reshaped front neck',async()=>{
 const f=await production(),d=f.NOCT.Maneuver_Short_02.build(fresh());
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 // Sample above the neck surface: old foot leaves whole cross-sections empty.
 for(let iy=85;iy<=98;iy++){
  let occupied=false;
  for(let iz=120;iz<=160;iz++)if(new f.THREE.Raycaster(new f.THREE.Vector3(-.1,iy/1000,iz/2000),new f.THREE.Vector3(1,0,0)).intersectObject(mesh).length){occupied=true;break;}
  assert.ok(occupied,`disconnected optic foot at y=${iy/1000}`);
 }
});
