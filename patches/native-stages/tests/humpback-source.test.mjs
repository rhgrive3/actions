import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {nativeStageCatalog} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';

const source=process.env.INKWAVE_NATIVE_STAGE_SOURCE,assets=process.env.INKWAVE_NATIVE_STAGE_ASSETS;
const enabled=!!source&&!!assets&&fs.existsSync(path.join(assets,'humpback','manifest.json'));
const evidence=JSON.parse(fs.readFileSync(new URL('../../../reports/native-stages/humpback-verification.json',import.meta.url)));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

test('Humpback identity retains the pinned complete source and opposed full-bowl supports',()=>{
 const definition=nativeStageCatalog().stages.find(s=>s.id==='humpback');
 assert.equal(definition.internal,'Vss_Wave03');assert.equal(definition.name,'コンブトラック');
 assert.equal(definition.tree,'70167a0b036081b63638e7eacce7654057f8131c');
 assert.equal(definition.sourceSha256,'fcff18651320c4855b2af6278ad726aa7a8fbb4021c0329913163082a29e604d');
 assert.deepEqual(definition.spawnPads,[[0,6.08,-61],[0,6.08,61]]);
 assert.equal(definition.version1130Verified,false);assert.equal(definition.sourceSemantics,undefined);
 assert.equal(evidence.source.blobs.length,177);
});

test('Humpback independent OBJ stream proves every float32 attribute bit and uint32 triangle index',{skip:!enabled},async()=>{
 const dir=path.join(source,'Vss_Wave03'),data=readStage(assets,'humpback'),raw=fs.readFileSync(path.join(dir,'Vss_Wave03.obj'));
 assert.equal(raw.length,29146955);assert.equal(digest(raw),evidence.source.lfsSha256);
 const bits=new Uint32Array(data.vertices.buffer,data.vertices.byteOffset,data.vertices.length),f32=new Float32Array(1),u32=new Uint32Array(f32.buffer);
 let vertex=0,index=0,normal=0,uv=0,vertexBase=0,normalBase=0,uvBase=0,objectIndex=-1,current;
 const bit=(value,offset)=>{f32[0]=Number(value);assert.equal(bits[offset],u32[0],'attribute bit '+offset);};
 const finish=()=>{
  if(!current)return;
  assert.equal(vertex-current.vo,current.vc);assert.equal(index-current.io,current.ic);
  if(!current.sourceHasUV)for(let i=current.vo;i<vertex;i++){bit(0,i*8+6);bit(0,i*8+7);}
  vertexBase=vertex;normalBase=normal;uvBase=uv;
 };
 const stream=readline.createInterface({input:fs.createReadStream(path.join(dir,'Vss_Wave03.obj')),crlfDelay:Infinity});
 for await(const line of stream){
  const words=line.trim().split(/\s+/);
  if(words[0]==='o'){finish();current=data.manifest.objects[++objectIndex];assert.equal(words.slice(1).join(' '),current.name);}
  else if(words[0]==='v'){for(let k=0;k<3;k++)bit(words[k+1],vertex*8+k);vertex++;}
  else if(words[0]==='vn'){for(let k=0;k<3;k++)bit(words[k+1],normal*8+3+k);normal++;}
  else if(words[0]==='vt'){const local=uv-uvBase;for(let k=0;k<2;k++)bit(words[k+1],(vertexBase+local)*8+6+k);uv++;}
  else if(words[0]==='f'){
   const polygon=words.slice(1).map(word=>{const p=word.split('/'),v=Number(p[0])-1-vertexBase;assert.equal(Number(p[2])-1-normalBase,v);if(p[1])assert.equal(Number(p[1])-1-uvBase,v);return v;});
   for(let j=1;j<polygon.length-1;j++)for(const value of [polygon[0],polygon[j],polygon[j+1]])assert.equal(data.indices[index++],value,'source triangle index '+(index-1));
  }
 }
 finish();assert.equal(vertex,254995);assert.equal(normal,vertex);assert.equal(index,174089*3);assert.equal(objectIndex+1,79);
 for(const pin of evidence.source.blobs){const bytes=fs.readFileSync(path.join(dir,pin.path));assert.equal(bytes.length,pin.bytes);assert.equal(digest(bytes),pin.sha256);assert.equal(crypto.createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex'),pin.gitBlobSha1);}
 for(const [name,pin] of Object.entries(data.manifest.textureIntegrity)){const bytes=fs.readFileSync(path.join(assets,'humpback',name));assert.equal(bytes.length,pin.bytes);assert.equal(digest(bytes),pin.sha256);assert.equal(digest(bytes),digest(fs.readFileSync(path.join(dir,name))));}
 console.log(JSON.stringify({id:'humpback',attributeBits:vertex*8,indices:index,objects:objectIndex+1,pinnedMtlPngBlobs:evidence.source.blobs.length,derivedTextures:Object.keys(data.manifest.textureIntegrity).length}));
});

test('Humpback pads, source capsules and directed navigation retain both complete opposing approaches',{skip:!enabled},async()=>{
 const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(assets,'humpback');G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.nav=new f.NavGraph(G.level,G.physics);
 const pads=G.level.spawnPads,nodes=[],supports=[];
 for(const pad of pads){
  const hit=G.physics.raycast(pad.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),.6);
  assert(hit.hit&&hit.normal.y>.68);assert(Math.abs(hit.point.y-6)<.001);
  assert.equal(G.physics.bodyFits(pad,PLAYER.radius,PLAYER.stepUp,PLAYER.height),true);
  const object=data.manifest.objects[data.objectIds[hit.triangle]];assert.match(object.name,/GroundPlywood/);assert.equal(object.paintable,true);
  nodes.push(G.nav.nearest(pad,1.2));supports.push({pad:pad.toArray(),triangle:hit.triangle,object:object.name,normal:hit.normal.toArray()});
 }
 // The ordinary A* correctly forbids the opposing guarded spawn itself.
 // Use actual source-supported approaches outside that guard for bank routes.
 const approaches=pads.map((pad,team)=>{
  const p=pad.clone();p.z+=(team?-1:1)*8;
  const hit=G.physics.raycast(p.clone().add(new THREE.Vector3(0,.3,0)),new THREE.Vector3(0,-1,0),15);
  assert(hit.hit&&hit.normal.y>.68);p.y=hit.point.y;
  const id=G.nav.nearest(p,1.2);assert(id>=0&&G.nav.nodes[id].zone===-1);return id;
 });
 const opposedPaths=nodes.map((n,team)=>G.nav.path(n,approaches[1-team],team,50000));
 for(const team of [0,1])assert(opposedPaths[team]?.length>40,'actual full opposed source-bank path team '+team);
 const playable=G.nav.validIds.map(id=>G.nav.nodes[id]);assert(Math.min(...playable.map(n=>n.z))<-58);assert(Math.max(...playable.map(n=>n.z))>58);
 assert(Math.min(...playable.map(n=>n.x))<-25);assert(Math.max(...playable.map(n=>n.x))>25);
 assert.equal(data.manifest.geometry.vertices,254995);assert.equal(data.manifest.geometry.triangles,174089);assert.equal(data.manifest.geometry.collisionTriangles,149539);
 const roofs=data.manifest.objects.filter(o=>/CeilingWalls|CorrugatedRoof/.test(o.name));assert(roofs.length>=3);assert(roofs.every(o=>o.collidable));
 const noPaint=data.manifest.objects.filter(o=>/_np$/.test(o.material)&&o.collidable);assert(noPaint.length>10);assert(noPaint.every(o=>!o.paintable));
 const ranked=f.nativeRankedStage(G);const proof={id:'humpback',supports,nav:{candidate:G.nav.nodes.length,valid:G.nav.validIds.length,opposedPaths:opposedPaths.map(p=>p.length)},tower:ranked.tower.supported?{supported:true,nodes:ranked.tower.path.length,arenaSpan:ranked.tower.arenaSpan}:ranked.ruleAvailability.tower,sourceRoofs:roofs.length,noPaintObjects:noPaint.length};
 if(process.env.HUMPBACK_ROUTE_EVIDENCE)fs.writeFileSync(process.env.HUMPBACK_ROUTE_EVIDENCE,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
});

test('Humpback genuine two-cell plywood departure uses ordinary Actor walking and gravity at three rates',{skip:!enabled},async()=>{
 const f=await nativeFixture(),{G,THREE}=f,data=readStage(assets,'humpback');G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(G.level);
 class CpuPaint extends f.PaintSystem{_initGPU(){this.quads=0;} _pushQuad(){}}
 G.paint=new CpuPaint(null,G.level,{atlasSize:2048,maxDensity:4,cell:.25});G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
 const start=new THREE.Vector3(6.2,6,42.6),lower=new THREE.Vector3(6.2,3.0000998973846436,40.6),direction=new THREE.Vector3(0,0,-1),cases=[];
 const before=G.physics.raycast(start.clone().setY(6.15),new THREE.Vector3(0,-1,0),.4);assert(before.hit&&before.triangle===95403);
 for(const hz of [30,60,120]){
  const a=f.make('shooter');a.team=1;a.isBot=false;a._integrate=f.Actor.prototype._integrate;a.spawnAt(start,Math.PI);G.actors=[a];a._resolve(false,a.pos.y,false);assert(a.grounded&&a.ground.hit);
  let walking=true,departed=false,frames=0;
  for(;frames<hz*4;frames++){
   a.intent.move.copy(walking?direction:new THREE.Vector3());a.intent.fire=a.intent.squid=a.intent.jump=a.intent.sub=a.intent.special=false;G.time+=1/hz;a.update(1/hz);departed ||=!a.grounded;
   if(walking&&start.z-a.pos.z>=1.95)walking=false;
   if(!walking&&a.grounded&&frames>hz*.5)break;
  }
  const hit=G.physics.raycast(a.pos.clone().setY(a.pos.y+.15),new THREE.Vector3(0,-1,0),.4);
  assert(departed&&a.alive&&a.grounded&&hit.hit);assert(Math.abs(a.pos.y-lower.y)<.001);assert(Math.hypot(a.pos.x-lower.x,a.pos.z-lower.z)<1.8);assert.equal(hit.triangle,94558);
  assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);cases.push({hz,frames,ordinaryWalk:true,jump:false,fire:false,departed,alive:a.alive,grounded:a.grounded,start:start.toArray(),end:a.pos.toArray(),sourceTriangle:hit.triangle,sourceObject:data.manifest.objects[data.objectIds[hit.triangle]].name,weapon:'shooter',gearAP:0});
 }
 const proof={id:'humpback',sourceSha256:data.manifest.sourceSha256,cases,conditions:'standalone real Actor integrator + original source capsules; neutral dry human 0AP Shooter; no shot/muzzle evidence or production-match claim',version1130Verified:false};
 if(process.env.HUMPBACK_DEPARTURE_EVIDENCE)fs.writeFileSync(process.env.HUMPBACK_DEPARTURE_EVIDENCE,JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
});
