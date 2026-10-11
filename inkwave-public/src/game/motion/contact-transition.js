import * as THREE from 'three';
import {clamp} from './source-bank.js';
/** Finite-duration inertial offset in world space. A plant/release changes the
 * destination, not the visible position or velocity. No frame-count smoothing.
 * Quintic Hermite basis: p(0)=p0, p'(0)=v0, p''(0)=0, p(T)=p'(T)=p''(T)=0.
 * These transition durations are host settings, not source animation keys. */
export class ContactTransition {
 constructor(){this.position=new THREE.Vector3();this.velocity=new THREE.Vector3();this.offset=new THREE.Vector3();this.offsetVelocity=new THREE.Vector3();this.age=99;this.duration=.1;this.ready=false;}
 reset(){this.ready=false;this.offset.set(0,0,0);this.offsetVelocity.set(0,0,0);this.velocity.set(0,0,0);this.age=99;}
 advance(goal,velocity,dt){
  if(!this.ready){this.position.copy(goal);this.velocity.copy(velocity);this.ready=true;return;}
  this.age+=Math.max(0,dt);
  const u=clamp(this.age/this.duration,0,1),u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
  const a=1-10*u3+15*u4-6*u5,b=this.duration*(u-6*u3+8*u4-3*u5);
  const da=(-30*u2+60*u3-30*u4)/this.duration,db=1-18*u2+32*u3-15*u4;
  this.position.copy(goal).addScaledVector(this.offset,a).addScaledVector(this.offsetVelocity,b);
  this.velocity.copy(velocity).addScaledVector(this.offset,da).addScaledVector(this.offsetVelocity,db);
 }
 transition(goal,velocity,seconds){
  this.offset.subVectors(this.position,goal);this.offsetVelocity.subVectors(this.velocity,velocity);
  this.age=0;this.duration=Math.max(1e-4,seconds);
 }
}