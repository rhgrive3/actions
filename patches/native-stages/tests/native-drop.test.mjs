import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {nativeStageCatalog,nativeBrowserStageIntegrity} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {nativeFixture,readStage} from './fixture.mjs';

test('high source drops require a validated opt-in and a distinct source-cache identity',()=>{
 const dir=fs.mkdtempSync(path.resolve('.ci-scratch/drop-catalog-'));
 const base={id:'probe',internal:'Vss_Probe00',name:'Probe',tree:'b'.repeat(40),sourceSha256:'a'.repeat(64),bounds:{minX:-10,minZ:-10,maxX:10,maxZ:10},spawnPads:[[0,1,-8],[0,1,8]],spawnBarrier:2.5,placementStatus:'inferred source supports',version1130Verified:false};
 const write=value=>fs.writeFileSync(path.join(dir,'probe.json'),JSON.stringify({...base,sourceNavigation:value}));
 try{
  for(const value of [{highDrops:true},{wallClimb:true,highDrops:true}]){write(value);assert.deepEqual(nativeStageCatalog(dir).stages.at(-1).sourceNavigation,value);assert.notEqual(nativeBrowserStageIntegrity(base),nativeBrowserStageIntegrity({...base,sourceNavigation:value}));}
  for(const value of [{},{highDrops:false},{highDrops:1},{highDrops:true,hover:true},[]]){write(value);assert.throws(()=>nativeStageCatalog(dir),/source navigation/);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('ordinary blockout inputs remain unchanged',async()=>{
 const f=await nativeFixture(),actor=f.make('shooter'),brain=new f.BotBrain(actor,'normal');actor.intent.squid=actor.intent.fire=true;actor.intent.move.set(1,0,0);
 f.nativeDropTravelForm(brain,f.G);assert.equal(actor.intent.squid,true);assert.equal(actor.intent.fire,true);assert.deepEqual(Array.from(actor.intent.move.toArray()),[1,0,0]);
});

const roots=(process.env.NATIVE_DROP_FIXTURE_ASSETS||'').split(path.delimiter).filter(Boolean);
for(const root of roots){const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'),'utf8'));for(const definition of catalog.stages.filter(s=>['manta','bluefin'].includes(s.id))){
 test(definition.id+' exact source drops preserve blocked forms and execute ordinary human/bot input at 30/60/120Hz',async()=>{
  const f=await nativeFixture(),{G,THREE,PLAYER}=f,data=readStage(root,definition.id),hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.triangleFace.buffer)).digest('hex'),before=hash();
  const L=G.level=new f.NativeLevel(data),P=G.physics=new f.NativePhysics(L);
  class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
  G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});G.camera=new THREE.PerspectiveCamera();G.match.mode='turf';G.match.opts={};
  const previous=L.manifest.sourceNavigation;L.manifest.sourceNavigation={...previous,highDrops:true};
  const started=performance.now(),N=G.nav=new f.NavGraph(L,P),navBuildMilliseconds=performance.now()-started;
  const seeds=N.nativeSpawnNodeIds,reach=seed=>{const set=new Set([seed]),queue=[seed];for(let i=0;i<queue.length;i++)for(const edge of N.nodes[queue[i]].nb)if(!set.has(edge.to)){set.add(edge.to);queue.push(edge.to);}return set;},both=seeds.map(reach),common=N.validIds.filter(id=>both.every(s=>s.has(id)));
  if(definition.id==='bluefin')assert.ok(common.length>=1000,'actual upper source pads must reach the substantial lower playable component');
  const wanted=definition.id==='bluefin'?[[[25,8.9237,-21.5],[25,3.9882,-20.5]],[[-25,8.9237,21.5],[-25,3.9882,20.5]]]:[[[-2,11,40.89720153808594],[-3,8,40.89720153808594]]];
  const nearest=p=>N.nodes.reduce((a,n)=>Math.hypot(n.x-p[0],n.y-p[1],n.z-p[2])<Math.hypot(a.x-p[0],a.y-p[1],a.z-p[2])?n:a,N.nodes[0]),cases=[];
  for(const [start,low]of wanted){const upper=nearest(start),lower=nearest(low),edge=f.nativeDropTransition(N,upper,lower);assert.ok(edge,'known real source departure must be admitted');assert.equal(edge.drop.form,'kid');assert.equal(N.nodes[edge.to].nativePaintable,true);
   assert.equal(P.los(new THREE.Vector3(upper.x,upper.y+1.5,upper.z),new THREE.Vector3(lower.x,lower.y+1.5,lower.z)),false,'the old straight descent is a genuine false negative');
   assert.ok(N.valid[upper.id]&&N.valid[edge.to]);if(definition.id==='bluefin')assert.equal(edge.drop.squidClearance,false,'source railing retains the wider swim-capsule negative');
   delete L.manifest.sourceNavigation;assert.equal(f.nativeDropTransition(N,upper,lower),null);L.manifest.sourceNavigation={...previous,highDrops:true};
   for(const bot of [false,true])for(const hz of [30,60,120]){
    G.actors=[];G.projectiles.clear();G.paint=new Cpu(null,L,{atlasSize:2048,maxDensity:4,cell:.25});const a=f.make('shooter');a.team=start[2]<0?0:1;a._integrate=f.Actor.prototype._integrate;a._spawnBarrier=f.Actor.prototype._spawnBarrier;a.spawnAt(new THREE.Vector3(...edge.drop.upper),Math.atan2(edge.drop.direction[0],edge.drop.direction[2]));a.invuln=0;G.actors=[a];
    const goal=new THREE.Vector3(...edge.drop.landing);let brain;
    if(bot){a.isBot=true;brain=a.bot=new f.BotBrain(a,'normal');assert.ok(brain._pathTo(goal,.6));brain.goalTimer=brain.repath=brain.bombCd=1000;assert.ok(brain.path.slice(1).some((id,i)=>N.nodes[brain.path[i]].nb.find(e=>e.to===id)?.drop));}
    else {a.intent.move.fromArray(edge.drop.direction);a.intent.fire=a.intent.squid=a.intent.jump=false;}
    let airborne=false,seconds=0;
    for(let frame=0;frame<hz*6;frame++){G.time+=1/hz;brain?.update(1/hz);a.character.root.position.copy(a.pos);a.update(1/hz);G.projectiles.update(1/hz);G.paint.advanceSimulation(1/hz);airborne ||=!a.grounded;seconds=(frame+1)/hz;if(airborne&&a.grounded&&a.pos.y<upper.y-1.25)break;}
    const support=P.raycast(a.pos.clone().setY(a.pos.y+.1),new THREE.Vector3(0,-1,0),.3);
    assert.ok(a.alive&&a.grounded&&a.pos.distanceTo(goal)<.9,'real ordinary controller lands at screened source support '+JSON.stringify({bot,hz,seconds,position:a.pos.toArray(),goal:goal.toArray(),alive:a.alive,grounded:a.grounded,pi:brain?.pi,path:brain?.path,form:a.form}));
    assert.ok(support.hit&&support.face>=0);assert.deepEqual(Object.keys(a.s3.abilityPoints),[]);assert.equal(a.s3JumpSerial||0,0);
    cases.push({bot,hz,seconds,start:edge.drop.upper,end:a.pos.toArray(),sourceTriangle:support.triangle,weapon:'shooter / Shooter_Normal_00',gearAP:0,form:a.form,ordinaryMoveGravity:true,alive:true,grounded:true});
   }
  }
  if(definition.id==='manta'){
   const sweep=f.nativeDropClearance(L),from=new THREE.Vector3(-11,8,-23.102798461914062),to=new THREE.Vector3(-15,8,-23.102798461914062);
   assert.ok(P.bodyFits(from,.35,PLAYER.stepUp,PLAYER.height)&&P.bodyFits(to,.35,PLAYER.stepUp,PLAYER.height));assert.equal(sweep.clear(from,to,.35,PLAYER.stepUp,PLAYER.height),false,'both fitting endpoints still cross an actual source wall');
   const sourceNoPaint=N.nodes.find(n=>n.y<0&&!n.nativePaintable),upper=nearest([-14,15.4452,-25.1028]);assert.equal(f.nativeDropTransition(N,upper,sourceNoPaint),null,'real source lower hull and NoPaint water floor never become a playable drop');
  }
  assert.equal(hash(),before,'source collision, flags and chart IDs are immutable');console.log(JSON.stringify({id:definition.id,sourceSha256:L.manifest.sourceSha256,navNodes:N.nodes.length,validNodes:N.validIds.length,common:common.length,newDrops:N.nodes.flatMap(n=>n.nb.filter(e=>e.drop)).length,navBuildMilliseconds,cases,sourceBuffersUnchanged:true,metrics:N._nativeDropClearance?.metrics}));
 });
}}
