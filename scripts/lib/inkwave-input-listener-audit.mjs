// Browser component-test observer. DOM listener identity includes the target,
// event type, callback and capture phase; signal abortion is also retirement.
const capture=o=>typeof o==='boolean'?o:!!o?.capture;
const check=(condition,message)=>{if(!condition)throw Error(message);};
const layoutWindow=['resize','scroll','orientationchange','fullscreenchange','animationstart','animationend','animationcancel','transitionrun','transitionend','transitioncancel'];
export function auditInputListeners({Input,windowTarget,documentTarget,canvas,orientationTarget,viewportTarget,fontsTarget,eventTargetPrototype,event,keyEvent,cycles=10,requireCanvas=false,onSentinels}){
 const base=[windowTarget,documentTarget,canvas],names=['window','document','canvas'];
 const proto=eventTargetPrototype||Object.getPrototypeOf(windowTarget);
 const originalAdd=proto.addEventListener,originalRemove=proto.removeEventListener;
 const addDesc=Object.getOwnPropertyDescriptor(proto,'addEventListener'),removeDesc=Object.getOwnPropertyDescriptor(proto,'removeEventListener');
 const sentinelCalls=[0,0,0],sentinels=base.map((target,i)=>{
  const callback=e=>{if(e.target===target)sentinelCalls[i]++;};originalAdd.call(target,'iw-audit-sentinel',callback,{capture:true});return {target,callback};
 });
 const records=[],retired=[],summaries=[];let addCalls=0,removeCalls=0;
 const active=row=>!row.removed&&!row.signal?.aborted;
 const find=(target,type,callback,useCapture)=>records.find(r=>r.target===target&&r.type===type&&r.callback===callback&&r.capture===useCapture&&active(r));
 const restore=(key,desc)=>desc?Object.defineProperty(proto,key,desc):delete proto[key];
 try{
  onSentinels?.(sentinels);
  proto.addEventListener=function(type,callback,options){
   const result=originalAdd.call(this,type,callback,options);addCalls++;
   if(callback!=null&&!find(this,type,callback,capture(options)))records.push({target:this,type,callback,capture:capture(options),signal:options&&typeof options==='object'?options.signal:null,removed:false});
   return result;
  };
  proto.removeEventListener=function(type,callback,options){
   const row=find(this,type,callback,capture(options)),result=originalRemove.call(this,type,callback,options);removeCalls++;
   if(row)row.removed=true;return result;
  };
  for(let n=0;n<cycles;n++){
   const begin=records.length,input=new Input(canvas),allCreated=records.slice(begin),owners=input._platformInputListeners,mobile=input.mobile,root=mobile?.root;
   check(Array.isArray(owners),'Input does not expose its platform listener owners');
   const kind=target=>target===windowTarget?'window':target===documentTarget?'document':target===canvas?'canvas':target===orientationTarget?'orientation':target===viewportTarget?'visualViewport':target===fontsTarget?'fonts':target===root?'mobile-root':target?.nodeType&&root?.contains?.(target)?'mobile-descendant':null;
   const created=allCreated.filter(r=>kind(r.target));
   for(const o of owners)check(created.some(r=>r.target===o.target&&r.type===o.type&&r.callback===o.callback&&r.capture===!!o.capture&&active(r)),'missing platform listener '+o.type);
   // LayoutSample registers this exact set using explicit unsubscriptions.
   const sampler=mobile?._queueSafeLayout,expected=[];
   if(sampler){for(const type of layoutWindow)expected.push([windowTarget,type]);for(const type of ['resize','scroll'])if(viewportTarget?.addEventListener)expected.push([viewportTarget,type]);for(const type of ['loadingdone','loadingerror'])if(fontsTarget?.addEventListener)expected.push([fontsTarget,type]);
    check(sampler.unsubs?.length===expected.length,'mobile layout sampler subscription count mismatch');}
   const layoutRows=[];
   for(const r of created){
    if(owners.some(o=>o.target===r.target&&o.type===r.type&&o.callback===r.callback&&!!o.capture===r.capture))r.owner='platform';
    else if(r.signal&&r.signal===mobile?._abort?.signal)r.owner='mobile-signal';
    else if(r.target===mobile?.els?.gyro&&r.type==='click'&&!r.capture)r.owner='mobile-gyro';
    else if(sampler&&r.capture&&expected.some(([target,type])=>target===r.target&&type===r.type)){r.owner='mobile-layout';layoutRows.push(r);}
    else check(false,'listener lacks an identified instance owner: '+kind(r.target)+':'+r.type);
   }
   for(const [target,type] of expected)check(layoutRows.filter(r=>r.target===target&&r.type===type).length===1,'missing or duplicated mobile layout listener: '+type);
   if(requireCanvas){check(created.some(r=>r.target===canvas),'touch Input did not register canvas listeners');check(created.some(r=>kind(r.target)==='mobile-root'),'touch Input did not register root listeners');check(!orientationTarget||created.some(r=>r.target===orientationTarget),'touch Input did not register orientation listener');}
   for(const old of retired)check(!old.down('KeyA'),'retired Input received a later key');
   windowTarget.dispatchEvent(keyEvent('keydown','KeyW'));check(input.down('KeyW'),'live Input lost keydown');
   const addsBeforeDispose=addCalls;input.disposePlatform();const removesAfterFirst=removeCalls;
   check(addCalls===addsBeforeDispose,'dispose unexpectedly added listeners');
   if(sampler)check(sampler.unsubs.length===0,'mobile layout sampler retained its unsubs');
   check(created.every(r=>!active(r)),'instance listener remains active: '+created.filter(active).map(r=>kind(r.target)+':'+r.type+':'+r.capture).join(','));
   input.disposePlatform();check(addCalls===addsBeforeDispose&&removeCalls===removesAfterFirst,'second dispose is not idempotent');
   windowTarget.dispatchEvent(keyEvent('keyup','KeyW'));windowTarget.dispatchEvent(keyEvent('keydown','KeyA'));
   check(input.down('KeyW')&&!input.down('KeyA'),'retired Input still receives keyboard events');
   retired.push(input);for(const target of base)target.dispatchEvent(event('iw-audit-sentinel'));
   check(sentinelCalls.every(v=>v===n+1),'an unrelated preexisting sentinel was removed');
   const targets={};for(const r of created)(targets[kind(r.target)]??=[]).push({type:r.type,capture:r.capture,owner:r.owner});
   summaries.push({cycle:n+1,registered:created.length,targets,excludedOtherTargets:allCreated.length-created.length});
  }
  return {cycles,adds:addCalls,removeCalls,active:0,sentinelCalls,instances:summaries};
 }finally{
  restore('addEventListener',addDesc);restore('removeEventListener',removeDesc);
  base.forEach((t,i)=>originalRemove.call(t,'iw-audit-sentinel',sentinels[i].callback,{capture:true}));
 }
}
