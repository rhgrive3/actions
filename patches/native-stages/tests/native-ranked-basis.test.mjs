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
 assert.ok(project(stage.tower.path[0])< -10);assert.ok(project(stage.tower.path.at(-1))>10);
 const lateral=p=>(p[0]-basis.origin.x)*basis.lateral.x+(p[2]-basis.origin.z)*basis.lateral.z;
 const spread=stage.clams.spawns.map(lateral);assert.ok(Math.max(...spread)-Math.min(...spread)>10);
 // Force the ordinary path attempt to fail; the safe graph fallback must use
 // exactly the same supported-pad axis as the normal ranked goals.
 const original=G.nav.path;let calls=0;G.nav.path=function(...args){if(++calls<=2)return null;return original.apply(this,args);};
 const fallback=f.nativeRankedStage(G);assert.ok(project(fallback.tower.path[0])< -10);assert.ok(project(fallback.tower.path.at(-1))>10);
});
