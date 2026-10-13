import fs from 'node:fs';import crypto from 'node:crypto';
import {nativeFixture,readStage} from '../patches/native-stages/tests/fixture.mjs';
const f=await nativeFixture({includeCharacter:true}),{G,THREE}=f,data=readStage('/workspace/stage-worktrees/shipshape/.codex-stage-sources/generated','shipshape');
const level=G.level=new f.NativeLevel(data);G.physics=new f.NativePhysics(level);G.camera=new THREE.PerspectiveCamera();G.nav={nodes:[]};G.match={state:'playing',mode:'turf',opts:{},playing:()=>true,canRespawn:()=>false};
class Cpu extends f.PaintSystem{_initGPU(){this.quads=0;this.dryMesh={visible:false};this._dryU={uDry:{value:0}};} _pushQuad(){} _drawQuads(){}}
const hash=()=>crypto.createHash('sha256').update(Buffer.from(data.triangles.buffer)).update(Buffer.from(data.flags.buffer)).update(Buffer.from(data.mask.buffer)).digest('hex'),before=hash(),cases=[];
for(const form of ['kid','squid'])for(const policy of ['baseline','candidate']){
 G.paint=new Cpu(null,level,{atlasSize:2048,maxDensity:4,cell:.25});G.projectiles.clear();G.actors=[];G.time=0;f.setRandom(()=>.5);
 const a=new f.Actor({team:0,slot:0,name:'combat support source',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});G.actors.push(a);a.spawnAt(new THREE.Vector3(19.008217972071392,6,45.533175676955224),-1.2);
 for(let i=0;i<60;i++){G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);}
 if(!a.grounded||!a.alive)throw Error('unsupported real source departure');
 const start=a.pos.toArray(),brain=a.bot=new f.BotBrain(a,'normal');brain.mode='fight';brain.target={pos:new THREE.Vector3(6.05,6,64.5),vel:new THREE.Vector3(),alive:true};
 if(policy==='baseline')brain._wet=function(x,z,y){const gy=G.level.groundHeight(x,z,y+.6);return gy===-Infinity||gy<f.PLAYER.fallDeathY;};
 // Controlled initial own ink reproduces the witnessed fast combat form;
 // this is a physics/support diagnostic, not a natural-weapon paint proof.
 G.paint.splat(a.pos.clone(),12,0,{seed:.3,instant:true});
 let low=a.pos.y,departed=false;const frames=[];
 for(let tick=0;tick<240&&a.alive;tick++){
  a.intent.fire=a.intent.jump=a.intent.sub=a.intent.special=false;a.intent.squid=form==='squid';
  brain._tail(1/60,new THREE.Vector3(-.9,0,.4).normalize(),-1.2,0,20,true);
  G.time+=1/60;a.update(1/60);G.projectiles.update(1/60);G.paint.advanceSimulation(1/60);low=Math.min(low,a.pos.y);departed||=a.pos.y<5;
  if(tick%12===0)frames.push({tick,pos:a.pos.toArray(),vel:a.vel.toArray(),grounded:a.grounded,form:a.form,move:a.intent.move.toArray()});
 }
 cases.push({form,policy,sourceSha256:level.manifest.sourceSha256,start,end:a.pos.toArray(),alive:a.alive,grounded:a.grounded,low,departed,frames});
}
if(hash()!==before)throw Error('source buffers mutated');const result={cases,sourceBuffersUnchanged:true,conditions:'Controlled production Actor/Character/Brain._tail/source Physics/WeaponRunner/Projectiles at1/60; fixed desired combat direction; initial own ink supplied through PaintSystem.splat; not actual Game clock or natural source paint evidence.'};fs.writeFileSync('.ci-scratch/native-combat-source-probe.json',JSON.stringify(result,null,2));console.log(JSON.stringify(cases.map(({frames,...r})=>r)));
