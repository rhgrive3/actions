import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';
const f=await fixture({fullRuntime:true,productionComposition:true,includeCharacter:true,vmMathRandom:()=>.5,extraExports:`export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`});
const {G,THREE}=f;
for(const weapon of ['shooter','roller','dualies'])test(weapon+' final pose and actual two-hand grip through charge, recovery, interruption, drop',()=>{
 const a=new f.Actor({team:0,weapon,isLocal:true,CharacterClass:f.Character,style:{hair:0,skin:2,outfit:0,eyes:0}}),ch=a.character;
 a.nid='carrier';ch.actor=a;ch.onEvent=null;a.form='kid';a.kidT=10;a.grounded=a.ground.hit=true;a.pos.set(0,0,0);a.vel.set(0,0,0);
 G.scene=new THREE.Scene();G.camera=new THREE.PerspectiveCamera();G.actors=[a];G.scene.add(ch.root);G.time=0;
 const state={carrier:null,charge:{value:0}},match={mode:'rainmaker',ranked:{rule:{state}},playing:()=>true};G.match=match;
 const mesh=f.createRainmakerModel(THREE);G.scene.add(mesh);const display=f.createRainmakerPresentation(THREE,mesh);
 const originalSolve=ch._solveLimb;let solves=0;ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)solves++;return originalSolve.call(this,limb,...args);};
 const hand=new THREE.Vector3(),grip=new THREE.Vector3(),left=new THREE.Vector3(),target=new THREE.Vector3();let maxLeft=0,maxRight=0,maxSolves=0,maxRightReach=0;
 const step=()=>{solves=0;G.time+=1/60;a._finishFrame(1/60);display.update(state.carrier?a:null,state.charge.value);G.scene.updateMatrixWorld(true);if(ch._rainmakerPose)maxRightReach=Math.max(maxRightReach,ch.ikErr[1]);};
 try{
  for(let i=0;i<60;i++)step();
  assert.equal(Object.hasOwn(ch,'_rainmakerPose'),false,'noncarrier receives no rainmaker state allocation');
  for(let round=0;round<2;round++){
   state.carrier='carrier';
   for(let i=0;i<121;i++){
    state.charge=i<61?{value:i/60,firing:true}:i===61?{value:0,pending:{charge:1}}:{value:0,recovery:Math.max(0,(82-i)/60)};
    a.aimPitch=.1*Math.sin(i*.04);a.aimDir.set(0,Math.sin(a.aimPitch),Math.cos(a.aimPitch));
    if(i===10){ch.trigger(weapon==='roller'?'flick':'throw');}
    step();maxSolves=Math.max(maxSolves,solves);
    ch.weapon.pivot.getWorldPosition(hand);mesh.getWorldPosition(grip);maxRight=Math.max(maxRight,hand.distanceTo(grip));
    left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);
    target.set(0,0,.07);mesh.localToWorld(target);if(ch._rainmakerPose && left.distanceTo(target)>maxLeft){maxLeft=left.distanceTo(target);if(maxLeft>.02)console.log(JSON.stringify({weapon,err:maxLeft,pitch:a.aimPitch,form:a.form,kidScale:ch.kidScale,scale:ch.kid.scale.toArray()}));}
    assert.equal(ch._rainmakerPose,true);assert.equal(ch.P[f.CHARACTER_CHANNELS.LTW],0);assert.equal(solves,1,'one replacement left-arm solve');
   }
   for(const pitch of [-1.05,1.15]){a.aimPitch=pitch;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));for(let i=0;i<8;i++){
    step();left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);target.set(0,0,.07);mesh.localToWorld(target);if(ch._rainmakerPose && left.distanceTo(target)>maxLeft){maxLeft=left.distanceTo(target);if(maxLeft>.02)console.log(JSON.stringify({weapon,err:maxLeft,pitch:a.aimPitch,form:a.form,kidScale:ch.kidScale,scale:ch.kid.scale.toArray()}));}assert.equal(solves,1);
   }}
   a.aimPitch=0;a.aimDir.set(0,0,1);a.grounded=a.ground.hit=false;a.vel.set(0,2,0);for(let i=0;i<8;i++)step();a.grounded=a.ground.hit=true;a.vel.set(0,0,0);
   a.form='squid';for(let i=0;i<12;i++)step();assert.equal(ch._rainmakerPose,false);a.form='kid';for(let i=0;i<18;i++){
    step();left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);target.set(0,0,.07);mesh.localToWorld(target);if(ch._rainmakerPose && left.distanceTo(target)>maxLeft){maxLeft=left.distanceTo(target);if(maxLeft>.02)console.log(JSON.stringify({weapon,err:maxLeft,pitch:a.aimPitch,form:a.form,kidScale:ch.kidScale,scale:ch.kid.scale.toArray()}));}
   }
   state.carrier=null;step();assert.equal(ch._rainmakerPose,false);assert.equal(ch.weapon.pivot.visible,true);
   a.alive=false;state.carrier='carrier';step();assert.equal(ch._rainmakerPose,false);a.alive=true;state.carrier=null;step();
  }
  console.log(JSON.stringify({weapon,maxRight,maxLeft,maxSolves,maxRightReach}));assert(maxRight<1e-6);assert(maxLeft<.001,'support grip remains within .001 world units');assert(maxRightReach<.001,'native primary wrist remains reachable');
 }finally{display.release();mesh.geometry.dispose();mesh.material.dispose();ch.dispose();G.actors=[];G.match=null;}
});

// Await the real gzip source bank in the production-composed loader, not a
// sourceMotion flag stub. The source/native ownership choice remains the production policy.
test('loaded source motion, both teams: grip, reach, form boundary and source ownership restoration',async()=>{
 const {sourceLoadedActorFixture}=await import('./source-loaded-actor-fixture.mjs');
 const sf=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`}),{G,THREE,createRainmakerModel,createRainmakerPresentation}=sf,rows=[];
 for(const weapon of ['shooter','roller','dualies'])for(const team of [0,1]){
  const a=await sf.make(team),ch=a.character;a.setWeapon(weapon);ch.onEvent=null;
  const state={carrier:null,charge:{value:0}},match={mode:'rainmaker',ranked:{rule:{state}},playing:()=>true,canRespawn:()=>false};G.match=match;
  const mesh=createRainmakerModel(THREE);G.scene.add(mesh);const display=createRainmakerPresentation(THREE,mesh);
  const original=ch._solveLimb;let solves=0,maxReach=0,maxError=0;ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)solves++;const r=original.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose)maxReach=Math.max(maxReach,this.ikErr[0]);return r;};
  const left=new THREE.Vector3(),target=new THREE.Vector3();
  const step=()=>{solves=0;G.time+=1/60;a._finishFrame(1/60);display.update(state.carrier?a:null,state.charge.value);G.scene.updateMatrixWorld(true);
   if(ch._rainmakerPose){left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);target.set(0,0,.07);mesh.localToWorld(target);if(left.distanceTo(target)>maxError){maxError=left.distanceTo(target);if(maxError>.01)console.log(JSON.stringify({sourceDiagnostic:true,weapon,team,error:maxError,reach:maxReach,kidScale:ch.kidScale,aim:a.aimPitch,phase:ch.sourceMotion?.state}));}assert.equal(solves,1);}
  };
  try{
   for(let i=0;i<60;i++)step();const upper=ch.sourceMotion.sourceUpper,keep=ch.sourceMotion.keepSourceArms,constrain=ch.sourceMotion.constrainLeft;
   state.carrier=String(a.nid);
   for(let i=0;i<90;i++){state.charge={value:i<60?i/60:0,recovery:i>=60?Math.max(0,(80-i)/60):0};step();}
   assert.equal(ch._rainmakerPose,true);if(ch.sourceMotion.active)assert.equal(ch.sourceMotion.sourceUpper,false);
   for(const pitch of [-1.05,1.15]){a.aimPitch=pitch;a.aimDir.set(0,Math.sin(pitch),Math.cos(pitch));for(let i=0;i<8;i++)step();}
   a.aimPitch=0;a.aimDir.set(0,0,1);a.form='squid';for(let i=0;i<12;i++)step();a.form='kid';for(let i=0;i<30;i++)step();
   ch.sourceMotion.setEnabled(false);for(let i=0;i<12;i++)step();ch.sourceMotion.setEnabled(true);for(let i=0;i<30;i++)step();
   state.carrier=null;for(let i=0;i<60;i++)step();assert.equal(ch._rainmakerPose,false);assert.equal(ch.sourceMotion.sourceUpper,upper);assert.equal(ch.sourceMotion.keepSourceArms,keep);assert.equal(ch.sourceMotion.constrainLeft,constrain);assert.equal(ch.weapon.pivot.visible,true);assert.equal(mesh.scale.x,1);
   rows.push({weapon,team,sourceActive:ch.sourceMotion.active,weaponKind:ch.weaponKind,maxError,maxReach});
   assert(maxError<.001,`${weapon}/${team} source support ${maxError}`);assert(maxReach<.001,`${weapon}/${team} source overreach ${maxReach}`);
  }finally{display.release();G.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();sf.reset();}
 }
 console.log(JSON.stringify({loadedSource:rows}));
});

test('one catalogue representative of every family: native/source carry, charge, recoil and full aim range',async()=>{
 const {sourceLoadedActorFixture}=await import('./source-loaded-actor-fixture.mjs');
 const sf=await sourceLoadedActorFixture({random:()=>.5,extraExports:`export {MAIN_WEAPON_CATALOG} from './patches/splatoon3/runtime/main-weapon-catalog-data.mjs';export {createRainmakerModel,createRainmakerPresentation} from './patches/splatoon3/runtime/ranked/rainmaker-model.mjs';`}),{G,THREE}=sf,rows=[];
 const representatives=[...new Set(sf.MAIN_WEAPON_CATALOG.records.map(r=>r.family))].map(family=>sf.MAIN_WEAPON_CATALOG.records.find(r=>r.family===family));
 assert.equal(representatives.length,11);
 for(const [index,record]of representatives.entries()){
  const a=await sf.make(index%2),ch=a.character;a.setWeapon(record.id);ch.onEvent=null;
  const state={carrier:String(a.nid),charge:{value:0}};G.match={mode:'rainmaker',ranked:{rule:{state}},playing:()=>true,canRespawn:()=>false};
  const mesh=sf.createRainmakerModel(THREE);G.scene.add(mesh);const display=sf.createRainmakerPresentation(THREE,mesh),left=new THREE.Vector3(),target=new THREE.Vector3();
  const shoulder=new THREE.Vector3(),elbow=new THREE.Vector3(),wristLine=new THREE.Vector3(),pole=new THREE.Vector3();
  let leftSolves=0,maxReach=0,minElbowPlane=Infinity;const solve=ch._solveLimb;ch._solveLimb=function(limb,...args){if(limb===this.limbs.armL)leftSolves++;const result=solve.call(this,limb,...args);if(limb===this.limbs.armL&&this._rainmakerPose)maxReach=Math.max(maxReach,this.ikErr[0]);return result;};
  try{
   for(const source of [false,true]){
    ch.sourceMotion.setEnabled(source);let maxGrip=0,maxRightReach=0;maxReach=0;
    for(const phase of ['carry','charge','recoil'])for(const pitch of [-1.05,0,1.15]){
     state.charge={value:phase==='charge'?1:0,recovery:phase==='recoil'?20/60:0};a.yaw=a.aimYaw=index%2*Math.PI;a.aimPitch=pitch;a.aimDir.set(Math.sin(a.yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(a.yaw)*Math.cos(pitch));
     for(let i=0;i<12;i++){
      leftSolves=0;G.time+=1/60;a._finishFrame(1/60);display.update(a,state.charge.value);G.scene.updateMatrixWorld(true);
      assert.equal(ch._rainmakerPose,true);assert.equal(leftSolves,1);maxRightReach=Math.max(maxRightReach,ch.ikErr[1]);
      left.copy(ch.weapon.pivot.position);left.x=-left.x;ch.bones.handL.localToWorld(left);target.set(0,0,.07);mesh.localToWorld(target);maxGrip=Math.max(maxGrip,left.distanceTo(target));
      for(const side of ['L','R']){ch.bones['uArm'+side].getWorldPosition(shoulder);ch.kid.worldToLocal(shoulder);ch.bones['fArm'+side].getWorldPosition(elbow);ch.kid.worldToLocal(elbow);ch.bones['hand'+side].getWorldPosition(wristLine);ch.kid.worldToLocal(wristLine);wristLine.sub(shoulder).normalize();elbow.sub(shoulder);elbow.addScaledVector(wristLine,-elbow.dot(wristLine));const c=sf.CHARACTER_CHANNELS[side==='L'?'POLEL':'POLER'];pole.set(ch.P[c],ch.P[c+1],ch.P[c+2]);minElbowPlane=Math.min(minElbowPlane,elbow.dot(pole));}
     }
    }
    const row={family:record.family,id:record.id,actualModel:ch.weaponModel,team:a.team,source,sourceActive:ch.sourceMotion.active,maxGrip,maxReach,maxRightReach,minElbowPlane};rows.push(row);console.log(JSON.stringify({familyGrip:row}));
    assert.equal(ch.weaponModel,record.id);
   }
  }finally{display.release();G.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();sf.reset();}
 }
 assert.equal(rows.length,22);assert(rows.every(r=>r.maxGrip<.001&&r.maxReach<.001&&r.maxRightReach<.001&&r.minElbowPlane>=-1e-8),JSON.stringify(rows.filter(r=>r.maxGrip>=.001||r.maxReach>=.001||r.maxRightReach>=.001||r.minElbowPlane< -1e-8)));
});
