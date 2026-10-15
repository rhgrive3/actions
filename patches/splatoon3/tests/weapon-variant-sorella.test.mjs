import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {fixture} from './source-fixture.mjs';
let spec,base,THREE;
const fresh=()=>({kind:'shooter',parts:{}});
test.before(async()=>{
 const f=await fixture({extraExports:`export {weaponModelSpec} from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
 THREE=f.THREE;spec=f.weaponModelSpec('Shelter_Normal_01');base=f.weaponModelSpec('s3-shelter-normal');
 assert.ok(spec&&base);assert.equal(spec.sourceRow,'Shelter_Normal_01');assert.equal(spec.baseId,'s3-shelter-normal');
});
const geos=d=>[d.body,d.ink,...Object.values(d.parts).map(p=>p.src)];
const digest=g=>crypto.createHash('sha256').update(Buffer.from(g.attributes.position.array.buffer)).update(Buffer.from(g.index.array.buffer)).digest('hex');
const wholeDigest=g=>{const h=crypto.createHash('sha256');for(const a of Object.values(g.attributes))h.update(Buffer.from(a.array.buffer));return h.update(Buffer.from(g.index.array.buffer)).digest('hex');};
test('only new variant; current base and ownership anchors retained',()=>{
 const b=base.build(fresh()),before=geos(b).map(wholeDigest),d=spec.build(fresh());assert.notEqual(spec,base);assert.equal(spec.animate,base.animate);
 assert.deepEqual(d.muzzle,b.muzzle);assert.deepEqual(d.gripL,b.gripL);assert.deepEqual(Object.keys(d.parts),Object.keys(b.parts));assert.equal(digest(d.body),digest(b.body));assert.equal(digest(d.parts.trigger.src),digest(b.parts.trigger.src));
 for(const k of Object.keys(b.parts)){assert.equal(d.parts[k].mat,b.parts[k].mat);assert.deepEqual(d.parts[k].pivot,b.parts[k].pivot);}assert.deepEqual(geos(b).map(wholeDigest),before);
});
test('deterministic finite geometry; no extra draw channels, bounded triangles',()=>{
 const b=base.build(fresh()),d=spec.build(fresh()),again=spec.build(fresh());assert.deepEqual(geos(d).map(digest),geos(again).map(digest));
 let tris=0,bytes=0;for(const g of geos(d)){tris+=g.index.count/3;bytes+=g.index.array.byteLength;for(const a of Object.values(g.attributes)){bytes+=a.array.byteLength;for(const v of a.array)assert.ok(Number.isFinite(v));}for(const i of g.index.array)assert.ok(i<g.attributes.position.count);}
 const baseTris=geos(b).reduce((n,g)=>n+g.index.count/3,0);assert.ok(tris<=baseTris);assert.equal(geos(d).filter(g=>g.index.count).length,geos(b).filter(g=>g.index.count).length);console.log(JSON.stringify({triangles:tris,baseTriangles:baseTris,bytes,nonemptyChannels:geos(d).filter(g=>g.index.count).length}));
});
test('native opening, closing, naked and launched visibility stay identical',()=>{
 const def=spec.build(fresh());def.modelId='s3-shelter-normal';const w=()=>({def,ps:{},parts:Object.fromEntries(Object.keys(def.parts).map(k=>[k,new THREE.Object3D()]))});const a=w(),b=w();
 for(const canopy of [{open:true,launched:false},{open:false,launched:false},{open:true,launched:true},null])for(let i=0;i<60;i++){
  const state={dt:1/60,runner:{catalogState:{canopy,naked:canopy?0:1}}};base.animate(a,state);spec.animate(b,state);assert.deepEqual(a.ps,b.ps);for(const k of ['canopy','canopyInk']){assert.deepEqual(a.parts[k].scale,b.parts[k].scale);assert.equal(a.parts[k].visible,b.parts[k].visible);}
 }
});

test('fixed black center/yellow tips and live team hem occupy separate native channels',()=>{
 const d=spec.build(fresh()),fixed=d.parts.canopy.src,ink=d.parts.canopyInk.src;
 const near=(c,i,h)=>{const k=new THREE.Color(h);return Math.abs(c.getX(i)-k.r)<1e-6&&Math.abs(c.getY(i)-k.g)<1e-6&&Math.abs(c.getZ(i)-k.b)<1e-6;};
 let black=0,yellow=0;for(let i=0;i<fixed.attributes.color.count;i++){
  if(near(fixed.attributes.color,i,'#242528'))black++;
  if(near(fixed.attributes.color,i,'#f2ca24')){yellow++;assert.ok(Math.hypot(fixed.attributes.position.getX(i),fixed.attributes.position.getY(i)-.075)>.043);}
 }
 assert.ok(black>200);assert.ok(yellow>100);assert.equal(d.parts.canopy.mat,'body');assert.equal(d.parts.canopyInk.mat,'ink');
 for(let i=0;i<ink.attributes.color.count;i++){assert.ok(near(ink.attributes.color,i,'#69cbb1'));const r=Math.hypot(ink.attributes.position.getX(i),ink.attributes.position.getY(i)-.075);assert.ok(r>.026&&r<.045);}
 const fallback=base.build(fresh());assert.ok(!Array.from({length:fallback.parts.canopy.src.attributes.color.count},(_,i)=>near(fallback.parts.canopy.src.attributes.color,i,'#242528')).some(Boolean),'base negative control lacks variant center');
});
