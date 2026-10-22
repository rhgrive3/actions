// CPU-only source fixtures. No WebGL context, native Game frame or historical evidence repair.
import vm from 'node:vm';import path from 'node:path';import fs from 'node:fs';import{pathToFileURL}from'node:url';
const root=process.env.INKWAVE_MATERIAL_COMMON_SOURCE;
if(!root)throw Error('Explicit immutable COMMON source required');
const base=path.join(root,'inkwave-public');
const THREE=await import(pathToFileURL(path.join(base,'vendor/three/build/three.core.js')));
const context=vm.createContext({console,Math,performance,TextEncoder,Uint8Array,Uint16Array,Float32Array,Int32Array,ArrayBuffer,Map,Set,WeakMap,WeakSet});
const cache=new Map();const three=new vm.SyntheticModule(Object.keys(THREE),function(){for(const k of Object.keys(THREE))this.setExport(k,THREE[k]);},{context});
function get(file){if(!cache.has(file))cache.set(file,new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file}));return cache.get(file);}
async function load(file){const m=get(file);if(m.status==='unlinked')await m.link((s,parent)=>s==='three'?three:get(s.startsWith('three/addons/')?path.join(base,'vendor/three/jsm',s.slice(13)):path.resolve(path.dirname(parent.identifier),s)));if(m.status==='linked')await m.evaluate();return m.namespace;}
const {EffectComposer}=await load(path.join(base,'vendor/three/jsm/postprocessing/EffectComposer.js'));
const {GTAOPass}=await load(path.join(base,'vendor/three/jsm/postprocessing/GTAOPass.js'));
const {ShaderPass}=await load(path.join(base,'vendor/three/jsm/postprocessing/ShaderPass.js'));
const {OutputPass}=await load(path.join(base,'vendor/three/jsm/postprocessing/OutputPass.js'));
const {ScreenFX}=await load(path.join(base,'src/fx/screenfx.js'));
const rendererSource=fs.readFileSync(path.join(base,'src/core/renderer.js'),'utf8');const start=rendererSource.indexOf('const GradeShader =');const end=rendererSource.indexOf('\n};',start)+3;if(start<0||end<3)throw Error('GradeShader source boundary');
const GradeShader=Function('THREE',rendererSource.slice(start,end)+';return GradeShader;')(THREE);
export function fixture(){
 const r={getPixelRatio:()=>1,getSize:v=>v.set(960,600)},scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
 const R={renderer:r,composer:new EffectComposer(r,new THREE.WebGLRenderTarget(960,600,{type:THREE.HalfFloatType,samples:4})),renderPass:{name:'non-rendered fixture leading pass'},bloom:{name:'non-rendered fixture bloom'},grade:new ShaderPass(GradeShader),setExtraPass(p){this.extraPass=p;}};
 R.gtao=new GTAOPass(scene,camera,960,600);const g={R};g.screenfx=new ScreenFX(R,{});const output=new OutputPass();R.composer.passes=[R.renderPass,R.gtao,R.bloom,R.grade,R.extraPass,output];
 // Populate the native sampler binding that a normal render assigns. No render is simulated or claimed.
 R.grade.uniforms.tDiffuse.value=R.composer.renderTarget1.texture;g.screenfx.mat.uniforms.tDiffuse.value=R.composer.renderTarget2.texture;output.uniforms.tDiffuse.value=R.composer.renderTarget1.texture;
 // Native GPU setup ordinarily sizes the depth attachment; this CPU-only fixture binds matching size.
 R.gtao.depthTexture.image.width=960;R.gtao.depthTexture.image.height=600;
 return{g,THREE};
}
export const sourceFiles=[...cache.keys(),path.join(base,'vendor/three/build/three.core.js'),path.join(base,'src/core/renderer.js')];
