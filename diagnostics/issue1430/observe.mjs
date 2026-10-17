export function observe1430() {
  const rows=window.issue1430Rows=[],listeners=[];
  const scalar=v=>v===null||['string','number','boolean'].includes(typeof v)?v:null;
  const record=(kind,e=null)=>{
    const a=window.actionActor,w=a?.weaponRunner,m=window.mobile,i=window.input;
    if(rows.length>=2048)throw Error('Issue1430 trace bound exceeded');
    rows.push({kind,time:performance.now(),count:window.actionDodges,
      event:e&&{type:e.type,id:e.pointerId,trusted:e.isTrusted,target:e.target?.dataset?.c||e.target?.id||e.target?.tagName,x:e.clientX,y:e.clientY,prevented:e.defaultPrevented},
      input:{owner:i?.lastDevice,navigation:i?.navigationDevice,pressed:[...(m?.pressed||[])],buttons:{...m?.buttons},pointers:[...(m?._ptr||[])].map(([id,v])=>[id,scalar(v),scalar(v?.id),scalar(v?.kind)]),move:[m?.moveX,m?.moveY]},
      actor:a&&{alive:a.alive,grounded:a.grounded,form:a.form,ink:a.ink,jumpBuffer:a.jumpBuffer,previousJump:a._prevIntent?.jump,intent:{fire:a.intent?.fire,jump:a.intent?.jump,jumpPressed:a.intent?.jumpPressed,sub:a.intent?.sub,squid:a.intent?.squid,move:a.intent?.move?.toArray()}},
      runner:w&&{cooldown:w.cooldown,lockT:w.lockT,rollsLeft:w.rollsLeft,aimingSub:w.aimingSub,dodge:w.dodge&&Object.fromEntries(Object.entries(w.dodge).filter(([,v])=>v===null||['string','number','boolean'].includes(typeof v)))}});
  };
  for(const type of ['pointerdown','pointerup','pointercancel'])for(const capture of [true,false]){
    const listener=e=>record(capture?'pointer-capture':'pointer-bubble',e);document.addEventListener(type,listener,capture);listeners.push([type,listener,capture]);
  }
  const advance=window.advance;
  window.advance=function(...args){record('before-advance');try{return Reflect.apply(advance,this,args);}finally{record('after-advance');}};
  window.stopIssue1430Observation=()=>{window.advance=advance;for(const args of listeners)document.removeEventListener(...args);};
  record('observer-installed');
}
