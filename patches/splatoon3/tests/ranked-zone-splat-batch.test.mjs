import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,adaptRuntime:adaptBuildSource,extraExports:`
 export {MAP_LAYOUTS} from './inkwave-public/src/world/maps.js';
 export {map3ArtColliders} from './inkwave-public/src/world/stages/map3-art.js';
 export {createRankedStage,RankedWorld} from './patches/splatoon3/runtime/ranked/world.mjs';
`});
function renderer(){let target;return{capabilities:{getMaxAnisotropy:()=>1},getRenderTarget:()=>target,setRenderTarget(x){target=x},getClearColor:c=>c.setHex(0),getClearAlpha:()=>1,setClearColor(){},render(){},clear(){},getViewport:o=>o.set(0,0,1024,1024),setViewport(){},getScissor:o=>o.set(0,0,1024,1024),setScissor(){},getScissorTest:()=>false,setScissorTest(){}};}
function setup(id,fast){
 const layout=f.MAP_LAYOUTS[id],colliders=f.map3ArtColliders(layout);
 if(layout.map3)assert(colliders.length>0,'MAP3 capture includes production structural and cover colliders');
 const level=new f.Level(layout,colliders),physics=new f.Physics(level);Object.assign(f.G,{level,physics,scene:new f.THREE.Scene(),time:0,netm:null});
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
for(const id of ['tidewater','kelpline','cargo','scorch'])test(id+' direct-face owner retains every ordered stamp, network receipt, CPU grid and GPU quad',()=>{
 const old=capture(id,false),next=capture(id,true);assert(next.wire.length>50);assert(old.hashReads>0,'before-face-optimization control must traverse hash buckets');assert.equal(next.hashReads,0,'production direct-face path performs zero broadphase hash reads');
 const reads=[old.hashReads,next.hashReads];delete old.hashReads;delete next.hashReads;assert.deepEqual(next,old);console.log(id+' hash cell reads '+reads.join(' -> '));
});
test('direct-face owner keeps custom query and repeated within-block face semantics',()=>{
 const {level,paint,world}=setup('tidewater',true),face=world._zoneCells[0][0].face,center=world._zoneCells[0][0].center,opts={seed:7,kind:'blast',instant:true,face:face.id};
 let calls=0;const query=level.queryBlocks;level.queryBlocks=function(...args){calls++;return query.apply(this,args)};paint.splat(center,.2,0,opts);assert(calls>0);level.queryBlocks=query;
 const block=level.blocks[face.block];block.faces[(block.faces.indexOf(face.id)+1)%6]=face.id;calls=0;const owner=paint._cpuSplat;paint._cpuSplat=function(...args){calls++;return owner.apply(this,args)};paint.splat(center,.2,0,opts);assert.equal(calls,2,'the source face loop retains duplicate processing within its owning block');
 world.dispose();paint.dispose();
});
// The previous central rectangle happened to include elevated cover, without
// requiring any sloped cell. Exercise a height cut through one actual MAP3
// ramp face; its excluded cells must survive both body and ancillary splats.
for(const scenario of [
 {id:'tidewater',tag:'A_market_return',center:[-19,2.4,-13],size:[4,12]},
 {id:'kelpline',tag:'A_boarding_recovery',center:[-34,1.8,-16],size:[7,6]},
])test(scenario.id+' production face-owner capture keeps a sloped height band isolated',()=>{
 const {level,paint,world}=setup(scenario.id,true);
 world.stage.zones=[{center:scenario.center,size:scenario.size}];world._buildZoneIndex();
 const projected=world._zoneCells[0];
 const slope=projected.filter(e=>level.blocks[e.face.block].tag===scenario.tag && e.face.n.y>.7 && e.face.n.y<.999);
 assert(slope.length>0,'the projected zone contains the actual authored slope');
 const outside=projected.filter(e=>Math.abs(e.center.y-scenario.center[1])>.75).map(e=>e.cell);
 const slopeOutside=slope.filter(e=>Math.abs(e.center.y-scenario.center[1])>.75);
 assert(outside.length>0,'the projected zone includes cells outside the floor-height band');
 assert(slopeOutside.some(e=>e.center.y>scenario.center[1]+.75) && slopeOutside.some(e=>e.center.y<scenario.center[1]-.75),'one sloped face crosses both edges of the height band');
 world.stage.zones[0].heightTolerance=.75;world._buildZoneIndex();
 assert(world._zoneCells[0].some(e=>slopeOutside.some(o=>o.face.id===e.face.id)),'retained and excluded cells belong to the same ramp face');
 assert(world._zoneCells[0].every(e=>Math.abs(e.center.y-scenario.center[1])<=.75001),'zone index retains only the calibrated height band');
 world.captureZone(0,0);
 assert(world.zoneCoverage()[0][0]>=.99,'the calibrated floor is captured');
 assert(outside.every(id=>paint.grid[id]===0),'no excluded cell is painted by the body or ancillary drops');
 world.dispose();paint.dispose();
});
