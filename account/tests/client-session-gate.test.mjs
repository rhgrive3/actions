import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { parse } from '../../patches/loading-cache/vendor/acorn.mjs';
const sourceRoot = process.env.INKWAVE_ACCOUNT_SESSION_SOURCE_ROOT
 ? pathToFileURL(process.env.INKWAVE_ACCOUNT_SESSION_SOURCE_ROOT.replace(/\/$/, '') + '/') : new URL('../client/src/', import.meta.url);
const source = name => fs.readFileSync(new URL(name, sourceRoot), 'utf8');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const settle = async () => { for(let i=0;i<20;i++) await Promise.resolve(); };
function fixture() {
 const calls=[];
 class AccountError extends Error { constructor(code) { super(code); this.code=code; } }
 const context=vm.createContext({console,Date,AbortController,AccountError,localStorage:{getItem:()=>null},
  game:{setProfileName(){}},api:{session(options){ const d=deferred(); calls.push({ ...d, signal:options?.signal }); options?.signal.addEventListener('abort',()=>d.reject(new AccountError('cancelled')),{once:true}); return d.promise; }} });
 vm.runInContext(source('store.js').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.account=account;',context);
 return {account:context.account,calls,context,AccountError};
}

test('mutation cancels an old refresh before the API starts and coalesces refresh until state commits',async()=>{
 const f=fixture(); f.account.signedIn({id:'old'});const old=f.account.refresh();await settle();
 const result=deferred();let runs=0;
 const mutation=f.account.mutateSession(()=>{runs++;assert.equal(f.calls[0].signal.aborted,true);return result.promise;},r=>f.account.signedIn(r.user));
 assert.equal(f.calls[0].signal.aborted,true,'invalidate at initiation, before mutation microtask');
 const queued=f.account.refresh(); assert.equal(f.account.refresh(),queued);
 await settle();assert.equal(runs,1);assert.equal(f.calls.length,1);await old;assert.equal(f.account.status,'user');
 result.resolve({user:{id:'new'}});await mutation;await settle();
 assert.equal(f.account.user.id,'new');assert.equal(f.calls.length,2);assert.equal(f.calls[1].signal.aborted,false);
 f.calls[1].resolve({user:{id:'new'}});await queued;assert.equal(f.account._pending,null);
});

test('failed mutation keeps current identity, releases queued refresh, and synchronous throws cannot stick the gate',async()=>{
 const f=fixture();f.account.signedIn({id:'known'});const d=deferred();
 const mutation=f.account.mutateSession(()=>d.promise);const rejected=assert.rejects(mutation,/wrong_password/);
 const queued=f.account.refresh();await settle();assert.equal(f.calls.length,0);
 d.reject(new Error('wrong_password'));await rejected;await settle();assert.equal(f.account.user.id,'known');assert.equal(f.calls.length,1);
 f.calls[0].resolve({user:{id:'known'}});await queued;
 await assert.rejects(f.account.mutateSession(()=>{throw new Error('sync');}),/sync/);
 const next=f.account.refresh();await settle();f.calls[1].resolve({user:null});await next;
 assert.equal(f.account.status,'guest');
});

test('queued mutations retain ownership until the newest mutation has applied its state',async()=>{
 const f=fixture(),a=deferred(),b=deferred();const order=[];
 const first=f.account.mutateSession(()=>{order.push('a');return a.promise;},()=>{order.push('apply-a');f.account.signedIn({id:'a'});});
 const second=f.account.mutateSession(()=>{order.push('b');return b.promise;},()=>{order.push('apply-b');f.account.signedOut();});
 const refresh=f.account.refresh();await settle();assert.deepEqual(order,['a']);assert.equal(f.calls.length,0);
 a.resolve({});await first;await settle();assert.deepEqual(order,['a','apply-a','b']);assert.equal(f.calls.length,0);
 b.resolve({});await second;await settle();assert.deepEqual(order,['a','apply-a','b','apply-b']);assert.equal(f.account.status,'guest');assert.equal(f.calls.length,1);
 f.calls[0].resolve({user:null});await refresh;
});

test('refresh scheduled but not yet dispatched is canceled before mutation',async()=>{
 const f=fixture();const old=f.account.refresh();const mutation=f.account.mutateSession(async()=>({user:{id:'new'}}),r=>f.account.signedIn(r.user));
 await Promise.all([old,mutation]);assert.equal(f.calls.length,0);assert.equal(f.account.user.id,'new');
});

// Evaluate the production panel call expression enclosing each real API call.
// This checks the five UI paths use the gate, without replacing their handlers
// with test-only wrappers or needing a browser/DOM for unrelated layout.
function mutationExpression(method) {
 const code=source('panel.js'),ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});let expression;
 const visit=(node,parents=[])=>{
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee.object?.name==='api'&&node.callee.property?.name===method){
   expression=[...parents].reverse().find(p=>p.type==='CallExpression'&&p.callee.object?.name==='account'&&p.callee.property?.name==='mutateSession')||node;
  }
  for(const [key,value]of Object.entries(node)){if(key==='start'||key==='end')continue;if(Array.isArray(value))value.forEach(child=>visit(child,[...parents,node]));else if(value&&typeof value==='object')visit(value,[...parents,node]);}
 };visit(ast);assert.ok(expression,method+' call exists');return code.slice(expression.start,expression.end);
}
for(const method of ['login','register','logout','password','remove'])test(`panel ${method} aborts observation before changing session and commits before refresh`,async()=>{
 const f=fixture();f.account.signedIn({id:'old'});const old=f.account.refresh();await settle();const d=deferred();
 f.context.api[method]=()=>{assert.equal(f.calls[0].signal?.aborted,true);return d.promise;};
 Object.assign(f.context,{expectedUserId:'old',closed:true,loginId:'player',pw:{value:'password'},cur:{value:'old-password'},remember:{checked:true},body:{},confirm:{value:'player'}});
 const mutation=vm.runInContext(mutationExpression(method),f.context);const queued=f.account.refresh();await settle();assert.equal(f.calls.length,1);
 d.resolve(method==='logout'||method==='remove'?null:{user:{id:'new'}});await mutation;await old;await settle();
 assert.equal(f.account.user?.id||null,method==='logout'||method==='remove'?null:'new');assert.equal(f.calls.length,2);
 f.calls[1].resolve({user:f.account.user});await queued;
});

test('optional caller abort cancels a streaming JSON body and removes its listener',async()=>{
 const external=new AbortController();let adds=0,removes=0,transportSignal;const realAdd=external.signal.addEventListener.bind(external.signal),realRemove=external.signal.removeEventListener.bind(external.signal);
 external.signal.addEventListener=(...args)=>{adds++;return realAdd(...args);};external.signal.removeEventListener=(...args)=>{removes++;return realRemove(...args);};
 const timers=new Map();const context=vm.createContext({AbortController,console,navigator:{onLine:true},setTimeout(fn){timers.set(1,fn);return 1;},clearTimeout(id){timers.delete(id);},fetch:async(_url,options)=>{
  transportSignal=options.signal;
  const body=new ReadableStream({start(controller){options.signal.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}});
  return new Response(body,{headers:{'Content-Type':'application/json'}});
 }});
 vm.runInContext(source('api.js').replace('import.meta.env.VITE_ACCOUNT_API',"''").replace(/^export /gm,'')+'\nglobalThis.api=api;',context);
 const pending=context.api.session({signal:external.signal});pending.catch(()=>{});await settle();external.abort();
 assert.equal(transportSignal.aborted,true);await assert.rejects(pending,e=>e.code==='cancelled');assert.equal(adds,1);assert.equal(removes,1);assert.equal(timers.size,0);
});

test('a mutation queued after a refresh waiter prevents the earlier gate from resuming observation',async()=>{
 const f=fixture(),a=deferred(),b=deferred();let secondStarted=false;
 const first=f.account.mutateSession(()=>a.promise);
 const refresh=f.account.refresh();
 const second=f.account.mutateSession(()=>{secondStarted=true;return b.promise;});
 a.resolve({});await first;await settle();assert.equal(secondStarted,true);assert.equal(f.calls.length,0);
 assert.equal(f.account.refresh(),f.account._queuedRefresh);
 b.resolve({});await second;await settle();assert.equal(f.calls.length,1);
 f.calls[0].resolve({user:null});await refresh;
});

test('an expired session is committed as signed out before queued observation starts',async()=>{
 const f=fixture();f.account.signedIn({id:'expired'});
 const mutation=f.account.mutateSession(async()=>{throw new f.AccountError('not_signed_in');});
 const queued=f.account.refresh();await assert.rejects(mutation,e=>e.code==='not_signed_in');await settle();
 assert.equal(f.account.status,'guest');assert.equal(f.calls.length,1);f.calls[0].resolve({user:null});await queued;
});

test('a caller-cancelled session request never reaches fetch when already aborted',async()=>{
 let fetched=false;const context=vm.createContext({AbortController,console,navigator:{onLine:true},setTimeout,clearTimeout,fetch:()=>{fetched=true;throw new Error('unexpected fetch');}});
 vm.runInContext(source('api.js').replace('import.meta.env.VITE_ACCOUNT_API',"''").replace(/^export /gm,'')+'\nglobalThis.api=api;',context);
 const ctl=new AbortController();ctl.abort();await assert.rejects(context.api.session({signal:ctl.signal}),e=>e.code==='cancelled');assert.equal(fetched,false);
});

test('caller abort listeners are removed on both success and ordinary network failure',async()=>{
 for(const fail of [false,true]){
  const external=new AbortController();let removed=0;const remove=external.signal.removeEventListener.bind(external.signal);
  external.signal.removeEventListener=(...args)=>{removed++;return remove(...args);};
  const context=vm.createContext({AbortController,console,navigator:{onLine:true},setTimeout,clearTimeout,fetch:async()=>{if(fail)throw new TypeError('network');return Response.json({user:null});}});
  vm.runInContext(source('api.js').replace('import.meta.env.VITE_ACCOUNT_API',"''").replace(/^export /gm,'')+'\nglobalThis.api=api;',context);
  if(fail)await assert.rejects(context.api.session({signal:external.signal}),e=>e.code==='network');else assert.equal((await context.api.session({signal:external.signal})).user,null);
  assert.equal(removed,1);
 }
});

test('async application keeps the mutation gate closed until the identity is committed',async()=>{
 const f=fixture(),apply=deferred();
 const mutation=f.account.mutateSession(async()=>({user:{id:'new'}}),async result=>{await apply.promise;f.account.signedIn(result.user);});
 const refresh=f.account.refresh();await settle();assert.equal(f.calls.length,0);assert.equal(f.account.user,null);
 apply.resolve();await mutation;await settle();assert.equal(f.account.user.id,'new');assert.equal(f.calls.length,1);
 f.calls[0].resolve({user:{id:'new'}});await refresh;
});
