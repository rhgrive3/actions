import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {adaptGearSub} from '../../splatoon3/gear-sub-adapter.mjs';
import {adaptHudSnapshots} from '../hud-snapshots-adapter.mjs';
import {hudFrameSnapshot} from '../hud-snapshots.mjs';
import {subInkSpec} from '../../splatoon3/runtime/sub-ready.mjs';

const rel='src/main.js';
const raw=fs.readFileSync(process.env.INKWAVE_MAIN_SOURCE || new URL('../../../inkwave-public/src/main.js', import.meta.url),'utf8');
function once(code,before,after,label){
 const at=code.indexOf(before);
 if(at<0||code.indexOf(before,at+before.length)>=0)throw Error(label+': expected exactly one connection');
 return code.slice(0,at)+after+code.slice(at+before.length);
}
const gear=s=>adaptGearSub(rel,s,once),snap=s=>adaptHudSnapshots(rel,s,once);
// Negative controls retain the published bf307275 Main branches/helper verbatim.
// Non-Main adapter branches are irrelevant to this connection and omitted.
function originalGearSub(rel,code,replace){
 const patch=(before,after,label)=>{code=replace(code,before,after,'gear/sub: '+label);};
 if(rel==='src/main.js'){
  patch('    const frame = {\n      time: m.time,', '    const subCost = subInkSpec(a, SUB.bomb).inkCost;\n    const frame = {\n      time: m.time,','equipped HUD sub cost');
  patch('subCost: SUB.bomb.inkCost / PLAYER.inkMax,', 'subCost: subCost / PLAYER.inkMax, subReady: a.ink >= subCost,','raw admission and normalized mark');
  patch('ink: frame.ink, subCost: frame.subCost });', 'ink: frame.ink, subCost: frame.subCost, subReady: frame.subReady });','same readiness for mobile');
  return "import { subInkSpec } from '../patches/splatoon3/runtime/sub-ready.mjs';\n"+code;
 }
 return code;
}
function originalHudSnapshots(rel, code, once) {
  if (rel === 'src/main.js') {
    code = once(code, "    const frame = {\n      time: m.time,\n      teams: a.team === 1 ? m.teamSummary().reverse() : m.teamSummary(),   // HUD: [your team, theirs]\n      ink: a.ink / PLAYER.inkMax, inkLow: a.ink < 18 || (this._lowInkFlash > 0), subCost: SUB.bomb.inkCost / PLAYER.inkMax,\n      special: a.specialFrac(), specialReady: a.specialReady(), specialActive: !!a.specialActive,\n      hp: a.hp / PLAYER.hp,\n      weapon: a.weaponId, charge: a.weaponRunner.charge,\n      crosshair: { spread, onTarget: m.controller?.onTarget ? 'enemy' : null, inRange: m.controller ? m.controller.inRange !== false : true },\n      // corner minimap follows the setting; the TAB map (needed for super jumps) is always available\n      map: showMinimap ? { canvas: this.minimap.canvas, expanded: false, players } : null,\n      markers,\n      prompt,\n      fps: this.settings.showFps ? this.fps : undefined,\n    };", '    const frame = hudFrameSnapshot(this, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB);', 'persistent Game HUD frame');
    code = once(code, "    this.input.mobile?.setHud({ special: frame.special, ready: frame.specialReady, activeSp: frame.specialActive, weapon: w.kind || a.weaponId, specialId: w.special, ink: frame.ink, subCost: frame.subCost });", '    this.input.mobile?.setHud(this._hudTransport.mobile);', 'persistent touch HUD frame');
    return "import { hudFrameSnapshot } from '../patches/local-quality/hud-snapshots.mjs';\n" + code;
  }
  return code;
}
function originalHudFrameSnapshot(game, m, a, w, spread, players, markers, prompt, showMinimap, PLAYER, SUB) {
  let cache = game._hudTransport;
  if (!cache) cache = game._hudTransport = { frame: {}, crosshair: {}, map: {}, mobile: {} };
  const frame = cache.frame, crosshair = cache.crosshair, map = cache.map;
  frame.time = m.time; frame.teams = m.teamSummary(a.team);
  frame.ink = a.ink / PLAYER.inkMax; frame.inkLow = a.ink < 18 || game._lowInkFlash > 0; frame.subCost = SUB.bomb.inkCost / PLAYER.inkMax;
  frame.special = a.specialFrac(); frame.specialReady = a.specialReady(); frame.specialActive = !!a.specialActive;
  frame.hp = a.hp / PLAYER.hp; frame.weapon = a.weaponId; frame.charge = a.weaponRunner.charge;
  crosshair.spread = spread; crosshair.onTarget = m.controller?.onTarget ? 'enemy' : null; crosshair.inRange = m.controller ? m.controller.inRange !== false : true;
  frame.crosshair = crosshair;
  map.canvas = showMinimap ? game.minimap.canvas : null; map.expanded = false; map.players = players;
  frame.map = showMinimap ? map : null; frame.markers = markers; frame.prompt = prompt; frame.fps = game.settings.showFps ? game.fps : undefined;
  const mobile = cache.mobile;
  mobile.special = frame.special; mobile.ready = frame.specialReady; mobile.activeSp = frame.specialActive; mobile.weapon = w.kind || a.weaponId;
  mobile.specialId = w.special; mobile.ink = frame.ink; mobile.subCost = frame.subCost;
  return frame;
}
const guideExpr='projectShotGuide(m.controller?.enabled && m.controller?.a?.alive ? m.controller.shotGuide : null, cam, W, H)';
function addPublishedGuide(source){
 return once(source,"inRange: m.controller ? m.controller.inRange !== false : true },",
 "inRange: m.controller ? m.controller.inRange !== false : true, guide: "+guideExpr+" },",'published868 guide');
}
// Execute the unmodified native _updateHud method after only the two real
// adapters. Actor/team/DOM consumers are bounded stand-ins, not full gameplay.
function setup(source,snapshot=hudFrameSnapshot){
 const start=source.indexOf('  _updateHud(dt) {'),end=source.indexOf('  _onDevice(',start);
 assert.ok(start>=0&&end>start);
 let scale=1,costReads=0,summaryCalls=0,guideCalls=0;
 const modifiers={get inkSaverSub(){costReads++;return scale;}};
 const a={team:0,alive:true,hp:73,ink:100,weaponId:'shooter',weapon:{kind:'shooter',special:'storm'},weaponRunner:{spread:0,charge:.2},
  form:'kid',intent:{fire:false},s3:{modifiers},specialFrac:()=>.25,specialReady:()=>false,specialActive:null};
 const controller={enabled:true,a,shotGuide:{x:.2,y:.4},onTarget:true,inRange:false,mapHeld:false};
 const teams=[{color:'orange',players:[]},{color:'blue',players:[]}];
 const G={camera:{fov:60}},PLAYER={inkMax:100,hp:100},SUB={bomb:{inkCost:70}};
 const projectShotGuide=value=>{guideCalls++;return value;};
 const C=new Function('G','THREE','PLAYER','SUB','t','subInkSpec','hudFrameSnapshot','projectShotGuide','innerWidth','innerHeight',
  'return class {'+source.slice(start,end)+'}')(G,{},PLAYER,SUB,x=>x,subInkSpec,snapshot,projectShotGuide,1280,720);
 const game=new C();let frame,mobile;
 game.match={local:a,actors:[],state:'playing',duration:180,time:100,controller,teamSummary(viewer){
  summaryCalls++;return viewer===1?[teams[1],teams[0]]:teams;
 }};
 game.settings={minimap:false};game.minimap={};game._mv={};game._hints={};game._hintT=game._lowInkFlash=0;
 game.hud={update(_dt,value){
  frame=value;
  if(game._hudTransport){assert.equal(game._hudTransport.mobile.subCost,value.subCost);assert.equal(game._hudTransport.mobile.subReady,value.subReady);}
 }};
 game.input={mobile:{setHud(value){mobile=value;}}};
 return {game,a,SUB,controller,teams,setScale(value){scale=value;},run(){
  costReads=summaryCalls=guideCalls=0;game._updateHud(1/60);
  return {frame,mobile,costReads,summaryCalls,guideCalls};
 }};
}
function check(composed,{pooled=true,geared=true,guided=false}={}){
 const h=setup(composed);let frame,crosshair,mobile;
 for(const scale of [1,.8,.65])for(const delta of [-.000001,0,.000001]){
  h.setScale(scale);const cost=70*(geared?scale:1);h.a.ink=cost+delta;
  const out=h.run();
  assert.equal(out.frame.subCost,cost/100);assert.equal(out.mobile.subCost,cost/100);
  assert.equal(out.frame.subReady,delta>=0);assert.equal(out.mobile.subReady,delta>=0);
  assert.equal(out.costReads,geared?1:0);assert.equal(out.summaryCalls,1);
  assert.equal(out.frame.teams,h.teams);assert.equal(out.frame.special,.25);assert.equal(out.frame.hp,.73);
  assert.equal(out.frame.crosshair.onTarget,'enemy');assert.equal(out.frame.crosshair.inRange,false);
  assert.equal(h.SUB.bomb.inkCost,70);
  if(pooled&&frame){assert.equal(out.frame,frame);assert.equal(out.frame.crosshair,crosshair);assert.equal(out.mobile,mobile);}
  if(guided){assert.equal(out.frame.crosshair.guide,h.controller.shotGuide);assert.equal(out.guideCalls,1);}
  frame=out.frame;crosshair=out.frame.crosshair;mobile=out.mobile;
 }
 h.controller.enabled=false;h.setScale(.8);h.a.ink=50;
 const next=h.run();assert.equal(next.frame.subReady,false);
 if(guided)assert.equal(next.frame.crosshair.guide,null);
 return h;
}
test('original adapters conflict in either ordering',async()=>{
 const oldGear=originalGearSub;
 const oldSnap=originalHudSnapshots;
 assert.throws(()=>oldSnap(rel,oldGear(rel,raw,once),once),/persistent Game HUD frame/);
 assert.throws(()=>oldGear(rel,oldSnap(rel,raw,once),once),/equipped HUD sub cost/);
});
test('snapshot alone keeps base-cost authority and pooled objects',()=>check(snap(raw),{geared:false}));
test('gearSub alone keeps actor-local exact readiness',()=>check(gear(raw),{pooled:false}));
test('production gearSub then snapshot retains one cost read and one synchronous update',()=>check(snap(gear(raw))));
test('reverse snapshot then gearSub preserves the same values and pool identity',()=>check(gear(snap(raw))));
test('published ShotGuide property survives production and reverse composition',()=>{
 check(snap(addPublishedGuide(gear(raw))),{guided:true});
 check(gear(snap(addPublishedGuide(raw))),{guided:true});
});
test('old runtime helper still demonstrates fixed70 loss after anchor-only repair',async()=>{
 const old=originalHudFrameSnapshot;
 const h=setup(snap(gear(raw)),old);h.setScale(.8);h.a.ink=56;
 const out=h.run();assert.equal(out.frame.subCost,.7);assert.equal(out.frame.subReady,undefined);
});
test('unexpected frame changes and repeated adapters remain fail-closed',()=>{
 assert.throws(()=>snap(gear(raw).replace('time: m.time,','time: m.time, extraOwner: true,')),/persistent Game HUD frame/);
 assert.throws(()=>snap(snap(raw)),/persistent Game HUD frame/);
 assert.throws(()=>gear(gear(snap(raw))),/equipped persistent HUD sub cost/);
});
