import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fixture } from './source-fixture.mjs';
let loaded;
const production=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
 adaptRuntime:(rel,source)=>rel.endsWith('/weapon-models/stringers.mjs')?source+'\nexport {sweptRect,cubicLimb,smoothLimb,TRI_LIMB_CONTROLS,REEF_LIMB_SECTIONS};':source,
 extraExports:"export {sweptRect,cubicLimb,smoothLimb,TRI_LIMB_CONTROLS,REEF_LIMB_SECTIONS} from './patches/splatoon3/runtime/weapon-models/stringers.mjs';"});
test('both mirrored swept sections have outward winding and retain normal thickness at the hooked ends',async()=>{
 const f=await production();
 for(const sign of[-1,1]){
  const stations=f.smoothLimb(sign,f.REEF_LIMB_SECTIONS,24);let g;
  f.sweptRect({add:geo=>{g=geo;}},stations,'#ffffff');
  const p=g.attributes.position,n=g.attributes.normal,ix=g.index.array;let volume=0;
  for(let j=0;j<ix.length;j+=3){const a=new f.THREE.Vector3().fromBufferAttribute(p,ix[j]),b=new f.THREE.Vector3().fromBufferAttribute(p,ix[j+1]),c=new f.THREE.Vector3().fromBufferAttribute(p,ix[j+2]);volume+=a.dot(b.cross(c))/6;}
  assert.ok(volume>0.0003,'outward signed volume '+sign+' '+volume);
  const k=stations.length-1,a=stations[k-1],b=stations[k],dy=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dy,dz);
  const projected=[];for(let j=k*8;j<k*8+8;j++)projected.push((p.getY(j)-.085-b[0])*(-dz/len)+(p.getZ(j)-b[1])*(dy/len));
  assert.ok(Math.abs(Math.max(...projected)-Math.min(...projected)-.028)<1e-7,'distal normal thickness');
  // Every side has actual faces; the eight vertices are a bevelled solid section,
  // not two disconnected planar sheets or a negative-scale mirrored backface.
  assert.equal(ix.length/3,24*16+12);
  for(let j=0;j<n.count;j++)assert.ok(Math.hypot(n.getX(j),n.getY(j),n.getZ(j))>.99);
 }
});
test('Tri keeps its endpoints but has continuous 7–9 percent chord sag and a tapered wooden tip',async()=>{
 const f=await production(),s=f.cubicLimb(1,f.TRI_LIMB_CONTROLS,18,t=>.050-.035*Math.pow(t,1.05),t=>.025-.0145*t),a=s[0],b=s.at(-1),dy=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dy,dz);
 const sag=Math.max(...s.map(p=>Math.abs(dy*(p[1]-a[1])-dz*(p[0]-a[0]))/length))/length;
 assert.ok(sag>.075&&sag<.09,'sag '+sag);assert.ok(Math.abs(b[2]/a[2]-.3)<1e-12);
 assert.deepEqual(Array.from(b.slice(0,2)),[.4,-.24]);
 console.log('TWO_BOW_SECTION_METRICS '+JSON.stringify({triSagRatio:sag,triTipRootWidth:b[2]/a[2],reefTipNormalThickness:.028,reefTipOldEffectiveThickness:.0086}));
});
test('the green Wellstring builder and all existing motion remain byte-identical to the reviewed baseline',()=>{
 const s=fs.readFileSync(new URL('../runtime/weapon-models/stringers.mjs',import.meta.url),'utf8'),m=s.indexOf('// ------------------------------------------------------------------------------------------ motion'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 assert.equal(hash(s.slice(s.indexOf('function wellstring(d){'),m)),'61191d87e49d8b9e188c54fd374eb1498d1543e763514c3fcb0e70fea6e68cb5');
 assert.equal(hash(s.slice(m)),'f1c54e1216a8603da0d910f751087f52e80113173ea28b74cbc59b1cebf600ad');
});
