// Browser-worker conversion of the public, pinned display export. This code
// contains no third-party vertices, images or native gameplay placement data.
import {SOURCE_COMMIT,SOURCE_RECIPE} from './source-catalog.mjs';
const F=Math.fround;
/** Positive-area overlap between a source triangle and a grid cell. A centre
 * sample alone drops paintable strips at the original polygon boundary. */
export function sourceTriangleCellOverlap(ax,ay,bx,by,cx,cy,x0,y0,x1,y1){
 if(Math.abs((by-cy)*(ax-cx)+(cx-bx)*(ay-cy))<1e-12)return false;
 // Float64 chart projections differ by roundoff across JS and NumPy. Reject
 // numerically zero-area contacts rather than claiming adjacent empty cells.
 const epsilon=1e-9;
 if(Math.max(ax,bx,cx)<=x0+epsilon||Math.min(ax,bx,cx)>=x1-epsilon||Math.max(ay,by,cy)<=y0+epsilon||Math.min(ay,by,cy)>=y1-epsilon)return false;
 const mx=(x0+x1)*.5,my=(y0+y1)*.5,hx=(x1-x0)*.5,hy=(y1-y0)*.5;
 for(let edge=0;edge<3;edge++){
  const ex=edge===0?bx-ax:edge===1?cx-bx:ax-cx,ey=edge===0?by-ay:edge===1?cy-by:ay-cy;
  const nx=-ey,ny=ex,a=ax*nx+ay*ny,b=bx*nx+by*ny,c=cx*nx+cy*ny,p=mx*nx+my*ny,r=Math.abs(nx)*hx+Math.abs(ny)*hy;
  const margin=epsilon*(Math.abs(nx)+Math.abs(ny));
  if(Math.max(a,b,c)<=p-r+margin||Math.min(a,b,c)>=p+r-margin)return false;
 }
 return true;
}
class BufferBuilder{
 constructor(Type,initial=4096){this.Type=Type;this.array=new Type(initial);this.length=0;}
 push(...values){if(this.length+values.length>this.array.length){const a=new this.Type(Math.max(this.length+values.length,this.array.length*2));a.set(this.array);this.array=a;}this.array.set(values,this.length);this.length+=values.length;}
 finish(){return this.array.slice(0,this.length);}
}
function lines(text,visit){let start=0;while(start<text.length){let end=text.indexOf('\n',start);if(end<0)end=text.length;visit(text.slice(start,end).trimEnd());start=end+1;}}
const any=(s,words)=>words.some(w=>s.includes(w));
function classify(name,material,semantics){
 const s=(name+' '+material).toLowerCase(),m=(material||'').toLowerCase();
 const alpha=any(s,['graffiti','warningtape','canola','leaf','grass','cloth','flag','stencil','notice','chainlink','net','grate','fence','vinyl','alpha','rope','fabric','dvpoolfloat','spotlight']);
 const decor=any(s,['graffiti','warningtape','canola','leaf','flag','cloth','stencil','light_cp','spotlight','lens','vinylseat','carshadow','__carsset','_car_','buss_shadow','treebush','groundgrass','watersurfice','__water_','__waterpuddle','watersurface','seawater','skyplane'])||m.endsWith('_water')||name.toLowerCase().includes('_water_')||m.endsWith('_plant')||m.endsWith('_code00');
 const layer=name.match(/(?:Pack|_)(Pnt|Var|Vlf|Vgl|Vcl|Tcl)(?:Set)?(?:_|$)/)?.[1]||null;
 const matches=key=>(semantics?.[key]||[]).some(pattern=>new RegExp(pattern).test(name));
 const active=(!layer||layer==='Pnt')&&!name.includes('TriColor')&&!matches('inactiveObjectPatterns');
 const grate=any(m,['grate','coppernet','chainlink','meshfloor','waffledplate']),glass=any(m,['glass','window']);
 const background=name.startsWith('FldBG')||name.startsWith('Fld_BG');
 const collidable=active&&!background&&(name.startsWith('Fld_')||name.startsWith('FldObj_'))&&!decor&&!matches('nonCollidableObjectPatterns');
 const paintable=collidable&&!grate&&!glass&&!['_np','_cp','_op'].some(x=>m.endsWith(x))&&!matches('nonPaintableObjectPatterns');
 return {background,collidable,paintable,grate,glass,alpha,active,ruleLayer:layer};
}
export function parseSourceOBJ(text,semantics){
 const geometry=[],indexChunks=[],objects=[];
 let v=new BufferBuilder(Float32Array),n=new BufferBuilder(Float32Array),uv=new BufferBuilder(Float32Array),ix=new BufferBuilder(Uint32Array);
 let name=null,material=null,vo=0,io=0,uvOffset=0,normalOffset=0;
 function flush(){
  const count=v.length/3;if(!name||!count)return;
  if(n.length!==v.length||(uv.length!==0&&uv.length/2!==count))throw Error('Unsupported split OBJ attributes: '+name);
  const g=new Float32Array(count*8),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<count;i++){
   for(let k=0;k<3;k++){const p=v.array[i*3+k];g[i*8+k]=p;g[i*8+3+k]=n.array[i*3+k];min[k]=Math.min(min[k],p);max[k]=Math.max(max[k],p);}
   if(uv.length){g[i*8+6]=uv.array[i*2];g[i*8+7]=uv.array[i*2+1];}
  }
  geometry.push(g);indexChunks.push(ix.finish());
  objects.push({name,material,vo,vc:count,io,ic:ix.length,bounds:[min,max],sourceHasUV:!!uv.length,...classify(name,material,semantics)});
  vo+=count;io+=ix.length;uvOffset+=uv.length/2;normalOffset+=n.length/3;
  v=new BufferBuilder(Float32Array);n=new BufferBuilder(Float32Array);uv=new BufferBuilder(Float32Array);ix=new BufferBuilder(Uint32Array);
 }
 lines(text,l=>{
  if(l.startsWith('o ')){flush();name=l.slice(2).trim();material=null;}
  else if(l.startsWith('v ')){const p=l.split(/\s+/);v.push(Number(p[1]),Number(p[2]),Number(p[3]));}
  else if(l.startsWith('vn ')){const p=l.split(/\s+/);n.push(Number(p[1]),Number(p[2]),Number(p[3]));}
  else if(l.startsWith('vt ')){const p=l.split(/\s+/);uv.push(Number(p[1]),Number(p[2]));}
  else if(l.startsWith('usemtl '))material=l.slice(7).trim();
  else if(l.startsWith('f ')){
   const face=l.slice(2).trim().split(/\s+/).map(t=>{
    const [vi,ui,ni]=t.split('/'),local=Number(vi)-1-vo;
    if(Number(ni)-1-normalOffset!==local||(ui&&Number(ui)-1-uvOffset!==local)||local<0||local>=v.length/3)throw Error('Unsupported separate OBJ indices: '+name);
    return local;
   });
   for(let j=1;j<face.length-1;j++)ix.push(face[0],face[j],face[j+1]);
  }
 });flush();
 const vertices=new Float32Array(vo*8),indices=new Uint32Array(io);let a=0,b=0;
 for(const chunk of geometry){vertices.set(chunk,a);a+=chunk.length;}for(const chunk of indexChunks){indices.set(chunk,b);b+=chunk.length;}
 if(!objects.length||!vertices.every(Number.isFinite))throw Error('Invalid source OBJ');
 return {vertices,indices,objects};
}
function collision(geo){
 const max=geo.objects.reduce((n,o)=>n+(o.collidable?o.ic/3:0),0);
 const triangles=new Float32Array(max*9),normals=new Float32Array(max*3),flags=new Uint32Array(max),objectIds=new Uint32Array(max),areas=new Float32Array(max);
 let count=0;
 for(let oi=0;oi<geo.objects.length;oi++){
  const o=geo.objects[oi];if(!o.collidable)continue;
  for(let i=o.io;i<o.io+o.ic;i+=3){
   const ids=[geo.indices[i]+o.vo,geo.indices[i+1]+o.vo,geo.indices[i+2]+o.vo],p=ids.map(id=>id*8),g=geo.vertices;
   const ab=[F(g[p[1]]-g[p[0]]),F(g[p[1]+1]-g[p[0]+1]),F(g[p[1]+2]-g[p[0]+2])],ac=[F(g[p[2]]-g[p[0]]),F(g[p[2]+1]-g[p[0]+1]),F(g[p[2]+2]-g[p[0]+2])];
   let x=F(F(ab[1]*ac[2])-F(ab[2]*ac[1])),y=F(F(ab[2]*ac[0])-F(ab[0]*ac[2])),z=F(F(ab[0]*ac[1])-F(ab[1]*ac[0]));
   const len=F(Math.sqrt(F(F(F(x*x)+F(y*y))+F(z*z))));if(len<=1e-9)continue;
   areas[count]=F(len*.5);x=F(x/len);y=F(y/len);z=F(z/len);
   const mx=F(F(F(g[p[0]+3]+g[p[1]+3])+g[p[2]+3])/3),my=F(F(F(g[p[0]+4]+g[p[1]+4])+g[p[2]+4])/3),mz=F(F(F(g[p[0]+5]+g[p[1]+5])+g[p[2]+5])/3);
   if(F(F(F(x*mx)+F(y*my))+F(z*mz))<0){x=-x;y=-y;z=-z;}
   for(let j=0;j<3;j++)for(let k=0;k<3;k++)triangles[count*9+j*3+k]=g[p[j]+k];
   normals.set([x,y,z],count*3);objectIds[count]=oi;flags[count]=1|(o.paintable?2:0)|(o.grate?4:0)|(o.glass?8:0);count++;
  }
 }
 return {triangles:triangles.slice(0,count*9),normals:normals.slice(0,count*3),flags:flags.slice(0,count),objectIds:objectIds.slice(0,count),areas:areas.slice(0,count)};
}
export function buildSourceBVH(triangles){
 const count=triangles.length/9,min=new Float32Array(count*3),max=new Float32Array(count*3),center=new Float32Array(count*3),order=new Uint32Array(count);
 for(let i=0;i<count;i++){
  order[i]=i;
  for(let k=0;k<3;k++){const a=Math.min(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]),b=Math.max(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]);min[i*3+k]=a;max[i*3+k]=b;center[i*3+k]=F(F(a+b)/2);}
 }
 const nodes=[];
 function partition(left,right,target,axis){
  while(left<right){const pivot=center[order[(left+right)>>>1]*3+axis];let i=left,j=right;
   while(i<=j){while(center[order[i]*3+axis]<pivot)i++;while(center[order[j]*3+axis]>pivot)j--;if(i<=j){const t=order[i];order[i++]=order[j];order[j--]=t;}}
   if(target<=j)right=j;else if(target>=i)left=i;else return;
  }
 }
 function recurse(start,end){
  const at=nodes.length/8,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],cl=[Infinity,Infinity,Infinity],ch=[-Infinity,-Infinity,-Infinity];
  for(let i=start;i<end;i++){const id=order[i];for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],min[id*3+k]);hi[k]=Math.max(hi[k],max[id*3+k]);cl[k]=Math.min(cl[k],center[id*3+k]);ch[k]=Math.max(ch[k],center[id*3+k]);}}
  nodes.push(...lo,...hi,0,0);
  if(end-start<=12){nodes[at*8+6]=-start-1;nodes[at*8+7]=end-start;}
  else{let axis=0;for(let k=1;k<3;k++)if(F(ch[k]-cl[k])>F(ch[axis]-cl[axis]))axis=k;const half=start+((end-start)>>>1);partition(start,end-1,half,axis);nodes[at*8+6]=recurse(start,half);nodes[at*8+7]=recurse(half,end);}
  return at;
 }
 if(count)recurse(0,count);return {nodes:new Float32Array(nodes),order};
}
const roundEven=x=>{const floor=Math.floor(x),f=x-floor;return f===.5?(floor%2?floor+1:floor):Math.round(x);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function paintCharts(data){
 const {triangles:T,normals:N,flags,objectIds,areas}=data,groups=new Map(),count=flags.length;
 for(let i=0;i<count;i++){
  if(!(flags[i]&2)||N[i*3+1]<=-.5||areas[i]<=.0004)continue;
  const n=Array.from(N.subarray(i*3,i*3+3)),distance=F(F(F(T[i*9]*n[0])+F(T[i*9+1]*n[1]))+F(T[i*9+2]*n[2]));
  const cell=[0,1,2].map(k=>Math.floor(F(F(F(T[i*9+k]+T[i*9+3+k])+T[i*9+6+k])/3)/8));
  const key=[objectIds[i],...n.map(x=>roundEven(F(x*10000))),roundEven(F(distance*1000)),...cell],str=key.join(',');
  const group=groups.get(str);if(group)group.ids.push(i);else groups.set(str,{key,ids:[i]});
 }
 const ordered=[...groups.values()].sort((a,b)=>{for(let k=0;k<a.key.length;k++){const d=a.key[k]-b.key[k];if(d)return d;}return 0;});
 const faces=[],masks=[],triangleFace=new Int32Array(count).fill(-1);let grid=0,maxError=0;
 for(const {ids} of ordered){
  const n=Array.from(N.subarray(ids[0]*3,ids[0]*3+3));let u=Math.abs(n[1])<.9?cross([0,1,0],n):[1-n[0]*n[0],-n[1]*n[0],-n[2]*n[0]];
  const len=Math.hypot(...u);u=u.map(x=>x/len);let v=cross(n,u);if(Math.abs(n[1])<.3&&v[1]<0){u=u.map(x=>-x);v=v.map(x=>-x);}
  const original=Array.from(T.subarray(ids[0]*9,ids[0]*9+3)),xy=new Float64Array(ids.length*6),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let area=0;
  for(let i=0;i<ids.length;i++){
   const id=ids[i];area+=areas[id];
   for(let j=0;j<3;j++){
    const p=[T[id*9+j*3],T[id*9+j*3+1],T[id*9+j*3+2]],rel=p.map((x,k)=>x-original[k]),a=dot(rel,u),b=dot(rel,v);xy[i*6+j*2]=a;xy[i*6+j*2+1]=b;
    lo[0]=Math.min(lo[0],a);lo[1]=Math.min(lo[1],b);hi[0]=Math.max(hi[0],a);hi[1]=Math.max(hi[1],b);
    for(let k=0;k<3;k++){min[k]=Math.min(min[k],p[k]);max[k]=Math.max(max[k],p[k]);}
   }
  }
  const origin=original.map((x,k)=>x+u[k]*lo[0]+v[k]*lo[1]),su=hi[0]-lo[0],sv=hi[1]-lo[1],nu=Math.max(1,Math.ceil(su/.25)),nv=Math.max(1,Math.ceil(sv/.25)),cu=su/nu,cv=sv/nv;
  if(nu*nv>1000000||!Number.isFinite(su+sv))throw Error('Unsupported source chart extent');
  const mask=new Uint8Array(nu*nv);
  for(let i=0;i<ids.length;i++){
   const id=ids[i];triangleFace[id]=faces.length;
   for(let j=0;j<3;j++){xy[i*6+j*2]-=lo[0];xy[i*6+j*2+1]-=lo[1];const rel=[0,1,2].map(k=>T[id*9+j*3+k]-origin[k]);maxError=Math.max(maxError,Math.abs(dot(rel,n)));}
   const at=i*6,ax=xy[at],ay=xy[at+1],bx=xy[at+2],by=xy[at+3],cx=xy[at+4],cy=xy[at+5],den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-12)continue;
   const x0=Math.max(0,Math.trunc(Math.min(ax,bx,cx)/cu)),x1=Math.min(nu,Math.trunc(Math.max(ax,bx,cx)/cu)+1),y0=Math.max(0,Math.trunc(Math.min(ay,by,cy)/cv)),y1=Math.min(nv,Math.trunc(Math.max(ay,by,cy)/cv)+1);
   for(let j=y0;j<y1;j++)for(let k=x0;k<x1;k++)if(sourceTriangleCellOverlap(ax,ay,bx,by,cx,cy,k*cu,j*cv,(k+1)*cu,(j+1)*cv))mask[j*nu+k]=1;
  }
  faces.push({origin,u,v,n,su,sv,nu,nv,cu,cv,grid,object:objectIds[ids[0]],triangles:ids,bounds:[min,max],area});masks.push(mask);grid+=mask.length;
 }
 if(!faces.length||grid>20000000||maxError>.005)throw Error('Unsupported source paint charts');
 const mask=new Uint8Array(grid);let offset=0;for(const m of masks){mask.set(m,offset);offset+=m.length;}
 return {faces,mask,triangleFace,chartMaxPlaneError:maxError};
}
export function parseSourceMaterials(text,objects,files){
 const source={};let key;
 lines(text,l=>{if(l.startsWith('newmtl ')){key=l.slice(7).trim();source[key]={maps:{},channels:{}};}else if(key&&l.startsWith('map_Kd '))source[key].albedo=l.slice(7).trim();else if(key&&l.startsWith('Kd '))source[key].diffuse=l.slice(3).split(/\s+/).map(Number);});
 const materials={},active=new Set(objects.filter(o=>o.active).map(o=>o.material));
 for(const name of active){
  const m=source[name]||{maps:{},channels:{}},original=m.albedo;materials[name]=m;if(!original)continue;
  if(!files[original])throw Error('Missing pinned source texture: '+original);
  const stem=original.split('/').at(-1),base=stem.replace(/_(Alb|Nrm|Rgh|Mtl|Opa)\.png$/,''),packed=stem.match(/_(Nrm|Rgh|Mtl|Opa)\.png$/);
  if(packed||stem.includes('BakeDummy')){m.albedo=null;m.materialRepair='inferred neutral tint for non-colour MTL map';if(packed)m.maps[{Nrm:'normal',Rgh:'roughness',Opa:'opacity',Mtl:'metalness'}[packed[1]]]=original;}
  for(const [suffix,role] of [['_Nrm.png','normal'],['_Rgh.png','roughness'],['_Opa.png','opacity'],['_Emi.png','emissive'],['_Emm.png','emissive']]){const p='textures/'+base+suffix;if(files[p])m.maps[role]=p;}
  if(name.includes('Canola')&&files['textures/Canola_Opa.png']){m.albedo=null;m.maps.opacity='textures/Canola_Opa.png';m.tint=name.includes('CanolaB')?'#8a75cd':'#df934e';}
  if(!m.albedo&&!m.tint)m.tint=/water|glass/i.test(name)?'#608e98':/vinyl/i.test(name)?'#698275':'#c3c3b8';
  // PNG-dependent channel/normal/alpha inference runs once at decode time.
  m.inferSourceChannels=true;m.hasAlpha=!!m.albedo;
 }
 return materials;
}
export function convertSource(stage,obj,mtl,files,progress=()=>{}){
 progress('OBJ');const geometry=parseSourceOBJ(obj,stage.sourceSemantics);
 progress('collision');const data=collision(geometry);
 progress('BVH');Object.assign(data,buildSourceBVH(data.triangles));
 progress('paint');const charts=paintCharts(data);
 const materials=parseSourceMaterials(mtl,geometry.objects,files);
 const integrity={};for(const m of Object.values(materials))for(const p of [m.albedo,...Object.values(m.maps)])if(p)integrity[p]=files[p];
 const manifest={schema:1,...stage,sourceCommit:SOURCE_COMMIT,sourceRecipe:SOURCE_RECIPE,sourceMode:'browser-direct',
  version1130Verified:false,coordinates:'OBJ Y-up float32, no scale/translation; retail unit equivalence unverified',
  boundsStatus:'R6 inferred interactive extent',spawnStatus:'R6 inferred supports, not recovered retail placements',
  collisionStatus:'inferred display triangles, not native collision',paintStatus:'inferred planar masks, not native masks',ruleStatus:'Pnt display only; ranked objectives are local calibration',
  objects:geometry.objects,materials,faces:charts.faces,textureIntegrity:integrity,
  gridCells:charts.mask.length,geometry:{vertices:geometry.vertices.length/8,triangles:geometry.indices.length/3,collisionTriangles:data.flags.length,bvhNodes:data.nodes.length/8,paintFaces:charts.faces.length},chartMaxPlaneError:charts.chartMaxPlaneError,cell:.25};
 delete data.areas;
 return {...data,vertices:geometry.vertices,indices:geometry.indices,mask:charts.mask,triangleFace:charts.triangleFace,manifest,integrity};
}
