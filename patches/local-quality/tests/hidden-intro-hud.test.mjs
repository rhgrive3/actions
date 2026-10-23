import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';import {mobileHudSnapshot,hudFrameSnapshot} from '../hud-snapshots.mjs';
const root=new URL('../../../',import.meta.url);
function method(rel,name,next,globals){const text=adaptBuildSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8')),a=text.indexOf('  '+name+'('),b=text.indexOf('\n  '+next+'(',a);return vm.runInNewContext('({'+text.slice(a,b)+'\n})',globals)[name];}
test('hidden intro keeps touch scalar feedback and independent HUD clocks while skipping projection/minimap/team paint',()=>{
 let updates=0,mobiles=0,full=0;const PLAYER={inkMax:100,hp:100},a={weapon:{kind:'shooter',special:'storm'},weaponRunner:{},ink:30,hp:80,specialFrac:()=>.4,specialReady:()=>false,specialActive:false};
 const update=method('src/main.js','_updateHud','_onDevice',{G:{camera:{}},PLAYER,SUB:{},selectedSubCost:()=>50,mobileHudSnapshot});
 const game={match:{state:'intro',local:a,teamSummary(){throw Error('hidden roster');}},settings:{showFps:true},fps:60,_hintT:0,_lowInkFlash:1,hud:{_visible:false,updateHiddenIntro(dt,fps){updates++;assert.equal(fps,60);},update(){full++;}},input:{mobile:{setHud(m){mobiles++;assert.equal(m.ink,.3);assert.equal(m.subReady,false);assert.equal(m.inkLow,true);assert.equal(m.special,.4);}}},minimap:{update(){throw Error('hidden minimap');}}};
 for(let i=0;i<360;i++)update.call(game,1/120);assert.equal(updates,360);assert.equal(mobiles,360);assert.equal(full,0);assert.ok(Math.abs(game._hintT-3)<1e-10);
 const hudUpdate=method('src/ui/hud.js','updateHiddenIntro','update',{G:{match:game.match},tr:x=>x,flushTeamWipeHud(){updates++;}});
 const called=[];const hud={_t:0,boss:{update:dt=>called.push(['boss',dt])},_updDamageDirs:dt=>called.push(['damage',dt]),_updDowns:dt=>called.push(['downs',dt]),_updFps:(fps,dt)=>called.push(['fps',fps,dt])};hudUpdate.call(hud,.1,30);assert.equal(hud._t,.1);assert.deepEqual(called,[['damage',.1],['downs',.1],['fps',30,.1],['boss',.1]]);
});
test('hidden and visible scalar transports use identical field owners and identities',()=>{
 const game={_lowInkFlash:0,settings:{},minimap:{}},a={ink:55,hp:70,weaponId:'shooter',weaponRunner:{charge:0},specialFrac:()=>.7,specialReady:()=>true,specialActive:false},w={kind:'shooter',special:'storm'},P={inkMax:100,hp:100},m={time:1,teamSummary:()=>[]};
 const mobile=mobileHudSnapshot(game,a,w,P,40),expected={...mobile};hudFrameSnapshot(game,m,a,w,2,[],[],null,false,P,{},40,null,null,null,null,null);
 assert.equal(game._hudTransport.mobile,mobile);assert.deepEqual(mobile,expected);
});
