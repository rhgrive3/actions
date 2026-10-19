import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import path from'node:path';import crypto from'node:crypto';
import{sourceLoadedActorFixture}from'../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import{installClock,installGame,runSimulation}from'../../splatoon3/runtime/clock.mjs';
import{adaptBuildSource}from'../../../scripts/inkwave-source-composition.mjs';
import{createRecoveryFixture as fixture,readRuntime,ROOT,EMITTED}from'./native-world-recovery-fixture.mjs';
assert.equal(EMITTED,false,'Actual Game method extraction is source-only; emitted application is tested by native browser');
const main=adaptBuildSource('src/main.js',fs.readFileSync(path.join(ROOT,'inkwave-public/src/main.js'),'utf8'));
function section(a,z){const i=main.indexOf(a),j=main.indexOf(z,i);assert(i>=0&&j>i,a);return main.slice(i,j);}
const f=await sourceLoadedActorFixture({sourceOnly:true}),{G}=f;installClock({G});

const Game=new Function('G',`return class Game {${section('  resume() {','  async quitToMenu() {')} ${section('  _padMenus() {','  _updateHud(dt) {')} ${section('  _startAttract() {','  _attractShot() {')} ${section('  _frame(dt) {','  _updateAmbience(dt) {')} ${section('  _loop() {','  _frame(dt) {')}}`)(G);installGame(Game);
const rows=[];
for(const hz of[30,60,120])for(const failedRecovery of[false,true])test('real stage '+(failedRecovery?'failed rollback':'successful rollback')+' to real clock '+hz+'Hz',async()=>{
 const w=await fixture({shadow:1,env:0,palette:0,minimap:0},{sharedG:G});const game=w.game;Object.setPrototypeOf(game,Game.prototype);G.net=G.netm=null;G.actors=[];G.time=0;G.mode='match';const match=new f.Match({duration:180});match.state='playing';match.paused=true;G.match=game.match=match;
 let paintSteps=0,dialog=0;const grid=new Uint8Array([1,2,1]),counts=new Uint32Array([2,1]);Object.assign(w.oldPaint,{grid,counts,useFixedPaintClock(){},advanceSimulation(){paintSteps++;},clear(){throw Error('terminal attract touched paint');}});
 game.showcase={fullFrame:false};game.settings={quality:'low'};game.rig={mode:'follow'};game.R={_contextLost:false};game.menus={current:'pause',show(x){this.current=x;}};game.input={pad:{buttons:[],axes:[]},padPressed:new Set(),padMenuPressed:new Set([9]),padAxis:()=>0,pollPad(){},endFrame(){},requestLock(){},consumePadMenuButton(){}};
 if(failedRecovery)w.oldMinimap.activate=()=>{throw Error('real rollback activation failed');};
 let error;try{await w.build(game,{id:'native-test',name:'Native'},()=>true);}catch(e){error=e;}
 assert.equal(error.message,'shadow injected');assert.equal(G.paint,w.oldPaint);assert.equal(game.nativeWorld,w.oldWorld);assert.equal(w.counters.old,0);assert.equal(w.counters.newPaint,1);assert.equal(w.counters.newDisplay,1);assert.equal(w.counters.newMesh,1);
 if(failedRecovery){assert.equal(game._nativeWorldRecoveryFatal.error,error);assert.equal(game.frozen,true);assert.equal(w.counters.dialog,1);game.frozen=false;}
 else{assert.equal(game._nativeWorldRecoveryFatal,undefined);assert.equal(game.frozen,undefined);}
 for(let i=0;i<hz;i++)runSimulation(game,1/hz);
 rows.push({hz,failedRecovery,originalError:error.message,recoveryMessages:Array.from(game._nativeWorldRecoveryFatal?.recoveryErrors||[],x=>x.message),counters:w.counters,matchTime:match.time,gameTime:G.time,paintSteps,paused:match.paused,menu:game.menus.current,ordinaryUnfreezeBypassRejected:failedRecovery&&match.time===180&&paintSteps===0});
 if(failedRecovery){assert.equal(match.time,180,'terminal rollback must preserve Match time');assert.equal(paintSteps,0,'terminal rollback must not update paint');game.resume();game._padMenus();assert.equal(game._startAttract(),false);game._frame(1/60);assert.equal(match.time,180);assert.equal(G.time,0);assert.equal(paintSteps,0);assert.equal(match.paused,true);assert.equal(game.menus.current,'pause');const oldRAF=globalThis.requestAnimationFrame;let raf=0;globalThis.requestAnimationFrame=()=>{raf++;};game.timer={update(){}};try{game._loop();assert.equal(raf,1);}finally{if(oldRAF===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRAF;}}
 else{assert.equal(match.paused,false);assert(Math.abs(match.time-179)<1e-9);assert(Math.abs(G.time-1)<1e-9);assert.equal(paintSteps,60);}
 assert.equal(G.paint.grid,grid);assert.equal(G.paint.counts,counts);assert.deepEqual([...grid],[1,2,1]);

});
test.after(()=>{f.reset();const receipt={lane:'source',stageRuntimeSha256:crypto.createHash('sha256').update(readRuntime('native-world.mjs')).digest('hex'),rows,scope:'Actual stage rollback feeds real Match/clock; synthetic GPU resources. Emitted Game uses the separate native app lane.'};console.log('RECOVERY_JOINT_RECEIPT '+JSON.stringify(receipt));if(process.env.RECOVERY_RECEIPT_DIR){fs.mkdirSync(process.env.RECOVERY_RECEIPT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.RECOVERY_RECEIPT_DIR,'joint-clock.json'),JSON.stringify(receipt,null,2)+'\n');}});
