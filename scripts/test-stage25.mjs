// Engine-level tests against the emitted seven-adapter build, not an alternate terrain renderer.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.argv[2]||'/mnt/data/inkwave-stage-site');
const load=p=>import(pathToFileURL(path.join(root,p)));
const THREE=await load('vendor/three/build/three.module.js');
const {getStageLayout,STAGE25_CATALOG,STAGE_RULES,stageDescriptor,assertStageCompatibility,getStageRuleData}=await load('src/world/stages/splatoon3/index.js');
const {Level}=await load('src/world/level.js'),{Physics,Hit,GroundHit}=await load('src/game/physics.js'),{NavGraph}=await load('src/game/nav.js');
const {PaintSystem}=await load('src/world/paint.js');
const {polygonArea,subtractConvex}=await load('src/world/stages/splatoon3/surface-ownership.js');
const {StageRuntime}=await load('src/world/stages/splatoon3/runtime.js');
const {G}=await load('src/core/ctx.js');
const report={source:'emitted-build',originalGeometryVerified:false,originalCameraComparison:false,layouts:[],unitTests:[],errors:[]};
function test(name,fn){try{fn();report.unitTests.push({name,pass:true});}catch(e){report.unitTests.push({name,pass:false,error:e.message});report.errors.push(name+': '+e.message);}}
test('polygon disjoint preserves area',()=>assert.equal(subtractConvex([[0,0],[4,0],[4,4],[0,4]],[[5,5],[6,5],[6,6],[5,6]]).reduce((a,p)=>a+polygonArea(p),0),16));
test('polygon interior subtract produces exact area',()=>assert.equal(subtractConvex([[0,0],[4,0],[4,4],[0,4]],[[1,1],[3,1],[3,3],[1,3]]).reduce((a,p)=>a+polygonArea(p),0),12));
test('polygon covered face removed',()=>assert.deepEqual(subtractConvex([[0,0],[4,0],[4,4],[0,4]],[[0,0],[4,0],[4,4],[0,4]]),[]));
test('25 native identities unique',()=>{assert.equal(STAGE25_CATALOG.length,25);assert.equal(new Set(STAGE25_CATALOG.map(s=>s.nativeId)).size,25);assert.ok(!STAGE25_CATALOG.some(s=>s.nativeId===25));});
test('unverified originals fail closed',()=>assert.throws(()=>getStageRuleData('mahi','zones',{requireVerified:true})));
test('network rejects missing/modified descriptors',()=>{assert.throws(()=>assertStageCompatibility('mahi',null));assert.throws(()=>assertStageCompatibility('mahi',{...stageDescriptor('mahi'),hash:'bad'}));assert.ok(assertStageCompatibility('mahi',stageDescriptor('mahi')));assert.ok(assertStageCompatibility('tidewater',null));});
function cpuPaint(level){const p=Object.create(PaintSystem.prototype);p.level=level;p.cell=.25;p.paintFaces=level.faces.filter(f=>f.paintable);p.size=2048;for(const f of p.paintFaces)f.atlas={x:0,y:0,ppm:1,pad:1};p._initGrid();p.version=0;return p;}
const down=new THREE.Vector3(0,-1,0),up=new THREE.Vector3(0,1,0),point=new THREE.Vector3(),hit=new Hit();
for(const meta of STAGE25_CATALOG)for(const rule of STAGE_RULES){
 const start=performance.now(),errors=[],l=getStageLayout(meta.id,rule),level=new Level(l),physics=new Physics(level),nav=new NavGraph(level,physics),paint=cpuPaint(level);
 const scene=new THREE.Scene(),mat=new THREE.MeshBasicMaterial();G.level=level;G.physics=physics;G.paint=paint;G.actors=[];
 const runtime=new StageRuntime(level,scene,paint,mat,mat,{scenery:false});G.stage25=runtime;
 const check=(condition,msg)=>{if(!condition)errors.push(msg);};
 check(l.validationErrors.length===0,'rule schema: '+l.validationErrors.join(','));
 const spawns=level.spawnPads.map((s,team)=>{
  const ground=physics.groundProbe(s.x,s.y,s.z,.1,.2,0,new GroundHit());
  const node=nav.nearest(s),anchor=nav.nearest(new THREE.Vector3(...l.battleAnchor),2),route=nav.path(node,anchor,team);
  check(ground.hit&&Math.abs(ground.y-s.y)<.02,`spawn ${team}: no ground`);check(node>=0,`spawn ${team}: no nav node`);check(!!route,`spawn ${team}: no route to battle anchor`);
  return {team,node,anchor,pathNodes:route?.length||0,ground:ground.hit,groundY:ground.y};
 });
 let paintableWalls=0,grates=0,glass=0,rayChecks=0;
 for(const b of level.blocks){if(b.grate)grates++;if(b.glass)glass++;}
 for(const f of level.faces){
   check(Number.isFinite(f.exposedArea)&&f.exposedArea>=-1e-7,`invalid exposed area ${f.id}`);
   if(f.wall&&f.paintable&&f.exposedArea>1)paintableWalls++;
   if(f.n.y<.68||f.exposedArea<1)continue;
   const u=f.su*.5,w=f.sv*.5;
   if(!level.faceContainsUV(f,u,w))continue;
   point.copy(f.origin).addScaledVector(f.u,u).addScaledVector(f.v,w).addScaledVector(f.n,.08);
   if(level.pointInside(point,0,f.block))continue;
   const h=physics.raycast(point,f.n.clone().negate(),.16,hit,false);
   check(h.hit,`visible support has no collision ${f.id}`);if(h.hit&&h.face>=0)check(level.faceContainsUV(level.faces[h.face],h.u,h.v),`ray resolves hidden face ${f.id}`);
   rayChecks++;
 }
 check(paint.turfTotal>0&&paint.turfArea>0,'empty turf area');check(paintableWalls>0,'no inkable walls');
 const geo=level.buildGeometry(paint.size),triangles=geo.index.count/3;
 check(geo.attributes.position.array.every(Number.isFinite),'non-finite geometry');check(triangles>0,'empty geometry');
 const runtimeTests=[];
 if(rule==='turf'&&runtime.controllers.size){
   runtime.reset();const before=[...runtime.controllers.values()].map(c=>c.matrix.clone());runtime.step(.1,{state:'playing'});
   runtime.step(.1,{state:'playing',paused:true});check(runtime.elapsed===.1,'pause advanced stage clock');
   const snap=runtime.snapshot();runtime.step(.1,{state:'playing'});runtime.restore(snap);check(Math.abs(runtime.elapsed-.1)<1e-8,'restore clock mismatch');
   for(const c of runtime.controllers.values())for(const x of c.blocks){const expect=x.center.clone().applyMatrix4(c.matrix);check(expect.distanceTo(x.block.center)<1e-7,'moving OBB differs from render transform');}
   runtimeTests.push('pause','snapshot/restore','render/OBB transform');
 }
 if(meta.id==='mahi'&&rule==='turf'){
   check(runtime.isHazard(new THREE.Vector3(0,-.3,0)),'initial high water not lethal');
   runtime.elapsed=94;runtime._water();check(Math.abs(runtime.waterY+1.6)<1e-7,'water did not drop at 90 seconds');
   check(!runtime.isHazard(new THREE.Vector3(0,-.3,0)),'low water kills reclaimed ground');runtimeTests.push('90s water transition');
 }
 const row={id:meta.id,nameJa:meta.nameJa,rule,hash:l.compatibilityHash,blocks:level.blocks.length,faces:level.faces.length,triangles,grates,glass,paintableWalls,gridCells:paint.grid.length,turfCells:paint.turfTotal,turfArea:paint.turfArea,navNodes:nav.nodes.length,spawns,rayChecks,runtimeTests,elapsedMs:performance.now()-start,pass:errors.length===0,errors};
 report.layouts.push(row);report.errors.push(...errors.map(x=>`${meta.id}/${rule}: ${x}`));runtime.dispose();geo.dispose();mat.dispose();
}
report.totals={layouts:report.layouts.length,passed:report.layouts.filter(x=>x.pass).length,unitTests:report.unitTests.length,rayChecks:report.layouts.reduce((a,x)=>a+x.rayChecks,0),errors:report.errors.length};
const out=path.resolve('reports/stage25/engine-tests.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(report.totals);console.log(report.errors.slice(0,80).join('\n'));process.exitCode=report.errors.length?1:0;
