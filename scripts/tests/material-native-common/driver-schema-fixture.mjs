import{commonFile}from'./source-fixture.mjs';
// Actual generated driver functions, synthetic native owners. No browser/GPU claim.
import assert from 'node:assert/strict';import fs from 'node:fs';
import{semanticSnapshot,UUID}from'./semantic-identity.mjs';import{compareReplaySemanticCondition,requireReplayIdentityCoverage}from'./replay-semantic-condition.mjs';
const driver=fs.readFileSync(new URL('../../check-inkwave-material-native-frame.mjs',import.meta.url),'utf8');
const obsSrc=driver.slice(driver.indexOf('function materialSettledEntryObservation('),driver.indexOf('\nfunction unusedSettledEntryPredicate'));
const observe=Function(obsSrc+';return materialSettledEntryObservation;')();
const snapSrc=driver.slice(driver.indexOf('  const boundedValue='),driver.indexOf('  // Capture pass'));
const snapFactory=Function('a','g','G','r','window','clocks','camera',snapSrc+';return snapshotRenderState;');
const id=n=>'00000000-0000-4000-8000-'+n.toString(16).padStart(12,'0'),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],matrix=()=>({elements:I.slice(),toArray(){return this.elements.slice();}}),v=(...x)=>({toArray:()=>x.slice()});
function fixture(){
 const node=(n,name,type)=>({uuid:id(n),name,type,visible:true,matrix:matrix(),matrixWorld:matrix(),children:[]});
 const root=node(1,'root','Group'),mesh=node(2,'body','SkinnedMesh'),bone=node(3,'bone','Bone');root.children=[mesh,bone];root.traverse=fn=>{const visit=o=>{fn(o);for(const c of o.children)visit(c);};visit(root);};
 const geo={uuid:id(4),type:'BufferGeometry',attributes:{position:{array:new Float32Array([0,0,0,1,0,0,0,1,0]),itemSize:3,count:3,version:0}},morphAttributes:{},groups:[],drawRange:{start:0,count:3}};
 const material={uuid:id(5),name:'body',type:'MeshPhysicalMaterial',version:1,opacity:1,transparent:false,depthWrite:true,depthTest:true,uniforms:{}};mesh.geometry=geo;mesh.material=material;mesh.bindMatrix=matrix();mesh.bindMatrixInverse=matrix();
 const texture=(n,data,width,height,type=1015,format=1023,rt=false)=>{const image={width,height,...(data?{data}:{})};return{isTexture:true,uuid:id(n),source:{uuid:id(n+1),data:image,version:1},image,version:1,type,format,isRenderTargetTexture:rt};};
 const source=fs.readFileSync(commonFile('inkwave-public/vendor/three/build/three.module.js'),'utf8'),data=Function('return '+source.match(/const DATA = new Uint16Array\( ([\s\S]*?) \);/)[1])();
 const lut=texture(10,new Uint16Array(data),16,16,1016,1030);lut.name='DFG_LUT';const env=texture(20,null,768,1024,1016,1023,true),atlas=texture(30,null,4096,4096,1009,1023,true),boneTex=texture(40,new Float32Array(64),4,4);
 const skeleton={boneTexture:boneTex,boneMatrices:boneTex.image.data,bones:[bone],boneInverses:[matrix()]};mesh.skeleton=skeleton;
 const lights=[['Sun','DirectionalLight'],['SkyFill','HemisphereLight']].map(([name,type],i)=>({...node(50+i,name,type),isLight:true,color:v(1,1,1),intensity:1}));
 const scene={environment:env,environmentIntensity:.66,environmentRotation:v(0,0,0),traverse:fn=>{for(const l of lights)fn(l);root.traverse(fn);}};for(const l of lights)l.parent=scene;
 const ao={enabled:true};for(const [role,size,n]of[['gtao',5,60],['pd',64,70]]){const t=texture(n,new Uint8Array(size*size*4),size,size,1009);ao[role+'NoiseTexture']=t;ao[role+'Material']={uuid:id(n+2),uniforms:{tNoise:{value:t}}};}
 const r={info:{render:{frame:100,calls:2,triangles:3,points:0,lines:0},memory:{textures:8,geometries:1},programs:[{}]},shadowMap:{needsUpdate:false,autoUpdate:false},properties:{has:m=>m===material,get:m=>{assert.equal(m,material);return{uniforms:{dfgLUT:{value:lut},envMap:{value:env}}};}}};
 const ch={root,skeleton,t:.5,phase:0,u:{},_camFrame:100,_camPos:v(0,0,0)},a={character:ch};const g={settings:{quality:'high'},R:{gtao:ao,composer:{passes:[ao]}},rig:{mode:'follow',target:a},showcase:{_warmState:'done'},input:{keys:new Set(),pressed:new Set()}};
 const G={scene,paint:{texture:atlas,rt:{texture:atlas,width:4096,height:4096},size:4096},env:{envMap:env,_envRT:{texture:env,width:768,height:1024},sun:lights[0],hemi:lights[1]},camera:{position:v(0,5,-10),quaternion:v(0,0,0,1),projectionMatrix:matrix()}};
 const win={__materialRngState:()=>123,__materialObserveCurrent:mode=>observe({a,g,G,r,rngState:123,rngCount:1000},mode)};
 const capture=snapFactory(a,g,G,r,win,()=>({time:.5}),()=>({position:[0,5,-10]}));return{a,g,G,r,capture};
}
function rename(value){const map=new Map();function walk(v){if(typeof v==='string'&&UUID.test(v)){if(!map.has(v))map.set(v,id(500+map.size));return map.get(v);}if(Array.isArray(v))return v.map(walk);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,walk(x)]));return v;}return walk(value);}
function condition(snapshot){return{sourceSha:'f'.repeat(40),loadedExceptMaterial:[['main.js','a'.repeat(64)]],atlasHash:'b'.repeat(64),initial:{gameplaySeed:123},renderStates:['unpainted','painted','repeat','repeat2'].map((label,i)=>({label,captureOrdinal:i,before:structuredClone(snapshot),afterRender:structuredClone(snapshot),after:structuredClone(snapshot)}))};}

export {fixture,condition,rename,driver};
