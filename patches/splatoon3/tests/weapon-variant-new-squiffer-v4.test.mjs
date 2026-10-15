import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './source-fixture.mjs';
// Pinned geometry hashes from frozen v3 source; no superseded runtime import.
const V3_BASELINE={"ink":"898341682e11ed49f4d6f2003d258e208ec8d5f34750b643dfd3f4118193ffbe","glow":"e3e39d5cd2c73bbff01f117495720e9ec0b2030a3d502b63892ca2f91fbebcc7","parts":{"trigger":"7606b0f84bfe8ae40da838695f2b1e6042854ba8865087244c4a8a0e8f82f3e4","ports":"cc1b3a242e54eb3af216eda3f8a4dde297e4efc8c57fe0201a227a27c1756bad"},"colors":["0.014444,0.019382,0.019382","0.014444,0.019382,0.020289","0.017642,0.023153,0.022174","0.135633,0.152926,0.162029","0.187821,0.309469,0.215861","0.191202,0.095307,0.068478","0.258183,0.287441,0.283149","0.467784,0.584078,0.610496","0.571125,0.038204,0.026241","0.737910,0.752942,0.715693","0.830770,0.533276,0.040915"]};
let loaded;
const production=()=>loaded??=(async()=>{
 const source=fs.readFileSync(new URL('../runtime/weapon-models/variants-squiffer-v4-followup.mjs',import.meta.url),'utf8');
 const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
 const sourceHash=sha(source);
 // Trace metadata is source-only data, bound to the same model input as the
 // emitted registry. All seven geometry/native assertions execute registry code.
 assert.equal(sourceHash,'288505b0dbe7991f487239edf73804af1c264322c1bdf6d9614d100ac278c9ff');
 const trace=source.match(/export const TANK_TRACE=Object\.freeze\((\{[^\n]+\})\);/);
 assert.ok(trace,'registered trace metadata must exist');
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  const registryHash=sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs')));
  assert.equal(manifest.files['patch/runtime/weapon-models/variants-squiffer-v4-followup.mjs'],sourceHash);
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],registryHash);
  console.log('SQUIFFER_V4_EMITTED_REGISTRY_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash,sourceHash,registryHash}));
 }
 const f=await fixture({extraExports:`export {weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
 return {...f,SQUIFFER_VARIANTS:{Charger_Quick_01:f.weaponModelSpec('Charger_Quick_01')},CHARGERS:{'s3-charger-quick':f.weaponModelSpec('s3-charger-quick')},TANK_TRACE:JSON.parse(trace[1])};
})();
const fresh=()=>({kind:'charger',parts:{}});
const hash=g=>crypto.createHash('sha256').update(Buffer.concat([...Object.values(g.attributes).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),Buffer.from(g.index.array.buffer)])).digest('hex');
const shape=d=>[d.body,d.ink,d.glow,...Object.values(d.parts).map(p=>p.src)].filter(Boolean).map(hash);
const bounds=g=>{g.computeBoundingBox();return g.boundingBox;};
test('New Squiffer rebuild is deterministic and preserves Classic geometry isolation',async()=>{
 const f=await production(),base=f.CHARGERS['s3-charger-quick'],spec=f.SQUIFFER_VARIANTS.Charger_Quick_01;
 const b=base.build(fresh()),before=shape(b),d=spec.build(fresh());
 assert.deepEqual(shape(base.build(fresh())),before);assert.deepEqual(shape(b),before);
 assert.deepEqual(shape(d),shape(spec.build(fresh())));assert.notDeepEqual(shape(d),before);
 assert.equal(spec.hold,base.hold);assert.equal(spec.animate,base.animate);
 assert.deepEqual(d.muzzle.toArray(),b.muzzle.toArray());assert.deepEqual(d.gripL.pos.toArray(),b.gripL.pos.toArray());
 assert.deepEqual(Object.keys(d.parts),Object.keys(b.parts));assert.equal(hash(d.glow),hash(b.glow));
 for(const n of Object.keys(b.parts))assert.deepEqual(d.parts[n].pivot.toArray(),b.parts[n].pivot.toArray());
});
test('tank and barrel are fixed while collar, clips, muzzle and trigger use team ink',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh());
 assert.equal(d.parts.trigger.mat,'ink');assert.equal(d.parts.ports.mat,'lamp');
 const b=bounds(d.ink);assert.ok(b.min.z>-.1,'no old team-colored rear bottle');assert.ok(b.max.z>.67,'muzzle retains dynamic ink');
 const p=d.body.attributes.position;let rod=0,tank=0;
 for(let i=0;i<p.count;i++){if(p.getZ(i)<-.16)tank++;if(p.getZ(i)>.3&&Math.abs(p.getY(i)-.0504)<.007)rod++;}
 assert.ok(tank>100);assert.ok(rod>10);
});
test('flattened tank has planar side geometry and no old circular cap rings',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh()),p=d.body.attributes.position,n=d.body.attributes.normal;
 let tank=0,planar=0,maxX=0;
 for(let i=0;i<p.count;i++)if(p.getZ(i)<-.16){tank++;maxX=Math.max(maxX,Math.abs(p.getX(i)));if(Math.abs(n.getX(i))>.995)planar++;}
 assert.ok(planar>100);assert.ok(planar/tank>.15);assert.ok(maxX<.03,'old radius .045 tank/cap must not survive');
});
test('geometry attributes, index ranges and near-model budget remain valid',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh());let triangles=0;
 for(const g of [d.body,d.ink,d.glow,...Object.values(d.parts).map(p=>p.src)].filter(Boolean)){
  triangles+=g.index.count/3;
  for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));
  for(const i of g.index.array)assert.ok(i>=0&&i<g.attributes.position.count);
 }
 assert.ok(triangles<16000);console.log(JSON.stringify({newSquifferTriangles:triangles,inkVertices:d.ink.attributes.position.count,fixedVertices:d.body.attributes.position.count}));
});

test('v2 curved grip surrounds the unchanged hand axis with a longer visible heel',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh()),p=d.body.attributes.position,c=d.body.attributes.color;
 const white=new f.THREE.Color('#b6c9cd');let minY=Infinity,atAxis=0;
 for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-white.r)<.001&&Math.abs(c.getY(i)-white.g)<.001&&p.getZ(i)>-.05&&p.getZ(i)<.03){minY=Math.min(minY,p.getY(i));if(Math.abs(p.getY(i))<.015)atAxis++;}
 assert.ok(minY<-.045,'heel must extend beyond short v1 grip');assert.ok(atAxis>0);
});

test('tank graphic retains registered source traces without invented textual glyphs',async()=>{
 const f=await production(),t=f.TANK_TRACE;assert.deepEqual(Array.from(t.sourceDimensions),[1812,1019]);
 assert.equal(t.burst.length,26);assert.equal(t.resolvedGlyphEdges.length,3);
 assert.ok(t.burst.every(p=>p[0]>=471&&p[0]<=562&&p[1]>=479&&p[1]<=580));
 const spans=t.burst.map(p=>Math.hypot(p[0]-516,p[1]-529));assert.ok(new Set(spans.map(v=>v.toFixed(1))).size>10,'asymmetric observed burst, not alternating regular radii');
});

test('v4 mold is geometry-only with unchanged ink, channels and native grip containment',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh());
 assert.equal(hash(d.ink),V3_BASELINE.ink);assert.equal(hash(d.glow),V3_BASELINE.glow);
 for(const k of Object.keys(d.parts))assert.equal(hash(d.parts[k].src),V3_BASELINE.parts[k]);
 const mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 const hit=new f.THREE.Raycaster(new f.THREE.Vector3(-.2,0,0),new f.THREE.Vector3(1,0,0)).intersectObject(mesh);
 assert.equal(hit.length,2);assert.ok(hit[0].point.x<-.01&&hit[1].point.x>.01);
 const col=d.body.attributes.color,white=new f.THREE.Color('#b6c9cd');
 for(const h of hit){const i=d.body.index.getX(h.faceIndex*3);assert.ok(Math.abs(col.getX(i)-white.r)<1e-6);}
 const colors=g=>{const c=g.attributes.color;return new Set(Array.from({length:c.count},(_,i)=>[c.getX(i),c.getY(i),c.getZ(i)].map(x=>x.toFixed(6)).join(',')));};
 assert.deepEqual([...colors(d.body)].sort(),V3_BASELINE.colors,'no palette change');
});
test('receiver front is a tapered molded section rather than constant thickness slab',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh()),p=d.body.attributes.position,c=d.body.attributes.color,col=new f.THREE.Color('#789780');let root=0,tip=0;
 for(let i=0;i<p.count;i++)if(Math.abs(c.getX(i)-col.r)<1e-6&&p.getY(i)<.03){
  if(p.getZ(i)>.05&&p.getZ(i)<.08)root=Math.max(root,Math.abs(p.getX(i)));
  if(p.getZ(i)>.21&&p.getZ(i)<.24)tip=Math.max(tip,Math.abs(p.getX(i)));
 }
 assert.ok(root>.014);assert.ok(tip<root*.7);assert.ok(tip>.005);
});

test('registered tank print follows molded shell with bounded surface clearance',async()=>{
 const f=await production(),d=f.SQUIFFER_VARIANTS.Charger_Quick_01.build(fresh()),g=d.body,p=g.attributes.position,c=g.attributes.color;
 const shellColor=new f.THREE.Color('#8b9291'),colors=['#dfe1dc','#242a29','#ebc139','#c7372d','#202627'].map(x=>new f.THREE.Color(x));
 const matches=(i,col)=>Math.abs(c.getX(i)-col.r)<1e-6&&Math.abs(c.getY(i)-col.g)<1e-6&&Math.abs(c.getZ(i)-col.b)<1e-6;
 const ids=[];for(let i=0;i<g.index.count;i+=3)if(matches(g.index.getX(i),shellColor))ids.push(g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2));
 const shell=g.clone();shell.setIndex(ids);const mesh=new f.THREE.Mesh(shell,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 let samples=0,max=0,min=Infinity;
 for(let i=0;i<p.count;i++)if(colors.some(col=>matches(i,col))){
  const x=p.getX(i),side=Math.sign(x),hits=new f.THREE.Raycaster(new f.THREE.Vector3(side*.1,p.getY(i),p.getZ(i)),new f.THREE.Vector3(-side,0,0)).intersectObject(mesh);
  assert.ok(hits.length,'print must have shell support');const gap=Math.abs(x)-Math.abs(hits[0].point.x);max=Math.max(max,gap);min=Math.min(min,gap);samples++;
  assert.ok(gap>-.00002&&gap<.0008,`raised or buried print: ${gap}`);
 }
 assert.ok(samples>100);console.log(JSON.stringify({printSamples:samples,minClearance:min,maxClearance:max}));
});
