import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,adaptRuntime:adaptBuildSource,extraExports:`
 export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';
 export {createRankedStage,RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
`});
function renderer(){let target;return{capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>target,setRenderTarget(x){target=x},getClearColor:c=>c.setHex(0),getClearAlpha:()=>1,setClearColor(){},render(){},clear(){},getViewport:o=>o.set(0,0,1024,1024),setViewport(){},getScissor:o=>o.set(0,0,1024,1024),setScissor(){},getScissorTest:()=>false,setScissorTest(){}};}
function setup(id,fast){
 const level=new f.Level(f.MAP_LAYOUTS[id]),physics=new f.Physics(level);Object.assign(f.G,{level,physics,scene:new f.THREE.Scene(),time:0,netm:null});
 const paint=new f.PaintSystem(renderer(),level,{atlasSize:1024,cell:.5});f.G.paint=paint;
 const world=new f.RankedWorld({G:f.G,THREE:f.THREE,Hit:f.Hit},{mode:'zones',actors:[]},f.createRankedStage(f.G));
 assert.equal(typeof level.queryFaceBlock,'function','native face owner must be integrated before this regression');
 if(!fast)level.queryFaceBlock=()=>null;
 return{level,paint,world};
}
const plain=v=>JSON.parse(JSON.stringify(v));
function capture(id,batch){
 const {level,paint,world}=setup(id,batch),wire=[],queries=[];let count=0;
 // Observe the canonical source broadphase without changing its method identity.
 const hash=level.hash;level.hash=new Proxy(hash,{get(target,key){if(/^\d+$/.test(String(key)))count++;return Reflect.get(target,key);}});
 const old=paint.splat;paint.splat=function(c,r,t,o){queries.push([c.x,c.y,c.z,r,t,plain(o)]);return old.call(this,c,r,t,o)};
 f.G.netm={applying:false,mute:0,recSplat(c,r,t,o){wire.push([c.x,c.y,c.z,r,t,plain(o)]);return{clock:wire.length,peer:'host',seq:wire.length};}};
 const claimed=[];for(const [zone,team]of [[0,0],[1,1],[0,1],[0,0]])claimed.push(world.captureZone(zone,team));
 const result={claimed,wire,queries,coverage:plain(world.zoneCoverage()),grid:Buffer.from(paint.grid),counts:plain(paint.counts),quads:paint._q.slice(),pos:Buffer.from(paint.aPos.buffer),local:Buffer.from(paint.aLocal.buffer),splat:Buffer.from(paint.aSplat.buffer),stretch:Buffer.from(paint.aStretch.buffer),grow:Buffer.from(paint.aGrow.buffer),hashReads:count};
 f.G.netm=null;world.dispose();paint.dispose();return result;
}
for(const id of ['tidewater','cargo','scorch'])test(id+' direct-face owner retains every ordered stamp, network receipt, CPU grid and GPU quad',()=>{
 const old=capture(id,false),next=capture(id,true);assert(next.wire.length>50);assert(old.hashReads>0,'before-face-optimization control must traverse hash buckets');assert.equal(next.hashReads,0,'production direct-face path performs zero broadphase hash reads');
 const reads=[old.hashReads,next.hashReads];delete old.hashReads;delete next.hashReads;assert.deepEqual(next,old);console.log(id+' hash cell reads '+reads.join(' -> '));
});
test('direct-face owner keeps custom query and repeated within-block face semantics',()=>{
 const {level,paint,world}=setup('tidewater',true),face=world._zoneCells[0][0].face,center=world._zoneCells[0][0].center,opts={seed:7,kind:'blast',instant:true,face:face.id};
 let calls=0;const query=level.queryBlocks;level.queryBlocks=function(...args){calls++;return query.apply(this,args)};paint.splat(center,.2,0,opts);assert(calls>0);level.queryBlocks=query;
 const block=level.blocks[face.block];block.faces[(block.faces.indexOf(face.id)+1)%6]=face.id;calls=0;const owner=paint._cpuSplat;paint._cpuSplat=function(...args){calls++;return owner.apply(this,args)};paint.splat(center,.2,0,opts);assert.equal(calls,2,'the source face loop retains duplicate processing within its owning block');
 world.dispose();paint.dispose();
});
