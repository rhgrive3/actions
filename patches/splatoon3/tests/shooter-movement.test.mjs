import test from 'node:test';
import assert from 'node:assert/strict';
import {shooterMovementRemaining,shooterMovementSpeed} from '../runtime/shooter-movement.mjs';
test('4F movement gate independent of 0.35s visual pose',()=>{
 let t=4/60;
 for(let f=0;f<4;f++){
   assert.equal(shooterMovementSpeed(t,5.76,4.32),4.32);
   t=shooterMovementRemaining(t,1/60);
 }
 assert.equal(shooterMovementSpeed(t,5.76,4.32),5.76);
});
