import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fixture } from './source-fixture.mjs';
let loaded;
const production=()=>loaded??=fixture({fullRuntime:true,includeCharacter:true,productionComposition:true,
 adaptRuntime:(rel,source)=>rel.endsWith('/weapon-models/stringers.mjs')?source+'\nexport {sweptRect,cubicLimb,smoothLimb,laminateFace,castSection,REEF_CAST_SECTION,REEF_ROUND_SECTION,TRI_LIMB_CONTROLS,REEF_LIMB_SECTIONS};':source,
 extraExports:"export {sweptRect,cubicLimb,smoothLimb,laminateFace,castSection,REEF_CAST_SECTION,REEF_ROUND_SECTION,TRI_LIMB_CONTROLS,REEF_LIMB_SECTIONS} from './patches/splatoon3/runtime/weapon-models/stringers.mjs';\nexport {getWeaponDef} from './inkwave-public/src/game/character-weapons.js';\nexport {installMainWeaponCatalogRuntime} from './patches/splatoon3/runtime/main-weapon-catalog.mjs';"}).then(f=>{f.installMainWeaponCatalogRuntime(f.installedRuntime,f.profile);return f;});
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
test('Tri laminate stays on the same physical face for the upper and lower mirrored arms',async()=>{
 const f=await production(),arms=[];for(const side of[1,-1])arms.push(f.laminateFace(f.cubicLimb(side,f.TRI_LIMB_CONTROLS,18,t=>.050-.035*Math.pow(t,1.05),t=>.025-.0145*t),side));
 for(let i=0;i<arms[0].length;i++){assert.ok(Math.abs(arms[0][i][0]+arms[1][i][0])<1e-12);for(let k=1;k<4;k++)assert.equal(arms[0][i][k],arms[1][i][k]);}
});
test('REEF rear casting uses the existing nock channel and moves with the unchanged draw anchor',async()=>{
 const f=await production(),d=f.getWeaponDef('s3-stringer-short'),g=d.parts.nock.geo;g.computeBoundingBox();const size=g.boundingBox.getSize(new f.THREE.Vector3());assert.ok(size.y>.15&&size.x>.035);
 const pivot=d.parts.nock.pivot,p=new f.THREE.Object3D();p.position.copy(pivot);p.userData.rest=pivot.clone();const w={def:d,parts:{nock:p},ps:{}};
 d.animate(w,{charge:1,sinceRelease:99});assert.ok(Math.abs(p.position.z-pivot.z+.17)<1e-12);assert.equal(p.position.x,pivot.x);assert.equal(p.position.y,pivot.y);
 d.animate(w,{charge:0,sinceRelease:99});assert.ok(p.position.distanceTo(pivot)<1e-12);
});
test('Tri and green Wellstring builders and all existing motion remain byte-identical to the reviewed baseline',()=>{
 const s=fs.readFileSync(new URL('../runtime/weapon-models/stringers.mjs',import.meta.url),'utf8'),m=s.indexOf('// ------------------------------------------------------------------------------------------ motion'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
 assert.equal(hash(s.slice(s.indexOf('function tri(d){'),s.indexOf('function reef(d){'))),'0b52bfc582e5bc02b2025875d2383603f723908cd4111a3b772bf20b9755c642');
 assert.equal(hash(s.slice(s.indexOf('function wellstring(d){'),m)),'61191d87e49d8b9e188c54fd374eb1498d1543e763514c3fcb0e70fea6e68cb5');
 assert.equal(hash(s.slice(m)),'f1c54e1216a8603da0d910f751087f52e80113173ea28b74cbc59b1cebf600ad');
});

test('LACT cast arms have outward closed recessed sections, seated forward roots, and a substantial pull shaft',async()=>{
 const f=await production();
 for(const sign of[-1,1])for(const section of[f.REEF_CAST_SECTION,f.REEF_ROUND_SECTION]){
  const stations=f.smoothLimb(sign,f.REEF_LIMB_SECTIONS,20);let g;
  f.castSection({add:geo=>{g=geo;}},stations,section,'#fff',undefined,section===f.REEF_CAST_SECTION);
  const p=g.attributes.position,ix=g.index.array;let volume=0;const edges=new Map();
  for(let j=0;j<ix.length;j+=3){const a=new f.THREE.Vector3().fromBufferAttribute(p,ix[j]),b=new f.THREE.Vector3().fromBufferAttribute(p,ix[j+1]),c=new f.THREE.Vector3().fromBufferAttribute(p,ix[j+2]);volume+=a.dot(b.cross(c))/6;
   for(let k=0;k<3;k++){const u=ix[j+k],v=ix[j+(k+1)%3],key=Math.min(u,v)+':'+Math.max(u,v);edges.set(key,(edges.get(key)||0)+(u<v?1:-1));}}
  assert.ok(volume>.0002,'positive cast volume '+volume);for(const e of edges.values())assert.equal(e,0,'closed oriented edge pairs');
 }
 const section=Array.from(f.REEF_CAST_SECTION),web=section.filter(p=>p[1]===0),rim=Math.max(...section.map(p=>Math.abs(p[0])));
 assert.ok(web.every(p=>rim-Math.abs(p[0])>=.099),'geometric relief, not a painted surface');
 assert.ok(f.REEF_LIMB_SECTIONS[0][1]>.01,'root registers with forward collar');
 const d=f.getWeaponDef('s3-stringer-short'),g=d.parts.arrow.geo;g.computeBoundingBox();assert.ok(g.boundingBox.getSize(new f.THREE.Vector3()).x>.018,'readable pale center shaft');
 const glow=d.glow.attributes.position;for(let i=0;i<glow.count;i++)assert.ok(Math.hypot(glow.getX(i),glow.getY(i)-.085)>.0661,'charge rings clear .066 collar');
 let root;const stations=f.smoothLimb(1,f.REEF_LIMB_SECTIONS,20);f.castSection({add:g=>{root=g;}},stations,f.REEF_CAST_SECTION,'#fff',undefined,true);
 const webIndex=section.findIndex(p=>p[1]===0);assert.ok(Math.abs(root.attributes.position.getX(webIndex))>stations[0][2]*.485,'groove blends out into full pale cuff');
});
