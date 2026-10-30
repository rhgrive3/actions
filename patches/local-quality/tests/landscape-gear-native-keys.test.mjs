import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath,pathToFileURL} from 'node:url';import {test} from 'node:test';
import {adaptLandscapeGearNativeKeys} from '../landscape-gear-native-keys-adapter.mjs';
import {practiceFixture} from './helpers/practice-gear-dom-fixture.mjs';
const root=process.env.INKWAVE_TEST_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const raw=()=>fs.readFileSync(path.join(root,'inkwave-public/src/ui/menus.js'),'utf8');
function event(key='Enter'){return {key,code:({Enter:'Enter',' ':'Space',Tab:'Tab',Escape:'Escape',ArrowDown:'ArrowDown'})[key],repeat:false,prevented:0,stopped:0,preventDefault(){this.prevented++},stopPropagation(){this.stopped++}};}
function nativeRoute(source,tag){const start=source.indexOf('  handleKey(e) {'),end=source.indexOf('\n  _modalBlocksKeys()',start);assert(start>=0&&end>start);const document={activeElement:{tagName:tag}};const constants=['MENU_MODIFIERS','MENU_BY_CODE','MENU_BY_KEY'].map(name=>{const at=source.indexOf('const '+name+' =');assert(at>=0);return source.slice(at,source.indexOf(';',at)+1);}).join('\n');const Menu=vm.runInNewContext(constants+'\nclass Menu{'+source.slice(start,end)+'};Menu',{document});const m=new Menu(),routes=[];Object.assign(m,{current:'loadout',el:{contains:()=>true},_scr:null,setInputMode(){},_nav:dir=>routes.push(dir)});return {m,routes};}
function guarded(source,{touch=true,landscape=true,gear=true,owned=true}={}){const marker=source.indexOf('// Landscape native gear controls keep activation/focus keys.');assert(marker>=0);const end=source.indexOf("    const countEl =",marker);const screen={contains:()=>owned,addEventListener(type,fn){assert.equal(type,'keydown');this.handler=fn}};const control={closest:s=>{assert.equal(s,'details.s3-gear');return gear?{}:null}};const context={document:{documentElement:{classList:{contains:()=>touch}}},matchMedia:()=>({matches:landscape})};const install=vm.runInNewContext('(function(el){'+source.slice(marker,end)+'})',context);install.call({el:{classList:{contains:()=>false}}},screen);return {screen,target:{closest:s=>{assert.equal(s,'summary, button');return control}}};}
test('actual production handleKey reproduces default cancellation and wrong background menu routing for native gear controls',async()=>{
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));const source=adaptBuildSource('src/ui/menus.js',raw());
 for(const tag of ['SUMMARY','BUTTON'])for(const[key,dir]of [['Enter','accept'],[' ','accept'],['Tab','tab_next']]){const f=nativeRoute(source,tag),e=event(key);assert.equal(f.m.handleKey(e),true);assert.equal(e.prevented,1);assert.deepEqual(f.routes,[dir]);}
 const gear=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/gear.mjs'),'utf8'),catalogue=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/catalogue.mjs'),'utf8');
 assert.match(gear,/summary\.textContent = 'ギアパワー'/);assert(!gear.includes("summary.addEventListener('keydown'"));assert(!catalogue.includes("reset.addEventListener('keydown'"));
});
test('delegated landscape guard stops only gear native activation/Tab bubbling, never its default',()=>{
 const source=adaptLandscapeGearNativeKeys('src/ui/menus.js',raw());
 for(const key of ['Enter',' ','Tab']){const f=guarded(source),e=event(key);e.target=f.target;f.screen.handler(e);assert.equal(e.stopped,1);assert.equal(e.prevented,0);}
 for(const key of ['Escape','ArrowDown']){const f=guarded(source),e=event(key);e.target=f.target;f.screen.handler(e);assert.equal(e.stopped,0);assert.equal(e.prevented,0);}
 for(const options of [{landscape:false},{touch:false},{gear:false},{owned:false}]){const f=guarded(source,options),e=event();e.target=f.target;f.screen.handler(e);assert.equal(e.stopped,0);}
});
test('adapter is fail-closed and leaves every other owner byte-identical',()=>{
 const before=raw(),after=adaptLandscapeGearNativeKeys('src/ui/menus.js',before);assert.throws(()=>adaptLandscapeGearNativeKeys('src/ui/menus.js',after),/repeated/);assert.throws(()=>adaptLandscapeGearNativeKeys('src/ui/menus.js',''),/expected one/);
 const start=after.indexOf('    // Landscape native gear controls keep activation/focus keys.'),end=after.indexOf("    const countEl =",start);assert.equal(after.slice(0,start)+after.slice(end),before);
 for(const rel of ['styles/ui.css','styles/mobile.css','src/config.js'])assert.equal(adaptLandscapeGearNativeKeys(rel,before),before);
});
test('candidate composes once after all current production adapters and retains normal card/filter owners',async()=>{
 const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
 const before=adaptBuildSource('src/ui/menus.js',raw());
 const marker='// Landscape native gear controls keep activation/focus keys.';
 const after=before.includes(marker)?before:adaptLandscapeGearNativeKeys('src/ui/menus.js',before);
 assert.equal(after.split('// Landscape native gear controls keep activation/focus keys.').length-1,1);
 assert.match(after,/const countEl = el\.querySelector\('\.iw-seclabel__count'\)/);assert.match(after,/onFocus: \(f\) =>/);assert.match(after,/id: 'w-' \+ id, accept:/);
 assert.equal(after.split("'aria-label': w.name").length,before.split("'aria-label': w.name").length);
 const f=guarded(after),e=event('Enter');e.target=f.target;f.screen.handler(e);assert.equal(e.stopped,1);assert.equal(e.prevented,0);
});

// Portable actual gear-form DOM/state audit (no browser/layout claim).
const runtime=path.join(root,'patches/splatoon3/runtime');
function declaration(code,name){const start=code.indexOf('export const '+name+' =');assert(start>=0);const end=code.indexOf(';',start);return code.slice(start,end+1).replace('export ','');}
function namedFunction(code,name){const start=code.indexOf('export function '+name+'(');assert(start>=0);const end=code.indexOf('\n}',start);return code.slice(start,end+2).replace('export ','');}
async function fixture(){
 const {Element}=await practiceFixture(root),storage=new Map(),applied=[];
 const source=fs.readFileSync(path.join(runtime,'gear.mjs'),'utf8'),clothing=fs.readFileSync(path.join(runtime,'clothing-gear.mjs'),'utf8'),conditional=fs.readFileSync(path.join(runtime,'conditional-gear.mjs'),'utf8');
 const constants=[declaration(source,'ABILITIES'),declaration(source,'SHOES_ABILITIES'),declaration(clothing,'CLOTHING_ABILITIES'),declaration(clothing,'SPLATFEST_TEE'),declaration(conditional,'HEAD_ABILITIES'),namedFunction(clothing,'clothingAbilityAllowed'),namedFunction(source,'abilityAllowed')].join('\n');
 const start=source.indexOf('  function gearPanel() {'),code=source.slice(start,source.lastIndexOf('\n}'));
 const key=source.match(/const STORAGE = '([^']+)'/)[1];
 const empty=()=>Array.from({length:3},()=>({main:'none',subs:['none','none','none']}));
 const context={document:{createElement:tag=>new Element(tag)},readLoadout:()=>JSON.parse(storage.get(key)||JSON.stringify(empty())),localStorage:{setItem:(k,v)=>storage.set(k,v)},STORAGE:key,G:{match:{local:{id:'local'},attract:true}},equip:actor=>applied.push(actor),tuning:{gear:new Proxy({},{get:()=>true})}};
 const panel=vm.runInNewContext(constants+'\n'+code+'; gearPanel;',context);
 return {panel,storage,key,applied};
}
test('actual gear form exposes twelve labeled slots and enforces main-only ability placement',async()=>{
 const f=await fixture(),panel=f.panel(),selects=panel.querySelectorAll('select');assert.equal(selects.length,12);
 assert.equal(new Set(selects.map(s=>s.attributes['aria-label'])).size,12);
 for(let i=0;i<selects.length;i++){
  const ids=selects[i].querySelectorAll('option').map(o=>o.value);
  assert(ids.includes('none'));assert(ids.includes('runSpeed'));
  assert.equal(ids.includes('abilityDoubler'),i===4);assert.equal(ids.includes('objectShredder'),i===8);assert.equal(ids.includes('comeback'),i===0);
 }
});
test('native gear save/reopen preserves exact piece/slot and doubled clothing labels',async()=>{
 const f=await fixture(),panel=f.panel(),selects=panel.querySelectorAll('select');
 for(const[index,value]of [[0,'runSpeed'],[1,'inkSaverMain'],[4,'abilityDoubler'],[5,'swimSpeed'],[8,'objectShredder']]){selects[index].value=value;selects[index].events.change();}
 const saved=JSON.parse(f.storage.get(f.key));assert.equal(saved[0].main,'runSpeed');assert.deepEqual(saved[0].subs,['inkSaverMain','none','none']);assert.equal(saved[1].main,'abilityDoubler');assert.equal(saved[1].item,'splatfestTee');assert.equal(saved[1].subs[0],'swimSpeed');assert.equal(saved[2].main,'objectShredder');assert.equal(f.applied.length,5);
 const fields=panel.querySelectorAll('fieldset'),labels=fields[1].querySelectorAll('[data-slot]').map(e=>e.textContent);assert(labels.includes('フェスT（倍化）'));assert(labels.includes('追加 1（6）'));
 const reopened=f.panel().querySelectorAll('select');assert.equal(reopened[0].value,'runSpeed');assert.equal(reopened[1].value,'inkSaverMain');assert.equal(reopened[4].value,'abilityDoubler');assert.equal(reopened[5].value,'swimSpeed');assert.equal(reopened[8].value,'objectShredder');
});
