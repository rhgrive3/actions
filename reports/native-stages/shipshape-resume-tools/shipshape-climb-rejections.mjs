import fs from 'node:fs';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
import {readStage} from '../patches/native-stages/tests/fixture.mjs';
import {adaptBuildSource} from '../scripts/inkwave-source-composition.mjs';
const labels=[];
const f=await fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:(rel,source)=>{
 if(rel==='patches/native-stages/runtime/native-climb.mjs'){
  source=source.replace(/return null;/g,(text,offset)=>{const id=labels.length;labels.push(source.slice(Math.max(0,offset-180),offset).split('\n').at(-1));return `return nativeDiagnosticReject(${id});`;});
  source+='\nlet nativeDiagnosticLast=-1;function nativeDiagnosticReject(id){nativeDiagnosticLast=id;return null;} export function nativeClimbRejectReason(){return nativeDiagnosticLast;}\n';
 }
 return adaptBuildSource(rel,source);
},extraExports:"export {NativeLevel,NativePhysics,nativeClimbTransition} from './patches/native-stages/runtime/engine.mjs';export {nativeClimbRejectReason} from './patches/native-stages/runtime/native-climb.mjs';"});
const L=new f.NativeLevel(readStage(process.env.INKWAVE_NATIVE_STAGE_ASSETS,'shipshape')),P=new f.NativePhysics(L),source=JSON.parse(fs.readFileSync('.ci-scratch/bank-frontiers.json')),rows=[];
for(const [i,c] of source.sourceFrontiers.entries()){
 const node=(p,id)=>({x:p[0],y:p[1],z:p[2],id}),result=f.nativeClimbTransition({level:L,physics:P,step:1},node(c.lower,0),node(c.upper,1)),reason=f.nativeClimbRejectReason();rows.push({...c,accepted:!!result,rejectId:reason,rejectGuard:labels[reason]});
}
console.log(JSON.stringify(rows));
