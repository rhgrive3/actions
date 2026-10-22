import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true});
function rig(time=0){
 f.G.scene=new f.THREE.Scene();f.G.settings={quality:'high'};f.G.time=time;
 const a=new f.Actor({team:0,name:'Kraken body clock',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.character.actor=a;a.character.onEvent=null;a.grounded=a.ground.hit=true;
 a.weapon={...a.weapon,special:'krakenRoyale'};a.specialActive={id:'krakenRoyale',phase:'active',t:0};
 function step(speed,dt=1/60){a.vel.set(0,0,speed);f.G.time+=dt;a._finishFrame(dt);}
 step(0,0);for(let i=0;i<60;i++)step(0);
 const d=a.character.s3SpecialDevices().find(x=>x.spec.model==='spKraken');
 const pose=()=>({scale:d.model.root.scale.toArray(),position:d.holder.position.toArray(),left:d.model.groups.legL.rotation.toArray(),right:d.model.groups.legR.rotation.toArray()});
 return {a,step,pose,close(){a.character.dispose();}};
}
test('Kraken paused pose does not rephase body or feet when velocity changes',()=>{
 const r=rig(99);try{r.step(0,0);const before=r.pose();r.step(0,0);assert.deepEqual(r.pose(),before,'unchanged-speed control');r.step(11.52,0);const after=r.pose();assert.deepEqual(after.left,before.left,'arms remain frozen');assert.deepEqual(after.right,before.right,'arms remain frozen');assert.deepEqual(after.scale,before.scale,'body phase must integrate dt instead of absolute time times speed');assert.deepEqual(after.position,before.position,'contact lift must use the same continuous body wave');r.step(11.52);assert.notDeepEqual(r.pose().scale,before.scale,'positive dt still animates body');}finally{r.close();}
});
test('Kraken normal body stroke does not depend on match age and is render-rate stable',()=>{
 const finals=[];for(const hz of [30,60,120])for(const age of [0,100]){const r=rig(age);try{for(let i=0;i<hz;i++)r.step(5.76,1/hz);for(let i=0;i<hz;i++)r.step(11.52,1/hz);finals.push(r.pose().scale);}finally{r.close();}}
 for(const scale of finals)for(let i=0;i<3;i++)assert.ok(Math.abs(scale[i]-finals[0][i])<1e-10,'same elapsed motion gives same body phase at any match age/render rate');
});
