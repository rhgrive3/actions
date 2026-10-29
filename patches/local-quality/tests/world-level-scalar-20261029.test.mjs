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

test('composed legacy layout × filter × paint/light atlas produces byte-identical attributes, winding, index and bounds with one filter pass',async()=>{
 const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-world-level-before-20261029.json',import.meta.url)));const old=await geometryFixture({transform(rel,s){return frozen[rel]??s;}}),now=await geometryFixture(),timings=[];
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

 assert.equal(old.NativeLevel.prototype.buildGeometry.toString(),now.NativeLevel.prototype.buildGeometry.toString(),'native stage override remains unchanged');
});
