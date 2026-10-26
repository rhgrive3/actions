// Owned capture-only observations plus the existing native pause/Resume route.
// Never patch Input/requestPointerLock, assign admission flags, or mask denial.
import assert from 'node:assert/strict';
export function readInputAdmission(){
 const G=window.__G,g=window.__inkwave,i=G.input,c=G.renderer.domElement;
 const b=c.getBoundingClientRect(),target=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
 return {mode:G.mode,state:G.match?.state,paused:G.match?.paused,menu:g.menus?.current??null,
  frozen:g.frozen,nativeTick:g.s3Clock?.ticks,time:G.time,enabled:i.enabled,lastDevice:i.lastDevice,
  locked:i.locked,pointerLockIsCanvas:document.pointerLockElement===c,
  pointerLockTag:document.pointerLockElement?.tagName??null,
  relock:g._relock??null,touchRelockWanted:i._touchRelockWanted??null,touchUnlockPending:i._touchUnlockPending??null,
  touchLockAdmissionBlocked:i._touchLockAdmissionBlocked??null,
  pending:i._pointerLockPending?{playing:i._pointerLockPending.playing,cancelled:i._pointerLockPending.cancelled,modern:i._pointerLockPending.modern}:null,
  focused:document.hasFocus(),visibility:document.visibilityState,
  userActivation:navigator.userActivation?{isActive:navigator.userActivation.isActive,hasBeenActive:navigator.userActivation.hasBeenActive}:null,
  centerTarget:target?{tag:target.tagName,id:target.id,classes:String(target.className?.baseVal??target.className),isCanvas:target===c}:null,
  events:(window.__reticleInputAdmission?.events||[]).map(e=>({...e}))};
}
export function assertInputAdmission(s){
 assert.equal(s.mode,'match');assert.equal(s.state,'playing');assert.equal(s.paused,false);assert.equal(s.menu,null);
 assert.equal(s.frozen,true);assert.equal(s.enabled,true);assert.equal(s.lastDevice,'kbm');
 assert.equal(s.locked,true,'native Input lock state');assert.equal(s.pointerLockIsCanvas,true,'actual browser pointer lock belongs to native canvas');
}
export function resumeControlReady(){
 const m=window.__inkwave?.menus,root=m?._scr?.el,controls=[...document.querySelectorAll('.iw-ui [data-id="resume"]')];
 if(!root||m.current!=='pause'||m._scr.name!=='pause'||root.inert||controls.length!==1||!root.contains(controls[0]))return false;
 const button=controls[0];if(button.disabled||button.closest('.is-leaving'))return false;
 let opacity=1;for(let n=button.closest('[data-nav]')||button;n&&n!==root.parentNode;n=n.parentElement){const value=Number(getComputedStyle(n).opacity);if(!Number.isFinite(value))return false;opacity*=value;if(n===root)break;}
 return opacity>.6;
}
export async function acquireNativeCaptureInput(page,{timeout=10000,onUpdate=()=>{}}={}){
 const record={route:'native-KeyP-pause-trusted-Resume',status:'starting'};
 let primary;
 await page.evaluate(()=>{
  if(window.__reticleInputAdmission)throw Error('Capture input observer already owned');
  const events=[],listeners=[];
  const listen=(target,name,fn)=>{target.addEventListener(name,fn,true);listeners.push(()=>target.removeEventListener(name,fn,true));};
  for(const name of ['pointerlockchange','pointerlockerror'])listen(document,name,e=>events.push({type:name,trusted:e.isTrusted,pointerLockIsCanvas:document.pointerLockElement===window.__G.renderer.domElement,wallTimestamp:Date.now()}));
  listen(document,'click',e=>{if(e.target?.closest?.('.iw-ui [data-id="resume"]'))events.push({type:'resume-click',trusted:e.isTrusted,wallTimestamp:Date.now()});});
  window.__reticleInputAdmission={events,stop:()=>listeners.forEach(remove=>remove())};
 });
 try{
  record.before=await page.evaluate(readInputAdmission);onUpdate({...record});
  assert(record.before.frozen,'scheduler must be frozen before input admission');
  if(record.before.locked&&record.before.pointerLockIsCanvas){assertInputAdmission(record.before);record.status='already-admitted';return record;}
  assert.equal(record.before.mode,'match');assert.equal(record.before.state,'playing');assert.equal(record.before.paused,false);assert.equal(record.before.menu,null);
  await page.keyboard.press('KeyP');
  await page.waitForFunction(()=>window.__G.match.paused===true&&window.__inkwave.menus.current==='pause',null,{timeout});
  await page.waitForFunction(resumeControlReady,null,{timeout});
  record.pauseSnapshot=await page.evaluate(readInputAdmission);onUpdate({...record});
  await page.locator('.iw-ui [data-id="resume"]').click({timeout});
  await page.waitForFunction(()=>window.__G.input.locked===true&&document.pointerLockElement===window.__G.renderer.domElement&&window.__G.match.paused===false&&!window.__inkwave.menus.current,null,{timeout});
  await page.mouse.up({button:'left'});
  record.after=await page.evaluate(readInputAdmission);assertInputAdmission(record.after);
  assert.equal(record.after.nativeTick,record.before.nativeTick,'UI admission must not advance frozen simulation');
  assert.equal(record.after.time,record.before.time,'UI admission must not advance native time');
  assert(record.after.events.some(e=>e.type==='resume-click'&&e.trusted),'actual trusted Resume gesture required');
  assert(record.after.events.some(e=>e.type==='pointerlockchange'&&e.pointerLockIsCanvas),'actual browser lock change required');
  record.status='admitted';return record;
 }catch(error){primary=error;record.status='failed';record.error=String(error);record.failure=await page.evaluate(readInputAdmission).catch(error=>({readFailure:String(error)}));throw error;}
 finally{
  onUpdate({...record});
  const results=await Promise.allSettled([
    page.keyboard.up('KeyP'),page.mouse.up({button:'left'}),
    page.evaluate(()=>{window.__reticleInputAdmission?.stop?.();delete window.__reticleInputAdmission;})
  ]);
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason);
  if(errors.length){record.observerCleanupFailure=errors.map(String);onUpdate({...record});throw new AggregateError(primary?[primary,...errors]:errors,'Native input admission cleanup failed');}
 }
}
