import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';
const frozen=JSON.parse(fs.readFileSync(new URL('../../splatoon3/tests/fixtures/ranked-queue-baseline-c0938a3f.json',import.meta.url)));
const original=frozen.files['patches/native-stages/runtime/native-nav.mjs'];
const source=fs.readFileSync(new URL('../runtime/native-nav.mjs',import.meta.url),'utf8');
const load=code=>new Function('THREE','PLAYER','nativeClimbTransition','nativeDropTransition','nativeSurgeTransition','nativeJumpAttachTransition','nativeWallApproachTransition','nativeApproachJumpTransition',code.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn {buildNativeNav,buildNativeNavAsync:typeof buildNativeNavAsync===\'function\'?buildNativeNavAsync:null};')(THREE,{radius:.3,height:1.8,stepUp:.4,fallDeathY:-20},...Array.from({length:6},(_,kind)=>(graph,n,m)=>{if(!m||!Number.isInteger(m.id)||((n.id+m.id+kind)%7))return null;return{to:m.id,cost:kind+2,type:['climb','drop','surge','attach','wall','approach'][kind]};}));
const old=load(original),next=load(source);
function graph(seed=0){
 const pads=[new THREE.Vector3(.5,0,.5),new THREE.Vector3(7.5,0,5.5)];
 const level={bounds:{minX:0,maxX:8,minZ:0,maxZ:6},spawnPads:pads,spawnBarrier:.1,data:{triangleFace:[0]},manifest:{sourceNavigation:{highDrops:!!(seed&1),wallJumpAttach:!!(seed&2),wallSurge:!!(seed&4),wallApproach:!!(seed&8)}},triangleWorld:{nodes:[0,-4,0,0,5],ray(p,d,max,o,out={point:new THREE.Vector3(),normal:new THREE.Vector3()}){
   const heights=[0,-2];if(p.x>2&&p.x<6&&p.z>1&&p.z<5)heights.unshift((seed%3)+1);
   const y=heights.find(y=>y<=p.y&&p.y-y<=max);if(y===undefined)return null;
   out.point.set(p.x,y,p.z);out.normal.set(0,1,0);out.flags=2;out.triangle=0;return out;
 }}};
 const result={level,physics:{bodyFits(){return true},los(a,b){return Math.abs(a.x-b.x)+Math.abs(a.z-b.z)<3}},step:1,nodes:[],_has(ix,iz,y){if(ix<0||iz<0||ix>=this.nx||iz>=this.nz)return false;return this.cells[iz*this.nx+ix].some(id=>Math.abs(this.nodes[id].y-y)<=.5)}};
 return result;
}
const output=g=>JSON.stringify({nodes:g.nodes,cells:g.cells,valid:Array.from(g.valid),validIds:g.validIds,spawns:g.nativeSpawnNodeIds,x0:g.x0,z0:g.z0,nx:g.nx,nz:g.nz});
test('time sliced native construction matches frozen source graph order, layers, edges, costs and spawn closure',async()=>{
 for(let flags=0;flags<16;flags++){
  const a=graph(flags),b=graph(flags),c=graph(flags);old.buildNativeNav(a);next.buildNativeNav(b);let time=0,yields=0;
  await next.buildNativeNavAsync(c,{now:()=>++time,budgetMilliseconds:4,yieldTask:async()=>{yields++}});
  assert.equal(output(b),output(a),'synchronous flags '+flags);assert.equal(output(c),output(a),'async flags '+flags);assert(yields>10);assert.equal(c.nativeBuildMetrics.yieldCount,yields);assert(c.nativeBuildMetrics.maxSliceMilliseconds>=4);
 }
});
test('interleaved detached builders cannot overwrite each other ray scratch or partial state',async()=>{
 const a=graph(15),b=graph(7),expectedA=graph(15),expectedB=graph(7);old.buildNativeNav(expectedA);old.buildNativeNav(expectedB);
 let time=0;const options={now:()=>++time,budgetMilliseconds:1,yieldTask:()=>new Promise(resolve=>setImmediate(resolve))};
 await Promise.all([next.buildNativeNavAsync(a,options),next.buildNativeNavAsync(b,options)]);
 assert.equal(output(a),output(expectedA));assert.equal(output(b),output(expectedB));
});
for(const abort of ['signal','generation'])test('cancel '+abort+' at navigation yield prevents resume and completion',async()=>{
 const g=graph(15),controller=new AbortController();let current=true,time=0,calls=0,atYield;
 const promise=next.buildNativeNavAsync(g,{signal:controller.signal,current:()=>current,now:()=>++time,budgetMilliseconds:1,yieldTask:async()=>{calls++;atYield=g.nodes.length;if(abort==='signal')controller.abort();else current=false;}});
 await assert.rejects(promise,{name:'AbortError'});assert.equal(calls,1);assert.equal(g.nodes.length,atYield);assert.equal(g.nativeBuildMetrics,undefined);assert.equal(g.valid,undefined);
});

test('default scheduled yield aborts without waiting for a suspended animation frame',async()=>{
 const savedFrame=globalThis.requestAnimationFrame,savedCancel=globalThis.cancelAnimationFrame;
 let scheduled=0,cancelled=0;
 globalThis.requestAnimationFrame=()=>++scheduled;globalThis.cancelAnimationFrame=id=>{assert.equal(id,scheduled);cancelled++;};
 try{const controller=new AbortController(),g=graph(15);let time=0;
  const pending=next.buildNativeNavAsync(g,{signal:controller.signal,now:()=>++time,budgetMilliseconds:1});
  assert.equal(scheduled,1);controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(cancelled,1);assert.equal(g.nativeBuildMetrics,undefined);
 }finally{if(savedFrame===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=savedFrame;if(savedCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=savedCancel;}
});

test('native empty cells share a frozen sentinel and populated cells remain private',()=>{
 const g=graph(0);g.physics.bodyFits=p=>!(p.x>3&&p.x<5&&p.z>1&&p.z<5);next.buildNativeNav(g);const empty=g.cells.filter(cell=>cell.length===0),occupied=g.cells.filter(cell=>cell.length>0);assert(empty.length>1);assert.equal(new Set(empty).size,1);assert(Object.isFrozen(empty[0]));assert.equal(new Set(occupied).size,occupied.length);assert(occupied.every(cell=>!Object.isFrozen(cell)));assert.throws(()=>empty[0].push(1),TypeError);
});
