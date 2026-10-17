// Contact-filter component only. Run without concurrent tests/browser/builds;
// this does not measure rendering, whole-game frame time or device FPS.
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import zlib from 'node:zlib';
import {pathToFileURL} from 'node:url';
import * as THREE from '../inkwave-public/vendor/three/build/three.module.js';
import {adaptMotionFkHotpath as adaptSourceContact} from '../patches/local-quality/motion-fk-hotpath-adapter.mjs';
import {replaceOnce} from '../patches/local-quality/adapter.mjs';
const rel='src/game/motion/contact-transition.js',raw=fs.readFileSync(new URL('../inkwave-public/'+rel,import.meta.url),'utf8');
const sources=[raw,adaptSourceContact(rel,raw,replaceOnce)],Classes=[];
for(const source of sources){
 const context=vm.createContext({}),three=new vm.SyntheticModule(['Vector3'],function(){this.setExport('Vector3',THREE.Vector3);},{context});
 const bank=new vm.SyntheticModule(['clamp'],function(){this.setExport('clamp',(v,a,b)=>Math.max(a,Math.min(b,v)));},{context});
 const module=new vm.SourceTextModule(source,{context});await module.link(s=>s==='three'?three:bank);await module.evaluate();Classes.push(module.namespace.ContactTransition);
}
const goal=new THREE.Vector3(.1,.085,.2),velocity=new THREE.Vector3(.1,0,.2),filters=Classes.map(C=>new C()),frames=[0,0],wall=[[],[]],cpu=[[],[]];
const tick=k=>{const f=filters[k],n=frames[k]++;if(n%120===0)f.transition(goal,velocity,.13);f.advance(goal,velocity,1/60);};
for(let k=0;k<2;k++){filters[k].advance(goal,velocity,0);for(let n=0;n<20000;n++)tick(k);}
const iterations=500000,order=[0,1,1,0,0,1,1,0];
for(const k of order){const usage=process.cpuUsage(),start=performance.now();for(let n=0;n<iterations;n++)tick(k);wall[k].push(performance.now()-start);const used=process.cpuUsage(usage);cpu[k].push((used.user+used.system)/1000);}
const median=v=>{v=[...v].sort((a,b)=>a-b);return(v[1]+v[2])/2;};
const esbuild=await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild');
const minified=await Promise.all(sources.map(s=>esbuild.transform(s,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline'})));
const sizes=minified.map(({code},i)=>({sourceBytes:Buffer.byteLength(sources[i]),minifiedBytes:Buffer.byteLength(code),gzipBytes:zlib.gzipSync(code,{level:9}).length}));
const result={scope:'actual Three.Vector3 + ContactTransition only; 500000 advances/window, periodic .13s transitions, ABBA x2; not renderer/whole-game/device FPS',node:process.version,cpu:os.cpus()[0].model,iterations,order,wallMs:wall,cpuMs:cpu,medianWallMs:wall.map(median),medianCpuMs:cpu.map(median),sizes};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
