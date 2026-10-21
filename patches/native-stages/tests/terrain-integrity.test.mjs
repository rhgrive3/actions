import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {parseSourceOBJ,convertSource} from '../runtime/source-convert.mjs';
import {validateNativeGeometry} from '../tools/validate-geometry.mjs';
import {nativeFixture} from './fixture.mjs';
import {assertSourceTerrainObjects} from '../runtime/source-terrain-contract.mjs';

const stage={id:'terrain-contract',bounds:{minX:-4,maxX:4,minZ:-4,maxZ:4},spawnPads:[[-2,0,0],[2,0,0]],spawnBarrier:0};
// Two real floor strips separated by a two-metre hole, one wall and one slope.
const points=[[-3,0,-2],[-3,0,2],[-1,0,2],[-1,0,-2],[1,0,-2],[1,0,2],[3,0,2],[3,0,-2],[-3,2,-2],[-1,2,-2],[1,1,0],[3,1,0]];
function obj(name='Fld_Test__GroundGrassMoss',material='GroundGrassMoss'){
 return `o ${name}\nusemtl ${material}\n`+points.map(p=>'v '+p.join(' ')).join('\n')+'\n'+points.map(()=>'vn 0 1 0').join('\n')+'\n'+[[1,2,3],[1,3,4],[5,6,7],[5,7,8],[1,4,10],[1,10,9],[5,11,12],[5,12,8]].map(t=>'f '+t.map(i=>`${i}//${i}`).join(' ')).join('\n')+'\n';
}
const convert=(definition=stage,source=obj())=>convertSource(definition,source,'newmtl GroundGrassMoss\nKd 1 1 1\n',{});

test('every catalog stage keeps structural soil, walls and ramps; backgrounds, water and inactive layers remain excluded',()=>{
 for(const s of nativeStageCatalog().stages){
  const data=convert(s);assert.equal(data.flags.length,8,s.id);assert.equal(validateNativeGeometry(data).structuralGroundObjects,1);
 }
 for(const name of ['FldBG_Test__GroundGrassMoss','Fld_Test_Var__GroundGrassMoss','Fld_Test__SeaWater']){
  const o=parseSourceOBJ(obj(name)).objects[0];assert.equal(o.collidable,false,name);
 }
 const noPaint=parseSourceOBJ(obj('Fld_Test__GroundGrassMoss_np','GroundGrassMoss_np')).objects[0];assert.equal(noPaint.collidable,true);assert.equal(noPaint.paintable,false);
 const excluded=parseSourceOBJ(obj(),{nonCollidableObjectPatterns:['^Fld_Test']}).objects[0];assert.equal(excluded.collidable,false,'explicit source semantics remain authoritative');
});

test('source audit detects dropped floors/walls/slopes, bad indices, bounds, BVH and paint ownership',()=>{
 validateNativeGeometry(convert());
 for(const mutate of [
  d=>{d.manifest.objects[0].collidable=false;},d=>{d.indices[0]=points.length;},
  d=>{d.triangles[0]+=.1;},d=>{d.normals[0]=NaN;},d=>{d.nodes[3]=-10;},
  d=>{d.manifest.objects[0].bounds[1][0]=-10;},
  d=>{d.order[0]=d.order[1];},d=>{d.manifest.faces[0].triangles.pop();},
  d=>{d.flags[0]=0;},d=>{d.triangles=d.triangles.slice(9);}
 ]){const d=convert();mutate(d);assert.throws(()=>validateNativeGeometry(d),/terrain-contract/);}
 for(const bad of ['NaN//NaN','Infinity//Infinity','1.5//1.5'])assert.throws(()=>parseSourceOBJ(obj().replace('1//1',bad)),/OBJ indices/);
 assert.throws(()=>parseSourceOBJ(obj().replace('f 1//1 2//2 3//3','f 1//1 2//2')),/Incomplete OBJ face/);
});

test('validly checksummed older prepared terrain cannot publish missing structural ground',async()=>{
 const data=convert();data.manifest.objects[0].collidable=false;
 assert.throws(()=>assertSourceTerrainObjects(data.manifest),/rebuild source conversion/);
 const f=await nativeFixture();assert.throws(()=>new f.NativeLevel(data),/rebuild source conversion/);
 data.manifest.sourceSemantics={nonCollidableObjectPatterns:['^Fld_Test']};assert.doesNotThrow(()=>assertSourceTerrainObjects(data.manifest),'explicit authored exclusions still apply');
});

test('browser/Python object semantics agree for ground families and negative controls',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-terrain-'));
 try{
  const names=['GroundGrassMoss','GroundGrassMoss_va','GroundGrass00','GroundGrassLittleSoil_np','GroundGrassFlowerBed','GroundGrassBaldSpot','GroundGrass','SeaWater','TreeBush','Canola','Cloth'];
  for(const material of names){
   const source=obj('Fld_Test__'+material,material),file=path.join(dir,'probe.obj');fs.writeFileSync(file,source);
   const python=JSON.parse(execFileSync('python3',['-c',"import sys,json;sys.path.insert(0,'patches/native-stages/tools');from obj_import import parse_obj;from pathlib import Path;print(json.dumps(parse_obj(Path(sys.argv[1]))[2]))",file],{encoding:'utf8'}));
   assert.deepEqual(python,parseSourceOBJ(source).objects,material);
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('real native physics and paint support only the original moss triangles at 30/60/120 Hz',async()=>{
 const f=await nativeFixture(),d=convert(),L=f.G.level=new f.NativeLevel(d),P=f.G.physics=new f.NativePhysics(L),{THREE,G}=f;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:512,maxDensity:4,cell:.25});G.match.mode='turf';G.match.opts={};
 const down=new THREE.Vector3(0,-1,0);
 for(const x of [-2,2]){const h=P.raycast(new THREE.Vector3(x,1,1),down,2);assert(h.hit&&Math.abs(h.point.y)<1e-6);assert(h.face>=0);}
 assert.equal(P.raycast(new THREE.Vector3(0,1,1),down,2).hit,false,'source hole stays open');
 G.paint.splat(new THREE.Vector3(-2,.03,1),.5,0,{instant:true,seed:.1});assert(G.paint.counts[0]>0);
 for(const hz of [30,60,120]){
  const a=f.make('shooter');a._integrate=f.Actor.prototype._integrate;a.spawnAt(new THREE.Vector3(-2,0,.5),0);a.intent.move.set(0,0,1);
  for(let i=0;i<hz*.1;i++){G.time+=1/hz;a.update(1/hz);}assert(a.alive&&a.grounded,'moss support '+hz);
 }
});
