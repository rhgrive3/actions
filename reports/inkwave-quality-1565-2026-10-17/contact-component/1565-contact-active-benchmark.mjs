// Scratch-only extension of scripts/benchmark-inkwave-contact-transition.mjs.
// Do not run alongside a game/browser/build/test measurement. Scheduler/input
// copies are included in timing; this is not a Character or whole-game probe.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const option=(name,fallback)=>{const i=process.argv.indexOf(name);if(i>=0&&process.argv[i+1])return process.argv[i+1];if(fallback!==undefined)return fallback;throw Error('Required '+name);};
const root=fs.realpathSync(option('--source-root')),expectedHead=option('--expected-head'),output=path.resolve(option('--out'));
const frames=960,stride=14,requestedIterations=Number(option('--iterations','500000')),requestedWarmup=Number(option('--warmup','20000'));
assert.ok(Number.isSafeInteger(requestedIterations)&&requestedIterations>0);assert.ok(Number.isSafeInteger(requestedWarmup)&&requestedWarmup>=frames);
const iterations=Math.ceil(requestedIterations/frames)*frames,warmup=Math.ceil(requestedWarmup/frames)*frames;
const order=[0,1,1,0,1,0,0,1]; // ABBA then BAAB: four windows per version.
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const git=(...args)=>execFileSync('git',['-C',root,...args],{maxBuffer:64*1024*1024});
const sourceFiles=['inkwave-public/src/game/motion/contact-transition.js','inkwave-public/src/game/motion/source-bank.js','inkwave-public/vendor/three/build/three.module.js','patches/local-quality/motion-fk-hotpath-adapter.mjs','patches/local-quality/adapter.mjs','patches/local-quality/tests/source-contact-fixture.mjs','scripts/inkwave-source-composition.mjs','scripts/benchmark-inkwave-contact-transition.mjs'];
function bindSource(){
 const head=String(git('rev-parse','HEAD')).trim();assert.equal(head,expectedHead,'pinned source HEAD');
 // Actual composition imports only committed source, not another worktree's edits.
 git('diff','--quiet','HEAD','--','inkwave-public/src','patches','scripts');
 return Object.fromEntries(sourceFiles.map(file=>{const bytes=fs.readFileSync(path.join(root,file)),committed=git('cat-file','blob',head+':'+file);assert.equal(hash(bytes),hash(committed),'committed input '+file);return[file,{sha256:hash(bytes),bytes:bytes.length}];}));
}
const sourceBinding=bindSource();
const THREE=await import(pathToFileURL(path.join(root,'inkwave-public/vendor/three/build/three.module.js')).href);
const {baselineSourceContact}=await import(pathToFileURL(path.join(root,'patches/local-quality/tests/source-contact-fixture.mjs')).href);
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')).href);
const rel='src/game/motion/contact-transition.js',raw=fs.readFileSync(path.join(root,'inkwave-public',rel),'utf8');
const bankRaw=fs.readFileSync(path.join(root,'inkwave-public/src/game/motion/source-bank.js'),'utf8');
assert.ok(bankRaw.includes('export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));'),'review changed clamp before benchmarking');
const sources=[baselineSourceContact(rel,raw),adaptBuildSource(rel,raw)];assert.notEqual(sources[0],sources[1]);
const timingClassSHA256=sources.map(hash),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

async function loadClass(source,counters=null){
 const context=vm.createContext(counters?{counters}:{});
 const three=new vm.SyntheticModule(['Vector3'],function(){this.setExport('Vector3',THREE.Vector3);},{context});
 const clampFn=counters?(x,a,b)=>{counters.clamp++;const u=clamp(x,a,b);if(u===1)counters.saturated++;return u;}:clamp;
 const bank=new vm.SyntheticModule(['clamp'],function(){this.setExport('clamp',clampFn);},{context});
 if(counters){assert.equal(source.split('u2=u*u').length,2,'single polynomial instrumentation anchor');source=source.replace('u2=u*u','u2=(counters.polynomial++,u*u)');}
 const module=new vm.SourceTextModule(source,{context});await module.link(s=>s==='three'?three:bank);await module.evaluate();
 const C=module.namespace.ContactTransition;
 if(counters){
  const advance=C.prototype.advance,transition=C.prototype.transition,reset=C.prototype.reset;
  C.prototype.advance=function(goal,velocity,dt){counters.advance++;return advance.call(this,goal,velocity,dt);};
  C.prototype.transition=function(goal,velocity,seconds){counters.transitions++;const result=transition.call(this,goal,velocity,seconds);if(this.offset.lengthSq()>0||this.offsetVelocity.lengthSq()>0)counters.nonzeroTransitions++;return result;};
  C.prototype.reset=function(){counters.resets++;return reset.call(this);};
 }
 return C;
}
const timingClasses=await Promise.all(sources.map(s=>loadClass(s)));
const counters=[0,1].map(()=>({advance:0,clamp:0,saturated:0,polynomial:0,transitions:0,nonzeroTransitions:0,resets:0}));
const countedClasses=await Promise.all(sources.map((s,k)=>loadClass(s,counters[k])));
const RESET=1,BEFORE=2,AFTER=4;
const dtPattern=[1/60,1/30,1/120,0,1/144,1/60,1/60,.1,1/120,1/60];
function program(name){
 const values=new Float64Array(frames*stride),flags=new Uint8Array(frames);
 let totalTime=0;for(let n=0;n<frames;n++)totalTime+=name==='irregular_contact'?dtPattern[n%dtPattern.length]:1/60;
 const omega=2*Math.PI*8/totalTime;let time=0,stance=false,ax=0,ay=.085,az=0;
 for(let n=0;n<frames;n++){
  const o=n*stride,dt=name==='irregular_contact'?dtPattern[n%dtPattern.length]:1/60;
  // Retain the original benchmark's constant goal/velocity as a control. Its
  // transitions have zero offsets; the two other modes require real changes.
  const x=name==='mostly_settled'?.1:.1+.08*Math.sin(omega*time),y=name==='mostly_settled'?.085:.085+.015*(1-Math.cos(omega*time)),z=name==='mostly_settled'?.2:.2+.06*Math.sin(omega*time+.4);
  const vx=name==='mostly_settled'?.1:.08*omega*Math.cos(omega*time),vy=name==='mostly_settled'?0:.015*omega*Math.sin(omega*time),vz=name==='mostly_settled'?.2:.06*omega*Math.cos(omega*time+.4);
  values[o]=dt;values[o+7]=.13;
  values[o+1]=stance?ax:x;values[o+2]=stance?ay:y;values[o+3]=stance?az:z;
  values[o+4]=stance?0:vx;values[o+5]=stance?0:vy;values[o+6]=stance?0:vz;
  values[o+8]=values[o+1];values[o+9]=values[o+2];values[o+10]=values[o+3];
  values[o+11]=values[o+4];values[o+12]=values[o+5];values[o+13]=values[o+6];
  if(name==='mostly_settled'){if(n%120===0)flags[n]|=BEFORE;}
  else if(name==='always_active'){if(n%4===0)flags[n]|=BEFORE;}
  else{
   const phase=n%96;
   if(phase===0){ // Native-style advance first, then capture a fixed support.
    flags[n]|=AFTER;ax=x;ay=.085;az=z;stance=true;
    values[o+8]=ax;values[o+9]=ay;values[o+10]=az;values[o+11]=values[o+12]=values[o+13]=0;
   }else if(phase===32){ // Release to a moving source goal with a real offset.
    flags[n]|=AFTER;stance=false;values[o+7]=.27;
    values[o+8]=x;values[o+9]=y;values[o+10]=z;values[o+11]=vx;values[o+12]=vy;values[o+13]=vz;
   }else if(phase===70){flags[n]|=RESET;}
  }
  time+=dt;
 }
 return{name,values,flags,frames,stride,inputSHA256:hash(Buffer.concat([Buffer.from(values.buffer),Buffer.from(flags.buffer)]))};
}
const programs=['mostly_settled','always_active','irregular_contact'].map(program);
function makeState(C,p){
 const s={filter:new C(),goal:new THREE.Vector3(),velocity:new THREE.Vector3(),destination:new THREE.Vector3(),destinationVelocity:new THREE.Vector3(),cursor:0};
 s.goal.set(p.values[1],p.values[2],p.values[3]);s.velocity.set(p.values[4],p.values[5],p.values[6]);s.filter.advance(s.goal,s.velocity,0);
 const owned=[s.filter.position,s.filter.velocity,s.filter.offset,s.filter.offsetVelocity,s.goal,s.velocity,s.destination,s.destinationVelocity];assert.equal(new Set(owned).size,8,'independent owned vectors');s.owned=owned;return s;
}
// Fixed buffers and preallocated vectors only. No new objects, arrays, closures,
// formatted strings, snapshots, hashing, logging or counters in this timed path.
function tick(p,s){
 const n=s.cursor,o=n*stride,v=p.values,flags=p.flags[n],f=s.filter;
 s.goal.set(v[o+1],v[o+2],v[o+3]);s.velocity.set(v[o+4],v[o+5],v[o+6]);
 if(flags&RESET)f.reset();
 if(flags&BEFORE)f.transition(s.goal,s.velocity,v[o+7]);
 f.advance(s.goal,s.velocity,v[o]);
 if(flags&AFTER){s.destination.set(v[o+8],v[o+9],v[o+10]);s.destinationVelocity.set(v[o+11],v[o+12],v[o+13]);f.transition(s.destination,s.destinationVelocity,v[o+7]);}
 s.cursor=n+1===frames?0:n+1;
}
function snapshot(s){const f=s.filter;return[...f.position.toArray(),...f.velocity.toArray(),...f.offset.toArray(),...f.offsetVelocity.toArray(),f.age,f.duration,Number(f.ready),...s.goal.toArray(),...s.velocity.toArray(),...s.destination.toArray(),...s.destinationVelocity.toArray(),s.cursor];}
const binarySignature=s=>hash(Buffer.from(Float64Array.from(snapshot(s)).buffer));
function verifyOwnership(s){const now=[s.filter.position,s.filter.velocity,s.filter.offset,s.filter.offsetVelocity,s.goal,s.velocity,s.destination,s.destinationVelocity];for(let i=0;i<now.length;i++)assert.equal(now[i],s.owned[i],'owned vector identity');}
function assertExact(a,b,label){assert.deepStrictEqual(snapshot(b),snapshot(a),label);assert.deepStrictEqual(Object.keys(b.filter),Object.keys(a.filter),label+' filter fields');for(const v of snapshot(a))assert.ok(Number.isFinite(v),label+' finite normal state');verifyOwnership(a);verifyOwnership(b);}
function assertInputs(s,p,lastAfter){
 const o=((s.cursor+p.frames-1)%p.frames)*stride;
 assert.deepStrictEqual(s.goal.toArray(),[p.values[o+1],p.values[o+2],p.values[o+3]],'goal input unchanged');
 assert.deepStrictEqual(s.velocity.toArray(),[p.values[o+4],p.values[o+5],p.values[o+6]],'velocity input unchanged');
 const d=lastAfter*stride;
 assert.deepStrictEqual(s.destination.toArray(),lastAfter<0?[0,0,0]:[p.values[d+8],p.values[d+9],p.values[d+10]],'destination input unchanged');
 assert.deepStrictEqual(s.destinationVelocity.toArray(),lastAfter<0?[0,0,0]:[p.values[d+11],p.values[d+12],p.values[d+13]],'destination velocity input unchanged');
}
const checks=[];
for(const p of programs){
 const states=countedClasses.map(C=>makeState(C,p));for(const c of counters)for(const key of Object.keys(c))c[key]=0;
 const steps=p.frames*2;let lastAfter=-1;for(let n=0;n<steps;n++){const frame=n%p.frames;if(p.flags[frame]&AFTER)lastAfter=frame;tick(p,states[0]);tick(p,states[1]);assertExact(states[0],states[1],p.name+' step '+n);assertInputs(states[0],p,lastAfter);assertInputs(states[1],p,lastAfter);}
 assert.equal(counters[0].clamp,counters[1].clamp);assert.equal(counters[0].saturated,counters[1].saturated);
 assert.equal(counters[0].polynomial-counters[1].polynomial,counters[1].saturated,'skipped only saturated polynomials');
 if(p.name!=='mostly_settled')assert.ok(counters[0].nonzeroTransitions>0,'actual destination/velocity changes');
 if(p.name==='always_active')assert.equal(counters[0].saturated,0,'always-active denominator');
 if(p.name==='mostly_settled')assert.ok(counters[0].saturated/counters[0].clamp>.8,'mostly-settled denominator');
 if(p.name==='irregular_contact')assert.ok(counters[0].resets>0&&counters[0].saturated>0&&counters[0].polynomial>counters[0].saturated,'resets plus active and settled');
 checks.push({mode:p.name,steps,inputSHA256:p.inputSHA256,counts:counters.map(c=>({...c})),exact:true,finalFloat64SHA256:states.map(binarySignature)});
}
const median=v=>{const a=[...v].sort((a,b)=>a-b);return(a[1]+a[2])/2;};
const results=[];
for(const p of programs){
 const states=timingClasses.map(C=>makeState(C,p));
 for(let n=0;n<warmup;n++){tick(p,states[0]);tick(p,states[1]);}assertExact(states[0],states[1],p.name+' warmed');
 const windows=[];
 for(let window=0;window<order.length;window++){
  const version=order[window],state=states[version];if(typeof globalThis.gc==='function')globalThis.gc();
  const usage=process.cpuUsage(),start=performance.now();
  for(let n=0;n<iterations;n++)tick(p,state);
  const wallMs=performance.now()-start,used=process.cpuUsage(usage);
  windows.push({window,block:window<4?'ABBA':'BAAB',version,wallMs,cpuMs:(used.user+used.system)/1000,userMs:used.user/1000,systemMs:used.system/1000});
 }
 assertExact(states[0],states[1],p.name+' timed final');
 assert.equal(hash(Buffer.concat([Buffer.from(p.values.buffer),Buffer.from(p.flags.buffer)])),p.inputSHA256,'read-only input buffers');
 const wall=[0,1].map(k=>windows.filter(w=>w.version===k).map(w=>w.wallMs)),cpu=[0,1].map(k=>windows.filter(w=>w.version===k).map(w=>w.cpuMs));
 const medianWallMs=wall.map(median),medianCpuMs=cpu.map(median);
 results.push({mode:p.name,warmup,iterations,windows,medianWallMs,medianCpuMs,wallChangePercent:(medianWallMs[1]/medianWallMs[0]-1)*100,cpuChangePercent:(medianCpuMs[1]/medianCpuMs[0]-1)*100,candidateSlowerWallMedian:medianWallMs[1]>medianWallMs[0],candidateSlowerCpuMedian:medianCpuMs[1]>medianCpuMs[0],exactTimedFinal:true,finalFloat64SHA256:states.map(binarySignature)});
}
assert.deepStrictEqual(bindSource(),sourceBinding,'source still pinned after measurement');
const report={scope:'scratch-only actual ContactTransition/Three component replay; scheduler and fixed-vector input copies included; no browser/Character/whole-game/FPS claim',scriptSHA256:hash(fs.readFileSync(fileURLToPath(import.meta.url))),sourceRoot:root,sourceHead:expectedHead,sourceBinding,timingClassSHA256,node:process.version,threeRevision:THREE.REVISION,cpu:os.cpus()[0].model,endianness:os.endianness(),forcedGcBetweenWindows:typeof globalThis.gc==='function',frames,order,requestedIterations,iterations,requestedWarmup,warmup,checks,results,interpretation:'Positive change percent is slower. Four windows per version are diagnostic, not statistical proof. Always-active has no skipped coefficients and can regress despite a mostly-settled gain; do not combine modes into a whole-game claim.'};
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,sourceHead:expectedHead,checks:checks.map(c=>({mode:c.mode,counts:c.counts,exact:c.exact})),results:results.map(({mode,medianWallMs,medianCpuMs,wallChangePercent,cpuChangePercent})=>({mode,medianWallMs,medianCpuMs,wallChangePercent,cpuChangePercent}))}));
