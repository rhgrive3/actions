// #1723: the production native-stage adapter must fence RAF while an
// outgoing native GPU world is disposed and a legacy lightmap is loading.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../inkwave-source-composition.mjs';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
const main=adaptBuildSource('src/main.js',
  fs.readFileSync(new URL('../../inkwave-public/src/main.js',import.meta.url),'utf8'));
test('#1723 recovery UI ships through the native bundle, never an omitted source-menu sidefile', () => {
 const bootImports=main.split('\n').filter(line=>line.startsWith('import '));
 assert.ok(bootImports.some(line=>line.includes('showNativeWorldRecovery')&&line.includes('/native-stages/runtime/engine.mjs')),
   'published Game imports recovery UI from the bundled engine');
 assert.ok(!bootImports.some(line=>line.includes('/native-stages/runtime/source-menu.mjs')),
   'source-menu is build-only in minified native builds');
 const engine=fs.readFileSync(new URL('../../patches/native-stages/runtime/engine.mjs',import.meta.url),'utf8');
 assert.match(engine,/export \{ nativeStageArt, showNativeWorldRecovery \} from '\.\/source-menu\.mjs'/);
});
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
 const ast=parse(main,{sourceType:'module',ecmaVersion:'latest'});
 const game=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id?.name==='Game');
 const method=game?.body.body.find(n=>n.type==='MethodDefinition'&&n.key?.name==='_frame');
 assert.ok(method,'production Game._frame');
 const [guard]=method.value.body.body;
 assert.equal(guard?.type,'IfStatement','the stage fence is the first frame statement');
 assert.equal(main.slice(guard.test.start,guard.test.end),'this._nativeStageSwitchPending','the leading guard checks the actual pending stage');
 assert.equal(guard.consequent.type,'BlockStatement');
 assert.equal(guard.consequent.body.at(-1)?.type,'ReturnStatement','the fence exits before world work');
 // Compile the exact leading method prefix through the guarded return.
 const source=main.slice(method.start,guard.end)+'\n  }';
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
 assert.deepEqual([network,poll,menu,end,clock,reset],[120,120,240,120,120,0]);
 assert.ok(Math.abs(G.time-12)<1e-8,'clock advances while GPU is fenced');
});
