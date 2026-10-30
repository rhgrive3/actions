import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {webcrypto} from 'node:crypto';
import {installPairedBlastDiagnostics} from './paired-blast-diagnostics.mjs';
function fixture(mutate){
 const attr={array:new Float32Array([.1,.2,.3,.92]),itemSize:4,normalized:false};
 const geo={attributes:{aColA:attr,aMisc:{array:new Float32Array([.1,.4,1,0]),itemSize:4,normalized:false}},instanceCount:1,drawRange:{start:0,count:6},index:null};
 const node={name:'shell',type:'Mesh',geometry:geo,position:{x:0,toArray(){return [this.x,0,0]}},material:{id:1,uuid:'mat',type:'ShaderMaterial',transparent:true,uniforms:{uSunCol:{value:{x:1,toArray(){return [this.x,1,1]}}}}}};
 const pool=()=>({n:0,cap:1,X:new Float32Array(9)});
 const shells={...pool(),n:1,P:new Float32Array(3),V:new Float32Array(3),C:new Float32Array(3),X:new Float32Array([1,2,.1,.34,1,.92,1,.4,0]),A:new Float32Array([0,1,0,0]),geo};
 const fx={shells,_time:.1,_dt:1/60,motes:{geometry:{attributes:{aSeed:{array:new Float32Array([.1,.2,.3,.4])}}}},root:{traverse:fn=>fn(node)}};
 for(const k of ['puffs','glows','rings','beams','marks','pillars'])fx[k]=pool();
 const paint={rt:{width:1,height:1,texture:{type:1009,format:1023}},clock:0,frame:0,version:0,grid:new Uint8Array(4),paintFaces:[{id:0}],_q:[],growing:[]};
 let renders=0,pixels=new Uint8Array([1,2,3,4]);
 const matrix={toArray:()=>[1,0,0,1]},actor={pos:{toArray:()=>[1,2,3]},s3:{actions:{roll:null}}};
 const canvas={width:7,height:5,toDataURL:()=> 'data:image/png;base64,'+Buffer.from('render-'+attr.array[3]+(mutate==='pixels'&&renders>1?renders:'')).toString('base64')};
 const renderer={domElement:canvas,getContext:()=>({getError:()=>0}),readRenderTargetPixels:(rt,x,y,w,h,out)=>out.set(pixels)};
 const G={fx,paint,time:1,env:{time:0,U:{uTime:{value:0}}},camera:{matrixWorld:matrix,projectionMatrix:matrix},renderer};
 const game={time:1,match:{local:actor},R:{render(){renders++;if(mutate==='temporaryUniform')node.material.uniforms.uSunCol.value.x=renders===2?2:1;if(renders===2){if(mutate==='transform')node.position.x++;if(mutate==='uniform')node.material.uniforms.uSunCol.value.x++;if(mutate==='clock')G.time++;if(mutate==='pool')shells.P[0]++;if(mutate==='targetGPU')attr.array[3]=.5;if(mutate==='otherGPU')geo.attributes.aMisc.array[0]++;if(mutate==='paintFace')paint.paintFaces[0].id++;if(mutate==='paintCPU')paint.grid[0]++;if(mutate==='paintGPU')pixels[0]++;if(mutate==='rng')ctx.draws++;if(mutate==='throw')throw Error('injected render failure');}}}};
 const ctx={__G:G,__inkwave:game,__iwFxClock:()=>({time:fx._time}),__iwSurfaceClock:()=>({time:1}),__iwBlastLighting:()=>({exposure:1}),draws:0,__iwBlastRng:{snapshot:()=>({seed:1,state:1,draws:ctx.draws})},crypto:webcrypto,TextEncoder,atob:s=>Buffer.from(s,'base64').toString('binary')};
 runInNewContext('('+installPairedBlastDiagnostics.toString()+')()',ctx);ctx.__iwMarkBlastShell();return {ctx,attr,original:attr.array[3],shells};
}
test('paired rendering changes only GPU alpha and restores exact state and pixels',async()=>{const f=fixture();const r=await f.ctx.__iwCapturePairedBlast(3);assert.equal(f.attr.array[3],f.original);assert.equal(f.shells.X[5],f.original);assert.deepEqual(JSON.parse(JSON.stringify(r.dimensions)),{width:7,height:5,format:'image/png'});assert.equal(r.restoration.originalPngSHA256,r.restoration.restoredPngSHA256);assert.notEqual(r.alpha1,r.alpha092);assert.match(r.restoration.paintAtlasSHA256,/^[0-9a-f]{64}$/);});
test('clock pool otherGPU CPU/GPU paint RNG pixels and render failure fail closed with alpha restored',async()=>{for(const kind of ['temporaryUniform','transform','uniform','clock','pool','targetGPU','otherGPU','paintFace','paintCPU','paintGPU','rng','pixels','throw']){const f=fixture(kind);await assert.rejects(()=>f.ctx.__iwCapturePairedBlast(0),undefined,kind);assert.equal(f.attr.array[3],f.original,kind);}});
test('wrong frame and changed shell identity fail before pair',async()=>{let f=fixture();await assert.rejects(()=>f.ctx.__iwCapturePairedBlast(1));f=fixture();f.shells.X[7]=.9;await assert.rejects(()=>f.ctx.__iwCapturePairedBlast(9));assert.equal(f.attr.array[3],f.original);});
