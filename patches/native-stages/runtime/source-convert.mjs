// Browser-worker conversion of the public, pinned display export. This code
// contains no third-party vertices, images or native gameplay placement data.
import {SOURCE_COMMIT,SOURCE_RECIPE} from './source-catalog.mjs';
import {applySourcePlacements} from './source-placement.mjs';
const F=Math.fround;
const OBJ_SPACE=/\s/;
const objSpace=(line,index)=>{const c=line.charCodeAt(index);return c===32||(c>=9&&c<=13)||(c>127&&OBJ_SPACE.test(line[index]));};
function sourceBVHNodeCount(count){
 const sizes=new Map();
 const countNodes=n=>{if(n<=12)return 1;let result=sizes.get(n);if(result===undefined){result=1+countNodes(n>>>1)+countNodes(n-(n>>>1));sizes.set(n,result);}return result;};
 return count?countNodes(count):0;
}
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
function lines(text,visit){
 // Decode complete UTF-8 lines without retaining a second full-sized string.
 if(typeof text!=='string'){
  const bytes=text instanceof Uint8Array?text:new Uint8Array(text),decoder=new TextDecoder('utf-8',{ignoreBOM:true});let start=0;
  while(start<bytes.length){
   const newline=bytes.indexOf(10,start),end=newline<0?bytes.length:newline;
   let line=decoder.decode(bytes.subarray(start,end));
   if(start===0&&line.charCodeAt(0)===0xfeff)line=line.slice(1);
   visit(line.trimEnd());start=end+1;
  }
  return;
 }
 let start=0;while(start<text.length){let end=text.indexOf('\n',start);if(end<0)end=text.length;visit(text.slice(start,end).trimEnd());start=end+1;}
}
// Capacity counting does not consume numeric attributes. Decode object/material
// names and Unicode face separators, preserving the ordinary UTF-8 path there.
// The full writing pass still validates every number, index and attribute.
function sourceOBJCountLines(text,visit){
 if(typeof text==='string'){lines(text,visit);return;}
 const bytes=text instanceof Uint8Array?text:new Uint8Array(text),decoder=new TextDecoder('utf-8',{ignoreBOM:true});let start=0;
 while(start<bytes.length){
  const newline=bytes.indexOf(10,start),end=newline<0?bytes.length:newline;
  let at=start;
  if(start===0&&bytes[at]===239&&bytes[at+1]===187&&bytes[at+2]===191)at+=3;
  const first=bytes[at],second=bytes[at+1];
  if(first===118&&second===32)visit('v ');
  else if(first===102&&second===32){
   let words=0,inside=false,unicode=false;
   for(let i=at+2;i<end;i++){const c=bytes[i];if(c>127){unicode=true;break;}if(c===32||(c>=9&&c<=13))inside=false;else if(!inside){inside=true;words++;}}
   if(!unicode)visit('f ',words);
   else visit(decoder.decode(bytes.subarray(at,end)).trimEnd());
  }else if((first===111&&second===32)||(first===117&&second===115&&bytes[at+2]===101&&bytes[at+3]===109&&bytes[at+4]===116&&bytes[at+5]===108&&bytes[at+6]===32)){
   visit(decoder.decode(bytes.subarray(at,end)).trimEnd());
  }
  start=end+1;
 }
}
const any=(s,words)=>words.some(w=>s.includes(w));
function classify(name,material,semantics,compiledSemantics){
 const s=(name+' '+material).toLowerCase(),m=(material||'').toLowerCase();
 const alpha=any(s,['graffiti','warningtape','canola','leaf','grass','cloth','flag','stencil','notice','chainlink','net','grate','fence','vinyl','alpha','rope','fabric','dvpoolfloat','spotlight']);
 // GroundGrass* names are structural soil/moss surfaces, not grass blades.
 // Excluding them here removed real floors from collision and paint while
 // nativeDisplay still rendered the exact source triangles (Bluefin centre).
 const decor=any(s,['graffiti','warningtape','canola','leaf','flag','cloth','stencil','light_cp','spotlight','lens','vinylseat','carshadow','__carsset','_car_','buss_shadow','treebush','watersurfice','__water_','__waterpuddle','watersurface','seawater','skyplane'])||m.endsWith('_water')||name.toLowerCase().includes('_water_')||m.endsWith('_plant')||m.endsWith('_code00');
 const layer=name.match(/(?:Pack|_)(Pnt|Var|Vlf|Vgl|Vcl|Tcl)(?:Set)?(?:_|$)/)?.[1]||null;
 const matches=key=>(semantics?.[key]||[]).some((pattern,i)=>{const rules=compiledSemantics[key]||(compiledSemantics[key]=[]),re=rules[i]||(rules[i]=new RegExp(pattern));return re.test(name);});
 const active=(!layer||layer==='Pnt')&&!name.includes('TriColor')&&!matches('inactiveObjectPatterns');
 const grate=any(m,['grate','coppernet','chainlink','meshfloor','waffledplate']),glass=any(m,['glass','window']);
 const background=name.startsWith('FldBG')||name.startsWith('Fld_BG');
 const collidable=active&&!background&&(name.startsWith('Fld_')||name.startsWith('FldObj_'))&&!decor&&!matches('nonCollidableObjectPatterns');
 const paintable=collidable&&!grate&&!glass&&!['_np','_cp','_op'].some(x=>m.endsWith(x))&&!matches('nonPaintableObjectPatterns');
 return {background,collidable,paintable,grate,glass,alpha,active,ruleLayer:layer};
}
export function parseSourceOBJ(text,semantics,{compactInactiveDisplay=false}={}){
 // The first pass fixes final storage and object admission before writing any
 // vertices. Attribute/index lines then write directly into their final views.
 let vertexCapacity=0,indexCapacity=0,packedVertices=0,packedIndices=0;
 let countedName=null,countedMaterial=null,countedVertices=0,countedIndices=0;
 const plans=[],compiledSemantics=Object.create(null);
 const flushCount=()=>{
  if(!countedName||!countedVertices)return;
  const classification=compactInactiveDisplay?classify(countedName,countedMaterial,semantics,compiledSemantics):null,keep=!compactInactiveDisplay||classification.active;
  plans.push({classification,keep});
  if(keep){packedVertices+=countedVertices;packedIndices+=countedIndices;}
  countedVertices=countedIndices=0;
 };
 sourceOBJCountLines(text,(line,faceWords)=>{
  if(line.startsWith('o ')){flushCount();countedName=line.slice(2).trim();countedMaterial=null;}
  else if(line.startsWith('usemtl '))countedMaterial=line.slice(7).trim();
  if(line.startsWith('v ')){vertexCapacity++;countedVertices++;}
  else if(line.startsWith('f ')){
   let words=faceWords??0;if(faceWords===undefined){let inside=false;for(let i=2;i<line.length;i++){if(objSpace(line,i))inside=false;else if(!inside){inside=true;words++;}}}
   const count=Math.max(0,words-2)*3;indexCapacity+=count;countedIndices+=count;
  }
 });flushCount();
 const displayVertices=compactInactiveDisplay?packedVertices:vertexCapacity,displayIndices=compactInactiveDisplay?packedIndices:indexCapacity;
 const vertices=new Float32Array(displayVertices*8),indices=new Uint32Array(displayIndices),objects=[];
 let name=null,material=null,vo=0,io=0,sourceVo=0,sourceIo=0,allFinite=true,uvOffset=0,normalOffset=0;
 let vc=0,nc=0,uc=0,ic=0,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 const keep=()=>plans[objects.length]?.keep!==false;
 function flush(){
  if(!name||!vc)return;
  if(nc!==vc||(uc!==0&&uc!==vc))throw Error('Unsupported split OBJ attributes: '+name);
  const plan=plans[objects.length],retained=keep();
  objects.push({name,material,vo,vc:retained?vc:0,io,ic:retained?ic:0,bounds:[min,max],sourceHasUV:!!uc,...(plan.classification||classify(name,material,semantics,compiledSemantics))});
  sourceVo+=vc;sourceIo+=ic;
  if(retained){vo+=vc;io+=ic;}
  uvOffset+=uc;normalOffset+=nc;
  vc=nc=uc=ic=0;min=[Infinity,Infinity,Infinity];max=[-Infinity,-Infinity,-Infinity];
 }
 let line='',cursor=0;
 const token=()=>{while(cursor<line.length&&objSpace(line,cursor))cursor++;const start=cursor;while(cursor<line.length&&!objSpace(line,cursor))cursor++;return start===cursor?undefined:line.slice(start,cursor);};
 const attribute=(offset,count,index,bounds)=>{
  const retained=keep(),at=(vo+index)*8+offset;
  for(let k=0;k<count;k++){const value=F(Number(token()));if(!Number.isFinite(value))allFinite=false;if(retained)vertices[at+k]=value;if(bounds){min[k]=Math.min(min[k],value);max[k]=Math.max(max[k],value);}}
 };
 lines(text,l=>{
  line=l;cursor=l.indexOf(' ')+1;
  if(l.startsWith('o ')){flush();name=l.slice(2).trim();material=null;}
  else if(l.startsWith('v ')){attribute(0,3,vc,true);vc++;}
  else if(l.startsWith('vn ')){attribute(3,3,nc,false);nc++;}
  else if(l.startsWith('vt ')){attribute(6,2,uc,false);uc++;}
  else if(l.startsWith('usemtl '))material=l.slice(7).trim();
  else if(l.startsWith('f ')){
   let count=0,first,previous,t;
   while((t=token())!==undefined){
    const slash=t.indexOf('/'),next=slash<0?-1:t.indexOf('/',slash+1),last=next<0?-1:t.indexOf('/',next+1);
    const vi=Number(slash<0?t:t.slice(0,slash)),ui=slash<0?undefined:t.slice(slash+1,next<0?t.length:next),ni=next<0?NaN:Number(t.slice(next+1,last<0?t.length:last)),local=vi-1-sourceVo;
    if(!Number.isSafeInteger(vi)||!Number.isSafeInteger(ni)||(ui&&!Number.isSafeInteger(Number(ui)))||ni-1-normalOffset!==local||(ui&&Number(ui)-1-uvOffset!==local)||local<0||local>=vc)throw Error('Unsupported separate OBJ indices: '+name);
    if(count===0)first=local;else if(count>=2){if(keep()){indices[io+ic]=first;indices[io+ic+1]=previous;indices[io+ic+2]=local;}ic+=3;}
    previous=local;count++;
   }
   if(count<3)throw Error('Incomplete OBJ face: '+name);
  }
 });flush();
 if(sourceVo!==vertexCapacity||sourceIo!==indexCapacity||vo!==displayVertices||io!==displayIndices)throw Error('Invalid source OBJ allocation');
 // Every written component is checked after Float32 rounding in attribute().
 // Missing UV components retain finite zero initialization; allocation counts
 // above ensure no unwritten position/normal slots escape validation.
 if(!objects.length||!allFinite)throw Error('Invalid source OBJ');
 const result={vertices,indices,objects};
 if(compactInactiveDisplay&&displayVertices!==vertexCapacity)
  result.sourceGeometry={vertices:vertexCapacity,triangles:indexCapacity/3};
 return result;
}
export function collision(geo){
 const max=geo.objects.reduce((n,o)=>n+(o.collidable?o.ic/3:0),0);
 const triangles=new Float32Array(max*9),normals=new Float32Array(max*3),flags=new Uint32Array(max),objectIds=new Uint32Array(max),areas=new Float32Array(max);
 let count=0;
 for(let oi=0;oi<geo.objects.length;oi++){
  const o=geo.objects[oi];if(!o.collidable)continue;
  const g=geo.vertices,indices=geo.indices;
  for(let i=o.io;i<o.io+o.ic;i+=3){
   // Preserve all Float32 rounding steps, while removing five short-lived arrays per accepted triangle.
   const p0=(indices[i]+o.vo)*8,p1=(indices[i+1]+o.vo)*8,p2=(indices[i+2]+o.vo)*8;
   const abx=F(g[p1]-g[p0]),aby=F(g[p1+1]-g[p0+1]),abz=F(g[p1+2]-g[p0+2]);
   const acx=F(g[p2]-g[p0]),acy=F(g[p2+1]-g[p0+1]),acz=F(g[p2+2]-g[p0+2]);
   let x=F(F(aby*acz)-F(abz*acy)),y=F(F(abz*acx)-F(abx*acz)),z=F(F(abx*acy)-F(aby*acx));
   const len=F(Math.sqrt(F(F(F(x*x)+F(y*y))+F(z*z))));if(len<=1e-9)continue;
   areas[count]=F(len*.5);x=F(x/len);y=F(y/len);z=F(z/len);
   const mx=F(F(F(g[p0+3]+g[p1+3])+g[p2+3])/3),my=F(F(F(g[p0+4]+g[p1+4])+g[p2+4])/3),mz=F(F(F(g[p0+5]+g[p1+5])+g[p2+5])/3);
   if(F(F(F(x*mx)+F(y*my))+F(z*mz))<0){x=-x;y=-y;z=-z;}
   const dst=count*9;
   triangles[dst]=g[p0];triangles[dst+1]=g[p0+1];triangles[dst+2]=g[p0+2];
   triangles[dst+3]=g[p1];triangles[dst+4]=g[p1+1];triangles[dst+5]=g[p1+2];
   triangles[dst+6]=g[p2];triangles[dst+7]=g[p2+1];triangles[dst+8]=g[p2+2];
   const nn=count*3;normals[nn]=x;normals[nn+1]=y;normals[nn+2]=z;
   objectIds[count]=oi;flags[count]=1|(o.paintable?2:0)|(o.grate?4:0)|(o.glass?8:0);count++;
  }
 }
 return count===max?{triangles,normals,flags,objectIds,areas}:{triangles:triangles.slice(0,count*9),normals:normals.slice(0,count*3),flags:flags.slice(0,count),objectIds:objectIds.slice(0,count),areas:areas.slice(0,count)};
}
export function buildSourceBVH(triangles,{compactCenters=false}={}){
 if(compactCenters)return buildSourceBVHCompact(triangles);
 const count=triangles.length/9,min=new Float32Array(count*3),max=new Float32Array(count*3),center=new Float32Array(count*3),order=new Uint32Array(count);
 for(let i=0;i<count;i++){
  order[i]=i;
  for(let k=0;k<3;k++){const a=Math.min(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]),b=Math.max(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]);min[i*3+k]=a;max[i*3+k]=b;center[i*3+k]=F(F(a+b)/2);}
 }
 const nodes=new Float32Array(sourceBVHNodeCount(count)*8),bounds=new Float64Array(12);let used=0;
 function partition(left,right,target,axis){
  while(left<right){const pivot=center[order[(left+right)>>>1]*3+axis];let i=left,j=right;
   while(i<=j){while(center[order[i]*3+axis]<pivot)i++;while(center[order[j]*3+axis]>pivot)j--;if(i<=j){const t=order[i];order[i++]=order[j];order[j--]=t;}}
   if(target<=j)right=j;else if(target>=i)left=i;else return;
  }
 }
 function recurse(start,end){
  const at=used++;bounds.fill(Infinity,0,3);bounds.fill(-Infinity,3,6);bounds.fill(Infinity,6,9);bounds.fill(-Infinity,9,12);
  for(let i=start;i<end;i++){const id=order[i];for(let k=0;k<3;k++){bounds[k]=Math.min(bounds[k],min[id*3+k]);bounds[3+k]=Math.max(bounds[3+k],max[id*3+k]);bounds[6+k]=Math.min(bounds[6+k],center[id*3+k]);bounds[9+k]=Math.max(bounds[9+k],center[id*3+k]);}}
  for(let k=0;k<6;k++)nodes[at*8+k]=bounds[k];
  if(end-start<=12){nodes[at*8+6]=-start-1;nodes[at*8+7]=end-start;}
  else{let axis=0;for(let k=1;k<3;k++)if(F(bounds[9+k]-bounds[6+k])>F(bounds[9+axis]-bounds[6+axis]))axis=k;const half=start+((end-start)>>>1);partition(start,end-1,half,axis);nodes[at*8+6]=recurse(start,half);nodes[at*8+7]=recurse(half,end);}
  return at;
 }
 if(count)recurse(0,count);return {nodes,order};
}
function buildSourceBVHCompact(triangles){
 const count=triangles.length/9,min=new Float32Array(count*3),max=new Float32Array(count*3),order=new Uint32Array(count);
 for(let i=0;i<count;i++){
  order[i]=i;
  for(let k=0;k<3;k++){const a=Math.min(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]),b=Math.max(triangles[i*9+k],triangles[i*9+3+k],triangles[i*9+6+k]);min[i*3+k]=a;max[i*3+k]=b;}
 }
 // Bounds already contain the exact Float32 extrema. Derive each center with
 // the original rounding order instead of retaining another 12 bytes/triangle.
 const centerAt=(id,axis)=>{const i=id*3+axis;return F(F(min[i]+max[i])/2);};
 const nodes=new Float32Array(sourceBVHNodeCount(count)*8),bounds=new Float64Array(12);let used=0;
 function partition(left,right,target,axis){
  while(left<right){const pivot=centerAt(order[(left+right)>>>1],axis);let i=left,j=right;
   while(i<=j){while(centerAt(order[i],axis)<pivot)i++;while(centerAt(order[j],axis)>pivot)j--;if(i<=j){const t=order[i];order[i++]=order[j];order[j--]=t;}}
   if(target<=j)right=j;else if(target>=i)left=i;else return;
  }
 }
 function recurse(start,end){
  const at=used++;bounds.fill(Infinity,0,3);bounds.fill(-Infinity,3,6);bounds.fill(Infinity,6,9);bounds.fill(-Infinity,9,12);
  for(let i=start;i<end;i++){const id=order[i];for(let k=0;k<3;k++){const center=centerAt(id,k);bounds[k]=Math.min(bounds[k],min[id*3+k]);bounds[3+k]=Math.max(bounds[3+k],max[id*3+k]);bounds[6+k]=Math.min(bounds[6+k],center);bounds[9+k]=Math.max(bounds[9+k],center);}}
  for(let k=0;k<6;k++)nodes[at*8+k]=bounds[k];
  if(end-start<=12){nodes[at*8+6]=-start-1;nodes[at*8+7]=end-start;}
  else{let axis=0;for(let k=1;k<3;k++)if(F(bounds[9+k]-bounds[6+k])>F(bounds[9+axis]-bounds[6+axis]))axis=k;const half=start+((end-start)>>>1);partition(start,end-1,half,axis);nodes[at*8+6]=recurse(start,half);nodes[at*8+7]=recurse(half,end);}
  return at;
 }
 if(count)recurse(0,count);return {nodes,order};
}
const roundEven=x=>{const floor=Math.floor(x),f=x-floor;return f===.5?(floor%2?floor+1:floor):Math.round(x);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function paintCharts(data,packed=false){
 const {triangles:T,normals:N,flags,objectIds,areas}=data,groups=new Map(),ordered=[],count=flags.length,triangleFace=new Int32Array(count).fill(-1);let eligible=0;
 for(let i=0;i<count;i++){
  if(!(flags[i]&2)||N[i*3+1]<=-.5||areas[i]<=.0004)continue;
  const j=i*9,k=i*3,nx=N[k],ny=N[k+1],nz=N[k+2],distance=F(F(F(T[j]*nx)+F(T[j+1]*ny))+F(T[j+2]*nz));
  const k0=objectIds[i],k1=roundEven(F(nx*10000)),k2=roundEven(F(ny*10000)),k3=roundEven(F(nz*10000)),k4=roundEven(F(distance*1000));
  const k5=Math.floor(F(F(F(T[j]+T[j+3])+T[j+6])/3)/8),k6=Math.floor(F(F(F(T[j+1]+T[j+4])+T[j+7])/3)/8),k7=Math.floor(F(F(F(T[j+2]+T[j+5])+T[j+8])/3)/8);
  // Integer hashes only select a bucket. Compare all numeric components so
  // collisions and large rounded coordinates preserve the original grouping.
  const hash=(Math.imul(k0,73856093)^Math.imul(k1,19349663)^Math.imul(k2,83492791)^Math.imul(k3,49979687)^Math.imul(k4,86028121)^Math.imul(k5,104395301)^Math.imul(k6,122949829)^Math.imul(k7,141650939))>>>0;
  let bucket=groups.get(hash),group;
  if(bucket)for(const candidate of bucket){const key=candidate.key;if(key[0]===k0&&key[1]===k1&&key[2]===k2&&key[3]===k3&&key[4]===k4&&key[5]===k5&&key[6]===k6&&key[7]===k7){group=candidate;break;}}
  if(group){if(packed)group.count++;else group.ids.push(i);}
  else{group={key:[k0,k1,k2,k3,k4,k5,k6,k7],ids:packed?null:[i],count:1,ordinal:ordered.length};if(bucket)bucket.push(group);else groups.set(hash,[group]);ordered.push(group);}
  // Reuse the final triangle-to-face column for temporary group ordinals.
  // No parallel JS membership arrays or extra per-triangle scratch column.
  if(packed){triangleFace[i]=group.ordinal;eligible++;}
 }
 const byOrdinal=packed?ordered.slice():null;
 ordered.sort((a,b)=>{for(let k=0;k<a.key.length;k++){const d=a.key[k]-b.key[k];if(d)return d;}return 0;});
 let faceTriangles;
 if(packed){
  faceTriangles=new Uint32Array(eligible);let offset=0;
  for(const group of ordered){group.cursor=offset;group.ids=faceTriangles.subarray(offset,offset+group.count);offset+=group.count;}
  // Original triangle insertion order is retained within each sorted chart.
  for(let i=0;i<count;i++)if(triangleFace[i]>=0){const group=byOrdinal[triangleFace[i]];faceTriangles[group.cursor++]=i;}
 }

 // Retain only five projection scalars per chart, rather than one mask allocation per face.
 const faces=[],projection=new Float64Array(ordered.length*5);let grid=0,maxError=0;
 for(const {ids} of ordered){
  const n=Array.from(N.subarray(ids[0]*3,ids[0]*3+3));let u=Math.abs(n[1])<.9?cross([0,1,0],n):[1-n[0]*n[0],-n[1]*n[0],-n[2]*n[0]];
  const len=Math.hypot(...u);u=u.map(x=>x/len);let v=cross(n,u);if(Math.abs(n[1])<.3&&v[1]<0){u=u.map(x=>-x);v=v.map(x=>-x);}
  const original=Array.from(T.subarray(ids[0]*9,ids[0]*9+3)),lo=[Infinity,Infinity],hi=[-Infinity,-Infinity],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let area=0;
  for(let i=0;i<ids.length;i++){
   const id=ids[i];area+=areas[id];
   for(let j=0;j<3;j++){
    const k=id*9+j*3,px=T[k],py=T[k+1],pz=T[k+2],dx=px-original[0],dy=py-original[1],dz=pz-original[2],a=dx*u[0]+dy*u[1]+dz*u[2],b=dx*v[0]+dy*v[1]+dz*v[2];
    lo[0]=Math.min(lo[0],a);lo[1]=Math.min(lo[1],b);hi[0]=Math.max(hi[0],a);hi[1]=Math.max(hi[1],b);
    min[0]=Math.min(min[0],px);min[1]=Math.min(min[1],py);min[2]=Math.min(min[2],pz);max[0]=Math.max(max[0],px);max[1]=Math.max(max[1],py);max[2]=Math.max(max[2],pz);
   }
  }
  const origin=original.map((x,k)=>x+u[k]*lo[0]+v[k]*lo[1]),su=hi[0]-lo[0],sv=hi[1]-lo[1],nu=Math.max(1,Math.ceil(su/.25)),nv=Math.max(1,Math.ceil(sv/.25)),cu=su/nu,cv=sv/nv;
  if(nu*nv>1000000||!Number.isFinite(su+sv))throw Error('Unsupported source chart extent');
  const at=faces.length*5;projection[at]=original[0];projection[at+1]=original[1];projection[at+2]=original[2];projection[at+3]=lo[0];projection[at+4]=lo[1];
  faces.push({origin,u,v,n,su,sv,nu,nv,cu,cv,grid,object:objectIds[ids[0]],triangles:ids,bounds:[min,max],area});grid+=nu*nv;
 }
 if(!faces.length||grid>20000000)throw Error('Unsupported source paint charts');
 const mask=new Uint8Array(grid),xy=new Float64Array(6),edges=new Float64Array(21);
 for(let faceIndex=0;faceIndex<faces.length;faceIndex++){
  const face=faces[faceIndex],{origin,u,v,n,nu,nv,cu,cv,grid,triangles:ids}=face,at=faceIndex*5;
  for(const id of ids){
   triangleFace[id]=faceIndex;
   for(let j=0;j<3;j++){
    const k=id*9+j*3,dx=T[k]-projection[at],dy=T[k+1]-projection[at+1],dz=T[k+2]-projection[at+2];
    xy[j*2]=(dx*u[0]+dy*u[1]+dz*u[2])-projection[at+3];xy[j*2+1]=(dx*v[0]+dy*v[1]+dz*v[2])-projection[at+4];
    const ex=T[k]-origin[0],ey=T[k+1]-origin[1],ez=T[k+2]-origin[2];maxError=Math.max(maxError,Math.abs(ex*n[0]+ey*n[1]+ez*n[2]));
   }
   const ax=xy[0],ay=xy[1],bx=xy[2],by=xy[3],cx=xy[4],cy=xy[5],den=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy);if(Math.abs(den)<1e-12)continue;
   const minX=Math.min(ax,bx,cx),maxX=Math.max(ax,bx,cx),minY=Math.min(ay,by,cy),maxY=Math.max(ay,by,cy);
   const x0=Math.max(0,Math.trunc(minX/cu)),x1=Math.min(nu,Math.trunc(maxX/cu)+1),y0=Math.max(0,Math.trunc(minY/cv)),y1=Math.min(nv,Math.trunc(maxY/cv)+1);
   for(let edge=0;edge<3;edge++){
    const ex=edge===0?bx-ax:edge===1?cx-bx:ax-cx,ey=edge===0?by-ay:edge===1?cy-by:ay-cy,nx=-ey,ny=ex,k=edge*7;
    const a=ax*nx+ay*ny,b=bx*nx+by*ny,c=cx*nx+cy*ny;
    edges[k]=nx;edges[k+1]=ny;edges[k+2]=Math.max(a,b,c);edges[k+3]=Math.min(a,b,c);edges[k+4]=1e-9*(Math.abs(nx)+Math.abs(ny));edges[k+5]=Math.abs(nx);edges[k+6]=Math.abs(ny);
   }
   for(let j=y0;j<y1;j++)for(let k=x0;k<x1;k++)if(sourceTrianglePreparedOverlap(minX,maxX,minY,maxY,k*cu,j*cv,(k+1)*cu,(j+1)*cv,edges))mask[grid+j*nu+k]=1;
  }
 }
 if(maxError>.005)throw Error('Unsupported source paint charts');
 return {faces,mask,triangleFace,faceTriangles,chartMaxPlaneError:maxError};
}
function sourceTrianglePreparedOverlap(minX,maxX,minY,maxY,x0,y0,x1,y1,edges){
 const epsilon=1e-9;
 if(maxX<=x0+epsilon||minX>=x1-epsilon||maxY<=y0+epsilon||minY>=y1-epsilon)return false;
 const mx=(x0+x1)*.5,my=(y0+y1)*.5,hx=(x1-x0)*.5,hy=(y1-y0)*.5;
 for(let edge=0;edge<3;edge++){
  const k=edge*7,nx=edges[k],ny=edges[k+1],max=edges[k+2],min=edges[k+3],p=mx*nx+my*ny,r=edges[k+5]*hx+edges[k+6]*hy,margin=edges[k+4];
  if(max<=p-r+margin||min>=p+r-margin)return false;
 }
 return true;
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
export function convertSource(stage,obj,mtl,files,progress=()=>{},placement=null,{compactBVHCenters=false,compactInactiveDisplay=false,packedPaintCharts=false}={}){
 progress('OBJ');let geometry=parseSourceOBJ(obj,stage.sourceSemantics,{compactInactiveDisplay:compactInactiveDisplay&&!placement});
 if(placement){
  if(placement.plan?.stageId!==stage.id)throw Error('Placement stage differs from requested source');
  geometry=applySourcePlacements(geometry,placement.document,placement.plan,stage.sourceSha256);
 }
 progress('collision');const data=collision(geometry);
 progress('BVH');Object.assign(data,buildSourceBVH(data.triangles,{compactCenters:compactBVHCenters}));
 progress('paint');const charts=paintCharts(data,packedPaintCharts);
 const materials=parseSourceMaterials(mtl,geometry.objects,files);
 const integrity={};for(const m of Object.values(materials))for(const p of [m.albedo,...Object.values(m.maps)])if(p)integrity[p]=files[p];
 const manifest={schema:1,...stage,sourceCommit:SOURCE_COMMIT,sourceRecipe:SOURCE_RECIPE,sourceMode:'browser-direct',
  version1130Verified:false,coordinates:'OBJ Y-up float32, no scale/translation; retail unit equivalence unverified',
  boundsStatus:'R6 inferred interactive extent',spawnStatus:'R6 inferred supports, not recovered retail placements',
  collisionStatus:'inferred display triangles, not native collision',paintStatus:'inferred planar masks, not native masks',ruleStatus:'Pnt display only; ranked objectives are local calibration',
  objects:geometry.objects,materials,faces:charts.faces,textureIntegrity:integrity,
  gridCells:charts.mask.length,geometry:{vertices:geometry.vertices.length/8,triangles:geometry.indices.length/3,collisionTriangles:data.flags.length,bvhNodes:data.nodes.length/8,paintFaces:charts.faces.length},chartMaxPlaneError:charts.chartMaxPlaneError,cell:.25};
 if(geometry.sourceGeometry)manifest.sourceGeometry={...manifest.geometry,...geometry.sourceGeometry};
 if(geometry.placementReceipt){manifest.diagnosticOnly=true;manifest.placementReceipt=geometry.placementReceipt;manifest.coordinates='Explicit actor-local Banc binding; scales/Euler convention declared in placementReceipt';manifest.spawnStatus='Existing inferred trial pads, not Banc respawns';}
 delete data.areas;
 return {...data,vertices:geometry.vertices,indices:geometry.indices,mask:charts.mask,triangleFace:charts.triangleFace,...(packedPaintCharts?{faceTriangles:charts.faceTriangles}:{}),manifest,integrity};
}
