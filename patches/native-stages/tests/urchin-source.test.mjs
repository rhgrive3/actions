import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {nativeFixture,readStage} from './fixture.mjs';
const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS,SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE;
const available=ROOT&&fs.existsSync(path.join(ROOT,'urchin','manifest.json'));

test('Urchin every uint32 render index matches the independent pinned OBJ face stream',{skip:!available||!SOURCE},async()=>{
 const bytes=fs.readFileSync(path.join(ROOT,'urchin','indices.bin')),indices=new Uint32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 let vertexOffset=0,objectVertices=0,index=0;
 const lines=readline.createInterface({input:fs.createReadStream(path.join(SOURCE,'Vss_Crank02','Vss_Crank02.obj')),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){vertexOffset+=objectVertices;objectVertices=0;}
  else if(line.startsWith('v '))objectVertices++;
  else if(line.startsWith('f ')){
   const face=line.trim().split(/\s+/).slice(1).map(token=>Number(token.split('/')[0])-1-vertexOffset);
   for(let i=1;i<face.length-1;i++)for(const expected of [face[0],face[i],face[i+1]])assert.equal(indices[index++],expected,'source face index '+(index-1));
  }
 }
 assert.equal(index,indices.length);assert.equal(index/3,407073);
});

test('Urchin actual asphalt supports, source exclusions, both-team directed ranked access and 30/60/120Hz ground movement',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=new f.NativeLevel(readStage(ROOT,'urchin')),P=new f.NativePhysics(L);G.level=L;G.physics=P;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const excluded=L.manifest.objects.filter(o=>/^Fld_Crank02_(?:BakeDummy|Prop_Crank02WaterTower[AB]_)/.test(o.name));
 assert(excluded.length>=3);assert(excluded.every(o=>o.active&&!o.collidable),'scenery remains displayed without invented support');
 for(const [team,pad] of L.spawnPads.entries()){
  const h=P.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.equal(h.hit,true);assert.equal(h.normal.y,1);assert(h.point.distanceTo(pad)<1e-6);assert.equal(L.manifest.objects[L.data.objectIds[h.triangle]].name,'Fld_Crank02_Asphalt_1__AsphaltBace');
  assert(P.bodyFits(pad.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
  for(const hz of [30,60,120]){
   const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(pad,0);a.intent.move.set(team===0?-1:1,0,0);a.intent.fire=false;
   for(let i=0;i<hz*.5;i++){G.time+=1/hz;a.update(1/hz);}
   assert(a.alive&&a.grounded,'source-supported inward movement '+team+' '+hz);assert(a.pos.distanceTo(pad)>1,'real controller moves on source floor');
  }
 }
 G.nav=new f.NavGraph(L,P);const N=G.nav,stage=f.nativeRankedStage(G);
 const goals=[...stage.zones.map(z=>z.center),stage.rainmaker.center,...stage.rainmaker.goals,...stage.rainmaker.checkpoints.flat(),...stage.clams.spawns,...stage.tower.path.map(p=>[p[0],p[1]-3.3,p[2]])];
 for(const [team,pad] of L.spawnPads.entries())for(const p of goals){const start=N.nearest(pad,1.2),end=N.nearest(new THREE.Vector3(...p),1.2);assert(N.path(start,end,team,50000),'team '+team+' directed route to '+p);}
 for(const p of stage.tower.path)for(const [dx,dz] of [[0,0],[.7,0],[-.7,0],[0,.7],[0,-.7]])assert(P.bodyFits(new THREE.Vector3(p[0]+dx,p[1],p[2]+dz),PLAYER.radius,.3,PLAYER.height),'source capsule clearance across tower route');
 assert.equal(stage.version1130Verified,false);
});
