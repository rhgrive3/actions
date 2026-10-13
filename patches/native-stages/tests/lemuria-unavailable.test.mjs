import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {isRankedMode} from '../../splatoon3/runtime/ranked/engine.mjs';

const definition=JSON.parse(fs.readFileSync(new URL('../definitions/lemuria.json',import.meta.url)));
const code=rel=>adaptBuildSource(rel,fs.readFileSync(new URL('../../../inkwave-public/'+rel,import.meta.url),'utf8'));
const section=(source,start,end)=>{const at=source.indexOf(start),until=source.indexOf(end,at);assert.ok(at>=0&&until>at,start);return source.slice(at,until);};
const main=code('src/main.js'),session=code('src/net/session.js'),menus=code('src/ui/menus.js');
const context=()=>vm.createContext({UNAVAILABLE_NATIVE_STAGES:[definition],isRankedMode});

test('Lemuria is roster-confirmed but has no invented geometry, placement or playable build entry',()=>{
 const build=prepareNativeStageBuild(null).config;
 assert.equal(definition.internal,'Vss_AutoWalk00');
 assert.equal(definition.version1130Verified,false);
 assert.equal(definition.availability,'source-unavailable');
 for(const field of ['sourceSha256','tree','bounds','spawnPads','spawnBarrier'])assert.equal(Object.hasOwn(definition,field),false,field);
 assert.equal(build.stages.some(s=>s.id===definition.id),false);
 assert.equal(build.unavailableStages.filter(s=>s.id===definition.id).length,1);
});

for(const rule of ['turf','zones','tower','rainmaker','clams'])test('Lemuria '+rule+' request stops before match flow, world disposal or fallback',async()=>{
 const methods=section(main,'  _beginMatchFlow() {','\n  // ---- online (src/net/session.js');
 const Game=vm.runInContext(`class Game {${methods}};Game`,context());
 const calls=[],game=new Game(),world={id:'existing-world'};
 Object.assign(game,{mapDef:{id:'tidewater'},world,match:{dispose(){throw Error('Unavailable stage disposed the existing match');}},menus:{toast:message=>calls.push(message)}});
 assert.equal(await game.startMatch({mapId:'lemuria',rule,mode:rule}),false);
 assert.equal(game._matchFlow,undefined);
 assert.equal(game.world,world);
 assert.equal(await game._startMenuMatch({mapId:'lemuria',rule,mode:rule}),false);
 assert.equal(game._matchFlow,undefined);
 assert.equal(calls.length,2);
 assert.ok(calls.every(message=>message.includes(definition.name)&&message.includes(definition.reason)));
});

test('Direct online world startup rejects Lemuria before network flow or world disposal',async()=>{
 const method=section(main,'  async startNetMatch(cfg, nm) {','\n  // Compile every shader variant');
 const Game=vm.runInContext(`class Game {${method}};Game`,context());
 const game=new Game();
 await assert.rejects(game.startNetMatch({map:'lemuria'},{}),error=>error.name==='RangeError'&&error.message.includes(definition.name));
 assert.equal(game._matchFlow,undefined);
});

test('Direct world construction rejects unavailable source or placement before replacing authorities',async()=>{
 const method=section(main,'  async _buildWorld(map, flow = null) {','\n  // deck slabs over the sea:');
 const sandbox=context();
 sandbox.UNAVAILABLE_NATIVE_STAGES.push({...definition,id:'placement-blocked',availability:'placement-unavailable',reason:'配置を確認できないため、現在プレイできません。'});
 const Game=vm.runInContext(`class Game {${method}};Game`,sandbox);
 const game=new Game();
 for(const id of ['lemuria','placement-blocked'])await assert.rejects(game._buildWorld({id}),error=>error.name==='RangeError');
 assert.equal(game._worldBuild,undefined);
});

test('Online host start and incoming start reject Lemuria without broadcasting or preparing a match',async()=>{
 const methods=[section(session,'  canStart() {','\n  emote(name) {'),section(session,'  start() {','\n  _markReady(id) {')].join('\n');
 const Net=vm.runInContext(`class Net {${methods}};Net`,context());
 const net=new Net(),failed=[];
 Object.assign(net,{isHost:true,state:'lobby',lobby:{map:'lemuria',mode:'turf',bots:true,players:[{id:'host',ready:true},{id:'guest',ready:true}]},tr:{lock(){throw Error('Unavailable source locked the room');},broadcast(){throw Error('Unavailable source was broadcast');}},_fail:error=>failed.push(error.message)});
 assert.match(net.startBlock(),/リュウグウターミナル/);
 assert.equal(net.canStart(),false);
 assert.equal(net.start(),false);
 for(const mode of ['turf','zones','tower','rainmaker','clams'])await net._begin({map:'lemuria',mode});
 assert.equal(failed.length,5);
 assert.equal(net._startCfg,undefined);
});

test('Menu launch rejects a stale unavailable selection before motion permission or wipe',()=>{
 const method=section(menus,'  _startMatch() {','\n  /** Put a live 3D portrait');
 const Menu=vm.runInContext(`class Menu {${method}};Menu`,context());
 const menu=new Menu(),messages=[];
 Object.assign(menu,{_setup:{mapId:'lemuria'},toast:message=>messages.push(message)});
 menu._startMatch();assert.equal(menu._starting,undefined);assert.equal(messages.length,1);
});
