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
 const statements=method.value.body.body;
 const index=statements.findIndex(n=>n.type==='IfStatement'
   && main.slice(n.test.start,n.test.end)==='this._nativeStageSwitchPending');
 assert.ok(index>=0,'a real pending-stage early return remains in the published frame');
 // Independent render-clock instrumentation may read performance.now() first,
 // but no input, simulation, GPU work or effect may execute before the fence.
 const prior=statements.slice(0,index);
 assert.ok(prior.every(n=>n.type==='VariableDeclaration'&&n.kind==='const'
   && n.declarations.every(d=>d.init?.type==='CallExpression'
    && main.slice(d.init.callee.start,d.init.callee.end)==='performance.now')),
   'only independent clock reads can precede the pending-stage guard');
 const guard=statements[index];
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


// Compile the complete actual production frame and its actual title helpers.
// No independent replacement for the stage fence or title lifecycle is used.
function titleStageFixture({pending=true, retained=false}={}) {
 const ast=parse(main,{sourceType:'module',ecmaVersion:'latest'});
 const cls=ast.body.find(n=>n.type==='ClassDeclaration'&&n.id?.name==='Game');
 const method=cls.body.body.find(n=>n.type==='MethodDefinition'&&n.key?.name==='_frame');
 const names=['releaseTitleDemoBudget','prepareTitleDemoFrame','holdTitleDemoFrame'];
 const helpers=names.map(name=>{
  const node=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id?.name===name);
  assert.ok(node,`production title helper ${name}`);
  return main.slice(node.start,node.end);
 }).join('\n');
 const calls={gpu:[],network:0,poll:0,menu:0,end:0,clock:0};
 const env={document:{hidden:retained||!pending},innerWidth:800,innerHeight:600,devicePixelRatio:1,
  matchMedia:()=>({matches:retained})};
 const G={time:10,mode:'menu',net:{update(dt){assert.equal(dt,1/60);calls.network++;}}};
 for(const key of ['paint','renderer','level','projectiles'])Object.defineProperty(G,key,{get(){throw Error(`disposed world access: ${key}`);}});
 const game={_nativeStageSwitchPending:pending,match:{attract:true},
  menus:{current:'title',_scr:{name:'title'},update(){calls.menu++;}},
  input:{pollPad(){calls.poll++;},endFrame(){calls.end++;},padPressed:new Set()},
  _padMenus(){calls.menu++;},s3Clock:{reset(){calls.clock++;}},
  R:{dynScale:1,_contextLost:false,
   setDynamicScale(scale){calls.gpu.push(['scale',scale]);this.dynScale=scale;},
   releasePausedFrame(){calls.gpu.push(['release']);},
   presentPausedFrame(){calls.gpu.push(['present']);return true;}}
 };
 if(retained)game._titleDemo={active:true,phase:.01,elapsed:.02,draw:false,delta:0,captured:true,
  reduced:true,hidden:true,savedScale:1,match:game.match,motionQuery:{matches:true},width:800,height:600,dpr:1,hz:30,hold:true};
 const frame=new Function('G','globalThis',helpers+'\nreturn ({'+main.slice(method.start,method.end)+'})._frame;')(G,env);
 return {game,G,env,calls,frame:dt=>frame.call(game,dt)};
}

test('#1723 pending native stage fences a fresh real title lifecycle before any GPU owner or state allocation',()=>{
 const h=titleStageFixture();
 for(let i=0;i<120;i++)h.frame(1/60);
 assert.deepEqual(h.calls.gpu,[],'pending loading must not resize/present/release outgoing GPU owners');
 assert.equal(Object.hasOwn(h.game,'_titleDemo'),false,'the title owner must not allocate before the pending fence');
 assert.deepEqual([h.calls.network,h.calls.poll,h.calls.menu,h.calls.end,h.calls.clock],[120,120,240,120,120]);
 assert.ok(Math.abs(h.G.time-12)<1e-8,'stage loading clock remains on the existing pending-frame path');
});

test('#1723 an already captured hidden title cannot return before the actual pending-stage clock and fence',()=>{
 const h=titleStageFixture({retained:true}),state=h.game._titleDemo;
 const snapshot={...state};
 for(let i=0;i<120;i++)h.frame(1/60);
 assert.deepEqual(h.calls.gpu,[]);
 assert.equal(h.game._titleDemo,state);
 assert.deepEqual(state,snapshot,'a fenced frame does not mutate retained title ownership');
 assert.deepEqual([h.calls.network,h.calls.poll,h.calls.menu,h.calls.end,h.calls.clock],[120,120,240,120,120]);
 assert.ok(Math.abs(h.G.time-12)<1e-8,'hidden-title hold must not bypass the pending-stage clock');
});

test('#1723 the real hidden-title owner resumes normally only after the stage fence is released',()=>{
 const h=titleStageFixture({pending:false});
 h.frame(1/60);h.frame(1/60);
 assert.equal(h.game._titleDemo.active,true);
 assert.equal(h.game._titleDemo.hold,true);
 assert.deepEqual(h.calls.gpu,[['scale',.75]],'normal title density is still acquired once after publication');
 assert.deepEqual([h.calls.network,h.calls.poll,h.calls.menu,h.calls.end],[2,2,4,2]);
 assert.equal(h.G.time,10,'the existing hidden-title path still accumulates no simulation debt');
});
