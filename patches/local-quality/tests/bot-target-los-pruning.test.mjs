import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if (!vm.SourceTextModule) {
 test('bot perception LOS runtime fixture subprocess',()=>{
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});
 });
} else {
 class Vec {
  constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}
  copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}
  distanceTo(v){return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z);}
 }
 const G={actors:[],physics:null},context=vm.createContext({console});
 const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){
  for(const [k,v] of Object.entries(values))this.setExport(k,v);
 },{context});
 const imports={
  three:synthetic({Vector3:Vec}),
  '../core/ctx.js':synthetic({G,clamp:(x,a,b)=>Math.min(b,Math.max(a,x)),angleDiff:(a,b)=>a-b}),
  '../config.js':synthetic({PLAYER:{},DIFFICULTY:{},SUB:{}})
 };
 const src=fs.readFileSync(new URL('../../../inkwave-public/src/game/bots.js',import.meta.url),'utf8');
 const mod=new vm.SourceTextModule(src,{context});
 await mod.link(path=>{assert(imports[path],path);return imports[path];});await mod.evaluate();
 const BotBrain=mod.namespace.BotBrain;
 const actor=(team,x,{alive=true,form='kid',speed=0}={})=>({
  team,alive,pos:new Vec(x,0,0),vel:new Vec(speed,0,0),anim:{form},form
 });
 const make=(target=null)=>Object.assign(Object.create(BotBrain.prototype),{
  a:actor(0,0),diff:{awareness:20,reaction:.25},target,react:0,seeTimer:0,
  lostTimer:0,repath:10,acqT:10,acqSignY:0,acqSignP:0
 });
 const probe=(friends,blocked=[])=>{
  let rays=0;G.actors=friends;G.physics={los(_a,b){rays++;return !blocked.includes(b.x);}};
  return ()=>rays;
 };
 test('after a visible nearer candidate, a worse enemy does not consume a LOS ray',()=>{
  const close=actor(1,2),far=actor(1,8),brain=make(),calls=probe([close,far]);
  brain._perceive();assert.equal(brain.target,close);assert.equal(calls(),1);
  assert.equal(brain.seeTimer,1.2);assert.equal(brain.lostTimer,0);
 });
 test('occluded nearer enemy cannot suppress a later visible target',()=>{
  const hidden=actor(1,2),visible=actor(1,4),brain=make(),calls=probe([hidden,visible],[2]);
  brain._perceive();assert.equal(brain.target,visible);assert.equal(calls(),2);
 });
 test('retained target keeps the original score -4 hysteresis before pruning',()=>{
  const old=actor(1,4),newer=actor(1,2),brain=make(old),calls=probe([old,newer]);
  brain.react=.3;brain._perceive();
  assert.equal(brain.target,old);assert.equal(calls(),1);
  assert.ok(Math.abs(brain.react-.1)<1e-12);
 });
 test('equal-score rivals retain first-visible tie break without a second raycast',()=>{
  const first=actor(1,4),second=actor(1,-4),brain=make(),calls=probe([first,second]);
  brain._perceive();assert.equal(brain.target,first);assert.equal(calls(),1);
 });
 test('awareness, teammate, death and swimming filters remain before any raycast',()=>{
  const brain=make(),calls=probe([
   actor(0,2),actor(1,2,{alive:false}),actor(1,30),
   actor(1,10,{form:'swim',speed:0})
  ]);
  brain._perceive();assert.equal(calls(),0);
  assert.equal(brain.target,null);assert.equal(brain.seeTimer,-.2);
 });
}
