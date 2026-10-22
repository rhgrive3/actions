import{commonFile}from'./source-fixture.mjs';
// Synthetic protocol tests only; actual b9 is tested separately and remains incomplete.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash}from'node:crypto';
import {materialEntryObservation}from'./entry-observer.mjs';
import {semanticSnapshot,compareSemanticSnapshots,UUID}from'./semantic-identity.mjs';
const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0'),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function fixture(){
 const content={type:'BufferGeometry',attributes:{position:{type:'Float32Array',bytes:12,count:1,itemSize:3,sha256:'a'.repeat(64)}},groups:[],drawRange:{start:0,count:3}};
 const geometry={alias:0,uuid:id(4),content,contentSha256:hash(content)};
 const nodes=[{uuid:id(1),name:'root',type:'Group',geometry:null},...['left','right'].map((name,i)=>({uuid:id(i+2),name,type:'Mesh',geometry:{uuid:id(4)},matrix:[1,i,0,1]}))];
 const owners=nodes.slice(1).map((n,i)=>({uuid:n.uuid,name:n.name,type:n.type,path:'root/'+i,geometryAlias:0,materialUuids:[id(5)],bones:null}));
 const nodeGraph=nodes.map((n,i)=>({uuid:n.uuid,name:n.name,type:n.type,path:i?'root/'+(i-1):'root',parentPath:i?'root':null,children:i?[]:['root/0','root/1']}));
 const e={truncated:false,nodeGraph,owners,geometries:[geometry],materials:[{uuid:id(5),owner:'root/0',cached:true,compiled:true,privateUniforms:{roughness:.2,tint:[1,0,0]}}]};
 return{entryObservation:e,character:{nodes,materials:[{uuid:id(5),type:'MeshPhysicalMaterial',roughness:.2}],nodesTruncated:false,materialsTruncated:false},rngState:7,rendererFrame:41,clocks:{time:1},presentation:{toneMapping:4}};
}
function rename(s){let i=100;const m=new Map();const visit=v=>{if(typeof v==='string'&&UUID.test(v)){if(!m.has(v))m.set(v,id(i++));return m.get(v);}if(Array.isArray(v))return v.map(visit);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));return v;};return visit(s);}
function split(s){const g=structuredClone(s.entryObservation.geometries[0]);g.alias=1;g.uuid=id(99);s.entryObservation.geometries.push(g);s.entryObservation.owners[1].geometryAlias=1;s.character.nodes[2].geometry.uuid=g.uuid;return s;}
function withNoise(s){const ao={gtaoBinding:true,pdBinding:true};for(const[role,size,n]of [['gtao',5,10],['pd',64,20]]){ao[role+'Noise']={uuid:id(n),sourceUuid:id(n+1),sourceImageIdentity:true,width:size,height:size,bytes:size*size*4,sha256:'c'.repeat(64),version:1,sourceVersion:1};ao[role]={uuid:id(n+2),uniforms:{tNoise:{type:'texture',uuid:id(n),version:1},radius:8}};}s.entryObservation.postprocess={ao};return s;}
test('UUID renaming alone has equal semantic state, raw evidence remains unequal',()=>{const a=fixture(),b=rename(a),r=compareSemanticSnapshots(a,b);assert.equal(r.semanticEqual,true);assert.equal(r.rawEqual,false);assert.equal(r.rawIdsEqual,false);assert.equal(r.before.definitions.length,5);assert.equal(a.character.nodes[0].uuid,id(1));});
test('original raw equality is retained separately',()=>{const a=fixture(),r=compareSemanticSnapshots(a,a);assert.equal(r.rawEqual,true);assert.equal(r.rawIdsEqual,true);assert.equal(r.semanticEqual,true);});
test('alias splitting fails with identical CPU content',()=>assert.equal(compareSemanticSnapshots(fixture(),split(fixture())).semanticEqual,false));
test('alias merging fails with identical CPU content',()=>assert.equal(compareSemanticSnapshots(split(fixture()),fixture()).semanticEqual,false));
test('material alias split fails',()=>{const b=fixture(),m=structuredClone(b.entryObservation.materials[0]);m.uuid=id(88);m.owner='root/1';b.entryObservation.materials.push(m);b.entryObservation.owners[1].materialUuids=[m.uuid];b.character.materials.push({...b.character.materials[0],uuid:m.uuid});assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
test('owner swap fails rather than equating matching shapes',()=>{const b=fixture();[b.entryObservation.owners[0].path,b.entryObservation.owners[1].path]=[b.entryObservation.owners[1].path,b.entryObservation.owners[0].path];assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
test('changed geometry content with updated self-hash fails',()=>{const b=fixture(),g=b.entryObservation.geometries[0];g.content.attributes.position.sha256='b'.repeat(64);g.contentSha256=hash(g.content);assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
test('stale geometry self-hash fails',()=>{const b=fixture();b.entryObservation.geometries[0].content.drawRange.count=2;assert.throws(()=>semanticSnapshot(b),/hash mismatch/);});
test('changed private uniform fails',()=>{const b=fixture();b.entryObservation.materials[0].privateUniforms.roughness=.3;assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
test('noise UUID renaming passes only with bound complete CPU evidence',()=>assert.equal(compareSemanticSnapshots(withNoise(fixture()),rename(withNoise(fixture()))).semanticEqual,true));
test('changed noise byte hash fails',()=>{const a=withNoise(fixture()),b=structuredClone(a);b.entryObservation.postprocess.ao.pdNoise.sha256='d'.repeat(64);assert.equal(compareSemanticSnapshots(a,b).semanticEqual,false);});
test('noise source alias merge fails',()=>{const a=withNoise(fixture()),b=structuredClone(a);b.entryObservation.postprocess.ao.pdNoise.sourceUuid=b.entryObservation.postprocess.ao.gtaoNoise.sourceUuid;assert.equal(compareSemanticSnapshots(a,b).semanticEqual,false);});
for(const[k,v]of [['newReference',id(1)],['newResource',id(999)]])test('unknown reference fails even if raw IDs match: '+k,()=>{const a=fixture();a[k]=v;const r=compareSemanticSnapshots(a,a);assert.equal(r.rawEqual,true);assert.equal(r.semanticEqual,false);assert.equal(r.before.complete,false);});
test('geometry binding not backed by owner graph fails',()=>{const b=fixture();b.character.nodes[1].geometry.uuid=id(999);assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
test('UUID reuse across resource kinds fails',()=>{const b=fixture();b.entryObservation.geometries[0].uuid=id(5);b.character.nodes[1].geometry.uuid=id(5);b.character.nodes[2].geometry.uuid=id(5);assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});
for(const[k,v]of [['rngState',8],['rendererFrame',42],['clocks',{time:2}]])test('strict non-identity condition retained: '+k,()=>{const b=rename(fixture());b[k]=v;assert.equal(compareSemanticSnapshots(fixture(),b).semanticEqual,false);});

test('actual LOCAL observer schema, including AO keys, feeds semantic identity',()=>{
 const geometry={uuid:id(4),type:'BufferGeometry',attributes:{position:{array:new Float32Array([1,2,3]),itemSize:3,count:1}},morphAttributes:{},groups:[],drawRange:{start:0,count:1}};
 const material={uuid:id(5)},mesh={uuid:id(2),name:'mesh',type:'Mesh',geometry,material,children:[]},root={uuid:id(1),name:'root',type:'Group',children:[mesh]};
 const ao={enabled:true};for(const[role,size,n]of [['gtao',5,10],['pd',64,20]]){const image={width:size,height:size,data:new Uint8Array(size*size*4)};const texture={isTexture:true,uuid:id(n),image,source:{uuid:id(n+1),data:image,version:1},version:1};ao[role+'NoiseTexture']=texture;ao[role+'Material']={uuid:id(n+2),uniforms:{tNoise:{value:texture}}};}
 const r={info:{render:{frame:1}},properties:{has:()=>false}},a={character:{root}},g={R:{gtao:ao,composer:{passes:[ao]}}};
 const entryObservation=materialEntryObservation({g,G:{},r,a},'geometry');const snapshot={entryObservation,character:{nodesTruncated:false,materialsTruncated:false,nodes:[{uuid:root.uuid,name:root.name,type:root.type,geometry:null},{uuid:mesh.uuid,name:mesh.name,type:mesh.type,geometry:{uuid:geometry.uuid}}],materials:[{uuid:material.uuid}]}};
 assert.equal(semanticSnapshot(snapshot).complete,true);assert.equal(compareSemanticSnapshots(snapshot,rename(snapshot)).semanticEqual,true);
});
test('incomplete native parent-child ownership is rejected',()=>{const a=fixture();a.entryObservation.nodeGraph[0].children=[];assert.throws(()=>semanticSnapshot(a),/parent does not own child/);});
test('missing draw owner is rejected even when every raw UUID is otherwise known',()=>{const a=fixture();a.entryObservation.owners.pop();assert.throws(()=>semanticSnapshot(a),/draw-owner coverage/);});
test('unknown cyclic metadata cannot exhaust UUID inventory',()=>{const a=fixture();a.loop=a;assert.throws(()=>semanticSnapshot(a),/inventory cycle/);});
test('unknown deeply nested metadata cannot exhaust UUID inventory',()=>{const a=fixture();let p=a;for(let i=0;i<70;i++)p=p.extra={};assert.throws(()=>semanticSnapshot(a),/inventory bound/);});
import{readFileSync}from'node:fs';import{observeNativeIdentityResources}from'./native-resource-observer.mjs';
function resourceFixture(withContext=false){
 const s=fixture(),e=s.entryObservation,b={uuid:id(60),name:'bone',type:'Bone',geometry:null};s.character.nodes.push(b);e.nodeGraph[0].children.push('root/2');e.nodeGraph.push({...b,path:'root/2',parentPath:'root',children:[]});e.owners[0].bones=[{uuid:b.uuid,name:b.name,path:'root/2'}];
 const tex=(n,data,w,h,type,format,rt=false)=>{const image={width:w,height:h,...(data?{data}:{})};return{uuid:id(n),source:{uuid:id(n+1),data:image,version:1},image,version:1,type,format,isRenderTargetTexture:rt};};
 const source=readFileSync(commonFile('inkwave-public/vendor/three/build/three.module.js'),'utf8');const arr=Function('return '+source.match(/const DATA = new Uint16Array\( ([\s\S]*?) \);/)[1])();
 const lut=tex(70,new Uint16Array(arr),16,16,1016,1030);lut.name='DFG_LUT';const env=tex(80,null,768,1024,1016,1023,true),atlas=tex(90,null,4096,4096,1009,1023,true),bone=tex(100,new Float32Array(64),4,4,1015,1023);
 const mat={uuid:id(5)},u={dfgLUT:{value:lut},envMap:{value:env}},roots=s.character.nodes.map(n=>({uuid:n.uuid}));const sk={boneTexture:bone,boneMatrices:bone.image.data,bones:[roots[3]]};roots[1].skeleton=sk;const scene={environment:env};const sun={uuid:id(110),name:'Sun',type:'DirectionalLight',parent:scene},hemi={uuid:id(111),name:'SkyFill',type:'HemisphereLight',parent:scene};
 const G={scene,env:{envMap:env,_envRT:{texture:env,width:768,height:1024},sun,hemi},paint:{texture:atlas,rt:{texture:atlas,width:4096,height:4096},size:4096}};
 const args={G,r:{properties:{has:()=>true,get:()=>({uniforms:u})}},a:{character:{root:roots[0],skeleton:sk}},roots,materials:new Set([mat])};
 e.nativeResources=observeNativeIdentityResources(args,b=>createHash('sha256').update(b).digest('hex'));
 e.materials[0].privateUniforms.dfgLUT={uuid:lut.uuid};e.materials[0].privateUniforms.envMap={uuid:env.uuid};s.character.boneTexture={uuid:bone.uuid};s.atlasTexture={uuid:atlas.uuid};s.presentation={environment:{uuid:env.uuid},lights:[sun,hemi].map(({uuid,name,type})=>({uuid,name,type})),lightsTruncated:false};return withContext?{s,args}:s;
}
test('actual narrow resource observer schema maps all four b9 texture roles and lights',()=>{const a=resourceFixture();assert.equal(semanticSnapshot(a).complete,true);assert.equal(compareSemanticSnapshots(a,rename(a)).semanticEqual,true);});
for(const [name,mutate]of[
 ['LUT changed CPU content',s=>s.entryObservation.nativeResources.dfg[0].texture.sha256='b'.repeat(64)],
 ['environment owner detached',s=>s.entryObservation.nativeResources.environment.rtIdentity=false],
 ['private environment uses atlas',s=>s.entryObservation.materials[0].privateUniforms.envMap.uuid=s.atlasTexture.uuid],
 ['atlas wrong size',s=>s.entryObservation.nativeResources.atlas.size=2048],
 ['bone palette is not native CPU array',s=>s.entryObservation.nativeResources.skeleton.cpuIdentity=false],
 ['texture sources merged',s=>s.entryObservation.nativeResources.atlas.texture.sourceUuid=s.entryObservation.nativeResources.environment.texture.sourceUuid],
 ['light owner detached',s=>s.entryObservation.nativeResources.lights[0].sceneIdentity=false],
 ['LUT owned by wrong material',s=>s.entryObservation.nativeResources.dfg[0].materialUuids=[id(999)]],
 ['resource provenance missing',s=>delete s.entryObservation.nativeResources]
])test(name,()=>{const a=resourceFixture(),b=structuredClone(a);mutate(b);assert.equal(compareSemanticSnapshots(a,b).semanticEqual,false);});
test('known AO texture cannot masquerade as an unproven environment resource',()=>{const a=withNoise(fixture());a.entryObservation.materials[0].privateUniforms.envMap={uuid:a.entryObservation.postprocess.ao.gtaoNoise.uuid};assert.equal(semanticSnapshot(a).complete,false);});

for(const [name,mutate]of[
 ['actual other environment RT',c=>c.args.G.env._envRT.texture={}],
 ['actual other paint RT',c=>c.args.G.paint.rt.texture={}],
 ['actual other bone array',c=>c.args.a.character.skeleton.boneMatrices=new Float32Array(64)],
 ['actual other owner skeleton',c=>c.args.roots[1].skeleton={}],
 ['actual uncached material',c=>{c.args.r.properties.has=()=>false;c.args.r.properties.get=()=>{throw Error('Must not populate cache');};}]
])test(name+' is rejected through observer output, not a hand-written receipt',()=>{
 const c=resourceFixture(true),before=structuredClone(c.s);mutate(c);c.s.entryObservation.nativeResources=observeNativeIdentityResources(c.args,b=>createHash('sha256').update(b).digest('hex'));assert.equal(compareSemanticSnapshots(before,c.s).semanticEqual,false);
});
