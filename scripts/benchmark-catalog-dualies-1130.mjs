// CPU-only production Actor + actual Physics probe; no browser/GPU claim.
// Run unchanged against both worktrees, with the same Node build and hardware.
import {performance} from 'node:perf_hooks';
import {fixture} from '../patches/splatoon3/tests/source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}],half:[],spawnPads:[[-80,0,0],[80,0,0]],spawnBarrier:0});
f.G.physics=new f.Physics(f.G.level);
const ids=['s3-maneuver-short','s3-maneuver-gallon','s3-maneuver-dual','s3-maneuver-stepper','s3-maneuver-long'];
const actors=ids.map(id=>{const a=f.make(id);a._integrate=f.Actor.prototype._integrate;return a;});
const direction=new f.THREE.Vector3(1,0,0),cycles=Number(process.env.INKWAVE_DUALIES_BENCH_CYCLES||10),frames=96,DT=1/60;
const samples=[],cpuSamples=[],endpoints={};
for(let sample=-1;sample<7;sample++){
  globalThis.gc?.();const start=performance.now(),startCpu=process.cpuUsage();
  for(let cycle=0;cycle<cycles;cycle++){
    for(const a of actors){a.pos.set(0,0,0);a.vel.set(0,0,0);a.form='kid';a.grounded=true;a.ink=100;a.intent.move.set(0,0,0);a.weaponRunner.reset();a.intent.fire=true;
      if(!a.weaponRunner.tryDodge(direction))throw Error('Denied benchmark roll '+a.weaponId);a.intent.fire=false;}
    for(let frame=0;frame<frames;frame++){f.G.time+=DT;for(const a of actors)a.update(DT);}
  }
  const ms=performance.now()-start,cpu=process.cpuUsage(startCpu);if(sample>=0){samples.push(ms);cpuSamples.push((cpu.user+cpu.system)/1000);}
  if(sample===0)for(const a of actors)endpoints[a.weaponId]=a.pos.x;
}
samples.sort((a,b)=>a-b);cpuSamples.sort((a,b)=>a-b);
console.log(JSON.stringify({node:process.version,cycles,frames,actors:actors.length,updates:cycles*frames*actors.length,samplesMs:samples,cpuSamplesMs:cpuSamples,medianMs:samples[3],cpuMedianMs:cpuSamples[3],microsecondsCpuPerActorTick:cpuSamples[3]*1000/(cycles*frames*actors.length),endpoints,heapUsed:process.memoryUsage().heapUsed},null,2));
