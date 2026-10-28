import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {runBuildSlices} from '../../../inkwave-public/src/core/buildSlices.js';
import {loadNative} from './prop-retention-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {adaptQueueWorld20261024} from '../queue-world-20261024-adapter.mjs';
const read=p=>fs.readFileSync(new URL('../../../'+p,import.meta.url),'utf8');
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/nav-build-before-slicing.json',import.meta.url)));
const rawNav=read('inkwave-public/src/game/nav.js');
function replaceMethod(source,klass,name,value){const ast=parse(source,{sourceType:'module',ecmaVersion:'latest'}),node=ast.body.map(x=>x.declaration||x).find(x=>x.type==='ClassDeclaration'&&x.id.name===klass).body.body.find(x=>x.key.name===name);return source.slice(0,node.start)+value+source.slice(node.end);}
const graphState=g=>({nodes:g.nodes,cells:g.cells,valid:Array.from(g.valid),validIds:g.validIds,x0:g.x0,z0:g.z0,nx:g.nx,nz:g.nz});
test('synchronous and sliced legacy navigation retain frozen graph, component tie and cell order on all layouts',async()=>{
 const f=await geometryFixture(),PLAYER={radius:Number(read('inkwave-public/src/config.js').match(/radius: ([\d.]+)/)[1])};
 const make=source=>new Function('THREE','PLAYER','runBuildSlices',source.replace(/^import .*;$/gm,'').replace(/^export /gm,'')+'\nreturn NavGraph;')(f.THREE,PLAYER,runBuildSlices);
 let old=rawNav;for(const [name,body]of Object.entries(frozen))old=replaceMethod(old,'NavGraph',name,body);const Before=make(old),After=make(rawNav);
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){const level=new f.Level(f.MAP_LAYOUTS[id]),expected=graphState(new Before(level,null));assert.deepEqual(graphState(new After(level,null)),expected,id+' sync');assert.deepEqual(graphState(await After.createLegacy(level,null,{budgetMilliseconds:.5})),expected,id+' async');}
 const controller=new AbortController();let checks=0;await assert.rejects(After.createLegacy(new f.Level(f.MAP_LAYOUTS.cargo),null,{signal:controller.signal,current:()=>++checks<8,budgetMilliseconds:0}),{name:'AbortError'});
});
const hash=array=>crypto.createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const meshes=kit=>[...kit._meshes,...kit._inst].map(m=>({name:m.name,count:m.count??1,cast:m.castShadow,receive:m.receiveShadow,box:m.geometry.boundingBox,sphere:m.geometry.boundingSphere,attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,hash(a.array)])),index:m.geometry.index&&hash(m.geometry.index.array),matrix:m.instanceMatrix&&hash(m.instanceMatrix.array)}));
test('sliced placement/merge keeps exact collider, vertex/index, bounds, instance and shadow state',async()=>{
 const f=await loadNative(true);
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){const placements=f.dressingFor(id),a=new f.PropKit(null),b=new f.PropKit(null),cols=placements.flatMap(p=>a.add(p.type,p).colliders);a.build();const added=await b.addAll(placements,{budgetMilliseconds:.5});await b.buildAsync({budgetMilliseconds:.5});assert.deepEqual(added,cols,id+' colliders');assert.deepEqual(meshes(b),meshes(a),id+' merged');assert.deepEqual(b.stats(),a.stats());await b.buildAsync({budgetMilliseconds:.5});assert.deepEqual(meshes(b),meshes(a),id+' rebuilt');a.dispose();b.dispose();}
});
test('sliced generator cancellation closes ownership before later work can run',async()=>{
 let closed=0,steps=0;function* build(){try{while(true){steps++;yield;}}finally{closed++;}}
 await assert.rejects(runBuildSlices(build(),{current:()=>steps<3,budgetMilliseconds:0}),{name:'AbortError'});assert.equal(steps,3);assert.equal(closed,1);
});
const composed=adaptBuildSource('src/main.js',read('inkwave-public/src/main.js'));
const main=composed.includes('props.addAll')?composed:adaptQueueWorld20261024('src/main.js',composed);
test('terminal connections await detached builders before publishing and preserve native/reused paint resets',()=>{
 const a=main.indexOf('  async _buildWorld('),b=main.indexOf('  _shadowRoots()',a),world=main.slice(a,b);
 assert(world.indexOf('await props.addAll')<world.indexOf('releaseNativeWorld(this)'));assert(world.indexOf('await props.buildAsync')<world.indexOf('releaseNativeWorld(this)'));assert(world.indexOf('await NavGraph.createLegacy')<world.indexOf('releaseNativeWorld(this)'));assert(world.includes('G.nav = nav;'));assert.match(world,/if \(!worldCurrent\(\)\) return;\s*throw e;/);
 const line=main.split('\n').find(line=>line.includes('NATIVE_IDS.includes(map.layout || map.id))) G.paint.clear()'));assert(line);
 for(const enabled of [false,true])for(const current of ['a','b','native'])for(const chosen of ['a','b','native']){let calls=0;new Function('map','nativeStageEnabled','NATIVE_IDS','G',line).call({layoutId:current},{id:chosen},enabled,['native'],{paint:{clear(){calls++;}}});assert.equal(calls,+(chosen===current||enabled&&chosen==='native'));}
});
