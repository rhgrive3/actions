// No source edits: compare the public parent text with the current composed runtime.
import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='7e4c2e00b421b3a09872a83b9f729f56bfc95885';
const old=execFileSync('git',['show',base+':patches/splatoon3/runtime/catalogue.mjs'],{cwd:fileURLToPath(new URL('../../',import.meta.url)),encoding:'utf8'});
const boot=before=>fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
 adaptRuntime:(rel,source)=>before&&rel==='patches/splatoon3/runtime/catalogue.mjs'?old:source});
const before=await boot(true),after=await boot(false);
function setup(f){const P=f.G.projectiles;P.clear();f.G.actors.length=0;f.G.time=0;
 P.kitBarrierCandidate=()=>null;f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const owner=f.make('shooter');return {f,P,owner,p:{owner,team:0,damage:10,type:'shot',ghost:false,prev:new f.THREE.Vector3(),pos:new f.THREE.Vector3(0,0,1),size:.1}};}
function countClones(f,run){const proto=f.THREE.Vector3.prototype,clone=proto.clone;let count=0;proto.clone=function(){count++;return clone.call(this);};try{run();}finally{proto.clone=clone;}return count;}
const a=setup(before),b=setup(after);
const cloneCounts={};for(const [name,x]of [['before',a],['after',b]])cloneCounts[name]=countClones(x.f,()=>{for(let i=0;i<1000;i++)assert.equal(x.P.kitDefenseCandidate(x.p),null);});
const repetitions=500000,times={before:[],after:[]};
function run(x){let hits=0;for(let i=0;i<repetitions;i++)if(x.P.kitDefenseCandidate(x.p)!==null)hits++;assert.equal(hits,0);}
run(a);run(b);
for(let round=0;round<9;round++)for(const name of round%2?['after','before']:['before','after']){const start=performance.now();run(name==='before'?a:b);times[name].push(performance.now()-start);}
function simulation(f){const {P,owner}=setup(f);let seed=12345,rngCalls=0;f.setRandom(()=>{rngCalls++;seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;});
 owner.aimDir.set(0,0,1);owner.aimPoint.set(0,1,200);
 const paint=[],frames=[];f.G.paint.splat=(at,r,team,opts={})=>{paint.push({at:at.toArray(),r,team,seed:opts.seed,kind:opts.kind,face:opts.face});return 0;};
 const native=P.kitDefenseCandidate;let queries=0;
 P.kitDefenseCandidate=function(...args){queries++;return native.apply(this,args);};
 let clones;
 try{clones=countClones(f,()=>{for(let i=0;i<120;i++){f.G.time+=1/60;owner.weaponRunner.update(1/60,{fire:true,firePressed:i===0});P.update(1/60);frames.push(P.list.map(p=>({wid:p.wid,type:p.type,pos:p.pos.toArray(),vel:p.vel.toArray(),age:p.age,life:p.life,seed:p.seed})));}});}finally{P.kitDefenseCandidate=native;f.restoreRandom();}
 // Normalize cross-VM Array prototypes; retain every numeric value/ordering.
 return {queries,clones,rngCalls,frames:JSON.stringify(frames),paint:JSON.stringify(paint)};
}
const oldSimulation=simulation(before),newSimulation=simulation(after);
for(const field of ['queries','rngCalls','frames','paint'])assert.equal(newSimulation[field],oldSimulation[field],field+' parity');
assert.equal(oldSimulation.clones-newSimulation.clones,oldSimulation.queries);
const median=xs=>xs.slice().sort((a,b)=>a-b)[xs.length>>1];
const hash=x=>createHash('sha256').update(x).digest('hex');
console.log(JSON.stringify({base,node:process.version,parentCatalogueSha256:hash(old),repetitions,times,medianBefore:median(times.before),medianAfter:median(times.after),cloneCounts,
 simulation:{frames:120,queries:oldSimulation.queries,clonesBefore:oldSimulation.clones,clonesAfter:newSimulation.clones,rngCalls:oldSimulation.rngCalls,frameSnapshotSha256:hash(oldSimulation.frames),paintSnapshotSha256:hash(oldSimulation.paint),exactParity:true}},null,2));
