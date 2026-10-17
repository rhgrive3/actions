import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,includeCharacter:true});
const {G,THREE:T}=f;
function world(){
 G.projectiles.clear();G.actors=[];G.time=0;G.scene=new T.Scene();G.camera=new T.PerspectiveCamera();G.netm=null;G.net=null;G.mode='match';
 G.match={state:'playing',mode:'turf',playing:()=>true,canRespawn:()=>false};G.paint={sample:()=>1,splat:()=>0};
 G.level=new f.Level({bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},spawnPads:[[-90,0,0],[90,0,0]],spawnBarrier:0,
  half:[],single:[{kind:'box',min:[-100,-.5,-100],max:[100,0,100]}]});G.physics=new f.Physics(G.level);
}
function actor(id,hz=60){
 const a=new f.Actor({team:0,name:'native presentation',weapon:'shooter',CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}});
 a.character.actor=a;a.character.onEvent=null;G.actors.push(a);G.scene.add(a.character.root);
 a.pos.set(0,0,0);a._probeGround();a.invuln=0;a.aimDir.set(0,0,1);a.aimPoint.set(0,1,30);
 const step=(count=1)=>{for(let i=0;i<count;i++){G.time+=1/hz;a.update(1/hz);G.projectiles.update(1/hz);a.character.root.updateMatrixWorld(true);}};
 step(Math.ceil(hz/2));a.weapon={...a.weapon,special:id,specialCost:100};a.special=100;a.intent.special=true;step();a.intent.special=false;
 assert.equal(a.specialActive?.id,id,'activation is admitted by the native input path');
 return {a,ch:a.character,step,close(){a.specialActive=null;a.character.update(0,a.anim);a.character.dispose();G.projectiles.clear();}};
}
for(const hz of [30,60,120])test(`Wail restores its firing weapon and keeps speakers visible while swimming at ${hz}Hz`,()=>{
 world();const r=actor('killerWail',hz);try{
  assert.equal(r.ch.weapon.pivot.visible,false,'startup hides the main');
  r.step(Math.ceil(41*hz/60));r.a.intent.fire=true;r.step(Math.ceil(hz/6));
  assert.equal(r.ch.weapon.pivot.visible,true,'the permitted main is visible after 40F');
  assert.ok(G.projectiles.list.some(p=>p.owner===r.a),'the visible main really emitted an ordinary shot');
  const d=r.ch.s3SpecialDevices()[0],origin=r.a._s3AllSpecialState.beamPairs[0].origins[0].clone();
  assert.ok(d.holder.getWorldPosition(new T.Vector3()).distanceTo(origin)<1e-8);
  r.a.intent.fire=false;r.a.intent.squid=true;r.a.intent.move.set(1,0,0);r.step(Math.ceil(hz/2));
  assert.equal(r.a.form,'squid');assert.equal(r.a.anim.form,'swim');assert.equal(r.ch.kid.visible,false);
  assert.equal(d.holder.parent,G.scene,'autonomous speakers do not disappear with the human rig');
  assert.ok(d.holder.position.distanceTo(origin)<1e-8,'fired speakers stay at their beam origins while the actor moves');
 }finally{r.close();}
});

test('Zipcaster retirement preserves borrowed body geometry and disposes its coat material once',()=>{
 world();const r=actor('zipcaster');const counts=new Map(),listeners=[];try{
  r.step();const coat=r.ch.kid.getObjectByName('zipcaster-ink-coat');assert.ok(coat);
  const source=new Set(),twins=[];r.ch.kid.traverse(o=>{if(o.isSkinnedMesh&&/^kid:/.test(o.name||''))source.add(o.geometry);});
  coat.traverse(o=>{if(o.isSkinnedMesh)twins.push(o);});assert.ok(twins.length>0);
  const resources=new Set([...source,...twins.map(o=>o.material)]);
  for(const obj of resources){counts.set(obj,0);const cb=()=>counts.set(obj,counts.get(obj)+1);obj.addEventListener('dispose',cb);listeners.push([obj,cb]);}
  r.a.specialActive=null;r.a._s3AllSpecialState=null;r.ch.update(1/60,r.a.anim);
  assert.equal(r.ch.kid.getObjectByName('zipcaster-ink-coat'),undefined);
  for(const g of source)assert.equal(counts.get(g),0,'ending the special must not invalidate the normal rig');
  for(const m of new Set(twins.map(o=>o.material)))assert.equal(counts.get(m),1,'coat material has one owner');
 }finally{for(const[o,cb]of listeners)o.removeEventListener('dispose',cb);r.close();}
});

test('Screen renders only the thrown jar in flight and unfolds from its actual landing time',()=>{
 world();const r=actor('splattercolorScreen');try{
  r.a.pos.y=10;r.a.grounded=false;r.a.intent.sub=true;r.step();r.a.intent.sub=false;r.step();
  for(let i=0;!(G.projectiles._s3AllSpecialObjects||[]).some(o=>o.kind==='screen')&&i<20;i++)r.step();
  const o=G.projectiles._s3AllSpecialObjects.find(o=>o.kind==='screen');assert.ok(o);assert.equal(o.phase,'flight');
  const group=G.scene.children.find(g=>g.userData?.s3SpecialObject==='screen');assert.ok(group);
  const sheet=group.children.find(g=>g.userData.s3ScreenSheet);assert.ok(sheet);assert.equal(sheet.visible,false);
  assert.equal(o.mesh.visible,false,'the old large plane cannot flash during flight');
  for(let i=0;o.phase==='flight'&&i<240;i++)r.step();assert.equal(o.phase,'active');
  assert.ok(o.landedAt>0);assert.equal(sheet.visible,false,'the first contact has not completed the expansion');
  r.step(30);assert.equal(sheet.visible,true);assert.ok(sheet.scale.y>.5&&sheet.scale.y<1);
 }finally{r.close();}
});

test('already fired Wail speakers survive the owner and retire with their native laser tail',()=>{
 world();const r=actor('killerWail');try{
  r.step(50);assert.equal(r.a._s3AllSpecialState.beamPairs.length,1);
  const origin=r.a._s3AllSpecialState.beamPairs[0].origins[0].clone();r.a.splat(null,'test');
  assert.equal(r.ch.s3SpecialDevices(),null,'native death releases held/unfired world models before another Character update');
  r.step();
  const speakers=G.scene.children.filter(g=>g.name==='killer-wail-surviving-speaker');assert.equal(speakers.length,2);
  assert.ok(speakers[0].position.distanceTo(origin)<1e-8);
  r.step(250);assert.equal(G.scene.children.filter(g=>g.name==='killer-wail-surviving-speaker').length,0);
 }finally{r.close();}
});

test('accepted remote speaker observations cannot survive projectile clear or a match clock reset',()=>{
 world();const a=f.make();a.remote=true;a.alive=false;G.time=5;
 const event={actor:a,id:'killerWail',activation:1,index:0,action:'laser',pos:[0,2,0],target:[0,2,20]};
 f.installedRuntime.specialModelsReplay(event);G.projectiles.update(1/60);
 assert.equal(G.scene.children.filter(g=>g.name==='killer-wail-surviving-speaker').length,1);
 G.projectiles.clear();G.time=0;G.projectiles.update(1/60);
 assert.equal(G.scene.children.filter(g=>g.name==='killer-wail-surviving-speaker').length,0,'clear discards the observation generation');
 G.time=5;f.installedRuntime.specialModelsReplay(event);G.time=0;G.projectiles.update(1/60);
 assert.equal(G.scene.children.filter(g=>g.name==='killer-wail-surviving-speaker').length,0,'future observations are not recent after clock reset');
 G.projectiles.clear();
});

for(const id of ['waveBreaker','splattercolorScreen','ultraStamp','storm','tacticooler'])test(`${id} holding retains the admitted native squid pose`,()=>{
 world();const r=actor(id);try{
  r.a.intent.squid=true;r.step(30);assert.equal(r.a.form,'squid');assert.equal(r.a.anim.form,'swim');assert.equal(r.ch.kid.visible,false);
 }finally{r.close();}
});
