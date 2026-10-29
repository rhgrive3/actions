// Browser component-test observer, independent of production listener owners.
// Track the full DOM listener identity: target, type, callback and capture.
const capture=o=>typeof o==='boolean'?o:!!o?.capture;
const check=(condition,message)=>{if(!condition)throw Error(message);};
export function auditInputListeners({Input,windowTarget,documentTarget,canvas,event,keyEvent,cycles=10,requireCanvas=false,onSentinels}){
 const targets=[windowTarget,documentTarget,canvas],names=['window','document','canvas'];
 const originals=targets.map(t=>({add:t.addEventListener,remove:t.removeEventListener,
  addOwn:Object.getOwnPropertyDescriptor(t,'addEventListener'),removeOwn:Object.getOwnPropertyDescriptor(t,'removeEventListener')}));
 const sentinelCalls=[0,0,0],sentinels=targets.map((target,i)=>{
  const callback=e=>{if(e.target===target)sentinelCalls[i]++;};originals[i].add.call(target,'iw-audit-sentinel',callback,{capture:true});return {target,callback};
 });
 onSentinels?.(sentinels);
 const records=[],retired=[],summaries=[];let addCalls=0,removeCalls=0;
 const active=row=>!row.removed&&!row.signal?.aborted;
 function find(target,type,callback,useCapture){return records.find(r=>r.target===target&&r.type===type&&r.callback===callback&&r.capture===useCapture&&active(r));}
 const restore=(target,key,desc)=>desc?Object.defineProperty(target,key,desc):delete target[key];
 try{
  targets.forEach((target,i)=>{
   target.addEventListener=function(type,callback,options){
    const result=originals[i].add.call(this,type,callback,options);addCalls++;
    if(callback!=null&&!find(this,type,callback,capture(options)))records.push({target:this,type,callback,capture:capture(options),signal:options&&typeof options==='object'?options.signal:null,removed:false});
    return result;
   };
   target.removeEventListener=function(type,callback,options){
    const row=find(this,type,callback,capture(options));const result=originals[i].remove.call(this,type,callback,options);removeCalls++;
    if(row)row.removed=true;return result;
   };
  });
  for(let n=0;n<cycles;n++){
   const begin=records.length,input=new Input(canvas),created=records.slice(begin),owners=input._platformInputListeners;
   check(Array.isArray(owners),'Input does not expose its platform listener owners');
   for(const o of owners){if(!targets.includes(o.target))continue;check(created.some(r=>r.target===o.target&&r.type===o.type&&r.callback===o.callback&&r.capture===!!o.capture&&active(r)),'missing platform listener '+o.type);}
   // Mobile geometry observation owns explicit unsubs rather than an AbortSignal.
   const sampler=input.mobile?._queueSafeLayout;
   const samplerOwnsListeners=Array.isArray(sampler?.unsubs)&&sampler.unsubs.length>0;
   for(const r of created)check(owners.some(o=>o.target===r.target&&o.type===r.type&&o.callback===r.callback&&!!o.capture===r.capture)||r.signal||samplerOwnsListeners,'listener lacks an instance owner: '+r.type);
   if(requireCanvas)check(created.some(r=>r.target===canvas),'touch Input did not register canvas listeners');
   for(const old of retired)check(!old.down('KeyA'),'retired Input received a later key');
   windowTarget.dispatchEvent(keyEvent('keydown','KeyW'));check(input.down('KeyW'),'live Input lost keydown');
   const addsBeforeDispose=addCalls;input.disposePlatform();const removesAfterFirst=removeCalls;
   check(addCalls===addsBeforeDispose,'dispose unexpectedly added listeners');
   if(samplerOwnsListeners)check(sampler.unsubs.length===0,'mobile layout sampler retained its unsubs');
   check(created.every(r=>!active(r)),'instance listener remains active: '+created.filter(active).map(r=>names[targets.indexOf(r.target)]+':'+r.type+':'+r.capture).join(','));
   input.disposePlatform();check(addCalls===addsBeforeDispose&&removeCalls===removesAfterFirst,'second dispose is not idempotent');
   windowTarget.dispatchEvent(keyEvent('keyup','KeyW'));windowTarget.dispatchEvent(keyEvent('keydown','KeyA'));
   check(input.down('KeyW')&&!input.down('KeyA'),'retired Input still receives keyboard events');
   retired.push(input);for(const target of targets)target.dispatchEvent(event('iw-audit-sentinel'));
   check(sentinelCalls.every(v=>v===n+1),'an unrelated preexisting sentinel was removed');
   summaries.push({cycle:n+1,registered:created.length,targets:Object.fromEntries(names.map((name,i)=>[name,created.filter(r=>r.target===targets[i]).map(r=>({type:r.type,capture:r.capture,signal:!!r.signal}))]))});
  }
  check(records.every(r=>!active(r)),'listener remains after last Input');
  return {cycles,adds:addCalls,removeCalls,active:records.filter(active).length,sentinelCalls,instances:summaries};
 }finally{
  targets.forEach((t,i)=>{restore(t,'addEventListener',originals[i].addOwn);restore(t,'removeEventListener',originals[i].removeOwn);originals[i].remove.call(t,'iw-audit-sentinel',sentinels[i].callback,{capture:true});});
 }
}
