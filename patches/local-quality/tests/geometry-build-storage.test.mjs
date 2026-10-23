import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import vm from 'node:vm';
import {GeometryChunkWriter} from '../geometry-build-storage.mjs';
import {geometryFixture} from './geometry-build-fixture.mjs';
const json=x=>JSON.parse(JSON.stringify(x));
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function sameGeometry(a,b,label){
 assert.deepEqual(Object.keys(a.attributes),Object.keys(b.attributes),label+' names');
 for(const name of Object.keys(a.attributes)){
  const x=a.attributes[name],y=b.attributes[name];assert.equal(x.constructor.name,y.constructor.name,label+' '+name+' public subclass');
  assert.deepEqual([x.itemSize,x.normalized,x.gpuType,x.count],[y.itemSize,y.normalized,y.gpuType,y.count],label+' '+name+' metadata');
  assert.equal(x.array.constructor.name,y.array.constructor.name,label+' '+name+' array type');assert.deepEqual(bytes(x.array),bytes(y.array),label+' '+name+' bytes');
 }
 if(a.index){assert.equal(a.index.constructor.name,b.index.constructor.name,label+' public index subclass');assert.equal(a.index.array.constructor.name,b.index.array.constructor.name,label+' index type');assert.deepEqual(bytes(a.index.array),bytes(b.index.array),label+' index bytes');}else assert.equal(b.index,null);
 a.computeBoundingBox();b.computeBoundingBox();a.computeBoundingSphere();b.computeBoundingSphere();
 assert.deepEqual(json(a.boundingBox),json(b.boundingBox),label+' box');assert.deepEqual(json(a.boundingSphere),json(b.boundingSphere),label+' sphere');
 assert.deepEqual(json(a.groups),json(b.groups),label+' groups');assert.equal(a.morphTargetsRelative,b.morphTargetsRelative);
}

test('chunk boundaries preserve doubles until winding, exact final rounding and vendor index threshold',async()=>{
 for(const ArrayType of [Float32Array,Float64Array,Uint32Array]){
  const writer=new GeometryChunkWriter(ArrayType,true),expected=[];
  for(let i=0;i<3207;i++){const row=[i*.1,i*.3,i*.7,-i*.2].slice(0,i%4+1);writer.push(...row);expected.push(...row);}
  for(let i=0;i<expected.length;i++)assert(Object.is(writer.get(i),new ArrayType([expected[i]])[0]));
  assert.deepEqual(writer.finish(),new ArrayType(expected));assert.equal(writer.chunks.length,0);
 }
 const f=await geometryFixture();
 const floats=new GeometryChunkWriter();floats.push3(1.2,-0,3.5);const data=floats.finish();
 const view=new f.THREE.Float32BufferAttribute(data.buffer,3);assert.equal(view.array.buffer,data.buffer,'Float32 subclass wraps the same backing without copying');assert.equal(view.constructor.name,'Float32BufferAttribute');assert(view instanceof f.THREE.Float32BufferAttribute);assert.deepEqual(bytes(view.array),bytes(data));
 for(const max of [0,65534,65535,65536]){
  const writer=new GeometryChunkWriter(Uint32Array,true);writer.push(0,max,1);
  const expected=new f.THREE.BufferGeometry().setIndex([0,max,1]);
  const array=writer.finish(writer.maximum>=65535?Uint32Array:Uint16Array);
  assert.equal(array.byteOffset,0);assert.equal(array.byteLength,array.buffer.byteLength);
  const Attribute=max>=65535?f.THREE.Uint32BufferAttribute:f.THREE.Uint16BufferAttribute;
  const actual=new Attribute(array.buffer,1);assert.equal(actual.constructor.name,expected.index.constructor.name);assert(actual instanceof Attribute);assert.equal(actual.array.buffer,array.buffer,'index subclass wraps the same backing without copying');
  assert.equal(actual.array.constructor.name,expected.index.array.constructor.name);assert.deepEqual(bytes(actual.array),bytes(expected.index.array));
 }
});

test('composed legacy layout × filter × paint/light atlas produces byte-identical attributes, winding, index and bounds with one filter pass',async()=>{
 const old=await geometryFixture({baseline:true}),now=await geometryFixture(),timings=[];
 for(const id of ['tidewater','kelpline','cargo','halyard','range']){
  const a=new old.Level(old.MAP_LAYOUTS[id]),b=new now.Level(now.MAP_LAYOUTS[id]);
  assert.equal(a.faces.length,b.faces.length);
  for(const atlas of [false,true]){
   if(atlas){for(const level of [a,b]){level.lightSize=1024;for(let i=0;i<level.faces.length;i++){const f=level.faces[i];f.atlas={x:i%20,y:i%17,pad:2,ppm:3.7};f.light={x:i%11,y:i%23,pad:1,ppm:2.3};}}}
   for(const kind of ['solid','grate','all','none']){
    const calls=[[],[]],build=(level,index)=>{const start=performance.now();const geo=level.buildGeometry(2048,block=>{calls[index].push(block.id);return kind==='all'||kind==='solid'&&!block.grate||kind==='grate'&&block.grate;});return {geo,ms:performance.now()-start};};
    const x=build(a,0),y=build(b,1);
    for(const [geo,T] of [[x.geo,old.THREE],[y.geo,now.THREE]]){for(const [name,attr] of Object.entries(geo.attributes))assert(attr instanceof (name === 'faceFlags' ? T.Int8BufferAttribute : T.Float32BufferAttribute));const Index=geo.index.array.constructor.name==='Uint32Array'?T.Uint32BufferAttribute:T.Uint16BufferAttribute;assert(geo.index instanceof Index);}
    sameGeometry(x.geo,y.geo,id+'/'+kind+'/'+atlas);assert.deepEqual(calls[0],calls[1]);assert.equal(new Set(calls[1]).size,calls[1].length,'filter called once per eligible block');assert.equal(a.renderTris,b.renderTris);
    timings.push({id,kind,atlas,vertices:x.geo.attributes.position.count,index:x.geo.index.count,oldMs:x.ms,newMs:y.ms});x.geo.dispose();y.geo.dispose();
   }
  }
 }
 console.log('GEOMETRY_LEVEL_TIMINGS '+JSON.stringify(timings));
 assert.equal(old.NativeLevel.prototype.buildGeometry.toString(),now.NativeLevel.prototype.buildGeometry.toString(),'native stage override remains unchanged');
});

test('owned merge matches actual vendor bytes and bounds while unsupported formats fall back without consuming sources',async()=>{
 const f=await geometryFixture(),T=f.THREE,mergeOwned=f.mergeOwnedSceneryGeometries;
 function part(i){const g=new T.BoxGeometry(1+i*.1,2,3).toNonIndexed();g.deleteAttribute('uv');const n=g.attributes.position.count;
  g.setAttribute('color',new T.BufferAttribute(new f.F32(n*3).fill(i*.1),3));g.setAttribute('glow',new T.BufferAttribute(new f.F32(n).fill(i),1));g.setAttribute('bld',new T.BufferAttribute(new f.F32(n*3).fill(i+.1),3));return g;}
 const parts=[part(1),part(2),part(3)],sources=[...parts],original=parts.map(g=>g.clone()),vendor=f.mergeGeometries(original),out=mergeOwned(parts,T,f.mergeGeometries);
 sameGeometry(vendor,out,'owned merge');assert.equal(parts.length,0);assert(sources.every(g=>Object.values(g.attributes).every(a=>a===null)));assert(original.every(g=>g.attributes.position));
 for(const make of [()=>[new T.BoxGeometry(),new T.BoxGeometry()],()=>{const g=part(1);return[g,g];},()=>{const g=part(1);g.morphAttributes.position=[g.attributes.position.clone()];return[g];},()=>{const g=part(1);g.setAttribute('glow',new T.BufferAttribute(new Uint8Array(g.attributes.position.count),1));return[g];}]){
  const p=make(),before=p.map(g=>Object.keys(g.attributes));let calls=0;const result=mergeOwned(p,T,items=>{calls++;assert.equal(items,p);return 'original fallback';});assert.equal(result,'original fallback');assert.equal(calls,1);assert.deepEqual(p.map(g=>Object.keys(g.attributes)),before);
 }
});

test('test-only scenery candidate over composed source retains every mesh byte and escaping terrain while private merge capacity drops before the next attribute',async()=>{
 const records=[],worlds=[];
 for(const baseline of [true,false]){
  let active=null;const merges=[];
  const measure=(parts,build,label)=>{
   const arrays=parts.flatMap(g=>Object.values(g.attributes).map(a=>a.array));
   assert.equal(new Set(arrays.map(a=>a.buffer)).size,arrays.length,label+' source buffers are independently owned');
   const sourceBytes=arrays.reduce((n,a)=>n+a.byteLength,0);arrays.length=0;
   const record={label,parts:parts.length,vertices:parts.reduce((n,g)=>n+g.attributes.position.count,0),sourceBytes,live:sourceBytes,peak:sourceBytes,allocations:0};
   active=record;const start=performance.now();try{const out=build();record.ms=performance.now()-start;record.finalBytes=Object.values(out.attributes).reduce((n,a)=>n+a.array.byteLength,0);return out;}finally{active=null;merges.push(record);}
  };
  const f=await geometryFixture({baseline,candidateScenery:true,globals:{__traceMerge:measure,__geometryAllocate(bytes){if(active){active.live+=bytes;active.peak=Math.max(active.peak,active.live);active.allocations++;}},__geometryRelease(bytes){if(active)active.live-=bytes;}},transform(rel,s){
   if(rel==='src/world/environment.js'){
    const merge=(name)=>baseline?`mergeGeometries(${name})`:`mergeOwnedSceneryGeometries(${name}, THREE, mergeGeometries)`;
    for(const [name,label]of [['all','city'],['staticParts','static'],['treeParts','trees']])s=s.replace(merge(name),`globalThis.__traceMerge(${name},()=>${merge(name)},'${label}')`);
   }
   if(rel.endsWith('BufferGeometryUtils.js'))s=s.replace('const array = new TypedArray( arrayLength );','const array = new TypedArray( arrayLength );globalThis.__geometryAllocate?.(array.byteLength);');
   if(rel.endsWith('scenery-owned-merge.mjs'))s=s.replace('const array=new Float32Array(length);','const array=new Float32Array(length);globalThis.__geometryAllocate?.(array.byteLength);').replace('geometry.attributes[name]=null;','geometry.attributes[name]=null;globalThis.__geometryRelease?.(attribute.array.byteLength);');
   return s;
  }});
  const e=Object.create(f.Environment.prototype);e.root=new f.THREE.Group();e.U={uNight:{value:0}};
  const start=performance.now();e._buildScenery();const totalMs=performance.now()-start;
  assert(e._cityIsland.geo.attributes.position,'city island source escapes and must not be consumed');
  worlds.push(e);records.push({baseline,totalMs,merges});
 }
 const [old,now]=worlds;
 for(const name of ['terrain','staticScenery','city','trees']){
  sameGeometry(old[name].geometry,now[name].geometry,'actual scenery '+name);
  assert.deepEqual([old[name].frustumCulled,old[name].name],[now[name].frustumCulled,now[name].name]);
  if(old[name].instanceMatrix)assert.deepEqual(bytes(old[name].instanceMatrix.array),bytes(now[name].instanceMatrix.array));
  if(old[name].instanceColor)assert.deepEqual(bytes(old[name].instanceColor.array),bytes(now[name].instanceColor.array));
 }
 sameGeometry(old._cityIsland.geo,now._cityIsland.geo,'escaping island geometry');
 for(const label of ['city','static','trees']){
  const a=records[0].merges.find(r=>r.label===label),b=records[1].merges.find(r=>r.label===label);assert.deepEqual([a.parts,a.vertices,a.sourceBytes,a.finalBytes],[b.parts,b.vertices,b.sourceBytes,b.finalBytes]);
  assert.equal(a.peak,a.sourceBytes+a.finalBytes);assert.equal(b.live,b.finalBytes);assert(b.peak<a.peak,label+' releases copied source storage before later allocations');
  if(label==='city'){assert.equal(a.peak/a.vertices,104);assert.equal(b.peak/b.vertices,64);}
 }
 console.log('GEOMETRY_SCENERY_CAPACITY '+JSON.stringify(records));
});

test('unsafe early Float32 position storage changes actual generated winding and is rejected',async()=>{
 const exact=await geometryFixture(),unsafe=await geometryFixture({transform(rel,s){return rel==='src/world/level.js'?s.replace('B.pos.push(p.x, p.y, p.z);','B.pos.push(Math.fround(p.x), Math.fround(p.y), Math.fround(p.z));'):s;}});
 const layout={bounds:{minX:1e8,maxX:1e8+4,minZ:0,maxZ:4},spawnPads:[[1e8,2,0],[1e8+4,2,4]],spawnBarrier:1,single:[{kind:'box',min:[1e8,0,0],max:[1e8+1,1,1],color:'#d8d2c4',bevel:.1}],half:[]};
 const a=new exact.Level(layout),b=new unsafe.Level(layout),x=a.buildGeometry(2048),y=b.buildGeometry(2048);
 assert.deepEqual(bytes(x.attributes.position.array),bytes(y.attributes.position.array),'final position values are identical');
 assert.notDeepEqual(bytes(x.index.array),bytes(y.index.array),'rounded intermediates cannot preserve winding');
});

test('actual Level construction releases typed chunks progressively and records warmed paired build times',async()=>{
 let active=null;const metrics=[];
 const sample=()=>{if(!active)return;let bytes=0;for(const writer of Object.values(active.storage))if(writer?.chunks)for(const chunk of writer.chunks)if(chunk)bytes+=chunk.byteLength;active.peak=Math.max(active.peak,bytes+active.outputBytes);return bytes;};
 const now=await geometryFixture({globals:{__storageStart(storage){active={storage,peak:0,outputBytes:0};},__storageBeforeFinish(){active.constructionBytes=sample();},__storageOutput(bytes){active.outputBytes+=bytes;sample();},__storageEnd(){assert(Object.values(active.storage).every(w=>!w||!w.chunks.length&&!w.current));metrics.push({constructionBytes:active.constructionBytes,peak:active.peak,finalBytes:active.outputBytes});active=null;}},transform(rel,s){
  if(rel==='src/world/level.js')s=s.replace('const B = createLevelGeometryStorage();','const B = createLevelGeometryStorage();globalThis.__storageStart(B);')
   .replace('    const g = new THREE.BufferGeometry();','    globalThis.__storageBeforeFinish();const g = new THREE.BufferGeometry();')
   .replace("new THREE.Float32BufferAttribute(B.pos, 3));","new THREE.Float32BufferAttribute(B.pos, 3));globalThis.__storageOutput(g.attributes.position.array.byteLength);")
   .replace('    this.renderTris = B.idx.length / 3;','    this.renderTris = B.idx.length / 3;globalThis.__storageEnd();');
  if(rel.endsWith('geometry-build-storage.mjs'))s=s.replace('const out=new ArrayType(this.length);','const out=new ArrayType(this.length);globalThis.__storageOutput?.(out.byteLength);');return s;
 }});
 const b=new now.Level(now.MAP_LAYOUTS.range),geo=b.buildGeometry(2048),m=metrics[0];assert.equal(m.finalBytes,Object.values(geo.attributes).reduce((n,a)=>n+a.array.byteLength,geo.index.array.byteLength));assert(m.peak>m.finalBytes);assert(m.peak<m.constructionBytes+m.finalBytes,'earlier chunks are released before later attributes allocate');
 const old=await geometryFixture({baseline:true}),fast=await geometryFixture(),timings=[];
 const median=rows=>[...rows].sort((a,b)=>a-b)[Math.floor(rows.length/2)];
 for(const id of ['tidewater','kelpline','cargo','halyard','range']){
  const levels=[new old.Level(old.MAP_LAYOUTS[id]),new fast.Level(fast.MAP_LAYOUTS[id])],samples=[[],[]];
  for(let k=0;k<7;k++)for(const i of k%2?[1,0]:[0,1]){const start=performance.now(),g=levels[i].buildGeometry(2048);const ms=performance.now()-start;if(k>1)samples[i].push(ms);g.dispose();}
  timings.push({id,oldMedianMs:median(samples[0]),newMedianMs:median(samples[1]),oldSamples:samples[0],newSamples:samples[1]});
 }
 console.log('GEOMETRY_LEVEL_CAPACITY '+JSON.stringify({vertices:geo.attributes.position.count,indexValues:geo.index.count,oldNumericArrayElements:geo.attributes.position.count*25+geo.index.count,...m}));
 console.log('GEOMETRY_WARM_TIMINGS '+JSON.stringify(timings));
});

test('warmed actual city-part merge compares vendor, deleting-source and stable-shape null-source release timings',async()=>{
 let recorded=null,api;
 const benchmark=parts=>{
  const release=api.mergeOwnedSceneryGeometries,drop=vm.runInContext('('+release.toString().replace('geometry.attributes[name]=null;','geometry.deleteAttribute(name);')+')',api.context),rows=[[],[],[]];
  const methods=[p=>api.mergeGeometries(p),p=>drop(p,api.THREE,api.mergeGeometries),p=>release(p,api.THREE,api.mergeGeometries)];
  for(let run=0;run<8;run++)for(let offset=0;offset<3;offset++){
   const which=(run+offset)%3,copies=parts.map(g=>g.clone());const start=performance.now(),out=methods[which](copies),ms=performance.now()-start;
   if(run>=2)rows[which].push(ms);out.dispose();
  }
  const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];recorded={parts:parts.length,vertices:parts.reduce((n,g)=>n+g.attributes.position.count,0),vendorMs:median(rows[0]),deleteMs:median(rows[1]),nullMs:median(rows[2]),samples:rows};
 };
 api=await geometryFixture({candidateScenery:true,globals:{__benchmarkCity:benchmark},transform(rel,s){return rel==='src/world/environment.js'?s.replace('const geo = mergeOwnedSceneryGeometries(all, THREE, mergeGeometries);','globalThis.__benchmarkCity(all);const geo = mergeOwnedSceneryGeometries(all, THREE, mergeGeometries);'):s;}});
 const e=Object.create(api.Environment.prototype);e.root=new api.THREE.Group();e.U={uNight:{value:0}};e._buildScenery();assert(recorded);console.log('GEOMETRY_CITY_MERGE_WARM '+JSON.stringify(recorded));
});
