import * as THREE from 'three';
import { PaintSystem } from '/src/world/paint.js';
import { PaintSystem as CandidatePaintSystem } from '/src/world/paint-candidate.js';
const assert=(v,msg)=>{if(!v)throw Error(msg)};
export async function run(){
 const canvas=document.createElement('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:false,alpha:true});renderer.setSize(256,256,false);
 const gl=renderer.getContext(),errors=[];renderer.debug.checkShaderErrors=true;
 const hiddenMaterial=new THREE.MeshBasicMaterial({visible:false}),hiddenScene=new THREE.Scene(),hiddenMesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),hiddenMaterial);hiddenScene.add(hiddenMesh);
 await renderer.compileAsync(hiddenScene,new THREE.OrthographicCamera(-1,1,1,-1,-1,1));const hiddenMaterialCompiled=!!renderer.properties.get(hiddenMaterial).currentProgram;assert(hiddenMaterialCompiled&&!hiddenMaterial.visible,'compileAsync must include invisible material');hiddenMesh.geometry.dispose();hiddenMaterial.dispose();

 renderer.debug.onShaderError=(gl,p,vs,fs)=>errors.push({program:gl.getProgramInfoLog(p),vertex:gl.getShaderInfoLog(vs),fragment:gl.getShaderInfoLog(fs)});
 const create=(C)=>{const paint=Object.create(C.prototype);Object.assign(paint,{level:{native:true},renderer,size:256,usedHeight:256,quads:0,clock:0,grid:new Uint8Array(1),dead:new Uint8Array(1),counts:[0,0],growing:[]});paint._initGPU();paint.dryMesh.visible=false;return paint;};
 const a=create(PaintSystem),b=create(CandidatePaintSystem);assert(b[Symbol.for('inkwave.native-paint-transfer.state.v1')],'candidate not enabled');
 function clear(p){const prev=renderer.getRenderTarget(),col=renderer.getClearColor(new THREE.Color()).clone(),alpha=renderer.getClearAlpha();renderer.setRenderTarget(p.rt);renderer.setClearColor(0,0);renderer.clear(true,true,true);renderer.setClearColor(col,alpha);renderer.setRenderTarget(prev);p.quads=0;p.dryMesh.visible=false;}
 function pixel(p){const out=new Uint8Array(256*256*4);renderer.readRenderTargetPixels(p.rt,0,0,256,256,out);return out;}
 const face={atlas:{x:0,y:0,pad:2,ppm:16},su:15,sv:15,wall:false};
 function push(p,j,small=false){const x=small?(j%240)/16:(j%8)*1.5+1,y=small?(Math.floor(j/240)%240)/16:(Math.floor(j/8)%8)*1.5+1;face.wall=(j%5===0);const r=small?.08:.55;
  p._pushQuad(face,x-r,x+r,y-r,y+r,x,y,0,.65,j%2,(j*.017)%1,j%7,.6,.8,.5,.3+(j%5)*.25,.2+(j%4)*.2,j%11===0?1:0);
 }
 const cases=[];
 for(const [name,count,small] of [['one',1,false],['overlap',24,false],['mixed',128,false],['capacity',6000,true],['overflow',6001,true]]){
  clear(a);clear(b);for(let j=0;j<count;j++){push(a,j,small);push(b,j,small);}a._drawQuads();b._drawQuads();const pa=pixel(a),pb=pixel(b);let diff=0,max=0,nonzero=0;for(let i=0;i<pa.length;i++){if(pa[i])nonzero++;const d=Math.abs(pa[i]-pb[i]);if(d){diff++;max=Math.max(max,d)}}cases.push({name,count,differingBytes:diff,maxDifference:max,nonzeroBytes:nonzero});assert(diff===0,`${name}: ${diff} differing bytes`);assert(nonzero>0,`${name}: empty output`);assert(gl.getError()===gl.NO_ERROR,`${name}: GL error`);assert(errors.length===0,`${name}: shader ${JSON.stringify(errors)}`);
 }
 // Mutated individual vertex values must use the original geometry.
 for(const key of ['aPos','aLocal','aSplat','aStretch','aGrow']){
  clear(a);clear(b);push(a,0);push(b,0);
  const offset={aPos:6,aLocal:9,aSplat:4,aStretch:3,aGrow:4}[key];
  a[key][offset]+=.125;b[key][offset]+=.125;
  let seen=null;const oldRender=renderer.render;renderer.render=function(scene,...args){if(scene===b.scene)seen=b.mesh.geometry;return oldRender.call(this,scene,...args);};
  a._drawQuads();b._drawQuads();renderer.render=oldRender;
  const aa=pixel(a),bb=pixel(b);assert(aa.every((v,i)=>v===bb[i]),key+' custom vertex pixels');assert(seen===b.geo,key+' fallback geometry');
 }
 // A custom mesh hook must also keep the original rendering path.
 clear(a);clear(b);push(a,0);push(b,0);let customSeen=null;b.mesh.onBeforeRender=function(){customSeen=b.mesh.geometry};a._drawQuads();b._drawQuads();assert(customSeen===b.geo,'custom hook fallback');b.mesh.onBeforeRender=THREE.Object3D.prototype.onBeforeRender;
 const ca=pixel(a),cb=pixel(b);assert(ca.every((v,i)=>v===cb[i]),'custom hook pixels');
 // Verify an accumulating atlas through repeated opposing-team overlays,
 // wall splats, growth phases, and subtractive drying, not just fresh draws.
 clear(a);clear(b);a._iwPaintDryRegions?.tracker.reset();b._iwPaintDryRegions?.tracker.reset();
 const timeline={frames:36,compared:0,differingBytes:0,nonzeroFinal:0};
 for(let frame=0;frame<timeline.frames;frame++){
  for(const p of [a,b]){for(let j=0;j<(frame*7)%9;j++)push(p,frame*7+j,false);p.dryMesh.visible=frame%3===0;p._dryU.uDry.value=2/255;p._drawQuads();}
  const x=pixel(a),y=pixel(b);let diff=0,nonzero=0;for(let i=0;i<x.length;i++){if(x[i])nonzero++;if(x[i]!==y[i])diff++;}timeline.compared++;timeline.differingBytes+=diff;timeline.nonzeroFinal=nonzero;assert(diff===0,`timeline frame ${frame}: ${diff} differing bytes`);
 }
 assert(timeline.nonzeroFinal>0,'timeline ended empty');assert(gl.getError()===gl.NO_ERROR,'timeline GL error');
 // Isolated API count and wall timing; same generated content and two live
 // render targets. gl.finish measures completion only for this synthetic test.
 const calls={base:{calls:0,bytes:0},trial:{calls:0,bytes:0}};let measured=null;
 const originalSubData=gl.bufferSubData;gl.bufferSubData=function(...args){if(measured){const data=args[2],unit=data?.BYTES_PER_ELEMENT||1,start=args[3]||0,len=args[4];calls[measured].calls++;calls[measured].bytes+=(len||Math.max(0,(data?.byteLength||0)/unit-start))*unit;}return originalSubData.apply(this,args)};
 for(const side of ['base','trial']){const p=side==='base'?a:b;clear(p);for(let j=0;j<240;j++)push(p,j,true);p._drawQuads();gl.finish();measured=side;for(let j=0;j<240;j++)push(p,j,true);p._drawQuads();gl.finish();measured=null;}
 gl.bufferSubData=originalSubData; assert(calls.base.bytes===61440 && calls.trial.bytes===19200, 'unexpected bytes '+JSON.stringify(calls));
 const samples=[];
 for(const side of ['base','trial','trial','base','base','trial','trial','base','base','trial','trial','base']){
  const p=side==='base'?a:b;clear(p);for(let warm=0;warm<5;warm++){for(let j=0;j<240;j++)push(p,j,true);p._drawQuads();}gl.finish();
  const t=performance.now();for(let iter=0;iter<20;iter++){for(let j=0;j<240;j++)push(p,j,true);p._drawQuads();}gl.finish();samples.push({side,ms:performance.now()-t});
 }
 const result={hiddenMaterialCompiled,renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR),cases,customFallback:true,timeline,samples,calls,glError:gl.getError(),errors};renderer.dispose();return result;
}
