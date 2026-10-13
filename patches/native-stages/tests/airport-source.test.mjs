import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import {nativeFixture,readStage} from './fixture.mjs';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';

const stage=nativeStageCatalog().stages.find(s=>s.id==='airport');
const SOURCE=process.env.INKWAVE_NATIVE_STAGE_SOURCE,ASSETS=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const enabled=!!SOURCE&&!!ASSETS&&fs.existsSync(path.join(ASSETS,'airport','manifest.json'));

test('airport identity stays pinned and distinguishes local placement from 11.3.0',()=>{
 assert.equal(stage.internal,'Vss_Propeller00');
 assert.equal(stage.tree,'084a4ee4442823e237d9ef39b18b689484317cf9');
 assert.equal(stage.sourceSha256,'da8165322d2e1fecdc326ef1a721153f26428623958337a01460fcc45f211118');
 assert.equal(stage.version1130Verified,false);
 assert.ok(stage.spawnPads[0][0]<0&&stage.spawnPads[0][2]<0);
 assert.ok(stage.spawnPads[1][0]>0&&stage.spawnPads[1][2]>0);
});

test('airport independent original text agrees with every float32 attribute and uint32 face index',{skip:!enabled},async()=>{
 const data=readStage(ASSETS,'airport'),file=path.join(SOURCE,stage.internal,stage.internal+'.obj');
 const hash=crypto.createHash('sha256');let bytes=0;
 for await(const chunk of fs.createReadStream(file)){hash.update(chunk);bytes+=chunk.length;}
 assert.equal(hash.digest('hex'),stage.sourceSha256);assert.equal(bytes,30982635);
 let position=0,normal=0,uv=0,index=0,object=-1,offset=0,uvOffset=0;
 const lines=readline.createInterface({input:fs.createReadStream(file),crlfDelay:Infinity});
 for await(const line of lines){
  if(line.startsWith('o ')){
   object++;offset=data.manifest.objects[object].vo;uvOffset=uv;
   assert.equal(line.slice(2).trim(),data.manifest.objects[object].name);
  }else if(line.startsWith('v ')){
   const v=line.trim().split(/\s+/).slice(1).map(Number);
   for(let k=0;k<3;k++)assert.equal(data.vertices[position*8+k],Math.fround(v[k]),'position '+position+'/'+k);
   position++;
  }else if(line.startsWith('vn ')){
   const v=line.trim().split(/\s+/).slice(1).map(Number);
   for(let k=0;k<3;k++)assert.equal(data.vertices[normal*8+3+k],Math.fround(v[k]),'normal '+normal+'/'+k);
   normal++;
  }else if(line.startsWith('vt ')){
   const v=line.trim().split(/\s+/).slice(1).map(Number),o=data.manifest.objects[object];
   // The source has aligned per-object streams; objects without UVs insert zeros.
   const vertex=o.vo+uv-uvOffset;
   for(let k=0;k<2;k++)assert.equal(data.vertices[vertex*8+6+k],Math.fround(v[k]),'UV '+uv+'/'+k);
   uv++;
  }else if(line.startsWith('f ')){
   const vertices=line.trim().split(/\s+/).slice(1).map(t=>Number(t.split('/')[0])-1-offset);
   for(let j=1;j<vertices.length-1;j++)for(const v of [vertices[0],vertices[j],vertices[j+1]])assert.equal(data.indices[index++],v,'index '+(index-1));
  }
 }
 assert.equal(position,data.vertices.length/8);assert.equal(normal,position);assert.equal(index,data.indices.length);
 console.log(JSON.stringify({id:'airport',positions:position,normals:normal,uv,indices:index,independentExactSourceBuffers:true}));
});

test('airport source supports, clear capsules and real opening launches reach local objectives',{skip:!enabled},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,L=new f.NativeLevel(readStage(ASSETS,'airport')),P=new f.NativePhysics(L);
 G.level=L;G.physics=P;
 class Paint extends f.PaintSystem{_initGPU(){this.quads=0;}_pushQuad(){}}
 G.paint=new Paint(null,L,{atlasSize:2048,maxDensity:4,cell:.25});
 G.nav=new f.NavGraph(L,P);G.match.mode='turf';G.match.opts={};
 const ranked=f.nativeRankedStage(G),zone=ranked.zones[0].center,target=G.nav.nearest(new THREE.Vector3(...zone),1.2);
 assert.ok(target>=0);assert.ok(G.nav.validIds.length>100);
 const pads=L.spawnPads.map((p,team)=>{
  const h=P.raycast(p.clone().add(new THREE.Vector3(0,2,0)),new THREE.Vector3(0,-1,0),4);
  assert.ok(h.hit&&h.normal.y>.68);assert.ok(h.point.distanceTo(p)<.01);
  assert.match(L.manifest.objects[L.data.objectIds[h.triangle]].name,/__WoodDeckBright00$/);
  assert.ok(P.bodyFits(p.clone().add({x:0,y:.01,z:0}),PLAYER.radius+.04,.32,PLAYER.height,false,.01));
  const start=G.nav.nearest(p,1.2),route=G.nav.path(start,target,team,50000);assert.ok(route?.length>20);
  return {team,sourceTriangle:h.triangle,sourceObject:L.manifest.objects[L.data.objectIds[h.triangle]].name,routeNodes:route.length};
 });
 const cases=[];
 const openings=[{slot:0,isBot:false},...[0,1,2,3].map(slot=>({slot,isBot:true}))];
 for(const hz of [30,60,120])for(const team of [0,1])for(const {slot,isBot} of openings){
  const a=f.make();a.team=team;a.slot=slot;a.isBot=isBot;
  a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;
  assert.equal(f.beginInitialSquidSpawn(a),true);
  if(!isBot){a.intent.fire=true;G.time+=1/hz;a.update(1/hz);a.intent.fire=false;}
  assert.equal(a.s3.squidSpawn?.phase,'flight');
  let frames=0;while(a.s3.squidSpawn&&frames<hz*3){G.time+=1/hz;a.update(1/hz);frames++;}
  assert.equal(a.s3.squidSpawn,undefined,'real launch settles '+[hz,team,slot]);
  for(let i=0;i<hz/4;i++){G.time+=1/hz;a.update(1/hz);}
  assert.ok(a.alive&&a.grounded&&a.ground.hit,'actual supported landing '+[hz,team,slot]);
  const landed=G.nav.nearest(a.pos,1.2),route=G.nav.path(landed,target,team,50000);
  assert.ok(route?.length,'post-launch directed objective route '+[hz,team,slot]);
  const before=a.pos.clone();a.intent.move.set(Math.sin(a.aimYaw),0,Math.cos(a.aimYaw));
  for(let i=0;i<hz/4;i++){G.time+=1/hz;a.update(1/hz);}
  assert.ok(a.alive&&a.pos.distanceTo(before)>.1,'ordinary post-launch motion');
  cases.push({hz,team,slot,isBot,frames,landing:before.toArray(),routeNodes:route.length,moved:a.pos.distanceTo(before)});
 }
 console.log(JSON.stringify({id:'airport',pads,nodes:G.nav.nodes.length,valid:G.nav.validIds.length,towerSupported:ranked.tower.supported,towerRouteNodes:ranked.tower.path.length,cases,conditions:'Actual Actor integrator, ordinary shooter, default gear, source capsule and directed nav; display/audio stubs only'}));
});
