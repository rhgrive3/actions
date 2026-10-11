// Regression tests of emitted production modules. No substitute collision or stage implementation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'/mnt/data/inkwave-stage-site');
const load=p=>import(pathToFileURL(path.join(root,p)));
const T=await load('vendor/three/build/three.module.js');
const {getStageLayout,stageDescriptor,assertStageCompatibility}=await load('src/world/stages/splatoon3/index.js');
const {Level}=await load('src/world/level.js');
const {Physics,GroundHit}=await load('src/game/physics.js');
const {StageRuntime}=await load('src/world/stages/splatoon3/runtime.js');
const {G}=await load('src/core/ctx.js');
const tests=[]; const test=(name,fn)=>{try{fn();tests.push({name,pass:true});}catch(e){tests.push({name,pass:false,error:e.stack});}};
function fixture(id,rule='turf') {
 const level=new Level(getStageLayout(id,rule)),physics=new Physics(level),mat=new T.MeshBasicMaterial();
 G.level=level;G.physics=physics;G.actors=[];
 // Real face packing is a GPU paint responsibility. These UVs exercise only the stage mesh rebuild.
 for(const f of level.faces)f.atlas={x:0,y:0,pad:1,ppm:8};
 const runtime=new StageRuntime(level,new T.Scene(),{size:2048},mat,mat,{scenery:false});runtime.reset();
 return {level,physics,runtime,dispose(){runtime.dispose();mat.dispose();G.actors=[];}};
}
test('Lemuria co-planar conveyor owns visible material, collision and uninkable surface',()=>{
 const f=fixture('lemuria');try{
 const b=f.level.blocks.find(b=>b.conveyor),point=b.center.clone().addScaledVector(b.axes[1],b.half.y),h=f.physics.groundProbe(point.x,point.y,point.z,.1,.1,0,new GroundHit());
 assert.ok(h.hit);assert.equal(h.block,b.id);assert.equal(f.level.faces[h.face].paintable,false);
 const actor={pos:point.clone(),grounded:true,alive:true,remote:false,form:'kid',superJump(){},superJumpState:null};G.actors=[actor];
 f.runtime.step(.1,{state:'playing'});
 assert.ok(actor.pos.distanceTo(point)>.1,'Actor method superJump must not block conveyor contact');
 assert.ok(Math.abs(actor.pos.x-point.x-.11)<1e-7);
 }finally{f.dispose();}
});
test('Museum moving platform carries supported actors but not airborne actors',()=>{
 const f=fixture('museum');try{
 let actor,controller,point;
 for(const c of f.runtime.controllers.values())for(const x of c.faces){const a=x.face;if(a.n.y<.99)continue;
 const p=a.origin.clone().addScaledVector(a.u,a.su*.7).addScaledVector(a.v,a.sv*.7);
 const h=f.physics.groundProbe(p.x,p.y,p.z,.1,.1,0,new GroundHit());if(!h.hit||!c.blocks.some(x=>x.block.id===h.block))continue;
 actor={pos:p.clone(),grounded:true,alive:true,remote:false,form:'kid',superJump(){},superJumpState:null};point=p;controller=c;break;} 
 assert.ok(actor);const airborne={...actor,pos:point.clone(),grounded:false};G.actors=[actor,airborne];
 f.runtime.step(.1,{state:'playing'});
 assert.ok(actor.pos.distanceTo(point)>1e-5);assert.equal(airborne.pos.distanceTo(point),0);
 const expected=point.clone().applyMatrix4(controller.matrix);assert.ok(actor.pos.distanceTo(expected)<1e-6);
 }finally{f.dispose();}
});
test('Moving mesh atlas rebuild preserves world pose and finite normals/tangents',()=>{
 const f=fixture('museum');try{
 f.runtime.step(.2,{state:'playing'});const before=[...f.runtime.controllers.values()].flatMap(c=>c.meshes.map(m=>m.geometry.attributes.position.array.slice()));
 f.runtime.rebuildAtlasGeometry(4096);let n=0;
 for(const c of f.runtime.controllers.values())for(const m of c.meshes){const after=m.geometry.attributes.position.array;
 assert.equal(after.length,before[n].length);let max=0;for(let i=0;i<after.length;i++)max=Math.max(max,Math.abs(before[n][i]-after[i]));assert.ok(max<1e-4);
 for(const [name,a] of Object.entries(m.geometry.attributes))assert.ok(a.array.every(Number.isFinite),name);n++;}
 }finally{f.dispose();}
});
test('Snapshot rejects rule spoof, invalid water flag and duplicate controller before mutation',()=>{
 const f=fixture('museum');try{
 const snap=f.runtime.snapshot(),before=JSON.stringify(snap);
 assert.throws(()=>f.runtime.restore({...snap,descriptor:{...snap.descriptor,rule:'zones'}}));
 assert.throws(()=>f.runtime.restore({...snap,ruleState:{waterLow:'yes'}}));
 assert.throws(()=>f.runtime.restore({...snap,controllers:snap.controllers.map(()=>snap.controllers[0])}));
 assert.equal(JSON.stringify(f.runtime.snapshot()),before);
 }finally{f.dispose();}
});
test('Pause preserves stage clock, geometry and controller state',()=>{
 const f=fixture('sturgeon');try{const s=JSON.stringify(f.runtime.snapshot()),p=f.level.blocks.map(b=>b.center.toArray());f.runtime.step(.2,{state:'playing',paused:true});assert.equal(JSON.stringify(f.runtime.snapshot()),s);assert.deepEqual(f.level.blocks.map(b=>b.center.toArray()),p);}finally{f.dispose();}
});
test('Environment restores hidden dock props and water on leaving a stage',()=>{
 const f=fixture('scorch');try{const root=new T.Group(),prop=new T.Group(),hidden=new T.Group(),sea=new T.Group();hidden.visible=false;sea.position.y=-2;root.add(prop,hidden,sea);const env={root,sea};f.runtime.applyEnvironment(env);assert.equal(prop.visible,false);assert.equal(sea.visible,false);
 const added=new T.Group();root.add(added);f.runtime.applyEnvironment(env);assert.equal(added.visible,false);f.runtime.dispose();assert.equal(prop.visible,true);assert.equal(hidden.visible,false);assert.equal(added.visible,true);assert.equal(sea.visible,true);assert.equal(sea.position.y,-2);}finally{f.dispose();}
});
test('Network handshake rejects cross-rule hash and unexpected stage identity',()=>{
 const good=stageDescriptor('lemuria','zones');assert.ok(assertStageCompatibility('lemuria',good));assert.throws(()=>assertStageCompatibility('lemuria',{...good,rule:'turf'}));assert.throws(()=>assertStageCompatibility('mahi',good));
});
const out={buildRoot:root,scope:'engine regression tests, not a live network session or original-data validation',tests,passed:tests.filter(t=>t.pass).length,total:tests.length};
fs.mkdirSync('reports/stage25',{recursive:true});fs.writeFileSync('reports/stage25/regressions.json',JSON.stringify(out,null,2)+'\n');console.log(out);process.exitCode=out.passed===out.total?0:1;
