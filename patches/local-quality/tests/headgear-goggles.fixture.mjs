// Builder regression suite, executed against the emitted native production module.
import path from 'node:path';import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {createFaceGoggles,FACE_GOGGLES_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/face-goggles.js')).href);
assert.equal(FACE_GOGGLES_FIT.preserveHair,true);assert.equal(FACE_GOGGLES_FIT.rim,undefined);
const report=[];
for(const lod of ['hero','game','far']){
 let calls=0;const headSurface=(a,e,d,out)=>{calls++;return out.set((.178+d)*Math.sin(a)*Math.cos(e),1.214+(.176+d)*Math.sin(e),.012+(.165+d)*Math.cos(a)*Math.cos(e));};
 const g=createFaceGoggles({lod,headSurface,clearance:()=>.008});assert.ok(calls>=4);assert.equal(g.children.length,4);assert.equal(g.children.filter(m=>m.material.transparent).length,1);
 let degenerate=0,triangles=0;
 for(const m of g.children){const p=m.geometry.attributes.position.array,ix=m.geometry.index.array;assert.ok([...p].every(Number.isFinite));assert.ok([...m.geometry.attributes.normal.array].every(Number.isFinite));for(let i=0;i<ix.length;i+=3){const a=ix[i]*3,b=ix[i+1]*3,c=ix[i+2]*3,u=[p[b]-p[a],p[b+1]-p[a+1],p[b+2]-p[a+2]],v=[p[c]-p[a],p[c+1]-p[a+1],p[c+2]-p[a+2]];const area=Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);if(area<1e-12)degenerate++;triangles++;}}
 assert.equal(degenerate,0,'No collapsed rail faces');assert.equal(triangles,g.userData.stats.triangles);assert.ok(triangles<5000);
 const ink=g.children.find(x=>x.name==='ink-batch').material;g.userData.setInkColor(0xff0000);assert.equal(ink.color.getHex(),0xff0000);
 let disposedGeo=0,disposedMat=0;for(const m of g.children){m.geometry.addEventListener('dispose',()=>disposedGeo++);m.material.addEventListener('dispose',()=>disposedMat++);}g.dispose();g.dispose();assert.equal(disposedGeo,4);assert.equal(disposedMat,4);report.push({lod,...g.userData.stats});
}
assert.ok(report[0].triangles>report[1].triangles&&report[1].triangles>report[2].triangles);assert.throws(()=>createFaceGoggles({lod:'broken'}),RangeError);assert.throws(()=>createFaceGoggles({clearance:()=>NaN}),TypeError);console.log(JSON.stringify({pass:true,report},null,2));
// Rigid fit regression: a sculpt whose offset normals fold around the nose must
// never be sampled with a nonzero offset; structural surfaces remain unchanged.
const warped=(a,e,d,out)=>{assert.equal(d,0,'Rigid accessory must not follow sculpt normals');return out.set(.178*Math.sin(a)*Math.cos(e),1.214+.176*Math.sin(e),.012+.165*Math.cos(a)*Math.cos(e));};
for(const lod of ['hero','game','far']){
 const g=createFaceGoggles({lod,headSurface:warped});
 const trianglesFor=pred=>{const all=[];for(const part of g.userData.parts.filter(pred)){const m=g.children.find(x=>x.name===part.material+'-batch'),p=m.geometry.attributes.position,ix=m.geometry.index;for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3){all.push([0,1,2].map(k=>{const id=ix.getX(i+k);return [p.getX(id),p.getY(id),p.getZ(id)];}));}}return all;};
 const cross=t=>{const u=t[1].map((x,i)=>x-t[0][i]),v=t[2].map((x,i)=>x-t[0][i]);return [u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];};
 for(const t of trianglesFor(p=>p.name==='visor-top'))assert.ok(cross(t)[1]>0,'Peak top faces upward');
 for(const t of trianglesFor(p=>p.name==='visor-bottom'))assert.ok(cross(t)[1]<0,'Peak bottom faces downward');
 for(const t of trianglesFor(p=>p.name==='single-clear-eye-shield'||p.name==='recessed-arrow-stripe')){const n=cross(t),c=t[0].map((x,i)=>(x+t[1][i]+t[2][i])/3-[0,.164,.014][i]);assert.ok(n.reduce((v,x,i)=>v+x*c[i],0)>0,'Lens and both mirrored decals face outward');}
 for(const prefix of ['visor-','joined-cheek-chevron-0-','joined-cheek-chevron-1-','joined-cheek-chevron-2-','joined-chin-chevron-']){
  const edges=new Map(),key=p=>p.map(x=>Math.round(x*1e6)).join(',');
  for(const t of trianglesFor(p=>p.name.startsWith(prefix)))for(let i=0;i<3;i++){const a=key(t[i]),b=key(t[(i+1)%3]),e=[a,b].sort().join('/'),r=edges.get(e)||[0,0];r[0]++;r[1]+=a<b?1:-1;edges.set(e,r);}
  assert.ok(edges.size>0);for(const [edge,[count,direction]]of edges){assert.equal(count,2,prefix+' closed edge '+edge);assert.equal(direction,0,prefix+' consistent winding '+edge);}
 }
 g.dispose();
}
console.log('PASS rigid-envelope, outward lens/decals, closed joined-rail and peak edge continuity/winding');
