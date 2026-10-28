// Opt-in, same-origin diagnostic setup through ordinary native settings UI.
// The caller creates a fresh isolated context and installs existing lock/key
// observers first. No game state, permissions, DOM events, or private storage
// are written by this helper. Checks and trusted input are non-atomic.
import {readResumeState} from '../check-inkwave-lock-resume-probe.mjs';
import {rangeMenuControlReady} from './inkwave-range-menu-entry.mjs';

export const LOW_UI_ROUTE=Object.freeze([
 {key:'settings',selector:'.iw-ui .iw-main:not(.is-leaving) [data-id="settings"]',menu:'main',next:'settings'},
 {key:'video',selector:'.iw-ui .iw-settings:not(.is-leaving) [data-id="tab-video"]',menu:'settings',next:'settings'},
 {key:'quality',selector:'.iw-ui .iw-settings:not(.is-leaving) [data-id="set-quality"] .iw-seg__opt:nth-child(2)',menu:'settings',next:'settings'},
 {key:'back',selector:'.iw-ui .iw-settings:not(.is-leaving) .iw-backbtn',menu:'settings',next:'main'},
]);
export function installLowGraphicsObserver(){
 if(window.__lowGraphicsObserver)throw Error('LOW UI observer already installed');
 const state={events:[],count:0};
 const listener=e=>{const target=e.target,control=target?.closest?.('[data-id]'),option=target?.closest?.('.iw-seg__opt'),back=target?.closest?.('button.iw-backbtn'),row=option?.closest?.('[data-id="set-quality"]');let key=null,index=null,controlTag=null;
  if(control?.dataset?.id==='settings'){key='settings';controlTag=control.tagName;}
  else if(control?.dataset?.id==='tab-video'){key='video';controlTag=control.tagName;}
  else if(row&&option){key='quality';controlTag=option.tagName;index=[...row.querySelectorAll('.iw-seg__opt')].indexOf(option);}
  else if(back){key='back';controlTag=back.tagName;}
  state.count++;if(state.events.length<64)state.events.push({type:e.type,trusted:e.isTrusted,key,index,controlTag,targetTag:target?.tagName??null,menu:window.__inkwave?.menus?.current??null,time:performance.now()});
 };
 document.addEventListener('click',listener,true);window.__lowGraphicsObserver={state,listener};return true;
}
export function readLowGraphicsUi(){
 const g=window.__inkwave,G=window.__G,m=G?.match,i=g?.input,k=window.__resumeProbeKeys,o=window.__lowGraphicsObserver?.state,q=g?.R?.q;
 const screen=g?.menus?._scr?.el,row=screen?.querySelector?.('[data-id="set-quality"]'),options=row?[...row.querySelectorAll('.iw-seg__opt')]:[];
 const selected=options.map((x,i)=>x.classList.contains('is-sel')?i:null).filter(x=>x!==null);
 return {menu:g?.menus?.current??null,
  owner:{matchIdentity:k?.id?.(m)??null,mode:G?.mode??null,gameMatches:!!g&&G?.game===g,matchMatches:!!m&&g?.match===m,attract:m?.attract??null,matchState:m?.state??null,paused:m?.paused??null,noRange:!!m&&m.range==null,noLocal:!!m&&m.local===null&&G?.local===null,menusMatch:!!g?.menus&&G?.menus===g.menus,screenName:g?.menus?._scr?.name??null,screenConnected:screen?.isConnected??null,screenInert:screen?.inert??null,noModal:!!g?.menus&&g.menus._modal===null,inputMatches:!!i&&G?.input===i,noPending:!!i&&i._pointerLockPending==null,heldKeys:i?.keys instanceof Set?[...i.keys]:null,mouseLeft:i?.mouse?.left??null,mouseRight:i?.mouse?.right??null},settingsQuality:g?.settings?.quality??null,
  effective:q?{pixelRatio:q.pixelRatio,shadowSize:q.shadowSize,msaa:q.msaa,bloom:q.bloom,ao:q.ao,particles:q.particles}:null,
  selectedOptions:selected,optionCount:options.length,viewport:{width:innerWidth,height:innerHeight,deviceScaleFactor:window.devicePixelRatio??null},
  pointerLockHeld:document.pointerLockElement!==null,pointerLockElement:document.pointerLockElement?.id??null,observer:o?{count:o.count,events:o.events.slice()}:null};
}
export function lowGraphicsApplied(){
 const g=window.__inkwave,o=window.__nativeLockOutcome,t=window.__nativeLockEvidence,k=window.__resumeProbeKeys,u=window.__lowGraphicsObserver?.state,q=g?.R?.q;
 if(!o?.installed||o.stopFurtherInput||!o.attributeMatch||!Array.isArray(o.calls)||o.count!==o.calls.length||o.count!==0||!t||!Array.isArray(t.events)||t.eventCount!==t.events.length||!u||!Array.isArray(u.events)||u.count!==u.events.length||t.eventCount!==u.count||t.events.some((e,i)=>e.type!=='click'||e.trusted!==true||e.id!==['settings','tab-video','set-quality',null][i]||e.menu!==['main','settings','settings','settings'][i]||u.events[i]?.key!==['settings','video','quality','back'][i])||!k||!Array.isArray(k.keys)||k.count!==k.keys.length||k.count!==0||g?.input?._pointerLockPending)return true;
 return g?.settings?.quality==='low'&&q?.pixelRatio===.75&&q?.shadowSize===1024&&q?.msaa===0&&q?.bloom===false&&q?.ao===false&&q?.particles===.4;
}
export function removeLowGraphicsObserver(){const x=window.__lowGraphicsObserver;if(!x||typeof x.listener!=='function')throw Error('LOW UI observer missing');document.removeEventListener('click',x.listener,true);if(window.__lowGraphicsObserver!==x)throw Error('LOW UI observer replaced');delete window.__lowGraphicsObserver;return true;}
export function assertLowUiSafety(state,ui,menu,viewport){
 const o=state?.observer,e=state?.events,k=state?.keys,obs=ui?.observer,owner=ui?.owner;
 if(!o?.installed||!o.attributeMatch||o.stopFurtherInput||!Array.isArray(o.calls)||!Number.isSafeInteger(o.count)||o.count!==o.calls.length||o.count!==0||
 !e||!Array.isArray(e.events)||!Number.isSafeInteger(e.eventCount)||e.eventCount!==e.events.length||
 !k||!Array.isArray(k.keys)||!Number.isSafeInteger(k.count)||k.count!==k.keys.length||k.count!==0||state.pending!==false||state.playing!==true||state.range!==false||state.paused!==false||state.inputLocked!==false||state.canvasLocked!==false||
 !owner||!Number.isSafeInteger(state.matchIdentity)||state.matchIdentity<1||owner.matchIdentity!==state.matchIdentity||owner.mode!=='menu'||owner.gameMatches!==true||owner.matchMatches!==true||owner.attract!==true||owner.matchState!=='playing'||owner.paused!==false||owner.noRange!==true||owner.noLocal!==true||owner.menusMatch!==true||owner.screenName!==menu||owner.screenConnected!==true||owner.screenInert!==false||owner.noModal!==true||owner.inputMatches!==true||owner.noPending!==true||!Array.isArray(owner.heldKeys)||owner.heldKeys.length!==0||owner.mouseLeft!==false||owner.mouseRight!==false||
 !obs||!Array.isArray(obs.events)||!Number.isSafeInteger(obs.count)||obs.count!==obs.events.length||obs.count>LOW_UI_ROUTE.length||e.eventCount!==obs.count||e.events.some((event,i)=>{const uiEvent=obs.events[i],step=LOW_UI_ROUTE[i],ids=['settings','tab-video','set-quality',null];return !step||event.type!=='click'||event.trusted!==true||event.id!==ids[i]||event.menu!==step.menu||!Number.isFinite(event.time)||event.lockElementId!==null||event.inputLocked!==false||event.pending!==false||event.paused!==false||uiEvent?.key!==step.key||uiEvent.trusted!==true||uiEvent.menu!==step.menu;})||state.menu!==menu||ui.menu!==menu||ui.pointerLockHeld!==false||ui.pointerLockElement!==null||
 !viewport||ui.viewport?.width!==viewport.width||ui.viewport?.height!==viewport.height||ui.viewport?.deviceScaleFactor!==viewport.deviceScaleFactor)
  throw Error('LOW UI observer, lock/input history, viewport or menu unavailable; stop input');
}
export function assertTrustedLowGesture(ui,marker,step){
 if(!ui?.observer||!Array.isArray(ui.observer.events)||!Number.isSafeInteger(ui.observer.count)||ui.observer.count!==ui.observer.events.length||!Number.isSafeInteger(marker)||marker<0||marker>ui.observer.count)throw Error('LOW UI click evidence incomplete');
 const rows=ui.observer.events.slice(marker);if(rows.length!==1)throw Error('LOW UI click missing, repeated or ambiguous');const e=rows[0];
 if(e.type!=='click'||e.trusted!==true||e.key!==step.key||e.menu!==step.menu||!Number.isFinite(e.time)||
  (step.key==='quality'?(e.controlTag!=='SPAN'||e.index!==0):e.controlTag!=='BUTTON'))throw Error('LOW UI exact trusted target unavailable; stop input');
}
export function isExactLowProfile(q){return !!q&&q.pixelRatio===.75&&q.shadowSize===1024&&q.msaa===0&&q.bloom===false&&q.ao===false&&q.particles===.4;}
export async function selectLowGraphicsFromMain({page,bounded,cap,record,expectedViewport,freshContext}){
 if(freshContext!==true||!page||typeof bounded!=='function'||typeof cap!=='function'||typeof record!=='function'||expectedViewport?.width!==640||expectedViewport?.height!==480||expectedViewport?.deviceScaleFactor!==1)throw Error('LOW UI requires caller-attested fresh compact 640x480 DPR1 context and receipt recorder');
 let initialMatchIdentity=null;
 const safe=async(menu,label)=>{const state=await bounded(()=>page.evaluate(readResumeState),label+' history'),ui=await bounded(()=>page.evaluate(readLowGraphicsUi),label+' ui');record(label,{state,ui});assertLowUiSafety(state,ui,menu,expectedViewport);if(initialMatchIdentity===null)initialMatchIdentity=state.matchIdentity;else if(state.matchIdentity!==initialMatchIdentity)throw Error('LOW UI attract match owner changed; stop input');return {state,ui};};
 await bounded(()=>page.evaluate(installLowGraphicsObserver),'install LOW UI observer');
 for(const step of LOW_UI_ROUTE){
  await bounded(()=>page.waitForFunction(rangeMenuControlReady,{selector:step.selector,menu:step.menu},{timeout:cap()}),'LOW '+step.key+' readiness');
  const before=await safe(step.menu,'before-'+step.key),marker=before.ui.observer.count;
  await bounded(()=>page.locator(step.selector).click({timeout:cap()}),'LOW '+step.key+' trusted click');
  const after=await bounded(()=>page.evaluate(readLowGraphicsUi),'LOW '+step.key+' click evidence');record('click-'+step.key,after);assertTrustedLowGesture(after,marker,step);
  await bounded(()=>page.waitForFunction(expected=>window.__inkwave?.menus?.current===expected,step.next,{timeout:cap()}),'LOW '+step.key+' next menu');
  await safe(step.next,'after-'+step.key);
  if(step.key==='quality'){
   await bounded(()=>page.waitForFunction(lowGraphicsApplied,null,{timeout:cap()}),'LOW effective settings');
   const proof=await safe('settings','low-effective');const q=proof.ui.effective;
   if(proof.ui.settingsQuality!=='low'||proof.ui.optionCount!==4||proof.ui.selectedOptions.length!==1||proof.ui.selectedOptions[0]!==0||!isExactLowProfile(q))throw Error('LOW selection or effective profile unavailable; stop input');
  }
 }
 const final=await safe('main','low-main');if(final.ui.settingsQuality!=='low'||!isExactLowProfile(final.ui.effective))throw Error('LOW profile lost before Range; stop input');
 await bounded(()=>page.evaluate(removeLowGraphicsObserver),'remove LOW UI observer');
 return {status:'observed',population:'compact-LOW-640x480-dpr1',freshContext:'caller-attested',viewport:expectedViewport,settingsQuality:final.ui.settingsQuality,effective:final.ui.effective,scope:'Trusted menu input and read-only settings evidence only; no frame-rate, first-rebuild, full-quality or retail/device parity claim.'};
}
