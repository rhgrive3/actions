import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {nativeFixture,readStage} from './fixture.mjs';

const ROOT=process.env.INKWAVE_NATIVE_STAGE_ASSETS,SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE;
const available=ROOT&&fs.existsSync(path.join(ROOT,'bluefin','manifest.json'));

test('Bluefin exact original Float32 attributes and every Uint32 triangulated face index',{skip:!available||!SOURCE},async()=>{
 const buffer=name=>{const b=fs.readFileSync(path.join(ROOT,'bluefin',name+'.bin'));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);};
 const vertices=new Float32Array(buffer('vertices')),indices=new Uint32Array(buffer('indices'));
 let v=0,n=0,uv=0,index=0,offset=0,objectUV=0;
 const finish=()=>{if(!objectUV)for(let i=offset;i<v;i++){assert.equal(vertices[i*8+6],0);assert.equal(vertices[i*8+7],0);}else assert.equal(objectUV,v-offset);};
 const lines=readline.createInterface({input:fs.createReadStream(path.join(SOURCE,'Vss_Ruins03','Vss_Ruins03.obj')),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){finish();offset=v;objectUV=0;}
  else if(line.startsWith('v ')){const values=line.trim().split(/\s+/).slice(1,4);for(let k=0;k<3;k++)assert.equal(vertices[v*8+k],Math.fround(Number(values[k])));v++;}
  else if(line.startsWith('vn ')){const values=line.trim().split(/\s+/).slice(1,4);for(let k=0;k<3;k++)assert.equal(vertices[n*8+3+k],Math.fround(Number(values[k])));n++;}
  else if(line.startsWith('vt ')){const values=line.trim().split(/\s+/).slice(1,3);for(let k=0;k<2;k++)assert.equal(vertices[(offset+objectUV)*8+6+k],Math.fround(Number(values[k])));objectUV++;uv++;}
  else if(line.startsWith('f ')){
   const face=line.trim().split(/\s+/).slice(1).map(token=>Number(token.split('/')[0])-1-offset);
   for(let i=1;i<face.length-1;i++)for(const expected of [face[0],face[i],face[i+1]])assert.equal(indices[index++],expected,'original face index '+(index-1));
  }
 }
 finish();assert.equal(v,1024229);assert.equal(n,v);assert.equal(vertices.length,v*8);assert.equal(index,indices.length);assert.equal(index/3,774445);assert(uv>0);
});

test('Bluefin source deck capsules, opposing inward movement and both-team directed objective access',{skip:!available},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=new f.NativeLevel(readStage(ROOT,'bluefin')),P=new f.NativePhysics(L);G.level=L;G.physics=P;
 class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 const alternatives=L.manifest.objects.filter(o=>/^FldObj_Ruins03(?:Tcl|Var|Vcl|Vgl|Vlf)(?:Stage|Center)_|^FldObj_Ruins03GeneralBox(?:Tcl|Var|Vcl|Vgl|Vlf)_/.test(o.name));
 assert(alternatives.length>400);assert(alternatives.every(o=>!o.active&&!o.collidable));
 for(const [team,pad] of L.spawnPads.entries()){
  const h=P.raycast(pad.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert(h.hit&&h.normal.y>.99);assert(h.point.distanceTo(pad)<.01);assert.match(L.manifest.objects[L.data.objectIds[h.triangle]].name,/^FldObj_Ruins03PntStage_.*__DeckFloor0[12]$/);
  assert(P.bodyFits(pad.clone().add(new THREE.Vector3(0,.01,0)),PLAYER.radius+.04,.32,PLAYER.height));
  const inward=L.spawnPads[1-team].clone().sub(pad).setY(0).normalize();
  for(const hz of [30,60,120]){
   const a=f.make('shooter');a.team=team;a._integrate=f.Actor.prototype._integrate;a.spawnAt(pad,Math.atan2(inward.x,inward.z));a.intent.move.copy(inward);a.intent.fire=false;
   for(let i=0;i<hz*.5;i++){G.time+=1/hz;a.update(1/hz);}
   assert(a.alive&&a.grounded,'real controller inward source movement '+team+' '+hz);assert(a.pos.distanceTo(pad)>1);
  }
 }
 G.nav=new f.NavGraph(L,P);const N=G.nav,stage=f.nativeRankedStage(G);
 const goals=[...stage.zones.map(z=>z.center),stage.rainmaker.center,...stage.rainmaker.goals,...stage.rainmaker.checkpoints.flat(),...stage.clams.spawns,...stage.tower.path.map(p=>[p[0],p[1]-(stage.tower.localLift??3.3),p[2]])];
 for(const [team,pad] of L.spawnPads.entries())for(const p of goals){const start=N.nearest(pad,1.2),end=N.nearest(new THREE.Vector3(...p),1.2);assert(N.path(start,end,team,50000),'team '+team+' directed route to '+p);}
 assert.equal(stage.version1130Verified,false);
});
