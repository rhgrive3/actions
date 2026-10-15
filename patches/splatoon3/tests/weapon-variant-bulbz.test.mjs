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
  assert.equal(manifest.files['patch/runtime/weapon-models/variants-bulbz-followup.mjs'],sha(fs.readFileSync(new URL('../runtime/weapon-models/variants-bulbz-followup.mjs',import.meta.url))));
  assert.equal(manifest.artifacts['patches/splatoon3/runtime/weapon-models/registry.mjs'],sha(fs.readFileSync(path.join(site,'patches/splatoon3/runtime/weapon-models/registry.mjs'))));
  console.log('BULBZ_EMITTED_REGISTRY_RECEIPT',JSON.stringify({contentHash:manifest.contentHash,inputHash:manifest.inputHash}));
 }
 const f=await fixture({extraExports:`export {weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
 return {...f,BULBZ:{Stringer_Normal_02:f.weaponModelSpec('Stringer_Normal_02')},STRINGERS:{'s3-stringer-normal':f.weaponModelSpec('s3-stringer-normal')}};
})();
const fresh=()=>({kind:'charger',parts:{}});
const hash=(g,names=Object.keys(g.attributes))=>crypto.createHash('sha256').update(Buffer.concat([...names.map(n=>g.attributes[n]).map(a=>Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)),Buffer.from(g.index.array.buffer)])).digest('hex');
const shape=d=>[d.body,d.ink,d.glow,...Object.values(d.parts).map(p=>p.src)].filter(Boolean).map(g=>hash(g));
test('Bulbz variant is deterministic, isolated and preserves native anchors and motion spec',async()=>{
 const f=await production(),base=f.STRINGERS['s3-stringer-normal'],s=f.BULBZ.Stringer_Normal_02,b=base.build(fresh()),before=shape(b),d=s.build(fresh());
 assert.deepEqual(shape(b),before);assert.deepEqual(shape(base.build(fresh())),before);assert.deepEqual(shape(s.build(fresh())),shape(d));assert.notDeepEqual(shape(d),before);
 assert.deepEqual(d.muzzle.toArray(),b.muzzle.toArray());assert.deepEqual(d.gripL.pos.toArray(),b.gripL.pos.toArray());assert.deepEqual(d.bowCfg,b.bowCfg);assert.equal(s.animate,base.animate);assert.equal(s.hold,base.hold);
 assert.equal(hash(d.glow),hash(b.glow));assert.deepEqual(Object.keys(d.parts),Object.keys(b.parts));
 for(const n of Object.keys(d.parts)){assert.deepEqual(d.parts[n].pivot.toArray(),b.parts[n].pivot.toArray());assert.equal(hash(d.parts[n].src,['position','normal']),hash(b.parts[n].src,['position','normal']));}
});
test('black strings keep exact native geometry while team ink is confined inside three bores',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh());
 for(const n of ['string','stringL'])assert.equal(d.parts[n].mat,'body');
 const p=d.ink.attributes.position;for(let i=0;i<p.count;i++)assert.ok(p.getZ(i)>.125,'ink must not cover limb, reel or tube exterior');
 const ys=new Set();for(let i=0;i<p.count;i++)ys.add(Math.round((p.getY(i)-.085)/.1));assert.deepEqual([...ys].sort(),[-1,0,1]);
});
test('flat limb bands preserve exact trapezoid area and forward normals independent of tessellation',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh()),g=d.body,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;
 // Each band is a straight ruled trapezoid: width .011, tip taper .76,
 // length hypot(.34,.2). Vertex count is not a visual coverage invariant.
 const length=Math.hypot(.34,.2),expected=.011*(1+.76)/2*length;
 for(const col of ['#f06154','#4ce3a5','#51ddeb']){
  const rgb=new f.THREE.Color(col),areas={upper:0,lower:0};
  for(let j=0;j<g.index.count;j+=3){
   const ids=[0,1,2].map(k=>g.index.getX(j+k));
   if(!ids.every(i=>Math.abs(c.getX(i)-rgb.r)<1e-6&&Math.abs(c.getY(i)-rgb.g)<1e-6&&Math.abs(c.getZ(i)-rgb.b)<1e-6&&Math.abs(p.getX(i))<.018&&Math.abs(p.getY(i)-.085)>.05999))continue;
   const side=p.getY(ids[0])>.085?'upper':'lower';
   for(const i of ids){assert.ok(Math.abs(n.getX(i))<1e-5);assert.ok(Math.abs(n.getZ(i)-.34/length)<1e-5);assert.ok(Math.abs(n.getY(i)-(side==='upper'?1:-1)*.2/length)<1e-5);}
   const vs=ids.map(i=>new f.THREE.Vector3().fromBufferAttribute(p,i));areas[side]+=vs[1].sub(vs[0]).cross(vs[2].sub(vs[0])).length()/2;
  }
  for(const side of ['upper','lower'])assert.ok(Math.abs(areas[side]-expected)<1e-9,`${col} ${side}: full band coverage`);
 }
});
test('three colored bulb capsules protrude on exactly one limb',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh()),p=d.body.attributes.position,c=d.body.attributes.color;
 for(const col of ['#f06154','#4ce3a5','#51ddeb']){const rgb=new f.THREE.Color(col);let count=0,maxX=0;
  for(let i=0;i<c.count;i++)if(p.getX(i)>.028&&Math.abs(c.getX(i)-rgb.r)<1e-6&&Math.abs(c.getY(i)-rgb.g)<1e-6){assert.ok(p.getY(i)<-.2);maxX=Math.max(maxX,p.getX(i));count++;}
  assert.ok(count>20);assert.ok(maxX>.055);
 }
});
test('charge/release string motion remains identical at30/60/120Hz',async()=>{
 const f=await production(),base=f.STRINGERS['s3-stringer-normal'],s=f.BULBZ.Stringer_Normal_02;
 const make=spec=>{const def=spec.build(fresh()),w={def,ps:{},parts:{}};for(const [n,p]of Object.entries(def.parts)){const g=new f.THREE.Group();g.position.copy(p.pivot);g.userData.rest=p.pivot.clone();w.parts[n]=g;}return w;};
 const snapshot=w=>JSON.stringify(Object.fromEntries(Object.entries(w.parts).map(([n,p])=>[n,[p.position.toArray(),p.rotation.toArray(),p.scale.toArray()]])));
 for(const hz of [30,60,120]){const a=make(base),b=make(s);for(let i=0;i<hz*2;i++){const t=i/hz,st={dt:1/hz,charge:t<1?t:0,sinceRelease:t<1?99:t-1};base.animate(a,st);s.animate(b,st);assert.equal(snapshot(a),snapshot(b));}}
});
test('finite indexed attributes remain under near-model triangle budget',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh());let triangles=0;
 for(const g of [d.body,d.ink,d.glow,...Object.values(d.parts).map(p=>p.src)]){triangles+=g.index.count/3;for(const a of Object.values(g.attributes))for(const v of a.array)assert.ok(Number.isFinite(v));for(const i of g.index.array)assert.ok(i<g.attributes.position.count);}
 assert.ok(triangles<16000);console.log(JSON.stringify({bulbzTriangles:triangles,bodyVertices:d.body.attributes.position.count,inkVertices:d.ink.attributes.position.count}));
});

test('pale structural braces continuously join centre and side forward collars',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh()),g=d.body,mesh=new f.THREE.Mesh(g,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 const pale=new f.THREE.Color('#b9c5c2'),color=g.attributes.color;
 for(const side of [-1,1])for(const [z,dy]of [[.127,.061],[.118,.066],[.108,.070],[.098,.076]]){
  const hits=new f.THREE.Raycaster(new f.THREE.Vector3(-.1,.085+side*dy,z),new f.THREE.Vector3(1,0,0)).intersectObject(mesh);
  assert.ok(hits.some(h=>{const i=g.index.getX(h.faceIndex*3);return Math.abs(color.getX(i)-pale.r)<1e-6&&Math.abs(color.getY(i)-pale.g)<1e-6;}),`missing pale brace ${side} ${z}`);
 }
});
test('front dark tube caps step inward while the native bore axes stay clear',async()=>{
 const f=await production(),d=f.BULBZ.Stringer_Normal_02.build(fresh()),mesh=new f.THREE.Mesh(d.body,new f.THREE.MeshBasicMaterial({side:f.THREE.DoubleSide}));mesh.updateMatrixWorld(true);
 for(const [y,r,z1]of [[.085,.052,.175],[.185,.021,.135],[-.015,.021,.135]]){
  const hits=new f.THREE.Raycaster(new f.THREE.Vector3(-.1,y,z1-.001),new f.THREE.Vector3(1,0,0)).intersectObject(mesh);assert.ok(hits.length>=4);
  const xs=hits.map(h=>Math.abs(h.point.x));assert.ok(Math.max(...xs)<r*.95,'front cap must step inward from main shell');assert.ok(Math.min(...xs)>r*.64,'native open bore retained');
 }
});
