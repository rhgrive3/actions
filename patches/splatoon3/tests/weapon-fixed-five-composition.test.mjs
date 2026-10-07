import {updateStormHold} from '../runtime/storm-effects.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../reliability/tests/controls-fixture.mjs';
import {viabilityFixture} from '../../local-quality/tests/gyro-viability-fixture.mjs';
import {resetPlatformInput} from '../../local-quality/platform-input.mjs';
import {installWeaponMotion,slosherMotionSnapshot} from '../runtime/weapon-motion.mjs';
import {installWeaponDetailMotion} from '../runtime/weapon-detail-motion.mjs';
import {installSubSpecialFidelity} from '../runtime/sub-special-fidelity.mjs';
const DT=1/60;
async function world(real=false){
 const f=await fixture({network:true,character:real,fidelity:true});const {G,THREE}=f;
 G.scene=new THREE.Scene();G.camera=null;G.level={blocks:[],groundHeight:()=>0,queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;return out;}};G.physics=new f.Physics(G.level);
 f.installWeaponsFidelity(f,f.profile);installSubSpecialFidelity(f,f.profile);
 if(real){f.installWalkMotion(f,f.profile);f.installRollerMotion(f,f.profile);installWeaponMotion(f,f.profile);installWeaponDetailMotion(f,f.profile);}
 const ps=G.projectiles=new f.Projectiles(G.scene);G.actors=[];
 return {...f,ps};
}
function actor(f,kind='slosher',real=false){
 const a=real?new f.Actor({team:0,name:'composition',weapon:kind,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}):f.make(kind);
 a.grounded=true;a.ground.hit=true;a.character.actor=a;a.character.onEvent=null;
 a._spawnBarrier=()=>{};a._integrate=()=>{};a._resolve=()=>{};
 f.G.actors.push(a);
 if(real){f.G.scene.add(a.character.root);for(let i=0;i<90;i++){a.weaponRunner.update(DT,{});a._finishFrame(DT);}}
 return a;
}
function net(f,a,id='A'){
 a.nid=7;a.owner='A';const n=new f.NetMatch({myId:id,hostId:'A',isHost:false,_members:new Map([['A','A'],['B','B']]),tr:{broadcast(){}}},{map:'tidewater'});
 n.bind({actors:[a],state:'playing',time:180});return n;
}
function inputRig(f,a){
 const input=new f.Input({}),m=input.mobile,classes={toggle(){},add(){},remove(){},contains:n=>n==='is-active'};
 Object.assign(m,{active:true,visible:true,root:{classList:classes,setPointerCapture(){},querySelectorAll:()=>[]},els:{fire:{classList:classes}},_stickHome:{x:100,y:400,d:100},_stickR:50,_H:700});
 const camera={yaw:0,pitch:0,mapK:0},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};f.G.rig=camera;f.G.settings={...f.DEFAULT_SETTINGS,aimAssist:0};
 const event=(id,type='pointerdown')=>({pointerType:'touch',pointerId:id,clientX:700,clientY:400,type,target:{closest(){return null;}},cancelable:true,preventDefault(){},stopPropagation(){}});
 const down=()=>{input.lastDevice='touch';m._hitButton=()=> 'fire';m._down(event(7));};
 const up=()=>m._up(event(7,'pointercancel'));
 const key=code=>f.event('keydown',{code,repeat:false,preventDefault(){}});
 const step=()=>{c.update(DT);f.tick(a);input.endFrame();};
 return {input,m,c,camera,down,up,key,step};
}
test('592×563: dead Storm owner retains one cloud through480 recipient ticks',async()=>{
 for(const ghost of [false,true]){
  const f=await world(),a=actor(f,'charger'),n=net(f,a,ghost?'B':'A');let deaths=0,damage=0,paint=0,ends=0;
  f.on('splatted',()=>deaths++);f.on('storm:end',()=>ends++);f.G.paint.splat=()=>{paint++;return 0;};
  if(!ghost){a.weapon={...a.weapon,special:'storm'};a.special=a.specialCost();a.intent.special=true;f.tick(a);assert.equal(f.ps.bombs.length,0);a.intent.sub=true;updateStormHold(a,DT,f.G);a.intent.sub=false;updateStormHold(a,DT,f.G);a.pos.y=-2;f.G.level.groundHeight=()=>-Infinity;f.tick(a);assert.equal(deaths,1);assert.equal(a.alive,false);assert.equal(f.ps.bombs.length,1);}
  else {f.ps.ghostBomb(a,'storm',0,1,0,0,14.4,0);n._remoteSplat(a,null,'water');assert.equal(a.alive,false);}
  // Deployment now requires actual terrain contact; the old1.1s air timeout was retired.
  const V=f.THREE.Vector3;f.G.level.blocks=[{id:0,solid:true,center:new V(0,-.1,100),half:new V(100,.1,200),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]}];f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;};
  //30s is the installed Storm projectile retirement bound, not a new flight timer.
  for(let i=0;i<30/DT&&!f.ps.clouds.length;i++){f.G.time+=DT;f.ps._updateBombs(DT);}
  assert.equal(f.ps.clouds.length,1);assert.equal(f.ps.bombs.length,0);const cloud=f.ps.clouds[0];assert.equal(cloud.owner,a);
  if(ghost){cloud.ghost=true;cloud._netPeer={sim:0,tr:0,lastTs:100};cloud._netBornTick=0;cloud._netSteps=0;}
  f.G.physics.los=()=>true;f.G.physics.raycast=(p,_d,_l,h)=>{h.hit=true;h.point.copy(p).setY(0);h.normal.set(0,1,0);return h;};
  f.G.actors=[{alive:true,remote:false,team:1,pos:cloud.group.position.clone().add(new f.THREE.Vector3(0,-2,0)),damage(_v,owner){assert.equal(owner,a);damage++;return false;}},
   {alive:true,remote:true,team:1,pos:cloud.group.position.clone(),damage(){throw Error('remote damage doubled');}}];
  for(let i=0;i<481;i++){f.G.actors[0].pos.copy(cloud.group.position).add(new f.THREE.Vector3(0,-2,0));f.G.time+=DT;if(ghost)cloud._netPeer.sim=i;f.ps._updateClouds(DT);if(i===478)assert.equal(damage,479);}
  assert.equal(damage,480);assert.equal(ends,1);assert.equal(f.ps.clouds.length,0);assert.equal(ghost?paint===0:paint>0,true);n.dispose();
 }
});
test('592×596/590/566: water splat clears owner and accepted remote presentation state',async()=>{
 for(const kind of ['slosher','dualies','charger']){
  const f=await world(true),a=actor(f,kind,true),n=net(f,a);
  if(kind==='slosher'){a.intent.fire=true;f.tick(a);assert.ok(slosherMotionSnapshot(a.character));}
  else {a.intent.squid=true;f.tick(a,10);a.intent.fire=true;f.tick(a,3);if(kind==='dualies')assert.ok(a.weaponRunner.s3DualiesSwimStart>0);}
  a.weapon={...a.weapon,special:'storm'};a.special=a.specialCost();a.pos.y=-2;f.G.level.groundHeight=()=>-Infinity;a.intent.special=true;f.tick(a);
  assert.equal(a.alive,false);assert.equal(a.weaponRunner.charging,false);assert.equal(a.weaponRunner.s3DualiesSwimStart,null);assert.equal(slosherMotionSnapshot(a.character),null);
  a.remote=true;n._playEvent('weapon:fire',{actor:{n:7},weapon:kind,muzzle:[0,1,0],dir:[0,0,1]});assert.equal(slosherMotionSnapshot(a.character),null);
  // Accepted death replay/reset in a separate remote life must also clear a track.
  if(kind==='slosher'){a.alive=true;a.character.setVisible(true);a.form='kid';a.character.trigger('slosh');n._remoteSplat(a,null,'water');assert.equal(slosherMotionSnapshot(a.character),null);}
  n.dispose();a.character.dispose();
 }
});
test('567/571×weapons: keyboard preserves startup contact; Map owns new admission only',async()=>{
 for(const kind of ['dualies','charger']){
  const f=await world(),a=actor(f,kind),h=inputRig(f,a);a.intent.squid=true;f.tick(a,10);h.input.keys.add('ShiftLeft');h.down();const ptr=h.m._ptr.get(7);let first=null;
  for(let i=0;i<15;i++){if(i===2)h.key('KeyW');const count=f.ps.list.length;h.step();assert.equal(h.m._ptr.get(7),ptr);if(first==null&&(kind==='charger'?a.weaponRunner.charging:f.ps.list.length>count))first=i;}
  assert.equal(first,kind==='dualies'?12:6);h.up();h.step();
  const x=await world(),b=actor(x,kind),j=inputRig(x,b);b.intent.squid=true;x.tick(b,10);j.input.keys.add('ShiftLeft');j.down();for(let i=0;i<4;i++)j.step();j.up();for(let i=0;i<20;i++)j.step();assert.equal(x.ps.list.length,0);assert.equal(x.ps.beams.length,0);
  const axes=[.9,0,0,0],buttons=pressed=>Array.from({length:17},(_,i)=>({pressed:i===pressed,value:i===pressed?1:0}));
  f.setPads([{index:0,id:'pad',connected:true,mapping:'standard',axes,buttons:buttons(-1)}]);h.input.pollPad();h.input.lastDevice='touch';h.m.setMap(true);h.step();assert.equal(h.c.mapHeld,true);h.input.pollPad();assert.equal(h.m.mapOpen,true,'unchanged held axes preserve touch map');h.key('KeyD');assert.equal(h.m.mapOpen,false);h.step();assert.equal(h.c.mapHeld,false);
 }
 const f=await world(),a=actor(f,'slosher'),h=inputRig(f,a);h.down();h.step();assert.ok(a.weaponRunner.slosh>=0);h.m.setMap(true);for(let i=0;i<12;i++)h.step();assert.equal(f.ps.list.length,9,'paid heave completes under map mask');
});
test('588/595×startup: focused sensor ownership cannot run or restart weapon clocks',async t=>{
 const s=await viabilityFixture();t.after(s.close);s.env.navigator.userAgent='iPhone';await s.m.setGyro(true);
 let time=1100,angle=0;const sample=(rate,attitudeRate=rate)=>{time+=1000/60;angle+=attitudeRate/60;s.orientation({timeStamp:time,alpha:0,beta:angle,gamma:0});s.motion({timeStamp:time+1000/120,rotationRate:{alpha:0,beta:rate,gamma:0}});};
 for(let i=0;i<50;i++)sample(120);for(let i=1;i<=90;i++)sample(120*Math.pow(.9,i));sample(.01,0);assert.equal(s.m.gyro._src,'rrA');
 const f=await world(),a=actor(f,'dualies'),h=inputRig(f,a);h.m.gyro=s.m.gyro;a.intent.squid=true;f.tick(a,10);h.input.keys.add('ShiftLeft');h.down();h.step();h.step();const before=a.kidT;
 s.fire('blur');resetPlatformInput(h.input,h.c);const yaw=h.camera.yaw,pitch=h.camera.pitch;for(let i=0;i<8;i++){s.motion({rotationRate:{alpha:.0001,beta:0,gamma:0}});s.orientation({alpha:20+i});h.c.update(DT);assert.equal(h.camera.yaw,yaw);assert.equal(h.camera.pitch,pitch);assert.deepEqual(s.m.gyro.consume({yaw:0,pitch:0}),{yaw:0,pitch:0});}
 assert.equal(a.kidT,before,'sensor callbacks are not simulation ticks');f.tick(a,12);assert.ok(a.kidT>before);assert.equal(a.weaponRunner.s3DualiesSwimStart,null);assert.equal(f.ps.list.length,0);
 s.fire('focus');s.orientation({alpha:100});assert.deepEqual(s.m.gyro.consume({yaw:0,pitch:0}),{yaw:0,pitch:0});h.down();for(let i=0;i<3;i++)h.step();assert.equal(f.ps.list.length,1,'new human admission, not old swim countdown');
});
test('596 owner guard is transported once; remote pose cannot relocate nine births',async()=>{
 const f=await world(true),a=actor(f,'slosher',true),n=net(f,a),V=f.THREE.Vector3;f.G.netm=n;
 const wall={id:0,solid:true,center:new V(0,1,.5),half:new V(10,4,.05),axes:[new V(1,0,0),new V(0,1,0),new V(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};f.G.level.blocks=[wall];f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;};
 a.intent.fire=true;for(let i=0;i<13;i++){a.weaponRunner.update(DT,{fire:true});a._finishFrame(DT);f.ps.update(DT);}
 const packets=n.out.filter(e=>e[1]==='p');assert.equal(packets.length,9);assert.ok(packets.every(e=>e.length===35));assert.ok(f.ps.list.every(p=>p.pos.z<.45));
 const g=await world(true),b=actor(g,'slosher',true),remote=net(g,b,'B');b.pos.set(100,20,-100);b.character.getMuzzle=()=>{throw Error('remote recomputed local muzzle');};
 for(const packet of packets){remote._play('A',packet);}
 assert.equal(g.ps.list.length,9);for(let i=0;i<9;i++){assert.ok(g.ps.list[i].pos.distanceTo(f.ps.list[i].pos)<.009);assert.deepEqual(Array.from(g.ps.list[i].vel.toArray()),Array.from(f.ps.list[i].vel.toArray()));}
 f.ps.clear();n.out.length=0;f.G.level.blocks=[];f.G.level.queryBlocks=(_a,_b,_c,_d,out)=>{out.length=0;return out;};a.weaponRunner.reset();a.intent.fire=false;for(let i=0;i<60;i++){a.weaponRunner.update(DT,{});a._finishFrame(DT);}
 a.intent.fire=true;for(let i=0;i<13;i++){a.weaponRunner.update(DT,{fire:true});a._finishFrame(DT);f.ps.update(DT);}
 assert.equal(f.ps.list.length,9);assert.ok(f.ps.list[0].pos.z>.45,'free-space native pose remains the emitter');
 n.dispose();remote.dispose();a.character.dispose();b.character.dispose();
});
