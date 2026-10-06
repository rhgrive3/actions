import { blockExpiredGuestInput } from '../../splatoon3/runtime/turf-finish.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import {fileURLToPath} from 'node:url';
import {fixture} from './controls-fixture.mjs';
import{adaptSource}from'../../splatoon3/adapter.mjs';import{adaptTouchLayout}from'../../touch-layout/adapter.mjs';import{adaptReliability}from'../adapter.mjs';import{adaptQualitySource}from'../../local-quality/adapter.mjs';
const dir=fileURLToPath(new URL('../../../',import.meta.url)),DT=1/60;
const source=r=>adaptQualitySource(r,adaptReliability(r,adaptTouchLayout(r,adaptSource(r,fs.readFileSync(dir+'inkwave-public/'+r,'utf8')))));
const part=(s,a,b)=>{const i=s.indexOf(a),j=s.indexOf(b,i);assert.ok(i>=0&&j>i);return s.slice(i,j);};
const makePad=(id,axes)=>({id,index:0,connected:true,mapping:'standard',axes,buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
async function run(prime){
 const f=await fixture(),input=new f.Input({}),a=f.make(),ally=f.make(),camera={yaw:.4,pitch:.2},c=new f.PlayerController(a,camera,input);c.computeAim=()=>{};a.alive=false;
 const M=vm.runInNewContext(`class M{${part(source('src/game/match.js'),'  updateController(dt) {','\n  _judge() {')}};M`,{blockExpiredGuestInput});
 const match={state:'playing',paused:false,attract:false,local:a,controller:c};f.G.match=match;f.G.actors=[a,ally];f.G.input=input;f.G.level.spawnPads=[new f.THREE.Vector3()];
 input.lastDevice='kbm';input.keys.add('Tab');M.prototype.updateController.call(match,DT);
 f.setPads([makePad('previous',[0,0,0,0])]);input.pollPad();f.setPads([]);input.pollPad();
 const pad=makePad('respawn-intent',[.9,-.5,.8,.7]);f.setPads([pad]);input.pollPad();const initial={device:input.lastDevice,blocked:input._padTakeoverAxes};
 if(prime){pad.axes=[0,0,0,0];input.pollPad();pad.axes=[.9,-.5,.8,.7];input.pollPad();}
 f.event('pointerdown',{pointerType:'touch',pointerId:7});
 const D=vm.runInNewContext(`class D{${part(source('src/ui/diorama.js'),'  _jump(i, me) {','\n  _flash(')}};D`,{G:f.G});const d=Object.assign(new D(),{on:true,k:1,pins:[{target:ally}],_flash(){}});d._jump(0,a);
 assert.equal(c.pendingRespawnJump?.actor,ally,'real native pin queues the target');for(let i=0;i<120;i++){input.pollPad();M.prototype.updateController.call(match,DT);}
 const result={initial,pending:c.pendingRespawnJump?.actor===ally,device:input.lastDevice,navigation:input.navigationDevice};
 pad.buttons[0]={pressed:true,value:1};input.pollPad();M.prototype.updateController.call(match,DT);result.freshCancels=!c.pendingRespawnJump;
 return result;
}
test('old verifier held reconnect preserves reservation but cannot claim a fresh pad owner',async()=>{const r=await run(false);assert.equal(r.initial.blocked,true);assert.equal(r.pending,true);assert.equal(r.device,'touch');assert.equal(r.navigation,'touch');assert.equal(r.freshCancels,true);});
test('neutral then fresh axes establishes the owner, held polls preserve native touch intent and a fresh pad cancels',async()=>{const r=await run(true);assert.equal(r.initial.blocked,true);assert.equal(r.pending,true);assert.equal(r.device,'pad');assert.equal(r.navigation,'touch');assert.equal(r.freshCancels,true);});
