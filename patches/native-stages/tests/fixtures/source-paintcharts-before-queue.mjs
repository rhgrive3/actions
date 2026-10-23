const F=Math.fround;
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
const roundEven=x=>{const floor=Math.floor(x),f=x-floor;return f===.5?(floor%2?floor+1:floor):Math.round(x);};
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function paintCharts(data){
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
