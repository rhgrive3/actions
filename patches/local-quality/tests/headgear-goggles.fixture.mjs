import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {createFaceGoggles,FACE_GOGGLES_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/face-goggles.js')).href);
assert.equal(FACE_GOGGLES_FIT.preserveHair,true);assert.equal(FACE_GOGGLES_FIT.rim,undefined);
const counts=[];
for(const lod of ['hero','game','far']){
 let calls=0;const headSurface=(a,e,d,p)=>{assert.equal(d,0);calls++;return p.set(.178*Math.sin(a)*Math.cos(e),1.214+.176*Math.sin(e),.012+.165*Math.cos(a)*Math.cos(e));};
 const g=createFaceGoggles({lod,headSurface});assert.equal(calls,4);assert.equal(g.children.length,4);assert.equal(g.children.filter(x=>x.material.transparent).length,1);
 let t=0;for(const m of g.children){
 const pos=m.geometry.attributes.position,index=m.geometry.index;
 assert.equal(index.count%3,0);
 for(let i=0;i<index.count;i+=3){const ids=[index.getX(i),index.getX(i+1),index.getX(i+2)];assert.ok(ids.every(n=>Number.isInteger(n)&&n>=0&&n<pos.count));const v=ids.map(n=>[pos.getX(n),pos.getY(n),pos.getZ(n)]),a=v[1].map((x,j)=>x-v[0][j]),b=v[2].map((x,j)=>x-v[0][j]),n=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];assert.ok(Math.hypot(...n)>1e-12,'All meshes have nondegenerate triangles');if(m.name==='lens-batch'){const c=v[0].map((x,j)=>(x+v[1][j]+v[2][j])/3-[0,.164,.014][j]);assert.ok(n.reduce((sum,x,j)=>sum+x*c[j],0)>0,'Lens triangles face outward');}}
for(const key of ['position','normal','uv'])assert.ok([...m.geometry.attributes[key].array].every(Number.isFinite));t+=m.geometry.index.count/3;}
 assert.equal(t,g.userData.stats.triangles);counts.push(t);assert.ok(t<8000);
 const trianglesFor=name=>{const out=[];for(const part of g.userData.parts.filter(p=>p.name===name)){const m=g.children.find(x=>x.name===part.material+'-batch'),p=m.geometry.attributes.position,ix=m.geometry.index;for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3)out.push([0,1,2].map(k=>{const n=ix.getX(i+k);return [p.getX(n),p.getY(n),p.getZ(n)];}));}return out;};
 const names=['molded-lower-face-shell','molded-forehead-shell'];
 for(const name of names){const edges=new Map(),key=p=>p.map(x=>Math.round(x*1e6)).join(',');for(const tri of trianglesFor(name)){const a=tri[1].map((x,i)=>x-tri[0][i]),b=tri[2].map((x,i)=>x-tri[0][i]);assert.ok(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-12,'nondegenerate panel');for(let i=0;i<3;i++){const a=key(tri[i]),b=key(tri[(i+1)%3]),e=[a,b].sort().join('/'),r=edges.get(e)||[0,0];r[0]++;r[1]+=a<b?1:-1;edges.set(e,r);}}assert.ok(edges.size>100);for(const [e,[n,d]]of edges){assert.equal(n,2,name+' closed edge '+e);assert.equal(d,0,name+' consistent winding '+e);}}
 const shell=g.userData.parts.find(p=>p.name==='molded-lower-face-shell'),fore=g.userData.parts.find(p=>p.name==='molded-forehead-shell');assert.ok(shell.bounds.max.y-shell.bounds.min.y>.13);assert.ok(fore.bounds.max.y-fore.bounds.min.y>.06);
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('vent-recess-')).length,30);assert.equal(g.userData.parts.filter(p=>p.name==='cheek-ink-inlay').length,20);
 const lens=g.children.find(x=>x.name==='lens-batch');assert.equal(lens.material.depthWrite,false);assert.ok(lens.material.opacity>=.25&&lens.material.opacity<.4);const lp=lens.geometry.attributes.position;let maxY=-1,minY=1;for(let i=0;i<lp.count;i++){maxY=Math.max(maxY,lp.getY(i));minY=Math.min(minY,lp.getY(i));}assert.ok(maxY-minY<.14,'compact eye opening');
 const ink=g.children.find(x=>x.name==='ink-batch').material;g.setInkColor(0xff0000);assert.equal(ink.color.getHex(),0xff0000);let gd=0,md=0;for(const m of g.children){m.geometry.addEventListener('dispose',()=>gd++);m.material.addEventListener('dispose',()=>md++);}g.dispose();g.dispose();assert.equal(gd,4);assert.equal(md,4);
 console.log(lod,JSON.stringify(g.userData.stats));
}
assert.ok(counts[0]>counts[1]&&counts[1]>counts[2]);assert.throws(()=>createFaceGoggles({lod:'bad'}),RangeError);assert.throws(()=>createFaceGoggles({clearance:()=>NaN}),TypeError);console.log('PASS molded panels, closed topology, compact lens, source feature structure, LOD budget and lifecycle');
