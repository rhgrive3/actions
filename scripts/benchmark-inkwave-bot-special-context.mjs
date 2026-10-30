import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fixture } from '../patches/splatoon3/tests/source-fixture.mjs';
const started=new Date().toISOString(), start=performance.now();
const frozen=JSON.parse(fs.readFileSync('patches/splatoon3/tests/fixtures/bot-special-context-before-84453765.json'));
const paths=['patches/splatoon3/runtime/bot-special-context.mjs','patches/splatoon3/runtime/canonical-kits.mjs'];
const strip=s=>s.replace(/^import .*;\n/gm,'').replace(/^export \{[^\n]*\n/gm,'').replace(/^export /gm,'');
const makeDriver=old=>Function('driveMeleeSpecial','driveRangedSpecial','driveSupportSpecial',paths.map(p=>strip(old?frozen.sources[p]:fs.readFileSync(p,'utf8'))).join('\n')+'\nreturn driveCanonicalBotSpecial;')(()=>false,()=>false,()=>false);
function allocationProbe(){
 const counts=old=>{
  const work={contexts:0,normalIntents:0,closures:0,los:0,nullReturns:0};
  const context=strip(old?frozen.sources[paths[0]]:fs.readFileSync(paths[0],'utf8'))
   .replace(/  (const ctx =|return) \{ actor, intent, dt,/g,'  work.contexts++; $1 { actor, intent, dt,')
   .replace(/normalIntent: (\{[^\n]+\}),/,'normalIntent: (work.normalIntents++, $1),')
   .replace(/  ctx\.(aimAt|isAimed|safePath|moveToward) = /g,'  work.closures++; ctx.$1 = ');
  const driver=Function('work','driveMeleeSpecial','driveRangedSpecial','driveSupportSpecial',context+'\n'+strip(old?frozen.sources[paths[1]]:fs.readFileSync(paths[1],'utf8'))+'\nreturn driveCanonicalBotSpecial;')(work,()=>false,()=>false,()=>false);
  const actor={alive:true,isBot:true,team:0,pos:{x:0,y:0,z:0},weapon:{special:'trizooka'},specialReady:()=>false};
  const enemy={alive:true,team:1,pos:{x:0,y:0,z:12},vel:{x:0,y:0,z:0}},intent={move:{x:0,y:0,z:1},fire:true};
  const options={brain:{target:enemy,seeTimer:1},world:{physics:{los(){work.los++;return true;}}}};
  for(let i=0;i<420;i++)if(driver(actor,intent,1/60,enemy,options,true)===null)work.nullReturns++;
  return work;
 };
 return {calls:420,before:counts(true),after:counts(false),verifiedAt:new Date().toISOString(),timed:false};
}
if(process.argv[2]==='--allocation-probe'){
 const output=process.argv[3]||'reports/performance-20261030/bot-special-context/benchmark.json';
 const result=JSON.parse(fs.readFileSync(output));result.allocationProbe=allocationProbe();
 fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.allocationProbe));process.exit(0);
}
const f=await fixture({productionComposition:true});
const level=new f.Level({bounds:{minX:-25,maxX:25,minZ:-15,maxZ:45},spawnPads:[[-20,0,-10],[20,0,40]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-25,-1,-15],max:[25,0,45]}]});
const physics=new f.Physics(level);
const V=f.THREE.Vector3,rows=[],iterations=50000,samples=9;
function setup(old,active){
 const actor={alive:true,isBot:true,team:0,pos:new V(),weapon:{special:'trizooka'},weaponId:'shooter',aimYaw:0,aimPitch:0,aimPoint:new V(0,1.1,6),specialActive:active?{id:'trizooka'}:null,specialReady:()=>false};
 const enemy={alive:true,team:1,pos:new V(0,0,12),vel:new V(),form:'kid'};
 const intent={move:new V(.2,0,.7),fire:true,sub:false,jump:false,squid:false};
 const brain={target:enemy,seeTimer:1,aimYaw:0,aimPitch:0},work={los:0};
 const world={physics:{los(...args){work.los++;return physics.los(...args);}}};
 const options={world,brain,move:intent.move,wantYaw:0,wantPitch:0,aimDistance:6},driver=makeDriver(old);
 return {run(fast){return driver(actor,intent,1/60,enemy,options,fast);},work,intent};
}
function median(a){a=[...a].sort((a,b)=>a-b);return a[(a.length-1)>>1];}
for(const [scenario,active,fast] of [['internal-unready',false,true],['internal-active',true,true],['public-unready',false,false]]){
 const a=setup(true,active),b=setup(false,active);
 for(let i=0;i<20000;i++){a.run(fast);b.run(fast);}
 a.work.los=b.work.los=0;
 const times=[[],[]];
 for(let sample=0;sample<samples;sample++)for(const index of sample%2?[1,0]:[0,1]){
  const r=[a,b][index],t=performance.now();for(let i=0;i<iterations;i++)r.run(fast);times[index].push(performance.now()-t);
 }
 const control=r=>{const c=r.run(fast);return [!!c?.handled,...(c?.handled?[c.wantYaw,c.wantPitch,c.aimDistance]:[]),r.intent.fire,r.intent.sub,r.intent.special,r.intent.move.x,r.intent.move.z];};
 assert.deepEqual(control(a),control(b));
 const oldMs=median(times[0]),newMs=median(times[1]);
 rows.push({scenario,iterations,samples,beforeMs:times[0],afterMs:times[1],beforeMedianMs:oldMs,afterMedianMs:newMs,changePercent:(newMs/oldMs-1)*100,losBefore:a.work.los,losAfter:b.work.los});
}
const result={started,finished:new Date().toISOString(),elapsedSeconds:(performance.now()-start)/1000,node:process.version,baseline:frozen.sourceCommit,iterations,samples,scope:'Target microbenchmark, real Level/Physics.los, one stationary recognized target, fixed 1/60 ticks. Not whole-game FPS.',sourceHashes:Object.fromEntries(paths.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),rows,allocationProbe:allocationProbe()};
fs.writeFileSync(process.argv[2] || 'reports/performance-20261030/bot-special-context/benchmark.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
