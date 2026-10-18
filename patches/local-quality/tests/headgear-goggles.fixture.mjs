import {Vector3,Raycaster} from 'three';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const {createFaceGoggles,FACE_GOGGLES_FIT}=await import(pathToFileURL(path.join(process.env.INKWAVE_HEADGEAR_SITE,'patches/local-quality/headgear/face-goggles.js')).href);
const {createFaceGoggles:authoredFactory}=await import(new URL('../headgear/face-goggles.js',import.meta.url));
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
 assert.equal(t,g.userData.stats.triangles);counts.push(t);assert.ok(t<10000);
 const trianglesFor=name=>{const out=[];for(const part of g.userData.parts.filter(p=>p.name===name||(name==='cap-visor'&&p.name.startsWith('cap-visor-'))||(name==='rear-closed'&&p.name.startsWith('rounded-rear-band')))){const m=g.children.find(x=>x.name===part.material+'-batch'),p=m.geometry.attributes.position,ix=m.geometry.index;for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3)out.push([0,1,2].map(k=>{const n=ix.getX(i+k);return [p.getX(n),p.getY(n),p.getZ(n)];}));}return out;};
 // Curved panels must clear the fitted smooth head at triangle interiors,
 // not only their boundary vertices (low-LOD long chords previously failed).
 for(const name of ['molded-wrap-shell','cap-visor'])for(const tri of trianglesFor(name)){
   const c=[0,1,2].map(k=>tri.reduce((sum,v)=>sum+v[k],0)/3);
   assert.ok(Math.hypot(c[0]/.178,(c[1]-.164)/.176,(c[2]-.014)/.165)>1.04,name+' triangle interior clears head envelope');
 }
 const names=['molded-wrap-shell','cap-visor','rear-closed'];
 for(const name of names){const edges=new Map(),welded=[],key=p=>{let i=welded.findIndex(q=>Math.hypot(...p.map((x,k)=>x-q[k]))<1e-6);if(i<0){i=welded.length;welded.push(p);}return String(i);};for(const tri of trianglesFor(name)){const a=tri[1].map((x,i)=>x-tri[0][i]),b=tri[2].map((x,i)=>x-tri[0][i]);assert.ok(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-12,'nondegenerate panel');for(let i=0;i<3;i++){const a=key(tri[i]),b=key(tri[(i+1)%3]),e=[a,b].sort().join('/'),r=edges.get(e)||[0,0];r[0]++;r[1]+=a<b?1:-1;edges.set(e,r);}}assert.ok(edges.size>100);for(const [e,[n,d]]of edges){assert.equal(n,2,name+' closed edge '+e);assert.equal(d,0,name+' consistent winding '+e);}}
 let volume=0;for(const tri of trianglesFor('rear-closed')){const [a,b,c]=tri;volume+=a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);}assert.ok(volume>0,'closed convex bands have outward winding');
 const shell=g.userData.parts.find(p=>p.name==='molded-wrap-shell');assert.ok(shell.bounds.max.y-shell.bounds.min.y>.28);const hole=g.userData.parts.find(p=>p.name==='vent-recess-0').bounds,ratio=(hole.max.x-hole.min.x)/(shell.bounds.max.x-shell.bounds.min.x);assert.ok(ratio>.28&&ratio<.32,'top central aperture width measured against complete shell, not independently scaled crop');
 assert.equal(g.userData.parts.filter(p=>p.name.startsWith('vent-recess-')).length,7);assert.equal(g.userData.parts.filter(p=>p.name==='central-slot-web-0').length,18);assert.equal(g.userData.parts.filter(p=>p.name==='cheek-ink-inlay').length,20);
 assert.equal(g.userData.parts.filter(p=>p.name==='central-chevron-inlay').length,3);const arch=g.userData.construction.foreheadProfile;assert.ok(Math.abs(arch[1][1]-arch[3][1])<1e-7);assert.ok(arch[2][1]-arch[1][1]<.0001,'rounded crown has no center cusp');assert.ok(arch[2][1]>arch[0][1]+.003,'raised arch shoulders remain below center');assert.deepEqual(g.userData.construction.centralSlotHalfWidths,[.35,.325,.30]);
 assert.equal(g.userData.construction.sideInsets,'closed compact inset; no ear opening');assert.equal(g.userData.parts.filter(p=>p.name==='temple-inset-border').length,2);assert.ok(g.userData.construction.rearSection.thickness>=.015);
 assert.equal(g.userData.parts.filter(p=>p.name==='cheek-slot-web-0').length,12);
 const plan=g.userData.construction.billPlan,reach=plan.map(p=>Math.hypot(...p.tip.map((v,i)=>v-p.root[i])));assert.ok(reach[2]>reach[1]*1.5&&reach[1]>reach[0]*2,'bill projects centrally and recedes toward lateral roots');
 const vs=g.userData.construction.visorSection;assert.ok(vs.tip[2]-vs.lensUpper[2]>.04,'cap visor overhangs shield');assert.ok(vs.tip[1]<vs.root[1]-.015,'cap visor slopes down beyond root');
 assert.ok(!g.userData.parts.some(p=>/central-block-perimeter|^visor-|eye-side-frame/.test(p.name)),'no detached ring, shelf or side posts');
 const section=g.userData.construction.browSection;for(let i=1;i<section.length;i++){assert.ok(section[i].point[1]<section[i-1].point[1],'brow slopes down toward lens');assert.ok(section[i].point[2]>section[i-1].point[2],'brow projects forward toward lens');}
 assert.ok(g.userData.construction.centralExtraDepth>.015&&g.userData.construction.centralExtraDepth<.025,'central breathing unit integrated within shallow cheek relief');
 for(const a of g.userData.construction.templeAnchors)assert.ok(Math.abs(a.strapDepth-a.shellDepth)<.009,'strap ends overlap thick temple shell');g.updateMatrixWorld(true);for(const a of g.userData.construction.templeAnchors){const p=new Vector3(...a.point),d=p.clone().sub(new Vector3(0,.164,.014)).normalize(),ray=new Raycaster(p.clone().addScaledVector(d,.1),d.clone().negate()),hit=ray.intersectObject(g.children.find(m=>m.name==='shell-batch'))[0];assert.ok(hit&&hit.point.distanceTo(p)<.02,'each rear strap attaches to solid side shell, not ear opening');}

 for(const part of g.userData.parts.filter(p=>p.name==='temple-ink-inlay'||p.name==='central-chevron-inlay')){
 const mesh=g.children.find(m=>m.name==='ink-batch'),p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
 for(let i=part.indexStart;i<part.indexStart+part.indexCount;i+=3){
 const c=new Vector3();for(let k=0;k<3;k++)c.add(new Vector3().fromBufferAttribute(p,ix.getX(i+k)));c.multiplyScalar(1/3);
 const d=c.clone().sub(new Vector3(0,.164,.014)).normalize();const vv=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,ix.getX(i+k))),nn=vv[1].clone().sub(vv[0]).cross(vv[2].clone().sub(vv[0])).normalize();if(nn.dot(d)<.5)continue;const hit=new Raycaster(c.clone().addScaledVector(d,.02),d.clone().negate()).intersectObjects(g.children.filter(m=>!m.material.transparent))[0];
 assert.ok(hit&&hit.object===mesh,'temple ink triangle interiors remain visible above curved shell at every LOD');
 }}
 const lens=g.children.find(x=>x.name==='lens-batch');assert.equal(lens.material.depthWrite,false);assert.ok(lens.material.opacity>=.25&&lens.material.opacity<.4);const lp=lens.geometry.attributes.position;let maxY=-1,minY=1;for(let i=0;i<lp.count;i++){maxY=Math.max(maxY,lp.getY(i));minY=Math.min(minY,lp.getY(i));}assert.ok(maxY-minY<.14,'compact eye opening');
 const ink=g.children.find(x=>x.name==='ink-batch').material;g.setInkColor(0xff0000);assert.equal(ink.color.getHex(),0xff0000);let gd=0,md=0;for(const m of g.children){m.geometry.addEventListener('dispose',()=>gd++);m.material.addEventListener('dispose',()=>md++);}g.dispose();g.dispose();assert.equal(gd,4);assert.equal(md,4);
 console.log(lod,JSON.stringify(g.userData.stats));
}
assert.ok(counts[0]>counts[1]&&counts[1]>counts[2]);assert.throws(()=>createFaceGoggles({lod:'bad'}),RangeError);assert.throws(()=>createFaceGoggles({clearance:()=>NaN}),TypeError);console.log('PASS joined wrap shell, manifold topology, compact lens, allLOD clearance, no detached framework and lifecycle');

for(const lod of ['hero','game','far']){const a=authoredFactory({lod}),b=createFaceGoggles({lod});assert.equal(a.children.length,b.children.length);for(let i=0;i<a.children.length;i++){const x=a.children[i],y=b.children[i];assert.equal(x.name,y.name);assert.deepEqual(Object.keys(x.geometry.attributes),Object.keys(y.geometry.attributes));for(const key of Object.keys(x.geometry.attributes))assert.deepEqual(x.geometry.attributes[key].array,y.geometry.attributes[key].array,lod+' emitted '+key+' parity');assert.deepEqual(x.geometry.index.array,y.geometry.index.array,lod+' emitted index parity');}a.dispose();b.dispose();}
