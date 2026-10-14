import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import { fixture } from './source-fixture.mjs';
// Runs against source and emitted model modules. No runtime-source injection.
// The temporary observer captures authored geometry before merging; restore it
// even on failure so no presentation/runtime caller is changed by the test.
test('Hornz printed stripes remain supported by the actual rounded shell', async () => {
 const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
 const root=fileURLToPath(new URL('../../../',import.meta.url)),sourceHashes={};
 for(const name of ['registry','kit','variants-melee','hornz-dread-wringer']){
  const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';sourceHashes[rel]=hash(fs.readFileSync(path.join(root,rel)));
 }
 if(process.env.INKWAVE_BUILT_SITE){
  const site=path.resolve(process.env.INKWAVE_BUILT_SITE),manifest=JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'),'utf8'));
  assert.equal(hash(JSON.stringify(manifest.artifacts)),manifest.contentHash,'artifact manifest hash');
  for(const [rel,digest]of Object.entries(sourceHashes))assert.equal(manifest.files[rel.replace('patches/splatoon3/','patch/')],digest,'emitted build must bind this source '+rel);
  for(const name of ['registry','kit']){
   const rel='patches/splatoon3/runtime/weapon-models/'+name+'.mjs';assert.ok(manifest.artifacts[rel],'emitted artifact listed: '+rel);
   assert.equal(hash(fs.readFileSync(path.join(site,rel))),manifest.artifacts[rel],'fixture reads the manifested emitted '+rel);
   const versioned='_versions/'+manifest.build.revision+'/'+rel;assert.equal(manifest.artifacts[versioned],manifest.artifacts[rel],'capture and fixture artifact identity');
  }
 }
 console.log('Hornz stripe source binding',JSON.stringify(sourceHashes));
 // Family modules are bundled into registry.mjs in production. Both modes
 // must use the same public registry entry, never a source-only family import.
 const { THREE, Pieces, weaponVariantSpec } = await fixture({extraExports: `export { Pieces } from './patches/splatoon3/runtime/weapon-models/kit.mjs'; export { weaponVariantSpec } from './patches/splatoon3/runtime/weapon-models/registry.mjs';`});
 const spec=weaponVariantSpec('Slosher_Double_02');assert.ok(spec&&typeof spec.build==='function');
const saved=Pieces.prototype.add, shells=[],stripes=[];
Pieces.prototype.add=function(g,color,...rest){if(color==='#e51688')shells.push(g.clone());if(color==='#282334')stripes.push(g.clone());return saved.call(this,g,color,...rest);};
try { spec.build({kind:'slosher',parts:{}}); } finally { Pieces.prototype.add=saved; }
assert.equal(shells.length,1,'registry uses the same exported kit Pieces instance observed by this test');
const shell=new THREE.Mesh(shells.at(-1),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));shell.updateMatrixWorld(true);
let total=0,miss=0,gap=0,maxGap=0,minGap=Infinity,worstVertex=null;const examples=[];
for(const [index,g]of stripes.entries()){const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),s=Math.sign(x);const hits=new THREE.Raycaster(new THREE.Vector3(s*.2,y,z),new THREE.Vector3(-s,0,0)).intersectObject(shell);total++;if(!hits.length){miss++;if(examples.length<12)examples.push({index,i,x,y,z,reason:'no pink shell at stripe height/depth'});}else {const d=Math.abs(x)-Math.abs(hits[0].point.x);maxGap=Math.max(maxGap,d);if(d<minGap){minGap=d;worstVertex={x,y,z,hit:hits[0].point.toArray()};}if(d>.002)gap++;}}}
// Also sample triangle interiors: supported vertices alone cannot prove that
// a broad decal triangle follows a curved vessel between its corners.
let faceSamples=0,faceMiss=0,faceGap=0,maxFaceGap=0,minFaceGap=Infinity,worstFace=null;
for(const g of stripes){const p=g.attributes.position,ix=g.index,n=ix?ix.count:p.count;
 for(let j=0;j<n;j+=3){const ids=[0,1,2].map(k=>ix?ix.getX(j+k):j+k);
  for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[0,.5,.5],[.5,0,.5],[.2,.2,.6],[.2,.6,.2],[.6,.2,.2],[.1,.45,.45],[.45,.1,.45],[.45,.45,.1]]){
   const point=new THREE.Vector3();ids.forEach((id,k)=>point.addScaledVector(new THREE.Vector3().fromBufferAttribute(p,id),weights[k]));
   const sign=Math.sign(point.x),h=new THREE.Raycaster(new THREE.Vector3(sign*.2,point.y,point.z),new THREE.Vector3(-sign,0,0)).intersectObject(shell)[0];faceSamples++;
   if(!h)faceMiss++;else{const distance=Math.abs(point.x)-Math.abs(h.point.x);maxFaceGap=Math.max(maxFaceGap,distance);if(distance<minFaceGap){minFaceGap=distance;worstFace={point:point.toArray(),hit:h.point.toArray()};}if(distance>.002)faceGap++;}
  }
 }
}
assert.equal(stripes.length,18);assert.ok(total>0&&faceSamples>0);
assert.equal(miss,0,'every stripe vertex has a supporting shell');assert.equal(gap,0,'no stripe vertex floats over 2mm');
assert.equal(faceMiss,0,'triangle interiors stay within the shell silhouette');assert.equal(faceGap,0,'triangle interiors follow the curved shell within 2mm');
assert.ok(minGap>=0,`printed vertices penetrate vessel by ${-minGap}`);
assert.ok(minFaceGap>=0,`printed triangle interiors penetrate vessel by ${-minFaceGap}`);
});
