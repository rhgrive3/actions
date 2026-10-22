import test from 'node:test';
import assert from 'node:assert/strict';
import {collision} from '../runtime/source-convert.mjs';

// Frozen original implementation from main 870872c8b82015bc8b5c1fa0151808c0fbb43e6f; keep independent of the candidate.
const F=Math.fround;
function collisionBefore(geo){
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

function fixture(seed,count,invalid=false){
 let st=seed>>>0;const random=()=>((st=Math.imul(st,1664525)+1013904223>>>0)/4294967296);
 const total=count*3,vertices=new Float32Array(total*8),indices=new Uint32Array(total);
 for(let i=0;i<total;i++){
  const k=i*8;for(let j=0;j<3;j++)vertices[k+j]=F((random()-.5)*100);
  for(let j=0;j<3;j++)vertices[k+3+j]=F((random()-.5)*2);
  vertices[k+6]=F(random());vertices[k+7]=F(random());indices[i]=i;
 }
 for(let i=0;i<count;i+=17){const k=i*3;indices[k+1]=indices[k];indices[k+2]=indices[k];}
 if(invalid)for(let i=29;i<count;i+=211)indices[i*3+1]=total+100;
 const quarter=Math.floor(count/4)*3;
 return {vertices,indices,objects:[
  {vo:0,io:0,ic:quarter,collidable:true,paintable:true},
  {vo:0,io:quarter,ic:quarter,collidable:true,paintable:false,glass:true},
  {vo:0,io:quarter*2,ic:quarter,collidable:false,paintable:true},
  {vo:0,io:quarter*3,ic:total-quarter*3,collidable:true,paintable:true,grate:true}
 ]};
}
function compare(geo){
 const before=collisionBefore(geo),after=collision(geo);
 assert.deepEqual(Object.keys(after),Object.keys(before));
 for(const key of Object.keys(before)){
  assert.equal(after[key].constructor,before[key].constructor,key);
  assert.equal(after[key].byteLength,before[key].byteLength,key);
  assert.deepEqual(after[key],before[key],key+' must be byte-for-byte equivalent');
 }
}
test('source collision scalar path matches 4 deterministic random geometry seeds',()=>{
 for(const seed of [1,17,123456789,0xdeadbeef])compare(fixture(seed,4000));
});
test('degenerate and invalid triangle index fixtures preserve rejection and NaN semantics',()=>{
 for(const seed of [3,22,987])compare(fixture(seed,357,true));
});
test('collidable, grate, glass, paint and flipped-normal combinations retain exact owner flags',()=>{
 const geo=fixture(1,16);for(const o of geo.objects){o.collidable=true;o.paintable=!!o.glass;o.grate=!!o.paintable;o.glass=!!o.grate;}
 compare(geo);
});
