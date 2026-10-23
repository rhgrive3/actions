import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {transformSync} from 'esbuild';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {compactModuleStrings} from '../../../scripts/lib/inkwave-source-compaction.mjs';
const file='patches/splatoon3/runtime/flow-motion.mjs';
import {withoutFlowSurfaceFixes} from './flow-surface-negative.mjs';
const fingerprint=g=>createHash('sha256').update(JSON.stringify([Array.from(g.index.array),...Object.values(g.attributes).map(a=>Array.from(a.array))])).digest('hex');
async function trace(compiled,negative=false){
 const f=await sourceLoadedActorFixture({sourceOnly:true,random:()=>.5,moduleTransform:(rel,code)=>{
  if(rel!==file)return code;
  // Keep root/ribbon anchors identical; invert only the two glint-height
  // protections, otherwise one fix can mask the other's negative control.
  if(negative)code=withoutFlowSurfaceFixes(rel,code,{root:false});
  code=adaptBuildSource(file,code);
  return compiled?compactModuleStrings(transformSync(code,{loader:'js',format:'esm',minify:true,charset:'utf8',legalComments:'inline',sourcefile:file}).code).code:code;
 }});
 const a=await f.make(),v=await f.make(1);a.setWeapon('dualies');a.character.setLod('game');v.pos.set(8,0,8);const ch=a.character;
 const rows=[];
 const sample=name=>{
  const gl=ch.root.getObjectByName('s3-flow-glints'),shell=ch.root.getObjectByName('s3-flow-squid-edge');
  assert.equal(shell.skeleton,ch.squid.body.skeleton);assert.equal(shell.geometry.index,ch.squid.body.geometry.index);
  const m=new f.THREE.Matrix4(),p=new f.THREE.Vector3(),particles=[];
  for(let i=0;i<gl.count;i++){gl.getMatrixAt(i,m);p.setFromMatrixPosition(m);particles.push({alpha:gl.geometry.attributes.aFlowAlpha.getX(i),position:p.toArray(),world:gl.localToWorld(p).toArray(),size:new f.THREE.Vector3().setFromMatrixScale(m).x});}
  rows.push({name,form:ch.form,grounded:ch.grounded,pivot:ch.squid.pivot.position.toArray(),pose:Array.from(ch.P),sourceVisible:ch.squid.body.visible,shellVisible:shell.visible,geometry:fingerprint(ch.squid.body.geometry),root:ch.root.position.toArray(),physical:a.pos.toArray(),smoothY:a.smoothY,ribbons:ch.root.getObjectsByProperty('isMesh',true).filter(m=>m.name.startsWith('s3-flow-entry-spiral')).map(m=>({position:m.position.toArray(),visible:m.visible})),flow:{...a.s3.flow},particles});
 };
 try{
  for(let i=0;i<36;i++)f.tick(a);a.addTurf(10000);v.splat(a);for(let i=0;i<48;i++)f.tick(a);sample('kid');
  v.reset();v.splat(a);for(let i=0;i<6;i++)f.tick(a);a.intent.squid=true;a.intent.move.set(0,0,1);
  for(let i=0;i<8;i++)f.tick(a);sample('swim-entry');
  for(let i=0;i<40;i++)f.tick(a);sample('swim');
  // Set a raised physical floor through the fixture world boundary. The
  // production Actor still owns collision, smoothing, and Character placement.
  f.G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,3,0],[90,3,0]],spawnBarrier:0,half:[],single:[{kind:'box',min:[-100,2.5,-100],max:[100,3,100]}]});
  f.G.physics=new f.Physics(f.G.level);a.pos.y=3;f.tick(a);sample('raised');
  // Reproduce the real visual smoothing range without changing root/pose by hand.
  a.smoothY=-.7;f.tick(a);sample('smoothed');
  // Public terrain input changes, not visibility, animation, or timer writes.
  f.G.paint.sample=()=>0;for(let i=0;i<30;i++)f.tick(a);sample('dry');
  a.intent.jump=true;f.tick(a);a.intent.jump=false;for(let i=0;i<6;i++)f.tick(a);sample('air');
  a.intent.squid=false;a.intent.move.set(0,0,0);for(let i=0;i<30;i++)f.tick(a);sample('return');
  return JSON.parse(JSON.stringify(rows));
 }finally{f.reset();}
}
const surface=(rows,names=['swim-entry','swim','raised','smoothed'])=>{
 for(const name of names){
  const row=rows.find(r=>r.name===name);assert.equal(row.form,'swim');assert.equal(row.grounded,true);assert.equal(row.sourceVisible,false);assert.equal(row.shellVisible,false);
  const live=row.particles.filter(p=>p.alpha>1e-8);assert.ok(live.length>0,'live glints exist');
  assert.ok(live.every(p=>p.world[1]>row.physical[1]),'live grounded swim glint centers must be above physical contact: '+name);
 }
 assert.ok(rows.find(r=>r.name==='swim-entry').ribbons.some(r=>r.visible),'compare visible entry/extension ribbons');
 assert.equal(rows.find(r=>r.name==='raised').physical[1],3);
 assert.ok(rows.find(r=>r.name==='smoothed').smoothY<-.5);
 assert.equal(rows.find(r=>r.name==='air').grounded,false);
};
for(const compiled of [false,true])test(`${compiled?'compiled':'source'} grounded swim glints clear turf without modifying source pose, shell visibility, gameplay, dry or kid particles`,async()=>{
 const before=await trace(compiled,true),after=await trace(compiled);surface(after);for(const name of ['swim-entry','swim','raised','smoothed'])assert.throws(()=>surface(before,[name]),/above physical contact/);
 for(let i=0;i<after.length;i++){
  const {particles:b,...nativeBefore}=before[i],{particles:a,...nativeAfter}=after[i];assert.deepEqual(nativeAfter,nativeBefore);
  if(!['swim-entry','swim','raised','smoothed'].includes(after[i].name))assert.deepEqual(a,b,'non-swim particles are unchanged');
  else for(let j=0;j<a.length;j++){assert.equal(a[j].alpha,b[j].alpha);assert.equal(a[j].size,b[j].size);assert.equal(a[j].position[0],b[j].position[0]);assert.equal(a[j].position[2],b[j].position[2]);}
 }
});
