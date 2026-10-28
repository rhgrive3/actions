import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptRemainingVisualQueue20261027} from '../queue-remaining-visual-20261027-adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const rel='src/game/motion/retarget.js',source=fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8');
const ccd='if(angle>0.35)this.ccdWorld.identity().slerp(this.ccdLocal.setFromUnitVectors(this.ccdB,this.ccdC),0.35/angle);';
const init='this.groundInvQ=new THREE.Quaternion();';
const fk='invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundInvQ.invert());';
const forward='q.copy(this.groundInvQ).invert().multiply(f.orientation);';
const input=[ccd,init,fk,forward].join('\n');
const outputInv='invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundForwardQ.copy(this.groundInvQ),this.groundInvQ.invert());';
const outputFoot='q.copy(this.groundForwardQ).multiply(f.orientation);';
test('real 031 retarget composition applies both existing FK and all visual queue replacements exactly once',()=>{
 const result=adaptBuildSource(rel,source);
 for(const token of ['this.groundForwardQ=new THREE.Quaternion();',outputInv,outputFoot,'if(angle>0.35){this.ccdLocal.copy(this.ccdWorld);this.ccdWorld.identity().slerp(this.ccdLocal,0.35/angle);}'])assert.equal(result.split(token).length-1,1,token);
 assert.equal(result.includes(fk),false);assert.equal(result.includes(forward),false);
});
test('visual adapter accepts exact post-FK anchors only; missing or repeated inputs fail closed',()=>{
 const out=adaptRemainingVisualQueue20261027(rel,input);assert.equal(out.split(outputInv).length-1,1);assert.equal(out.split(outputFoot).length-1,1);
 for(const anchor of [ccd,init,fk,forward])for(const replacement of ['',anchor+'\n'+anchor])assert.throws(()=>adaptRemainingVisualQueue20261027(rel,input.replace(anchor,replacement)),/Remaining visual queue .*expected 1 anchors/);
 assert.equal(adaptRemainingVisualQueue20261027('src/other.js',input),input);
});
test('exact existing shared quaternion stays single and partial shared state fails closed',()=>{
 const replacements=[[init,init+'this.groundForwardQ=new THREE.Quaternion();'],[fk,outputInv],[forward,outputFoot]];
 const shared=replacements.reduce((code,[old,value])=>code.replace(old,value),input);
 const expected=adaptRemainingVisualQueue20261027(rel,input);
 assert.equal(adaptRemainingVisualQueue20261027(rel,shared),expected);
 for(let mask=1;mask<7;mask++){
  const partial=replacements.reduce((code,[old,value],index)=>(mask&(1<<index))?code.replace(old,value):code,input);
  assert.throws(()=>adaptRemainingVisualQueue20261027(rel,partial),/Remaining visual queue .*shared quaternion/,'partial shared state '+mask);
 }
 for(const [,value] of replacements){
  assert.throws(()=>adaptRemainingVisualQueue20261027(rel,shared+'\n'+value),/Remaining visual queue .*shared quaternion/,'duplicate shared anchor');
  assert.throws(()=>adaptRemainingVisualQueue20261027(rel,shared.replace(value,'')),/Remaining visual queue .*shared quaternion/,'missing shared anchor');
 }
 for(const code of [input,shared])assert.throws(()=>adaptRemainingVisualQueue20261027(rel,code+'\nthis.groundForwardQ=new THREE.Quaternion();'),/Remaining visual queue .*shared quaternion/,'unpaired or duplicate initializer');
});
test('source composition still rejects missing and duplicated pre-FK anchor',()=>{
 const original='invRot=c.kid.getWorldQuaternion(this.groundInvQ).invert();';assert.equal(source.split(original).length-1,1);
 for(const replacement of ['',original+'\n'+original])assert.throws(()=>adaptBuildSource(rel,source.replace(original,replacement)),/contact FK: read refreshed kid rotation/);
});
test('actual generated quaternion expressions preserve inverse and both foot orientations',()=>{
 const result=adaptBuildSource(rel,source);assert.equal(result.split(outputInv).length-1,1);assert.equal(result.split(outputFoot).length-1,1);
 const reference=new Function('c','q1','q2',`const invRot=(c.kid.matrixWorld.decompose(this.ccdA,this.groundInvQ,this.ccdB),this.groundInvQ.invert());const feet=[q1,q2].map(orientation=>{let q=new THREE.Quaternion();const f={orientation};${forward}return q.toArray()});return {inverse:invRot.toArray(),feet};`);
 const candidate=new Function('c','q1','q2',`const ${outputInv}const feet=[q1,q2].map(orientation=>{let q=new THREE.Quaternion();const f={orientation};${outputFoot}return q.toArray()});return {inverse:invRot.toArray(),feet};`);
 // `THREE` is explicit, avoiding any character/model fixture or render.
 const make=(body)=>new Function('THREE','c','q1','q2',`return (${body.toString()}).call(this,c,q1,q2)`);
 const oldRun=make(reference),newRun=make(candidate);
 for(let i=0;i<240;i++){
  const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.013,i*.021,i*.007));const pos=new THREE.Vector3(i*.01,-.3,.2),scale=new THREE.Vector3((i%2?-1:1)*(1+(i%3)*.2),.8+(i%5)*.1,1.1);const matrixWorld=new THREE.Matrix4().compose(pos,q,scale);const c={kid:{matrixWorld}};
  const feet=[new THREE.Quaternion().setFromEuler(new THREE.Euler(i*.007,-i*.011,.3)),new THREE.Quaternion().setFromEuler(new THREE.Euler(-i*.005,.2,i*.019))];
  const state=()=>({ccdA:new THREE.Vector3(),ccdB:new THREE.Vector3(),groundInvQ:new THREE.Quaternion(),groundForwardQ:new THREE.Quaternion()});
  assert.deepEqual(newRun.call(state(),THREE,c,...feet),oldRun.call(state(),THREE,c,...feet),'both feet case '+i);
 }
});
