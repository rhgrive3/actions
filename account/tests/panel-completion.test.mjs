// Evaluates actual production callbacks with a small lifecycle fixture.
// No DOM layout, accessibility or native browser acceptance is implied.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
const source=fs.readFileSync(new URL('../client/src/panel.js',import.meta.url),'utf8');
const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
function find(root,predicate){
 if(!root||typeof root!=='object')return;
 if(predicate(root))return root;
 for(const value of Object.values(root))for(const node of Array.isArray(value)?value:[value]){const found=find(node,predicate);if(found)return found;}
}
const text=node=>{assert.ok(node);return source.slice(node.start,node.end);};
const named=name=>text(find(ast,node=>node.type==='FunctionDeclaration'&&node.id.name===name));
const view=find(ast,node=>node.type==='Property'&&node.key.name==='delete'&&node.method);
const handler=text(find(view,node=>node.type==='CallExpression'&&node.callee.object?.name==='form'&&node.arguments[0]?.value==='submit').arguments[1]);
const subscriber=text(find(ast,node=>node.type==='CallExpression'&&node.callee.object?.name==='account'&&node.callee.property?.name==='subscribe').arguments[0]);
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
async function fixture(){
 const operation=deferred(),calls=[],frames=[];
 class AccountError extends Error{constructor(code){super(code);this.code=code;}}
 const account={user:{id:'old'},_subs:new Set(),subscribe(fn){this._subs.add(fn);fn();},signedOut(){this.user=null;for(const fn of this._subs)fn();},async mutateSession(run,apply){const result=await run();apply?.(result);return result;}};
 const c=vm.createContext({console,AccountError,account,api:{remove:()=>operation.promise},
  go:{disabled:false,setBusy(){}},bn:{hide(){}},confirm:{value:'Test',setError(){},focus(){}},pw:{value:'test-password'},
  expectedUserId:'old',matches:()=>true,sync:()=>calls.push('sync'),t:x=>x,
  game:{sfx:()=>{},menus:()=>({toast:message=>calls.push(message)})},
  dialog:{setAttribute(){},removeAttribute(){},focus:()=>calls.push('dialog-focus')},
  requestAnimationFrame:fn=>frames.push(fn),renderHero(){},current:{},touch:false,
 });
 vm.runInContext(`let closed=false, viewEpoch=1, pendingForms=0, viewName='delete', observedUserId='old';
 function show(name){viewEpoch++;viewName=name;}
 function close(){closed=true;viewEpoch++;}
 ${named('submit')}
 ${named('focusFirst')}
 account.subscribe(${subscriber});
 globalThis.run=${handler};
 globalThis.state=()=>({closed,viewEpoch,viewName,pendingForms});
 globalThis.navigate=name=>show(name);
 globalThis.closePanel=()=>close();`,c);
 return{operation,c,calls,frames,run:()=>c.run({preventDefault(){}}),state:c.state};
}
test('successful deletion closes its owned dialog despite the synchronous signed-out subscription',async()=>{
 const f=await fixture(),flight=f.run();f.operation.resolve(null);await flight;
 assert.equal(f.state().closed,true);assert.deepEqual(f.calls,['delete.done']);assert.equal(f.state().pendingForms,0);
});
test('deletion completing after navigation cannot close a replacement view or publish its old toast',async()=>{
 const f=await fixture(),flight=f.run();f.c.navigate('register');f.operation.resolve(null);await flight;
 assert.equal(f.state().closed,false);assert.equal(f.state().viewName,'register');assert.deepEqual(f.calls,[]);
});
test('deletion completing after close cannot publish a late game toast',async()=>{
 const f=await fixture(),flight=f.run();f.c.closePanel();f.operation.resolve(null);await flight;
 assert.equal(f.state().closed,true);assert.deepEqual(f.calls,[]);
});
test('old animation-frame focus work cannot focus a field after switching views',async()=>{
 const f=await fixture();
 f.c.current={initial:()=>({focus:()=>f.calls.push('old-focus')})};
 vm.runInContext('focusFirst()',f.c);f.c.navigate('login');for(const fn of f.frames)fn();
 assert.deepEqual(f.calls,[]);
});
