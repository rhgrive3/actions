import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { setup, geometry, unmodule } from '../../patches/native-stages/tests/fixtures/bvh-query-fixture.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const f=await setup(), V=f.V;
const original=fs.readFileSync(root+'/patches/native-stages/runtime/native-physics.mjs','utf8');
const replacement=original.replace('hl=Math.hypot(dir.x,dir.z)','hl=horizontal?Math.hypot(dir.x,dir.z):0');
assert.notEqual(original,replacement);
const load=code=>new Function('THREE','Physics','Hit','GroundHit','WALKABLE','PLAYER',unmodule(code)+'\nreturn NativePhysics;')(f.THREE,f.Physics,f.Hit,f.GroundHit,.68,f.PLAYER);
const classes=[load(original),load(replacement)];
const variants=classes.map(C=>{const level=new f.NativeLevel(geometry());return new C(level)});
const contact=()=>({ground:false,wall:false,ceiling:false,groundNormal:V(),wallNormal:V()});
let seed=173;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const inputs=Array.from({length:1000},(_,i)=>[(random()-.5)*7,random()*4,(random()-.5)*7,i%2===0,i%3===0]);
const flat=(p,c)=>JSON.stringify({p:p.toArray(),...c,groundNormal:c.groundNormal.toArray(),wallNormal:c.wallNormal.toArray()});
for (const input of inputs) { const [x,y,z,h,s]=input,pair=variants.map(p=>{const pos=V(x,y,z),c=contact();p.collideBody(pos,.35,.35,1.45,c,h,s);return flat(pos,c)}); assert.equal(pair[0],pair[1]); }
function median(a){return a.toSorted((x,y)=>x-y)[a.length>>1]}
function measure(step,n){const times=[[],[]],cpu=[[],[]];for(let k=0;k<2;k++)for(let i=0;i<n;i++)step(k,i);for(let w=0;w<12;w++){const k=[0,1,1,0][w%4],start=performance.now(),c=process.cpuUsage();for(let i=0;i<n;i++)step(k,i);const used=process.cpuUsage(c);times[k].push(performance.now()-start);cpu[k].push((used.user+used.system)/1000)}return {n,wallMs:times,cpuMs:cpu,medianWallMs:times.map(median),medianCpuMs:cpu.map(median),wallReduction:1-median(times[1])/median(times[0]),cpuReduction:1-median(cpu[1])/median(cpu[0])}}
const p=V(),c=contact();
const physics=measure((k,i)=>{const [x,y,z,,s]=inputs[i%inputs.length];p.set(x,y,z);variants[k].collideBody(p,.35,.35,1.45,c,false,s)},30000);
const navSource=fs.readFileSync(root+'/patches/native-stages/runtime/native-nav.mjs','utf8');
const navFast=navSource.replace(' const jumpAttachments=', ' const cardinalFlat=Math.hypot(1,0)*st,diagonalFlat=Math.hypot(1,1)*st;\n const jumpAttachments=').replace('cost=Math.hypot(dx,dz)*st','cost=dx&&dz?diagonalFlat:cardinalFlat');
assert.notEqual(navSource,navFast);
const loadNav=code=>new Function('THREE','PLAYER','nativeClimbTransition','nativeDropTransition','nativeSurgeTransition','nativeJumpAttachTransition','nativeWallApproachTransition','nativeApproachJumpTransition',unmodule(code)+'\nreturn buildNativeNav;')(f.THREE,{radius:.3,height:1.8,stepUp:.4,fallDeathY:-20},...Array(6).fill(()=>null));
const navs=[loadNav(navSource),loadNav(navFast)];
function graph(){const level={bounds:{minX:0,maxX:30,minZ:0,maxZ:30},spawnPads:[V(.5,0,.5),V(29.5,0,29.5)],spawnBarrier:.1,data:{triangleFace:[0]},manifest:{sourceNavigation:{}},triangleWorld:{nodes:[0,-1,0,0,1],ray(p,d,max,o,out={point:V(),normal:V()}){if(p.y<0||p.y>max)return null;out.point.set(p.x,0,p.z);out.normal.set(0,1,0);out.flags=2;out.triangle=0;return out}}};return {level,physics:{bodyFits:()=>true,los:()=>true},step:1,nodes:[],_has(ix,iz,y){return ix>=0&&iz>=0&&ix<this.nx&&iz<this.nz}}}
const gs=navs.map(n=>{const g=graph();n(g);return g});assert.equal(JSON.stringify(gs[0].nodes),JSON.stringify(gs[1].nodes));assert.deepEqual(gs[0].validIds,gs[1].validIds);
const nav=measure((k)=>navs[k](graph()),300);
const result={head:'3715e29d1656a00b853f73e12a89624b17985b7c',node:process.version,cpu:os.cpus()[0].model,scope:'CPU-only native fixtures; no game FPS, real stage or Nintendo comparison',physics,nav};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
