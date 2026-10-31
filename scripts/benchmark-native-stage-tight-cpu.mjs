#!/usr/bin/env node
// Isolated culling CPU and triangle counts for pinned, verified native data.
// This intentionally excludes WebGL / shader / GPU rendering and device FPS.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import * as work from '../patches/native-stages/runtime/native-work.mjs';
const dir=path.resolve(process.argv[2]||'native-prebuilt/scorch'),out=path.resolve(process.argv[3]||'.ci-scratch/stage-tight-cpu.json');
const record=JSON.parse(fs.readFileSync(path.join(dir,'stage.json')));
function read(name,C){const desc=record.arrays[name],raw=Buffer.concat(desc.chunks.map(c=>fs.readFileSync(path.join(dir,c.file))));if(raw.length!==desc.length*C.BYTES_PER_ELEMENT)throw Error('invalid length '+name);const a=new C(desc.length);new Uint8Array(a.buffer).set(raw);return a;}
const vertices=read('vertices',Float32Array),indices=read('indices',Uint32Array);
const oldSource=execFileSync('git',['show','2f3acacdb5296605cdc675e4feb564dc1a491d51:patches/native-stages/runtime/native-render.mjs'],{encoding:'utf8'});
const newSource=fs.readFileSync(process.env.INKWAVE_NATIVE_DISPLAY_EXPERIMENT||new URL('../patches/native-stages/runtime/native-render.mjs',import.meta.url),'utf8');
async function load(source){const context=vm.createContext({console});const make=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context});
 const deps={three:make(THREE),'./native-work.mjs':make(work),'../../../src/world/levelMaterial.js':make({createLevelMaterial(){throw Error('unused');}}),'./native-paint-detail.mjs':make({enableNativePaintDetail(){throw Error('unused');}})};
 const m=new vm.SourceTextModule(source+(source.includes('function nativeSkipIdentity(')?'\nexport {nativeSkipIdentity};':''),{context});await m.link(n=>deps[n]);await m.evaluate();return {install:m.namespace.installNativeDisplayCulling,skip:m.namespace.nativeSkipIdentity};}
const [oldModule,newModule]=await Promise.all([load(oldSource),load(newSource)]);const oldInstall=oldModule.install,newInstall=newModule.install;
function create(install,tight){const out=[];for(const o of record.manifest.objects){
 const mat=record.manifest.materials[o.material]||{};if(!o.active||o.glass||/_Water$/.test(o.material)||mat.hasAlpha||mat.maps?.opacity||o.ic<1536)continue;
 const vb=new Float32Array(vertices.buffer,vertices.byteOffset+o.vo*32,o.vc*8),ib=new Uint32Array(indices.buffer,indices.byteOffset+o.io*4,o.ic),inter=new THREE.InterleavedBuffer(vb,8),g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.InterleavedBufferAttribute(inter,3,0));let max=0;for(const v of ib)if(v>max)max=v;g.setIndex(new THREE.BufferAttribute(max<65535?new Uint16Array(ib):ib,1));
 if(o.boundingSphere)g.boundingSphere=new THREE.Sphere(new THREE.Vector3(...o.boundingSphere.center),o.boundingSphere.radius);else g.computeBoundingSphere();
 const mesh=new THREE.Mesh(g),culler=install(mesh,16,512,tight);if(culler)out.push({mesh,g,culler});
 }return out;}
const a=create(oldInstall,false),b=create(newInstall,true);if(a.length!==b.length||!a.length)throw Error('geometry mismatch');
const cameras=[];for(let i=0;i<120;i++){const t=i/119,c=new THREE.PerspectiveCamera(65,1.5,.1,500);c.position.set(Math.sin(t*4)*8,16,-70+t*140);const yaw=Math.sin(t*8)*.7;c.lookAt(c.position.x+Math.sin(yaw)*20,14,c.position.z+Math.cos(yaw)*20);c.updateMatrixWorld();cameras.push(c);}
function run(items){let triangles=0,meshes=0;const view=new THREE.Matrix4(),frustum=new THREE.Frustum();
 for(const camera of cameras){frustum.setFromProjectionMatrix(view.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  for(const v of items){if(!frustum.intersectsSphere(v.g.boundingSphere))continue;v.culler.select(camera);triangles+=Math.min(v.g.index.count,v.g.drawRange.count)/3;meshes++;}}
 return{triangles,meshes};}
let checkedIndices=0,eligible=0,checkedViews=0;
if(process.env.INKWAVE_NATIVE_IDENTITY_EXACT==='1'){
 const mat=new THREE.Matrix4();for(const camera of cameras){mat.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);const f=new THREE.Frustum().setFromProjectionMatrix(mat);
  for(let i=0;i<a.length;i++){if(!f.intersectsSphere(a[i].g.boundingSphere))continue;
   const aa=a[i],bb=b[i];if(newModule.skip?.(mat,bb.mesh.matrixWorld))eligible++;checkedViews++;aa.culler.select(camera);bb.culler.select(camera);
   if(aa.g.drawRange.count!==bb.g.drawRange.count||aa.g.index.version!==bb.g.index.version||JSON.stringify(aa.g.index.updateRanges)!==JSON.stringify(bb.g.index.updateRanges))throw Error('different index range or version');
   const n=Math.min(aa.g.index.count,aa.g.drawRange.count);for(let j=0;j<n;j++)if(aa.g.index.array[j]!==bb.g.index.array[j])throw Error('different triangle index');checkedIndices+=n;
  }
 }
 if(!eligible)throw Error('identity shortcut never used');
}
const baseline=run(a),candidate=run(b);if(!Number.isFinite(baseline.triangles)||!Number.isFinite(candidate.triangles)||candidate.triangles>baseline.triangles||candidate.meshes!==baseline.meshes||(process.env.INKWAVE_NATIVE_IDENTITY_EXACT==='1'&&candidate.triangles!==baseline.triangles))throw Error('selection mismatch');
// ABBA/BAAB; repeated independent windows, fixed camera sequence and views.
const samples=[];for(let cycle=0;cycle<8;cycle++){const order=cycle%2?['trial','base','base','trial']:['base','trial','trial','base'];for(const side of order){const t=performance.now(),result=run(side==='base'?a:b);samples.push({cycle,side,ms:performance.now()-t,...result});}}
const result={sourceSha256:record.sourceSha256,converter:record.converter.sha256,scope:'CPU-only source display selection; 120 moving views per window; no rendering, lighting, GPU uploads, full-match time or device FPS',objects:a.length,frames:cameras.length,checkedViews,eligible,checkedIndices,baseline,candidate,samples};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({objects:a.length,baseline,candidate,samples}));
for(const list of [a,b])for(const x of list){x.culler.dispose();x.g.dispose();x.mesh.material.dispose();}
