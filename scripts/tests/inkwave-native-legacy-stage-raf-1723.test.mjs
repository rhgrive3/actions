// #1723: the production native-stage adapter must fence RAF while an
// outgoing native GPU world is disposed and a legacy lightmap is loading.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
const main=adaptBuildSource('src/main.js',
  fs.readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8'));
const anchor='const nativeStageBuild = Game.prototype._buildWorld;';
const singleton='const game = new Game();';
const start=main.indexOf(anchor),end=main.indexOf(singleton,start);
assert.ok(start>=0 && end>start,'published source installs a stage-publish owner');
assert.equal(main.indexOf(anchor,start+1),-1,'one world-load owner');

function deferred() {
 let resolve,reject;
 const promise=new Promise((a,b)=>{resolve=a;reject=b;});
 return {promise,resolve,reject};
}
function wrapper(recovery=()=>{}) {
 // Compile the exact emitted source wrapper against a controlled asynchronous
 // builder, not an independent reimplementation of its cleanup contract.
 const source=main.slice(start,end);
 return new Function('NATIVE_IDS','showNativeWorldRecovery',
   'class Game { _buildWorld(map) { return map.wait; } }\n'+
   source+'\nreturn Game;')(['native-map'],recovery);
}

test('#1723 native-to-legacy pending lightmap fences every frame until publication',async()=>{
 const Game=wrapper(),game=new Game(),load=deferred();
 const native=game._buildWorld({id:'legacy-map',wait:load.promise});
 assert.equal(game._nativeStageSwitchPending,true);
 assert.equal(game._nativeStageSwitchEpoch,1);
 let finished=false;native.then(()=>{finished=true;});
 await Promise.resolve();
 assert.equal(finished,false,'the fixture lightmap request is unresolved');
 assert.equal(game._nativeStageSwitchPending,true);
 load.resolve('world published');
 assert.equal(await native,'world published');
 assert.equal(game._nativeStageSwitchPending,false);
 assert.equal(game._nativeWorldRecoveryFatal,undefined);
});

test('#1723 an old async build cannot un-fence a newer active build',async()=>{
 const Game=wrapper(),game=new Game(),first=deferred(),second=deferred();
 const a=game._buildWorld({id:'native-map',wait:first.promise});
 const b=game._buildWorld({id:'legacy-map',wait:second.promise});
 assert.equal(game._nativeStageSwitchEpoch,2);
 first.resolve('previous');
 assert.equal(await a,'previous');
 assert.equal(game._nativeStageSwitchPending,true);
 second.resolve('current');
 assert.equal(await b,'current');
 assert.equal(game._nativeStageSwitchPending,false);
});

test('#1723 failed legacy publication fails closed, native rollback is not falsely fatal',async()=>{
 let dialogs=0;
 const Game=wrapper(()=>{dialogs++;}),game=new Game();
 await assert.rejects(game._buildWorld({id:'native-map',wait:Promise.reject(Error('native rollback'))}),/native rollback/);
 assert.equal(game._nativeWorldRecoveryFatal,undefined);
 assert.equal(game._nativeStageSwitchPending,false);
 const failed=Error('legacy lightmap rejection');
 await assert.rejects(game._buildWorld({id:'legacy-map',wait:Promise.reject(failed)}),/legacy lightmap/);
 assert.equal(game._nativeWorldRecoveryFatal.error,failed);
 assert.equal(game.frozen,true);
 assert.equal(dialogs,1);
 assert.equal(game._nativeStageSwitchPending,false);
});

function guardedFrame(G,runSimulation=()=>{throw Error('disposed world advanced');}) {
 const marker='  _frame(dt) {',at=main.indexOf(marker);
 assert.ok(at>=0,'production Game._frame');
 const guard=main.indexOf('    if (this._nativeStageSwitchPending) {',at);
 const normal=main.indexOf('    runSimulation(this, dt);',guard);
 assert.ok(guard>at && normal>guard,'guard precedes normal fixed-step simulation');
 // Compile the emitted method prefix, with its terminating return.
 const source=main.slice(at,normal)+'\n  }';
 return new Function('G','performance','runSimulation',
   'return ({'+source+'})._frame;')(G,{now:()=>123},runSimulation);
}
test('#1723 actual frame suppresses disposed paint/decor but retains network and menu input',()=>{
 let network=0,poll=0,menu=0,end=0,clock=0,reset=0;
 const G={time:10,renderer:{info:{reset(){reset++;}}},
   paint:{flush(){throw Error('use-after-dispose');}},
   net:{update(dt){assert.equal(dt,1/60);network++;}}};
 const frame=guardedFrame(G);
 const game={_nativeStageSwitchPending:true,decor:null,levelMat:null,
  input:{pollPad(){poll++;},endFrame(){end++;}},
  _padMenus(){menu++;},menus:{update(){menu++;}},
  s3Clock:{reset(){clock++;}}
 };
 for(let i=0;i<120;i++)frame.call(game,1/60);
 assert.deepEqual([network,poll,menu,end,clock,reset],[120,120,240,120,120,120]);
 assert.ok(Math.abs(G.time-12)<1e-8,'clock advances while GPU is fenced');
});
