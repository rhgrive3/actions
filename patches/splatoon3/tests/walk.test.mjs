import {test} from 'node:test';
import assert from 'node:assert/strict';
import {character} from './real-character-fixture.mjs';
// These tests exercise the complete skinned Character and its actual IK.
// Thresholds reject visible regressions; they are not Switch measurements.
test('walking keeps shoe contact and handles slow input, stops and turns on the actual rig',async t=>{
 const {api,ch,state}=await character();
 try{
  for(const name of ['slow','run','stop','turn'])await t.test(name,()=>{
   ch.root.position.set(0,0,0);ch.rootInit=false;ch.feetValid=false;ch.replant=true;
   Object.assign(state,{speed:0,localMove:{x:0,z:0},grounded:true,form:'kid'});
   for(let i=0;i<120;i++)ch.update(1/60,state);
   const rows=[];let steps=0;ch.onEvent=type=>{if(type==='footstep')steps++;};
   const last=[null,null];
   for(let i=0;i<180;i++){
    let v=(name==='slow'?.35:name==='turn'?4.2:5.76)*Math.min(1,i/10.8);
    if(name==='stop'&&i>=84)v=5.76*Math.max(0,1-(i-84)/9);
    const dx=name==='turn'&&i>=84?1:0,dz=1-dx;
    ch.root.position.x+=dx*v/60;ch.root.position.z+=dz*v/60;
    Object.assign(state,{speed:v,localMove:{x:-dx,z:dz}});ch.update(1/60,state);ch.root.updateMatrixWorld(true);
    for(let j=0;j<2;j++){
     const f=ch.feet[j];assert.ok(f.cw.toArray().every(Number.isFinite));
     if(f.planted&&last[j]?.planted){assert.ok(f.cw.distanceTo(last[j].cw)<1e-8,'world contact stays locked');assert.ok(Math.abs(f.pitch-last[j].pitch)<.23,'heel/toe angle advances continuously after touchdown');}
     last[j]={planted:f.planted,cw:f.cw.clone(),pitch:f.pitch};
    }
    if(i>=48)rows.push({drop:ch.hipDrop,y:ch.bones.hips.position.y,moving:ch.moving});
   }
   assert.ok(steps>2,'both feet take steps even at low stick input');
   assert.ok(Math.max(...rows.map(r=>r.drop))<.10,'turning/stopping must not collapse the pelvis');
   const travel=Math.max(...rows.map(r=>r.y))-Math.min(...rows.map(r=>r.y));
   assert.ok(travel<(name==='run'?.075:.11),`bounded torso bounce (${travel})`);
   if(name==='slow')assert.ok(rows.every(r=>r.moving),'low-speed input gets a real walking gait');
   if(name==='stop')assert.equal(ch.moving,false);
  });
  await t.test('steady running contacts follow the cadence without phase-wrap extra steps',()=>{
   ch.root.position.set(0,0,0);ch.rootInit=false;ch.feetValid=false;ch.replant=true;
   Object.assign(state,{speed:0,localMove:{x:0,z:0},grounded:true,form:'kid',firing:false});
   for(let i=0;i<120;i++)ch.update(1/60,state);
   const contacts=[[],[]],previous=[true,true];
   for(let i=0;i<240;i++){
    const v=5.76*Math.min(1,i/12);ch.root.position.z+=v/60;Object.assign(state,{speed:v,localMove:{x:0,z:1}});ch.update(1/60,state);
    ch.feet.forEach((f,j)=>{if(f.planted&&!previous[j]&&i>=60)contacts[j].push(i/60);previous[j]=f.planted;});
   }
   const period=1/ch.cad;
   for(const leg of contacts){assert.ok(leg.length>=8);for(let i=1;i<leg.length;i++)assert.ok(Math.abs(leg[i]-leg[i-1]-period)<=1/60+1e-8,'each complete step matches its clock within one simulation tick');}
  });
  await t.test('firing locomotion folds the rear shoe and knee on the full rig',()=>{
   ch.root.position.set(0,0,0);ch.rootInit=false;ch.feetValid=false;ch.replant=true;
   Object.assign(state,{speed:0,localMove:{x:0,z:0},grounded:true,form:'kid',firing:true});
   for(let i=0;i<120;i++)ch.update(1/60,state);
   let rearFold=0,soleTilt=0;
   for(let i=0;i<180;i++){
    const v=api.profile.weapons.shooter.moveSpeedFiring*Math.min(1,i/12);ch.root.position.z+=v/60;Object.assign(state,{speed:v,localMove:{x:0,z:1}});
    if(i%6===0)ch.trigger('shoot');ch.update(1/60,state);ch.root.updateMatrixWorld(true);
    ch.feet.forEach((f,j)=>{
     if(f.planted||i<60)return;
     const l=j===0?ch.limbs.legL:ch.limbs.legR,hip=l.up.getWorldPosition(new api.THREE.Vector3()),knee=l.lo.getWorldPosition(new api.THREE.Vector3()),ankle=l.end.getWorldPosition(new api.THREE.Vector3());
     if(ankle.z>=ch.root.position.z)return;
     rearFold=Math.max(rearFold,Math.PI-knee.clone().sub(hip).angleTo(knee.clone().sub(ankle)));
     const forward=new api.THREE.Vector3(0,0,1).applyQuaternion(l.end.getWorldQuaternion(new api.THREE.Quaternion()));
     soleTilt=Math.max(soleTilt,Math.abs(Math.atan2(forward.y,Math.hypot(forward.x,forward.z))));
    });
   }
   assert.ok(rearFold>1.75,'rear leg folds during pickup');assert.ok(soleTilt>.7,'the rear sole rotates instead of staying nearly flat through flight');
   state.firing=false;
  });
  await t.test('swing across terrain normals keeps a unit rotation and continuous contact',()=>{
   const f=ch.feet[0];f.planted=false;f.sw=true;f.from.set(0,0,0);f.to.set(0,.05,.2);f.n.set(0,1,0);f.tn.set(0,.8,.6);f.startPitch=0;f.toe=.2;f.land=.1;f.fold=.5;f.peak=.35;f.lift=.1;
   for(let i=1;i<60;i++){f.su=i/60;ch._footPose(f);assert.ok(Math.abs(f.cn.length()-1)<1e-12,'terrain interpolation supplies a unit normal to foot quaternion construction');assert.ok(f.cw.toArray().every(Number.isFinite));}
   ch.replant=true;
  });
  await t.test('idle heel pitch uses elapsed time in variable-rate previews',()=>{
   const f=ch.feet[0],results=[];ch.moving=false;f.planted=true;
   for(const hz of [30,60,120]){f.pitch=.5;ch._dt=1/hz;for(let i=0;i<hz/2;i++)ch._footPose(f);results.push(f.pitch);}
   assert.ok(Math.max(...results)-Math.min(...results)<1e-10);
  });
  await t.test('lean settles through air, fully hidden squid and invisible bodies',()=>{
   for(const action of ['air','squid','hidden']){
    ch.root.visible=true;Object.assign(state,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0}});
    for(let i=0;i<120;i++)ch.update(1/60,state);
    for(let i=0;i<12;i++){ch.root.position.z+=5.76/60;state.speed=5.76;ch.update(1/60,state);}
    assert.ok(Math.abs(api.walkLean(ch,'pitch'))>.03,'the fixture first accelerates');
    state.speed=0;if(action==='air')state.grounded=false;if(action==='squid')state.form='squid';if(action==='hidden')ch.root.visible=false;
    for(let i=0;i<120;i++)ch.update(1/60,state);
    if(action==='squid')assert.ok(ch.kidScale<=.001,'pose building was skipped for the squid');
    ch.root.visible=true;Object.assign(state,{form:'kid',grounded:true});for(let i=0;i<30;i++)ch.update(1/60,state);
    assert.ok(Math.abs(api.walkLean(ch,'pitch'))<.002,'old lean does not reappear: '+action);
   }
  });
  await t.test('air, squid, dance and return preserve finite full-body poses',()=>{
   for(const form of ['kid','squid','kid'])for(const grounded of [false,true]){
    Object.assign(state,{form,grounded,speed:2,localMove:{x:0,z:1}});
    for(let i=0;i<15;i++){ch.root.position.z+=2/60;ch.update(1/60,state);assert.ok(Array.from(ch.P).every(Number.isFinite));}
   }
   Object.assign(state,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0}});
   for(const dance of ['victory','defeat']){
    ch.setDance(dance);for(let i=0;i<60;i++){ch.update(1/60,state);assert.ok(Array.from(ch.P).every(Number.isFinite));}
    ch.setDance(null);for(let i=0;i<120;i++)ch.update(1/60,state);
    assert.ok(ch.feet.every(f=>f.planted),'dance returns to a stable stance');assert.ok(ch.hipDrop<.10);
   }
   for(let i=0;i<60;i++){ch.root.position.z+=1.5/60;Object.assign(state,{speed:1.5,localMove:{x:0,z:1}});ch.update(1/60,state);}
   assert.equal(ch.moving,true,'walking resumes after the real dance pose');
   const before=ch.root.position.clone();ch.update(1/60,state);assert.ok(ch.root.position.equals(before),'animation never changes gameplay position');
  });
 }finally{ch.dispose();}
});
