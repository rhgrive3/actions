// Compare actual INKWAVE base/candidate runtime with the native posed Character.
// This is not an original Nintendo game measurement.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fixture } from '../../patches/splatoon3/tests/source-fixture.mjs';
const base='48511150bbaeab182dd04c712d39bd5b26df18f3';
const file='patches/splatoon3/runtime/main-weapon-catalog.mjs';
const baseline=execFileSync('git',['show',base+':'+file],{encoding:'utf8'});
const result={base,kind:'INKWAVE source/posed rig comparison; not Nintendo pixels',conditions:{weapon:'s3-slosher-double',gear:'neutral fixture',pitch:0,hz:60},runs:{}};
for(const which of ['base','candidate']){
 const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true,vmMathRandom:()=>.5,
  adaptRuntime:(rel,source)=>which==='base'&&rel===file?baseline:source});
 const {G,THREE}=f;G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera(45,1,.1,100);
 G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
 const a=new f.Actor({team:0,name:'Origin measurement',weapon:'s3-slosher-double',isLocal:true,CharacterClass:f.Character});
 a.character.actor=a;a.character.onEvent=null;a._integrate=()=>{};a._spawnBarrier=()=>{};
 a.pos.set(0,10,0);a.grounded=a.ground.hit=true;a.aimDir.set(0,0,1);a.aimPoint.set(0,11.05,60);a.intent.fire=true;G.actors=[a];
 const births=[];G.netm={recProj(p){births.push({unit:p.catalog.descriptor.unit,index:p.catalog.index,position:p.start.clone().sub(a.pos).toArray(),velocity:p.vel.toArray(),damage:p.damage,radius:p.radius,life:p.life,range:p.catalog.range,seed:p.seed});}};
 for(let tick=0;tick<60;tick++){G.time+=1/60;a.update(1/60);if(G.projectiles.list.length)a.intent.fire=false;G.projectiles.update(1/60);}
 result.runs[which]={births,ink:a.ink};a.character.dispose();
}
const positions=result.runs.base.births.map((b,i)=>({unit:b.unit,index:b.index,before:b.position,after:result.runs.candidate.births[i].position}));
const coefficients=run=>JSON.stringify(run.births.map(({position,...b})=>b));
result.comparison={birthCount:[result.runs.base.births.length,result.runs.candidate.births.length],sourceCoefficientsAndVelocityUnchanged:coefficients(result.runs.base)===coefficients(result.runs.candidate),positions};
fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2));console.log(JSON.stringify(result.comparison));
