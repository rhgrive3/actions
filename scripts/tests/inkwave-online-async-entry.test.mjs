import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import {fixture,flush,deferred} from '../lib/inkwave-online-controlled-fixture.mjs';
import {adaptOnlineAsyncEntry} from '../../patches/local-quality/online-async-entry-adapter.mjs';
const root=path.resolve(process.env.INKWAVE_SOURCE_ROOT || fileURLToPath(new URL('../../',import.meta.url)));
const {adaptBuildSource}=await import(pathToFileURL(path.join(root,'scripts/inkwave-source-composition.mjs')));
const raw=fs.readFileSync(path.join(root,'inkwave-public/src/ui/menus.js'),'utf8');
const composed=adaptBuildSource('src/ui/menus.js',raw);
const candidate=composed.includes('clipboardRevision')?composed:adaptOnlineAsyncEntry('src/ui/menus.js',composed);
const extract=source=>source.slice(source.indexOf('  _scr_online() {'),source.indexOf('  // ================================================================ SCREEN: lobby'));
const method=extract(process.env.ONLINE_ASYNC_BASELINE ? composed : candidate);
const inputValue=(f,value)=>{const input=f.find('iw-code-input');input.focus();input.value=value;input.dispatch('input');};
const pasteButton=f=>f.find('iw-join__btns').children[0];
const joinButton=f=>f.find('iw-join__btns').children[1];

test('pending clipboard success must not overwrite a newer native edit',async()=>{
 const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});
 pasteButton(f).dispatch('click');inputValue(f,'NETXX');clip.resolve('BCEFG');await flush();
 assert.equal(f.find('iw-code-input').value,'NETXX');f.screen.destroy();
});
test('clipboard responses resolved out of order must preserve the newest paste',async()=>{
 const a=deferred(),b=deferred(),queue=[a,b],f=fixture(method,{readClipboard:()=>queue.shift().promise});
 pasteButton(f).dispatch('click');pasteButton(f).dispatch('click');b.resolve('NETXX');await flush();a.resolve('BCEFG');await flush();
 assert.equal(f.find('iw-code-input').value,'NETXX');f.screen.destroy();
});
test('late clipboard rejection after Escape must not refocus or reopen code entry',async()=>{
 const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});
 inputValue(f,'NETXX');pasteButton(f).dispatch('click');f.find('iw-code-input').dispatch('keydown',{key:'Escape'});
 assert.equal(f.find('iw-hubcard--join').dataset.mode,'idle');clip.reject(new Error('denied'));await flush();
 assert.equal(f.find('iw-hubcard--join').dataset.mode,'idle');assert.notEqual(f.document.activeElement,f.find('iw-code-input'));f.screen.destroy();
});
test('clipboard result after a failed submitted join must not replace its code/error',async()=>{
 const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});inputValue(f,'NETXX');pasteButton(f).dispatch('click');joinButton(f).dispatch('click');
 f.pending[0].reject(new Error('Could not connect'));await flush();assert.equal(f.find('iw-hubcard--join').dataset.mode,'error');
 clip.resolve('BCEFG');await flush();assert.equal(f.find('iw-code-input').value,'NETXX');assert.equal(f.find('iw-hubcard--join').dataset.mode,'error');f.screen.destroy();
});
test('clipboard Promise after destroy/re-entry cannot write or focus either new screen',async()=>{
 const clip=deferred(),old=fixture(method,{readClipboard:()=>clip.promise});pasteButton(old).dispatch('click');old.screen.destroy();const next=fixture(method,{document:old.document});inputValue(next,'NETXX');clip.resolve('BCEFG');await flush();
 assert.equal(next.find('iw-code-input').value,'NETXX');assert.notEqual(next.document.activeElement,old.find('iw-code-input'));assert.equal(old.shows.length,0);next.screen.destroy();
});
test('late join/create success or error after destroy cannot navigate or contaminate re-entry',async()=>{
 for(const action of ['join','create'])for(const outcome of ['resolve','reject']){
  const old=fixture(method);if(action==='join'){inputValue(old,'NETXX');joinButton(old).dispatch('click');}else old.find('iw-hubcard--create').dispatch('click');
  old.screen.destroy();const next=fixture(method,{document:old.document});inputValue(next,'BCEFG');old.pending[0][outcome](outcome==='resolve'?'NETXX':new Error('Could not connect'));await flush();
  assert.deepEqual(old.shows,[]);assert.equal(next.find('iw-code-input').value,'BCEFG');assert.equal(next.find('iw-jstat').classList.contains('is-on'),false);next.screen.destroy();
 }
});
test('cancelled create completion cannot supersede a newer join attempt',async()=>{
 for(const outcome of ['resolve','reject']){
  const f=fixture(method);f.find('iw-hubcard--create').dispatch('click');f.screen.onKey({key:'Escape'});inputValue(f,'NETXX');joinButton(f).dispatch('click');
  f.pending[0][outcome](outcome==='resolve'?'BCEFG':new Error('Could not connect'));await flush();assert.deepEqual(f.shows,[]);assert.equal(f.find('iw-code-input').disabled,true);assert.equal(f.find('iw-hubcard--join').dataset.mode,'connecting');
  f.pending[1].reject(new Error('Could not connect'));await flush();assert.equal(f.find('iw-hubcard--join').dataset.mode,'error');f.screen.destroy();
 }
});
test('keyboard clipboard auto-join timer must not run after explicit Escape cancel',async()=>{
 const f=fixture(method,{touch:false});f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});f.screen.onKey({key:'Escape'});f.runTimers();await flush();
 assert.equal(f.requests.length,0);f.screen.destroy();
});

test('global paste during a pending join cannot overwrite disabled code state',async()=>{
 const f=fixture(method);inputValue(f,'NETXX');joinButton(f).dispatch('click');assert.equal(f.find('iw-code-input').disabled,true);
 f.find('iw-code-input').blur();f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});assert.equal(f.find('iw-code-input').value,'NETXX');assert.equal(f.find('iw-hubcard--join').dataset.mode,'connecting');f.screen.destroy();
});

test('actual production _swap destroys old online descriptor and constructs fresh descriptor on reopen',async()=>{
 const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});pasteButton(f).dispatch('click');
 const swapStart=composed.indexOf('  _swap(name, opts) {'),swapEnd=composed.indexOf("  /** mode: 'full'",swapStart);
 assert(swapStart>=0&&swapEnd>swapStart);const swapMethod=composed.slice(swapStart,swapEnd);
 f.document.documentElement=f.createElement('html');let timer=10000;
 const swap=vm.runInNewContext(`({${swapMethod}})`,{safeCall:fn=>fn(),document:f.document,CSS:{escape:x=>x},setTimeout:fn=>{f.timers.set(++timer,fn);return timer;}})._swap;
 Object.assign(f.api,{_scr:f.screen,_stack:['online'],_focusMem:{},el:f.createElement('div'),layer:f.createElement('div'),_scr_online:f.createScreen});
 swap.call(f.api,null,{instantLeave:true});assert.equal(f.api._scr,null);
 swap.call(f.api,'online',{});const reopened=f.api._scr;assert.notEqual(reopened,f.screen,'actual lifecycle must not reuse descriptor');
 const search=(e,cls)=>e.classList?.contains(cls)?e:e.children?.map(c=>search(c,cls)).find(Boolean);const input=search(reopened.el,'iw-code-input');input.value='NETXX';input.dispatch('input');
 clip.resolve('BCEFG');await flush();assert.equal(input.value,'NETXX');assert.equal(search(reopened.el,'iw-jstat').classList.contains('is-on'),false);reopened.destroy();
});

test('paste clicked while connecting cannot enqueue a clipboard write after the failure',async()=>{
 const clip=deferred();let reads=0;const f=fixture(method,{readClipboard:()=>{reads++;return clip.promise;}});inputValue(f,'NETXX');joinButton(f).dispatch('click');pasteButton(f).dispatch('click');
 f.pending[0].reject(new Error('Could not connect'));await flush();clip.resolve('BCEFG');await flush();
 assert.equal(reads,0,'busy entry must not begin clipboard work');assert.equal(f.find('iw-code-input').value,'NETXX');assert.equal(f.find('iw-hubcard--join').dataset.mode,'error');f.screen.destroy();
});

test('pending clipboard cannot supersede hardware/pad edits or clearing',async()=>{
 for(const edit of [f=>f.screen.onKey({key:'Backspace'}),f=>f.screen.onKey({key:'Delete'}),f=>f.screen.onKey({key:'g'}),f=>f.screen.onNav('alt'),f=>{f.api._input='pad';f.screen.onInputMode('pad');f.screen.onNav('up');}]){
  const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});inputValue(f,'NETXX');pasteButton(f).dispatch('click');edit(f);const intended=f.find('iw-code-input').value;clip.resolve('BCEFG');await flush();assert.equal(f.find('iw-code-input').value,intended);f.screen.destroy();
 }
});
test('unchallenged clipboard keeps touch explicit-submit and keyboard auto-join flows',async()=>{
 for(const touch of [true,false]){
  const clip=deferred(),f=fixture(method,{touch,readClipboard:()=>clip.promise});pasteButton(f).dispatch('click');clip.resolve('BCEFG');await flush();assert.equal(f.find('iw-code-input').value,'BCEFG');f.runTimers();await flush();assert.equal(f.requests.length,touch?0:1);f.screen.destroy();
 }
});
test('candidate transform is screen-scoped and fail-closed',()=>{
 assert.equal(adaptOnlineAsyncEntry('styles/ui.css','unchanged'),'unchanged');assert.throws(()=>adaptOnlineAsyncEntry('src/ui/menus.js','changed'),/anchors missing/);
 const next=candidate;assert.throws(()=>adaptOnlineAsyncEntry('src/ui/menus.js',next),/repeated transform/);
 const a=composed.indexOf('  _scr_online() {'),b=composed.indexOf('  // ================================================================ SCREEN: lobby',a);
 assert.equal(next.slice(0,a),composed.slice(0,a));assert.equal(next.slice(next.indexOf('  // ================================================================ SCREEN: lobby')),composed.slice(b));

});

test('late clipboard success/rejection must not overwrite or steal focus from newer name editing',async()=>{
 for(const outcome of ['resolve','reject']){
  const clip=deferred(),f=fixture(method,{readClipboard:()=>clip.promise});inputValue(f,'NETXX');pasteButton(f).dispatch('click');const name=f.find('iw-name__input');name.focus();name.value='New name';
  clip[outcome](outcome==='resolve'?'BCEFG':new Error('denied'));await flush();assert.equal(f.find('iw-code-input').value,'NETXX');assert.equal(f.document.activeElement,name);assert.equal(name.value,'New name');f.screen.destroy();
 }
});

test('new keyboard Paste request retires auto-join queued by the previous clipboard result',async()=>{
 const a=deferred(),b=deferred(),reads=[a,b],f=fixture(method,{touch:false,readClipboard:()=>reads.shift().promise});pasteButton(f).dispatch('click');a.resolve('BCEFG');await flush();pasteButton(f).dispatch('click');f.runTimers();await flush();assert.equal(f.requests.length,0,'older queued auto-join must yield to the newer paste request');b.resolve('NETXX');await flush();f.runTimers();await flush();assert.deepEqual(f.requests[0],['join','NETXX','Player']);f.screen.destroy();
});

test('new name editing cancels already queued keyboard clipboard auto-join',async()=>{
 const f=fixture(method,{touch:false});f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});const name=f.find('iw-name__input');name.focus();name.value='New name';f.runTimers();await flush();assert.equal(f.requests.length,0,'room join must not interrupt newer name editing');assert.equal(f.document.activeElement,name);f.screen.destroy();
});

test('new pad editing/partial confirmation retires previously queued clipboard auto-join',async()=>{
 for(const edit of [f=>f.screen.onNav('up'),f=>{f.screen.onNav('left');f.screen.onNav('accept');}]){
  const f=fixture(method,{touch:false});f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});f.api._input='pad';f.screen.onInputMode('pad');edit(f);f.runTimers();await flush();assert.equal(f.requests.length,0,'old paste must not auto-submit during a newer pad edit');f.screen.destroy();
 }
});

test('failed newer Create cannot release an older clipboard auto-join timer',async()=>{
 const f=fixture(method,{touch:false});f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});f.find('iw-hubcard--create').dispatch('click');f.pending[0].reject(new Error('Could not connect'));await flush();f.runTimers();await flush();assert.equal(f.requests.length,1,'failed Create must not unexpectedly fall through to joining old code');assert.equal(f.requests[0][0],'create');f.screen.destroy();
});
test('new invalid keyboard/paste attempts retire old clipboard auto-join rather than submit unchanged code',async()=>{
 for(const edit of [f=>f.screen.onKey({key:'o'}),f=>f.document.dispatch('paste',{clipboardData:{getData:()=> 'invalid clipboard text'}})]){
  const f=fixture(method,{touch:false});f.document.dispatch('paste',{clipboardData:{getData:()=> 'BCEFG'}});edit(f);f.runTimers();await flush();assert.equal(f.requests.length,0);f.screen.destroy();
 }
});
test('valid completed hardware typing still queues its intentional auto-join',async()=>{
 const f=fixture(method,{touch:false});for(const key of 'BCEFG')f.screen.onKey({key});f.runTimers();await flush();assert.deepEqual(f.requests[0],['join','BCEFG','Player']);f.screen.destroy();
});
