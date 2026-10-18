import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const adapter=fs.readFileSync(new URL('../adapter.mjs',import.meta.url),'utf8');
const pads=fs.readFileSync(new URL('../../practice-range/runtime/pads.mjs',import.meta.url),'utf8');
const start=adapter.indexOf('`const _farCache = new WeakMap();');
const end=adapter.indexOf("}`,\n      'cache vertex signature",start);
assert.ok(start>=0&&end>start,'LOD helper extraction');
const v2=vm.runInNewContext(adapter.slice(start+1,end+1)+'\n({ getVertexSigs, clusterTopology, getMapping:()=>Array.from(_vc) })',{});
const metrics={};

class Attr {
 constructor(array,itemSize=3,{normalized=false,interleaved=false}={}){this._array=array;this.itemSize=itemSize;this.normalized=normalized;this.isInterleavedBufferAttribute=interleaved;this.array=interleaved?undefined:array;this.count=array.length/itemSize;}
 getComponent(i,k){return this._array[i*this.itemSize+k]};getX(i){return this.getComponent(i,0)};getY(i){return this.getComponent(i,1)};getZ(i){return this.getComponent(i,2)};
}
function mesh(position,{normal=null,skinIndex=null,skinWeight=null,ex=null,cloth=null,tint=null,triangles=null,options={}}={}) {
 const A={position:new Attr(position,3,options.position||{})};
 if(normal)A.normal=new Attr(normal,3,options.normal||{});
 if(skinIndex)A.skinIndex=new Attr(skinIndex,4,options.skinIndex||{});
 if(skinWeight)A.skinWeight=new Attr(skinWeight,4,options.skinWeight||{});
 if(ex)A.aEx=new Attr(ex,1,options.ex||{});
 if(cloth)A.aCloth=new Attr(cloth,2,options.cloth||{});
 if(tint)A.aTint=new Attr(tint,1,options.tint||{});
 return {attributes:A,index:triangles?{array:new Uint32Array(triangles)}:null};
}
function reference(src,cell){
 const A=src.attributes,P=A.position,n=P.count,N=A.normal,SI=A.skinIndex,SW=A.skinWeight,EX=A.aEx,CL=A.aCloth,TI=A.aTint;
 const inv=1/cell,key2c=new Map(),vc=new Int32Array(n),rx=[],ry=[],rz=[];
 let nc=0;
 const newC=(key,i)=>{const c=nc++;key2c.set(key,c);rx.push(N?N.getX(i):0);ry.push(N?N.getY(i):0);rz.push(N?N.getZ(i):0);return c};
 for(let i=0;i<n;i++){
  const x=P.getX(i),y=P.getY(i),z=P.getZ(i);
  let dom=0;if(SI&&SW){let bw=-1;for(let k=0;k<4;k++){const w=SW.getComponent(i,k);if(w>bw){bw=w;dom=SI.getComponent(i,k)}}}
  let d='';if(EX)d+=Math.round(EX.getX(i));if(CL)d+=':'+Math.round(CL.getX(i))+'.'+Math.round(CL.getY(i));if(TI){const t=TI.getX(i);d+=':'+(t<=-1.5?Math.round(t):0)}
  const key=`${Math.floor(x*inv)},${Math.floor(y*inv)},${Math.floor(z*inv)},${dom},${d}`;
  let c=key2c.get(key);
  if(c===undefined)c=newC(key,i);
  else if(N&&N.getX(i)*rx[c]+N.getY(i)*ry[c]+N.getZ(i)*rz[c]<-0.09){const k2=key+'#';c=key2c.get(k2);if(c===undefined)c=newC(k2,i)}
  vc[i]=c;
 }
 const idx=src.index?src.index.array:null,nt=(idx?idx.length:n)/3,tris=[],sourceCorners=[],seen=new Set();
 for(let t=0;t<nt;t++){
  const a=vc[idx?idx[t*3]:t*3],b=vc[idx?idx[t*3+1]:t*3+1],c=vc[idx?idx[t*3+2]:t*3+2];
  if(a===b||b===c||a===c)continue;
  const m=Math.min(a,b,c),key=m===a?`${a},${b},${c}`:m===b?`${b},${c},${a}`:`${c},${a},${b}`;
  if(seen.has(key))continue;seen.add(key);tris.push(a,b,c);
  if(A.aMat&&A.color)sourceCorners.push(idx?idx[t*3]:t*3,idx?idx[t*3+1]:t*3+1,idx?idx[t*3+2]:t*3+2);
 }
 return {nc,vc:Array.from(vc),tris};
}
function check(src,cell,msg){
 const ref=reference(src,cell);
 const fast=v2.clusterTopology(src,cell,v2.getVertexSigs(src));
 assert.equal(fast.nc,ref.nc,`${msg}: cluster count`);
 assert.deepEqual(Array.from(v2.getMapping()).slice(0,src.attributes.position.count),ref.vc,`${msg}: vertex equivalence`);
 assert.deepEqual(Array.from(fast.tris),ref.tris,`${msg}: oriented triangle equivalence`);
 metrics[msg]={vertices:src.attributes.position.count,clusters:fast.nc,triangles:fast.tris.length/3};
}
let seed=984133;
function random(){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296}
const n=9000,p=new Float32Array(n*3),no=new Float32Array(n*3),si=new Uint16Array(n*4),sw=new Float32Array(n*4),ex=new Float32Array(n),cl=new Float32Array(n*2),ti=new Float32Array(n);
for(let i=0;i<n;i++){
  for(let k=0;k<3;k++){p[i*3+k]=(random()-.5)*1.6;no[i*3+k]=random()*2-1;}
  for(let k=0;k<4;k++){si[i*4+k]=Math.floor(random()*65);sw[i*4+k]=random()}
  ex[i]=Math.floor(random()*11)-5;cl[i*2]=Math.floor(random()*6)-3;cl[i*2+1]=Math.floor(random()*4)-2;ti[i]=Math.floor(random()*8)-6;
}
const rand=mesh(p,{normal:no,skinIndex:si,skinWeight:sw,ex,cloth:cl,tint:ti});
for (const cell of [0.018,0.034,0.07,0.2]) check(rand,cell,'random cell='+cell);
check(mesh(new Float32Array([0,0,0,0,0,0,0,0,0,2,0,0,20,0,0,-20,0,0]),{ex:new Float32Array([0,256,-256,0,0,0])}),0.02,'attribute overflow and distant points');
check(mesh(new Float32Array([0,0,0,0,0,0]),{normal:new Float32Array([1,0,0,-1,0,0]),triangles:[]}),0.02,'two-sided normal split');
check(mesh(new Float32Array([0,0,0,0.00001,0,0]),{ex:new Float32Array([0,1]),options:{ex:{interleaved:true}},triangles:[]}),0.02,'interleaved attribute fallback');
check(mesh(new Float32Array([0,0,0,0.00001,0,0]),{ex:new Float32Array([0,1]),options:{ex:{normalized:true}},triangles:[]}),0.02,'normalized attribute fallback');
check(mesh(new Float32Array([0,0,0,1,0,0,0,1,0]),{triangles:[0,1,2,1,2,0,2,1,0]}),0.03,'oriented triangle preservation');
{
 const M=135000, a=new Float32Array(M*3);
 for(let i=0;i<M;i++){a[i*3]=i%100;a[i*3+1]=Math.floor(i/100)%100;a[i*3+2]=Math.floor(i/10000)}
 check(mesh(a),1,'oversized geometry safe hash growth');
}
// The optimized ring must match the old dynamically generated 48-sector RingGeometry.
assert.match(pads,/new THREE\.RingGeometry\([^\n]+48, 1, Math\.PI \/ 2, 0\.001\)/);
assert.match(pads,/setUsage\(THREE\.DynamicDrawUsage\)/);
const methodStart=pads.indexOf('  update(dt, on, k, weapon) {');
const methodEnd=pads.indexOf('\n  dispose() {',methodStart);
const method=pads.slice(methodStart,methodEnd).trim();
const colorStub={copy(){return this},multiplyScalar(){return this}};
const update=vm.runInNewContext('({'+method+'}).update',{THREE:{},PAD_R:1,Y:0.012,_gold:{},_tmp:colorStub,Math});
const ring={visible:false,position:{set(){return this}},geometry:{attributes:{position:{array:new Float32Array(2*(48+1)*3),needsUpdate:false}}}};
const ctx={t:0,_k:-1,ring,ringMat:{emissiveIntensity:0},rimMat:{emissiveIntensity:0},rim:{setColorAt(){},instanceColor:{}},defs:[],_col:[]};
for(const k of [0.02,0.1,0.25,0.5,0.99]){
 update.call(ctx,1/60,{x:0,z:0},k,null);
 const a=ring.geometry.attributes.position.array;
 for(let row=0;row<2;row++)for(let i=0;i<=48;i++){
  const rad=row===0?.98:1.16,ang=Math.PI/2+i/48*Math.max(.001,k*Math.PI*2),pos=(row*49+i)*3;
  assert.ok(Math.abs(a[pos]-rad*Math.cos(ang))<1e-7,'ring local X');
  assert.ok(Math.abs(a[pos+1]-rad*Math.sin(ang))<1e-7,'ring local Y');
  assert.equal(a[pos+2],0,'ring planar Z');
 }
}
metrics.ring='All 5 tested progress states match the original geometry positions within 1e-7 world units';
console.log(JSON.stringify({status:'PASS',cases:Object.keys(metrics).length,metrics},null,2));
