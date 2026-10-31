import test from 'node:test';import assert from 'node:assert/strict';
import vm from 'node:vm';
import {geometryFixture} from './geometry-build-fixture.mjs';
import {baseline,raw,composed,declaration,restore,sameGeometry} from './queue-visual-world-20261031.helper.mjs';
import {adaptQueueVisualWorld20261031} from '../queue-visual-world-20261031-adapter.mjs';
const same=(a,b,expanded=false)=>{
 const x=expanded&&a.index?a.toNonIndexed():a,y=expanded&&b.index?b.toNonIndexed():b;
 assert.deepEqual(Object.keys(x.attributes),Object.keys(y.attributes));
 for(const name of Object.keys(x.attributes)){
  const u=x.attributes[name],v=y.attributes[name];assert.equal(u.itemSize,v.itemSize,name);assert.equal(u.count,v.count,name);
  assert.equal(Buffer.compare(Buffer.from(u.array.buffer,u.array.byteOffset,u.array.byteLength),Buffer.from(v.array.buffer,v.array.byteOffset,v.array.byteLength)),0,name+' bytes');
 }
 if(x.index){assert(y.index);assert.equal(x.index.count,y.index.count);for(let i=0;i<x.index.count;i++)assert.equal(x.index.getX(i),y.index.getX(i),'index '+i);}else assert.equal(y.index,null);
 if(x!==a)x.dispose();if(y!==b)y.dispose();
};
const fixture=before=>geometryFixture({transform(rel,s){if(before)s=restore(rel,s);if(rel==='src/world/environment.js')s+='\nimport {Decor} from "./decor.js";globalThis.__world={G,makeIsland,Decor};';return s;}});
const fixtures=Promise.all([fixture(true),fixture(false)]);

test('final pass composes each affected module once and preserves upstream source',()=>{
 assert.equal(baseline.main,'4423b1ea47a5be387991f3de9a70f900fb4d1b26');
 for(const rel of Object.keys(baseline.modules)){
  const before=composed(rel,true),after=composed(rel);new vm.SourceTextModule(after);
  assert.equal(adaptQueueVisualWorld20261031(rel,before),after,rel);
 }
 assert.equal(adaptQueueVisualWorld20261031('src/unrelated.js','const keep = 1;'),'const keep = 1;');
});

test('all authored far scenery preserves expanded triangles, instance transforms, normals and colors',async()=>{
 const f=await fixtures,owners=f.map(v=>{const e=Object.create(v.Environment.prototype);e.U={uNight:{value:0}};e.root=new v.THREE.Group();e._buildScenery();return e;});
 for(const name of ['terrain','staticScenery','city','trees','ferris']){
  const [a,b]=owners.map(e=>e[name]);if(a?.geometry)same(a.geometry,b.geometry,name==='terrain');
  if(a?.instanceMatrix)assert.deepEqual(Array.from(a.instanceMatrix.array),Array.from(b.instanceMatrix.array));
  if(a?.instanceColor)assert.deepEqual(Array.from(a.instanceColor.array),Array.from(b.instanceColor.array));
 }
 const [a,b]=owners.map(e=>e.terrain.geometry);assert.equal(a.index,null);assert(b.index);assert.equal(b.attributes.position.count,23368);assert.equal(b.index.count,136536);
 const bytes=g=>Object.values(g.attributes).reduce((n,a)=>n+a.array.byteLength,0)+(g.index?.array.byteLength||0);
 assert.equal(bytes(a)-bytes(b),4253648);
 for(const e of owners)e.root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('island generated indices, helpers and winding match beyond the 16-bit index boundary',async()=>{
 const f=await fixtures;
 for(const o of [{x:4,z:-3,rx:13,rz:9,h:7,rot:.371,R:4,S:7},{x:0,z:0,rx:13,rz:9,h:7,plateau:true,R:255,S:256}]){
  const [a,b]=f.map(v=>v.context.__world.makeIsland(o));same(a.geo,b.geo,true);
  assert.equal(b.geo.index.array.constructor.name,o.R===255?'Uint32Array':'Uint16Array');
  for(const p of [[0,0],[12,8],[-1.3,42.1]]){assert.equal(a.heightAt(...p),b.heightAt(...p));assert.equal(a.localF(...p),b.localF(...p));}
  let j=0;const rnd=()=>[.25,.77][j++%2];assert.deepEqual(Array.from(a.sample(rnd)),Array.from(b.sample(rnd)));
  a.geo.dispose();b.geo.dispose();
 }
});

test('sea final signed-byte normal storage matches all 9345 vertices',async()=>{
 const f=await fixtures,owners=f.map(v=>{const e=Object.create(v.Environment.prototype);e.U={uWaveTex:{value:null}};e.root=new v.THREE.Group();e._buildSea();return e;});
 same(owners[0].sea.geometry,owners[1].sea.geometry);assert.equal(owners[1].sea.geometry.attributes.normal.array.constructor.name,'Int8Array');
 for(const e of owners){e.sea.geometry.dispose();e.seaMat.dispose();e.U.uWaveTex.value.dispose();}
});

test('indexed palm trunks retain every triangle and keep frond geometry untouched',async()=>{
 const f=await fixtures;
 for(const id of ['tidewater','kelpline','halyard','cargo','range']){
  const owners=f.map(v=>{const e=Object.create(v.context.__world.Decor.prototype);e.level=new v.Level(v.MAP_LAYOUTS[id]);e.group=new v.THREE.Group();e.uTime={value:0};e._buildPalms();return e;});
  assert.equal(owners[0].group.children.length,owners[1].group.children.length);
  for(let i=0;i<owners[0].group.children.length;i++){const [a,b]=owners.map(e=>e.group.children[i]);same(a.geometry,b.geometry,a.name==='palms:trunk');if(a.name==='palms:trunk')assert(b.geometry.index);}
 }
});

test('marina strips and undersides retain exact geometry for actual Halyard and empty decks',async()=>{
 const f=await fixtures;
 for(const empty of [false,true]){
  const owners=f.map(v=>{const e=Object.create(v.Environment.prototype);v.context.__world.G.level=new v.Level(v.MAP_LAYOUTS.halyard);e.root=new v.THREE.Group();e.U={uTime:{value:0},uSunDir:{value:new v.THREE.Vector3()},uSunLight:{value:new v.THREE.Color()},uStripK:{value:1}};const M=empty?{decks:[],wet:[]}:e._marinaSets();e._buildMarinaFx(M);return e;});
  assert.equal(owners[0].marinaFx.children.length,owners[1].marinaFx.children.length);
  for(let i=0;i<owners[0].marinaFx.children.length;i++)same(owners[0].marinaFx.children[i].geometry,owners[1].marinaFx.children[i].geometry);
 }
});

test('foam field bytes stay exact for overlapping, degenerate, invalid and boundary capsules',async()=>{
 const f=await fixtures;let seed=4931;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/2**32);
 const shapes=Array.from({length:100},()=>({ax:rnd()*20-10,az:rnd()*20-10,bx:rnd()*20-10,bz:rnd()*20-10,r:rnd()*2,reach:rnd()*10}));
 shapes.push({ax:0,az:0,bx:0,bz:0,r:0,reach:20},{ax:1,az:1,bx:1,bz:1,r:-1,reach:10},{ax:0,az:0,bx:2,bz:2,r:NaN},{ax:NaN,az:0,bx:2,bz:2,r:1});
 for(const marina of [true,false]){
  const owners=f.map(v=>{const e=Object.create(v.Environment.prototype);e._marina=marina;e.bounds={minX:-10,maxX:10,minZ:-10,maxZ:10};e.U={uFoamTex:{value:null},uFoamRect:{value:new v.THREE.Vector4()},uMarinaK:{value:new v.THREE.Vector4()}};e._buildFoamField(shapes);return e;});
  const get=e=>Object.values(e).find(x=>x?.isTexture)||Object.values(e.U).find(x=>x.value?.isTexture)?.value;
  const [a,b]=owners.map(get);assert(a?.image?.data);assert.deepEqual(Array.from(a.image.data),Array.from(b.image.data));
 }
});

test('vessel known-size reserve retains Float64 topology inputs and previous surface data',async()=>{
 const {THREE}= (await fixtures)[1];
 const current=composed('src/world/props-marina-vessels.js'),cls=declaration(current,'IWMarinaStaging',null).source;
 const oldcls=baseline.modules['src/world/props-marina-vessels.js'].entries.find(e=>e.name==='IWMarinaStaging').source;
 const [A,B]=[oldcls,cls].map(s=>new Function(s+';return IWMarinaStaging;')());
 const [a,b]=[new A(),new B()];
 for(let i=0;i<7;i++)for(const s of [a,b])s._vertex(i/7,1e-14*i,-i/11,.3,.4,.5,.123,.2,.7);
 const old=b.p;b._reserveVertices(7);assert.equal(b.p,old);b._reserveVertices(1000);assert.equal(b.p.length,3000);assert.equal(b.p.constructor,Float64Array);assert.equal(b.n.constructor,Float64Array);
 for(let i=7;i<1000;i++)for(const s of [a,b])s._vertex(i/7,1e-14*i,-i/11,.3,.4,.5,.123,.2,.7);
 for(const s of [a,b])for(let i=0;i<996;i+=3)s._triangle(i,i+1,i+2);same(a._geometry(THREE),b._geometry(THREE));
});

test('ferry pennants keep sample coordinates and reduce identical rope sampling four to one',()=>{
 const before=composed('src/world/props-marina-vessels.js',true),after=composed('src/world/props-marina-vessels.js');
 const body=s=>s.slice(s.indexOf('      const pc = [C.teal'),s.indexOf('\n    },',s.indexOf('      const pc = [C.teal')));
 const outputs=[before,after].map(s=>{let calls=0;const flags=[];new Function('C','B','ropePts','hy0','hy1','HP',body(s))({teal:0,mustard:1,coral:2,navy:3},{flag:(...v)=>flags.push(v)},(a,b,d,n)=>{calls++;return Array.from({length:n+1},(_,i)=>[a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n-d*Math.sin(i/n*Math.PI),a[2]+(b[2]-a[2])*i/n]);},[0,1,.92],[0,2,.05],Math.PI/2);return{flags,calls};});
 assert.deepEqual(outputs[0].flags,outputs[1].flags);assert.equal(outputs[0].calls,4);assert.equal(outputs[1].calls,1);
});
