import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fixture } from './source-fixture.mjs';
let loaded;
const production=()=>loaded??=fixture({extraExports:`
export { FOLLOWUP_MODELS as SQUIFFER_VARIANTS } from './patches/splatoon3/runtime/weapon-models/variants-squiffer-v2-followup.mjs';
export { MODELS as CHARGERS } from './patches/splatoon3/runtime/weapon-models/chargers.mjs';`});
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
