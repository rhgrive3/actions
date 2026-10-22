import test from 'node:test';
import assert from 'node:assert/strict';
import {installWeaponGates} from '../runtime/weapon-gates.mjs';
function fixture(read){
 class Actor{update(){}}
 class WeaponRunner{constructor(){this.a={intent:{fire:true}};}reset(){}busy(){return false;}update(dt,input){return read?.call(this,input,dt);} _charger(){}tryDodge(){} _dualies(){}}
 class Projectiles{_new(){return{};} _push(){}}
 installWeaponGates({Actor,WeaponRunner,Projectiles});return new WeaponRunner();
}
const descriptors=x=>Object.getOwnPropertyDescriptors(x);
function baseline(r,input,subBlocked){return {...input,get fire(){return r.s3BlasterCancelLatch?false:input.fire;},get firePressed(){return r.s3BlasterCancelLatch?false:input.firePressed;},get sub(){return subBlocked?false:input.sub;},get subReleased(){return subBlocked?false:input.subReleased;}};}
test('gated ticks preserve fresh snapshots, enumeration, descriptors and late getters while reusing closures',()=>{
 const seen=[],r=fixture(input=>{seen.push(input);return input;});r.s3PostShotRemaining=10;
 const symbol=Symbol('extra'),input={extra:1,sub:true,fire:true,firePressed:true,subReleased:true,[symbol]:2};
 const first=r.update(0,input),second=r.update(0,input),expected=baseline(r,input,true);
 assert.notEqual(first,second);assert.deepEqual(Reflect.ownKeys(first),Reflect.ownKeys(expected));
 for(const key of ['fire','firePressed','sub','subReleased']){
  const a=descriptors(first)[key],b=descriptors(second)[key],c=descriptors(expected)[key];
  assert.equal(a.get,b.get,'steady native input reuses getter closures');assert.equal(a.get.name,c.get.name);
  assert.equal(a.enumerable,c.enumerable);assert.equal(a.configurable,c.configurable);assert.equal(a.set,c.set);
  assert.equal(a.get.call({}),c.get.call({}),'getters capture inputs and ignore arbitrary this');
 }
 input.extra=7;input[symbol]=8;input.fire=false;
 assert.equal(first.extra,1);assert.equal(first[symbol],2);assert.equal(first.fire,false);
 r.s3BlasterCancelLatch=true;input.fire=true;assert.equal(first.fire,false);assert.equal(second.firePressed,false);
 r.s3BlasterCancelLatch=false;assert.equal(first.fire,true);assert.equal(first.sub,false);
});
test('spread lazy reads, extra fields and nested gate modes retain exact source semantics',()=>{
 const reads=[],input={get extra(){reads.push('extra');return reads.length;},get fire(){reads.push('fire');return true;},get firePressed(){reads.push('firePressed');return false;},get sub(){reads.push('sub');return true;},get subReleased(){reads.push('subReleased');return false;}};
 let nested=false,outer;
 const r=fixture(function(admitted){if(!nested){outer=admitted;nested=true;this.s3PostShotRemaining=0;this.s3BlasterCancelLatch=true;this.update(0,input);assert.equal(outer.sub,false,'outer captured subBlocked survives nested mode');}return admitted;});
 r.s3PostShotRemaining=1;r.update(0,input);
 assert.deepEqual(reads,['extra','fire','firePressed','sub','subReleased','extra','fire','firePressed','sub','subReleased']);
 assert.equal(outer.extra,1);assert.equal(outer.fire,false);
});
test('input/runner identities are isolated, changed extras get fresh snapshots, and exceptions do not poison cache',()=>{
 const r=fixture(input=>input),other=fixture(input=>input);r.s3PostShotRemaining=other.s3PostShotRemaining=1;
 const a={fire:true,sub:true},b={fire:false,sub:false};
 const x=r.update(0,a),y=r.update(0,b),z=other.update(0,a);
 assert.notEqual(descriptors(x).fire.get,descriptors(y).fire.get);assert.notEqual(descriptors(x).fire.get,descriptors(z).fire.get);
 a.extra='new';const next=r.update(0,a);assert.equal(x.extra,undefined);assert.equal(next.extra,'new');
 const throwing={get fire(){throw Error('input failed');}};assert.throws(()=>r.update(0,throwing),/input failed/);assert.equal(r.update(0,a).fire,true);
});
