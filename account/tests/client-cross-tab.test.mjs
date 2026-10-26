import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../client/src/api.js',import.meta.url),'utf8').replace('import.meta.env.VITE_ACCOUNT_API',"''").replace(/^export /gm,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const settle=async()=>{for(let n=0;n<25;n++)await Promise.resolve();};
function locks(){
 let tail=Promise.resolve();const records=[];
 return {records,request(name,options,run){
  records.push({name,options});const predecessor=tail;
  const done=deferred();tail=done.promise;
  return new Promise((resolve,reject)=>{
   const abort=()=>reject(new DOMException('Aborted','AbortError'));
   options.signal.addEventListener('abort',abort,{once:true});
   predecessor.then(async()=>{
    options.signal.removeEventListener('abort',abort);
    try {if(options.signal.aborted)throw new DOMException('Aborted','AbortError');resolve(await run());}
    catch(e){reject(e);}finally{done.resolve();}
   });
  });
 }};
}
function fixture({lockManager,fetch,Channel}={}){
 const timers=new Map();let id=0;
 const c=vm.createContext({console,AbortController,DOMException,URL,Math,Date,Promise,
  navigator:{onLine:true,...(lockManager?{locks:lockManager}:{})},BroadcastChannel:Channel,
  setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(i){timers.delete(i);},fetch,
 });
 vm.runInContext(src+'\nglobalThis.subject={api,request,AccountError};',c);
 return {...c.subject,timers};
}
test('different tabs serialize cookie-bearing reads and writes through body completion',async()=>{
 const manager=locks(),body=deferred(),order=[];
 const a=fixture({lockManager:manager,fetch:async()=>{order.push('read');return{status:200,ok:true,headers:new Headers({'content-type':'application/json'}),json:()=>body.promise};}});
 const b=fixture({lockManager:manager,fetch:async()=>{order.push('write');return Response.json({ok:true});}});
 const read=a.api.session();await settle();const write=b.api.logout();await settle();
 assert.deepEqual(order,['read']);body.resolve({user:null});await Promise.all([read,write]);
 assert.deepEqual(order,['read','write']);assert.equal(manager.records.length,2);
 assert.equal(manager.records[0].name,manager.records[1].name);
});
test('timed-out queued mutations are not sent after their lock becomes available',async()=>{
 const manager=locks(),body=deferred();let writes=0;
 const a=fixture({lockManager:manager,fetch:()=>body.promise});
 const b=fixture({lockManager:manager,fetch:async()=>{writes++;return Response.json({ok:true});}});
 const read=a.api.session();await settle();const write=b.api.logout();write.catch(()=>{});await settle();
 [...b.timers.values()][0]();await assert.rejects(write,e=>e.code==='timeout');
 body.resolve(Response.json({user:null}));await read;await settle();assert.equal(writes,0);
});
test('queued caller cancellation never dispatches a cookie mutation',async()=>{
 const manager=locks(),body=deferred(),ctl=new AbortController();let writes=0;
 const a=fixture({lockManager:manager,fetch:()=>body.promise});
 const b=fixture({lockManager:manager,fetch:async()=>{writes++;return Response.json({});}});
 const read=a.api.session();await settle();const write=b.request('PATCH','/profile',{}, {signal:ctl.signal});write.catch(()=>{});await settle();ctl.abort();
 await assert.rejects(write,e=>e.code==='cancelled');body.resolve(Response.json({user:null}));await read;await settle();assert.equal(writes,0);
});
test('lock provider rejection does not fall back to an uncoordinated mutation',async()=>{
 let writes=0;const f=fixture({lockManager:{request:async()=>{throw Error('lock unavailable');}},fetch:async()=>{writes++;return Response.json({});}});
 await assert.rejects(f.api.logout(),e=>e.code==='network');assert.equal(writes,0);assert.equal(f.timers.size,0);
});
test('legacy fallback serializes this tab and releases a failed request',async()=>{
 const body=deferred(),order=[];const f=fixture({fetch:async(_u,o)=>{order.push(o.method);if(o.method==='GET')return body.promise;return Response.json({ok:true});}});
 const a=f.api.session();a.catch(()=>{});await settle();const b=f.api.logout();await settle();assert.deepEqual(order,['GET']);
 body.reject(Error('network'));await assert.rejects(a,e=>e.code==='network');await b;assert.deepEqual(order,['GET','POST']);
});
test('mutation notifications are invalidations only and channels close when unsubscribed',async()=>{
 const sent=[],channels=[];
 class Channel{constructor(name){this.name=name;this.closed=false;channels.push(this);}postMessage(m){sent.push(m);}close(){this.closed=true;}}
 const f=fixture({Channel,fetch:async()=>Response.json({user:{id:'private-user',loginId:'private-id'}})});
 const off=f.api.onSessionChange(()=>{});await f.api.login({loginId:'private-id',password:'secret'});
 assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['type','version']);assert(!JSON.stringify(sent).includes('private'));off();assert(channels.every(c=>c.closed));
});
test('a failed dispatched mutation still invalidates other tabs without replaying the request',async()=>{
 const sent=[];let requests=0;class Channel{postMessage(m){sent.push(m);}close(){}}
 const f=fixture({Channel,fetch:async()=>{requests++;throw Error('ambiguous connection loss');}});
 const off=f.api.onSessionChange(()=>{});await assert.rejects(f.api.logout(),e=>e.code==='network');assert.equal(requests,1);assert.equal(sent.length,1);off();
});

test('notification teardown failure cannot turn a successful mutation into an error',async()=>{
 class Channel{postMessage(){}close(){throw Error('disposing channel failed');}}
 const f=fixture({Channel,fetch:async()=>Response.json({ok:true})});assert.equal((await f.api.logout()).ok,true);
});
test('protected API helpers pin the captured account ID without changing older callers',async()=>{
 const sent=[];const f=fixture({fetch:async(url,options)=>{sent.push({url,body:options.body?JSON.parse(options.body):null});return Response.json({sessions:[]});}});
 await f.api.rename('name','owner');await f.api.profile({avatarIcon:'star'},'owner');await f.api.password({},'owner');await f.api.remove({},'owner');await f.api.revoke({},'owner');
 for(const request of sent)assert.equal(request.body.expectedUserId,'owner');
 await f.api.sessions({expectedUserId:'owner /?'});assert(sent.at(-1).url.endsWith('/sessions?expectedUserId=owner%20%2F%3F'));
 await f.api.rename('old-client');assert.equal(Object.hasOwn(sent.at(-1).body,'expectedUserId'),false);
});
