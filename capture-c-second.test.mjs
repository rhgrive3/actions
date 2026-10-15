import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {createHash} from 'node:crypto';import {captureCSecond} from './capture-c-second.mjs';
const src=captureCSecond.toString(),block=src.match(/function fitHeldCamera[\s\S]*?\n  }/)[0],fit=vm.runInNewContext('('+block+')');
class V{constructor(x=0,y=0,z=0){Object.assign(this,{x,y,z});}copy(v){Object.assign(this,v);return this;}add(v){this.x+=v.x;this.y+=v.y;this.z+=v.z;return this;}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}normalize(){const n=Math.hypot(this.x,this.y,this.z);this.x/=n;this.y/=n;this.z/=n;return this;}applyQuaternion(){return this;}addScaledVector(v,d){this.x+=v.x*d;this.y+=v.y*d;this.z+=v.z*d;return this;}}
const bounds={min:new V(-1,-2,-.5),max:new V(1,2,.5)},center=new V(),make=(aspect=16/9)=>({isPerspectiveCamera:true,fov:34,aspect,zoom:1,near:.15,far:6500,position:new V(),quaternion:{clone(){return {invert(){return this;}}}},lookAt(){},updateMatrixWorld(){}});
function clipped(c){for(const x of [-1,1])for(const y of [-2,2])for(const z of [-.5,.5]){const d=c.position.z-z,t=Math.tan(c.fov*Math.PI/360)/c.zoom;if(!(Math.abs(x/(d*t*c.aspect))<=.9000001&&Math.abs(y/(d*t))<=.9000001&&d>c.near&&d<c.far))return true;}return false;}
test('literal camera fit uses perspective, zoom and aspect with ten percent edge margin',()=>{for(const aspect of [16/9,1,.4])for(const zoom of [1,2]){const c=make(aspect);c.zoom=zoom;fit(bounds,center,[0,0,1],c,{Vector3:V});assert.equal(clipped(c),false);}});
test('old fixed distance clips tall or narrow cases; invalid camera and nonfinite geometry reject',()=>{const c=make(.2);c.position.z=4*2.5;assert.equal(clipped(c),true);for(const key of ['aspect','fov','zoom','near']){const c=make();c[key]=0;assert.throws(()=>fit(bounds,center,[0,0,1],c,{Vector3:V}));}assert.throws(()=>fit({min:new V(NaN,0,0),max:new V(1,1,1)},center,[0,0,1],make(),{Vector3:V}));});
test('projection rejection, pair camera reuse and native pose/render submission gates remain mandatory',()=>{for(const token of ['projectedBounds.min.some(v=>v< -1)','projectedBounds.max.some(v=>v>1)','projectedBounds.max[0]<=projectedBounds.min[0]','projectedBounds.max[1]<=projectedBounds.min[1]','const fixed=baseCameras.get(comparisonKey)','row.triangles!==ref.triangles','row.drawCalls!==ref.drawCalls','Math.abs(v-b[i])>1e-8','frames.length!==8','error.capturePartial={frames,currentCapture,error:String(error)}'])assert.ok(src.includes(token),token);assert.equal(typeof vm.runInNewContext('('+src+')'),'function');});
test('native mount and restoration remain identical',()=>{const s=src.slice(src.indexOf('  function nativeHands'),src.indexOf('\n\n try{'));assert.equal(createHash('sha256').update(s).digest('hex'),'c927710194d2341a6153649f4c0f0b96adedc101d6f4ea489888efa6927aeb7e');});

test('camera restore failures still attempt every owned cleanup and restore global state',()=>{
 const start=src.lastIndexOf('}finally{')+'}finally{'.length,body=src.slice(start,src.lastIndexOf('\n }\n}'));
 const run=new Function('Math','G','before','camera','owned',body);
 for(const failure of ['position','quaternion','update']){
  const called=[],saved=()=>.2,M={random:()=>.9},G={actors:[1],time:99},before={random:saved,actors:[],time:4,cameraPosition:{},cameraQuaternion:{}};
  const step=name=>()=>{called.push(name);if(name===failure)throw Error(name);};
  const camera={position:{copy:step('position')},quaternion:{copy:step('quaternion')},updateMatrixWorld:step('update')};
  const owned=[{character:{dispose(){called.push('dispose1');throw Error('dispose1');}}},{character:{dispose(){called.push('dispose2');}}}];
  assert.throws(()=>run(M,G,before,camera,owned),/Native capture cleanup/);assert.equal(M.random,saved);assert.equal(G.actors,before.actors);assert.equal(G.time,4);assert(called.includes('dispose1'));assert(called.includes('dispose2'));
 }
});
