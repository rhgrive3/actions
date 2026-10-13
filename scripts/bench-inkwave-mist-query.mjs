import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
const root=process.argv[2]||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), {fixture}=await import(pathToFileURL(root+'/patches/splatoon3/tests/source-fixture.mjs'));
const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true});
f.G.scene=new f.THREE.Scene();f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});f.G.physics=new f.Physics(f.G.level);
const owner=f.make();owner.team=0;owner.remote=true;const actors=Array.from({length:8},()=>{const a=f.make();a.team=1;a.isLocal=false;a.remote=false;a.pos.set(0,0,0);a.grounded=true;a.intent.move.set(0,0,1);return a;});
let los=0;const nativeLos=f.G.physics.los.bind(f.G.physics);f.G.physics.los=(...args)=>{los++;return nativeLos(...args);};
const results=[];
for(const [label,n,mists] of [['empty',0,0],['96 non-Mist',96,0],['1 Mist',1,1],['96 overlap Mist',96,96],['95 non-Mist + 1 Mist',96,1]]){
 f.G.projectiles._s3SubObjects=Array.from({length:n},(_,i)=>({owner,team:0,subId:i<mists?'toxicMist':'burst',phase:i<mists?'deployed':'ghostWait',pos:new f.THREE.Vector3(0,0,0),vel:new f.THREE.Vector3(),spec:{radius:6,slowScale:.72},age:0,expireAt:1e9,ghost:true,dead:false,seenToxic:new Map()}));
 for(const a of actors){delete a.s3.toxicMistSlowUntil;delete a.s3.toxicMistScale;}
 const run=(count)=>{for(let i=0;i<count;i++){f.G.time+=1/60;for(const a of actors)a._horizontal(1/60,false,false);f.G.projectiles.update(1/60);}};
 run(100);los=0;const t=performance.now();run(1000);const elapsed=performance.now()-t;results.push({label,msPerTick:elapsed/1000,losPerTick:los/1000,actors:8,frames:1000});
}
console.log(JSON.stringify({root,results}));
