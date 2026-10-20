import test from 'node:test';import assert from 'node:assert/strict';
import {fidelityThrowVelocity} from '../runtime/sub-special-fidelity.mjs';
import {ALL_SUB_SPECS} from '../runtime/all-subs.mjs';import {gearCurve} from '../runtime/gear.mjs';
import {stepGroundVelocity} from '../runtime/movement-physics.mjs';import {rollLaunchSpeed} from '../runtime/movement.mjs';
import {anyAimEnvelope,classifyAnyAim,minimumActorSpeed} from '../../network-replication/torpedo-launch-set.mjs';
const spec=ALL_SUB_SPECS.torpedo;
function launch(v,p,y,ap){const speed=gearCurve(ap,84,99,114);return {speed,velocity:fidelityThrowVelocity({vel:v,aimPitch:p,aimYaw:y},'bomb',{set(x,y,z){return {x,y,z};}},speed,spec)};}
test('arbitrary aim and actor motion fit parameterized necessary set without snapshot equality',()=>{
 let seed=717;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 // H values are test domains, explicitly not alleged production actor caps.
 for(const H of [0,6,11.8,30,100])for(let i=0;i<1000;i++){
 const yaw=rand()*Math.PI*2,hs=rand()*H,v={x:Math.sin(yaw)*hs,z:Math.cos(yaw)*hs,y:rand()*200-100};
 const {speed,velocity}=launch(v,rand()*4-2,rand()*Math.PI*2,i%58);
 assert.equal(classifyAnyAim(velocity,spec,speed,H),'compatible-not-authorized');
 const rounded=Object.fromEntries(Object.entries(velocity).map(([k,x])=>[k,Math.round(x*100)/100]));
 assert.equal(classifyAnyAim(rounded,spec,speed,H),'compatible-not-authorized');
 assert.equal(classifyAnyAim({x:700,y:0,z:0},spec,speed,H),'outside-bounded-native-set');
 }
});
test('vertical700 is impossible regardless of horizontal inheritance; horizontal700 requires huge actor momentum',()=>{
 const e=anyAimEnvelope(spec,114,0);assert.ok(e.yMax<130);
 assert.equal(classifyAnyAim({x:0,y:700,z:0},spec,114,10000),'outside-bounded-native-set');
 const required=minimumActorSpeed({x:700,y:0,z:0},spec,114);assert.ok(required>365 && required<366);
 console.log(JSON.stringify({maxGearEnvelope:e,horizontal700MinimumActorSpeed:required}));
});
test('native overspeed decay and roll retention do not establish a global actor cap',()=>{
 const v={x:400,y:0,z:0};stepGroundVelocity(v,1,0,11.8,36,1/60);assert.equal(v.x,399.4);
 assert.equal(rollLaunchSpeed(400,0,.8,0),400);
 const {velocity}=launch({x:400,y:0,z:0},0,Math.PI/2,57);assert.ok(velocity.x>700);
 // This is a formula/overspeed witness, NOT evidence that honest play reaches400.
 console.log(JSON.stringify({overspeedAfterNativeStep:v.x,nativeLaunchFromOverspeed:velocity}));
});
test('missing independently established actor cap stays indeterminate, never authorized',()=>{
 assert.equal(classifyAnyAim({x:84,y:14.4,z:0},spec,84,undefined),'indeterminate');
});

test('independent bounding box cannot admit impossible pitch-correlated velocity',()=>{assert.equal(classifyAnyAim({x:84,y:90,z:0},spec,84,0),'outside-bounded-native-set');});
