import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../client/src/store.js',import.meta.url),'utf8');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function fixture(){
 const calls=[],listeners={window:new Map(),document:new Map()},notices=new Set();let now=1000000;
 const add=area=>(key,fn)=>{if(!listeners[area].has(key))listeners[area].set(key,new Set());listeners[area].get(key).add(fn);};
 const remove=area=>(key,fn)=>listeners[area].get(key)?.delete(fn);
 class AccountError extends Error{constructor(code){super(code);this.code=code;}}
 const document={visibilityState:'visible',addEventListener:add('document'),removeEventListener:remove('document')};
 const context=vm.createContext({console,AbortController,AccountError,Date:{now:()=>now},document,
  addEventListener:add('window'),removeEventListener:remove('window'),localStorage:{getItem:()=>null,setItem(){}},game:{setProfileName(){}},
  api:{onSessionChange(fn){notices.add(fn);return()=>notices.delete(fn);},session({signal}){
   let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
   signal.addEventListener('abort',()=>reject(new AccountError('cancelled')),{once:true});
   calls.push({resolve,reject,signal});return promise;
  }},
 });
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'')+'\nglobalThis.subject=account;',context);
 return{account:context.subject,calls,listeners,notices,document,AccountError,advance(ms){now+=ms;},
  event(area,key,event={}){for(const fn of listeners[area].get(key)||[])fn(event);},notice(){for(const fn of notices)fn();}};
}
test('watch installs listeners once, teardown is idempotent, and old teardown cannot stop a new watch',async()=>{
 const f=fixture(),stop=f.account.watch();assert.equal(f.account.watch(),stop);await settle();assert.equal(f.calls.length,1);
 for(const group of Object.values(f.listeners))for(const values of group.values())assert.equal(values.size,1);
 assert.equal(f.notices.size,1);f.calls[0].resolve({user:null});await settle();
 stop();stop();assert.equal(f.notices.size,0);for(const group of Object.values(f.listeners))for(const values of group.values())assert.equal(values.size,0);
 const fresh=f.account.watch();stop();assert.equal(f.notices.size,1);await settle();assert.equal(f.calls.length,2);
 f.calls[1].resolve({user:null});await settle();fresh();
});
test('rapid invalidation notices abort old observations and coalesce before dispatch',async()=>{
 const f=fixture(),stop=f.account.watch();await settle();
 for(let i=0;i<20;i++)f.notice();await settle();
 assert.equal(f.calls[0].signal.aborted,true);assert.equal(f.calls.length,2);
 f.calls[1].resolve({user:{id:'new'}});await settle();assert.equal(f.account.user.id,'new');stop();
});
test('back-forward cache restoration revalidates instead of trusting the frozen identity',async()=>{
 const f=fixture(),stop=f.account.watch();await settle();f.calls[0].resolve({user:{id:'old'}});await settle();
 f.event('window','pageshow',{persisted:false});await settle();assert.equal(f.calls.length,1);
 f.event('window','pageshow',{persisted:true});await settle();assert.equal(f.calls.length,2);
 f.calls[1].resolve({user:null});await settle();assert.equal(f.account.status,'guest');stop();
});
test('hidden tabs avoid periodic checks and visible stale tabs refresh once',async()=>{
 const f=fixture(),stop=f.account.watch();await settle();f.calls[0].resolve({user:null});await settle();
 f.advance(301000);f.document.visibilityState='hidden';f.event('document','visibilitychange');await settle();assert.equal(f.calls.length,1);
 f.document.visibilityState='visible';for(let i=0;i<5;i++)f.event('document','visibilitychange');await settle();assert.equal(f.calls.length,2);
 f.calls[1].resolve({user:null});await settle();stop();
});
test('account-change conflicts reconcile after releasing the mutation queue without erasing the current identity',async()=>{
 const f=fixture();f.account.signedIn({id:'old'});
 const pending=f.account.mutateSession(async()=>{throw new f.AccountError('account_changed');});
 await assert.rejects(pending,e=>e.code==='account_changed');await settle();
 assert.equal(f.account.user.id,'old');assert.equal(f.calls.length,1);
 f.calls[0].resolve({user:{id:'new'}});await settle();assert.equal(f.account.user.id,'new');assert.equal(f.account._sessionMutation,null);
});
