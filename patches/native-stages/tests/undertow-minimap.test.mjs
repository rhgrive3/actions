import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {readStage} from './fixture.mjs';

const load = () => fixture({fullRuntime: true, adaptNative: adaptBuildSource, adaptRuntime: adaptBuildSource, extraExports: `
  export {NativeLevel, NativePhysics} from './patches/native-stages/runtime/engine.mjs';
  export {NavGraph} from './inkwave-public/src/game/nav.js';
  export {nativeMinimapSupport, buildNativeMinimap} from './patches/native-stages/runtime/native-minimap.mjs';
`});

function layered(f, upperReachable = false) {
  const triangles = new Float32Array([-2,0,-2, 2,0,-2, 2,0,2, -2,0,-2, 2,0,2, -2,0,2,
    -2,3,-2, 2,3,-2, 2,3,2, -2,3,-2, 2,3,2, -2,3,2,
    -2,8,-2, 2,8,-2, 2,8,2, -2,8,-2, 2,8,2, -2,8,2]);
  const objects = [0,3,8].map(y => ({collidable: true, paintable: true, bounds: [[-2,y,-2],[2,y,2]]}));
  const faces = objects.map((o,i) => ({origin: [-2,o.bounds[0][1],-2], u:[1,0,0], v:[0,0,1], n:[0,1,0], su:4, sv:4, nu:4, nv:4, cu:1, cv:1, grid:i*16, object:i, triangles:[i*2,i*2+1], bounds:o.bounds}));
  const level = new f.NativeLevel({triangles, normals: new Float32Array([0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0]), flags:new Uint32Array(6).fill(3), objectIds:new Uint32Array([0,0,1,1,2,2]),
    nodes:new Float32Array([-2,0,-2,2,8,2,-1,6]), order:new Uint32Array([0,1,2,3,4,5]), triangleFace:new Int32Array([0,0,1,1,2,2]), mask:new Uint8Array(48).fill(1),
    manifest:{id:'roof-layer-fixture', bounds:{minX:-2,minZ:-2,maxX:2,maxZ:2}, spawnPads:[[0,0,0],[.5,0,.5]], spawnBarrier:.1, gridCells:48, faces, objects}});
  const nodes = [{id:0,x:0,y:0,z:0,nb:upperReachable?[{to:1}]:[]},{id:1,x:0,y:3,z:0,nb:[]},{id:2,x:0,y:8,z:0,nb:[{to:0}]}];
  level.nativeNav = {level, nodes, validIds:[0,1,2], valid:new Uint8Array([1,1,1]), x0:0,z0:0,step:1,nx:1,nz:1,cells:[[0,1,2]],nearest:()=>0};
  return level;
}

test('minimap selects the highest reachable exact floor beneath unreachable roofs and retains CPU ink', async () => {
  const f = await load();
  for (const upperReachable of [false,true]) {
    const level = layered(f, upperReachable), bytes = Buffer.from(level.data.triangles.buffer).slice(), before = new Uint8Array(48).fill(0);
    const target = upperReachable ? 3 : 0;
    assert.equal(f.nativeMinimapSupport(level,0,0).point.y,target);
    const map = {level,paint:{dead:before,grid:new Uint8Array(48).fill(1)},w:1,h:1,flip:false,
      canvas:{},base:{},inkC:{},flashC:{},ictx:{createImageData:()=>({data:new Uint8Array(4)})},fctx:{createImageData:()=>({data:new Uint8Array(4)})},
      _worldX:()=>0,_worldZ:()=>0,_drawBase(){}};
    const grid = map.paint.grid.slice(); f.buildNativeMinimap(map);
    assert.equal(map.hgt[0],target); assert.equal(map.pixCell[0],upperReachable?26:10);
    assert.deepEqual(map.paint.grid,grid);
    assert.deepEqual(Buffer.from(level.data.triangles.buffer),bytes);
    level.nativeNav.level = {}; // detached preparation cannot borrow the old world's nav
    assert.equal(f.nativeMinimapSupport(level,0,0).point.y,8);
  }
});

test('minimap preserves obstacle silhouettes without nearby reachable floors', async () => {
  const f = await load(), level = layered(f);
  level.nativeNav.nodes[0].x = 10;
  assert.equal(f.nativeMinimapSupport(level,0,0).point.y,8);
});

const root = process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const originals = process.env.UNDERTOW_MINIMAP_ORIGINAL_ASSETS;
const sources = new Map(root ? JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))).stages.map(s=>[s.id,root]) : []);
if(originals)for(const id of ['scorch','hagglefish','inkblot','mako','brinewater'])if(!sources.has(id))sources.set(id,originals);
test('reachable minimap samples preserve pinned source support and paint ownership', {skip:!root}, async () => {
  const f = await load(), reports = [];
  for (const [id,directory] of sources) {
    const level = new f.NativeLevel(readStage(directory,id)), physics = new f.NativePhysics(level);
    level.nativeNav = new f.NavGraph(level,physics);
    const geometry = Buffer.from(level.data.triangles.buffer).slice(), nav = level.nativeNav;
    const reachable = new Set(), queue = level.spawnPads.map(p=>nav.nearest(p,1.2));
    for (const id of queue) reachable.add(id);
    for(let i=0;i<queue.length;i++)for(const e of nav.nodes[queue[i]].nb)if(nav.valid[e.to]&&!reachable.has(e.to)){reachable.add(e.to);queue.push(e.to);}
    const nodes = queue.filter(id=>nav.nodes[id].nativePaintable), stride = Math.max(1,Math.floor(nodes.length/80));
    let sampled=0, underneath=0;
    for(let i=0;i<nodes.length;i+=stride){
      const node = nav.nodes[nodes[i]], exact = level.triangleWorld.ray(new f.THREE.Vector3(node.x,node.y+.1,node.z),new f.THREE.Vector3(0,-1,0),.3,{minNormalY:.68});
      if(!exact)continue;
      const hit = f.nativeMinimapSupport(level,node.x,node.z);
      assert.ok(hit,'source support retained: '+id);
      assert.ok(hit.point.y>=node.y-.15,'minimap stays at or above reachable source floor: '+id);
      const near = queue.some(j=>{const n=nav.nodes[j],height=n.y-(hit.normal.x*(node.x-n.x)+hit.normal.z*(node.z-n.z))/hit.normal.y;return Math.hypot(node.x-n.x,node.z-n.z)<=nav.step*1.1&&Math.abs(height-hit.point.y)<.15;});
      assert.ok(near,'chosen layer is reachable: '+id);
      const top=level.triangleWorld.ray(new f.THREE.Vector3(node.x,level.triangleWorld.nodes[4]+1,node.z),new f.THREE.Vector3(0,-1,0),level.triangleWorld.nodes[4]-level.triangleWorld.nodes[1]+2,{minNormalY:.45});
      if(top.point.y>hit.point.y+.15)underneath++;
      sampled++;
    }
    assert.ok(sampled>30);
    assert.deepEqual(Buffer.from(level.data.triangles.buffer),geometry,'projection leaves collision triangles exact');
    reports.push({id,sampled,underneathUnreachableCover:underneath,reachableNodes:reachable.size});
  }
  if(process.env.UNDERTOW_MINIMAP_EVIDENCE){fs.mkdirSync(path.dirname(process.env.UNDERTOW_MINIMAP_EVIDENCE),{recursive:true});fs.writeFileSync(process.env.UNDERTOW_MINIMAP_EVIDENCE,JSON.stringify(reports,null,2));}
  console.log(JSON.stringify(reports));
});
