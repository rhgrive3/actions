import test from 'node:test';
import assert from 'node:assert/strict';
import {convertSource} from '../runtime/source-convert.mjs';
import {nativeArenaBasis} from '../runtime/native-spawn.mjs';
import {nativeFixture} from './fixture.mjs';

// Synthetic plane is a unit fixture only; runtime stages retain their source.
const obj=`o Fld_Test_Floor
v -35 0 -35
v 35 0 -35
v 35 0 35
v -35 0 35
vn 0 1 0
vn 0 1 0
vn 0 1 0
vn 0 1 0
usemtl Floor
f 1//1 3//3 2//2
f 1//1 4//4 3//3
`;
for(const pads of [[[0,.08,-28],[0,.08,28]],[[-28,.08,0],[28,.08,0]],[[-20,.08,-20],[20,.08,20]]])test('local objectives follow opposing supported pads '+JSON.stringify(pads),async()=>{
 const f=await nativeFixture(),G=f.G,data=convertSource({id:'ranked-basis-unit',internal:'Vss_Test',bounds:{minX:-35,minZ:-35,maxX:35,maxZ:35},spawnPads:pads,spawnBarrier:2.5},obj,'newmtl Floor\nKd 1 1 1\n',{});
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:512,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);
 const stage=f.nativeRankedStage(G),basis=nativeArenaBasis(G.level),project=p=>(p[0]-basis.origin.x)*basis.forward.x+(p[2]-basis.origin.z)*basis.forward.z;
 assert.ok(project(stage.rainmaker.goals[0])>10);assert.ok(project(stage.rainmaker.goals[1])< -10);
 assert.deepEqual(Array.from(stage.rainmaker.nativeRetreatAxis),[basis.forward.x,basis.forward.z]);
 assert.equal(stage.tower.arenaSpan.bothHalvesVerified,true);assert.ok(stage.tower.arenaSpan.endpointProjection[0]<0&&stage.tower.arenaSpan.endpointProjection[1]>0);
 assert.ok(project(stage.tower.path[0])< -10);assert.ok(project(stage.tower.path.at(-1))>10);
 const lateral=p=>(p[0]-basis.origin.x)*basis.lateral.x+(p[2]-basis.origin.z)*basis.lateral.z;
 const spread=stage.clams.spawns.map(lateral);assert.ok(Math.max(...spread)-Math.min(...spread)>10);
 // Force the ordinary path attempt to fail; the safe graph fallback must use
 // exactly the same supported-pad axis as the normal ranked goals.
 const original=G.nav.path;let calls=0;
 G.nav.path=function(...args){calls++;return original.apply(this,args);};
 assert.equal(f.nativeRankedStage(G),stage);assert.equal(calls,0,'complete swept proof cached on the prepared source/nav/body');
 G.nav=Object.assign(Object.create(Object.getPrototypeOf(G.nav)),G.nav,{path:function(...args){if(++calls<=2)return null;return original.apply(this,args);}});
 calls=0;const fallback=f.nativeRankedStage(G);assert.ok(project(fallback.tower.path[0])< -10);assert.ok(project(fallback.tower.path.at(-1))>10);
});

test('human climb links cannot become inferred vehicle tower segments',async()=>{
 const f=await nativeFixture(),G=f.G,data=convertSource({id:'ranked-climb-unit',internal:'Vss_Test',bounds:{minX:-35,minZ:-35,maxX:35,maxZ:35},spawnPads:[[0,.08,-28],[0,.08,28]],spawnBarrier:2.5},obj,'newmtl Floor\nKd 1 1 1\n',{});
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:512,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);
 for(const node of G.nav.nodes)for(const edge of node.nb)edge.type='climb';
 const stage=f.nativeRankedStage(G);
 assert.equal(stage.tower.supported,false,'source climbing eligibility does not permit a vehicle sweep');
 assert.equal(stage.tower.status,'source-route-unverified');assert.ok(stage.rainmaker.goals.length===2&&stage.zones.length===1,'other human objectives still construct');
 assert.throws(()=>f.nativeRankedStage(G,'tower'),e=>e.code==='NATIVE_TOWER_SOURCE_CLEARANCE_UNSUPPORTED');
});


test('safe same-bank tower component cannot replace an opposing-half match',async()=>{
 const f=await nativeFixture(),G=f.G;
 const roof=`o Fld_Test_Ceiling
v 0 2.2 -35
v 35 2.2 -35
v 35 2.2 35
v 0 2.2 35
vn 0 -1 0
vn 0 -1 0
vn 0 -1 0
vn 0 -1 0
usemtl Floor
f 5//5 6//6 7//7
f 5//5 7//7 8//8
`;
 const data=convertSource({id:'ranked-bank-unit',internal:'Vss_Test',bounds:{minX:-35,minZ:-35,maxX:35,maxZ:35},spawnPads:[[-28,.08,0],[28,.08,0]],spawnBarrier:2.5},obj+roof,'newmtl Floor\nKd 1 1 1\n',{});
 G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,G.level,{atlasSize:512,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);
 const ends=[new f.THREE.Vector3(-14,0,0),new f.THREE.Vector3(14,0,0)].map(p=>G.nav.nearest(p,1.2));assert.ok(G.nav.path(ends[0],ends[1],0,50000),'human walking still reaches both source-supported halves');
 const stage=f.nativeRankedStage(G);assert.equal(stage.tower.supported,false,'clear and boardable left-bank source nodes cannot qualify Tower');assert.equal(stage.tower.status,'source-route-unverified');assert.ok(stage.rainmaker.goals[0][0]>10&&stage.rainmaker.goals[1][0]<-10,'other rules retain opposed source goals');
});
