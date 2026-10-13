// Browser init function: passive, bounded observations only. No animation,
// clock, style, class, input, or wait is changed by these diagnostics.
export function installCursorTimelineDiagnostics() {
  const entries=window.__lifecycleCursorTimelineEvents=[];
  const finite=value=>Number.isFinite(value)?Math.round(value*1000)/1000:null;
  for(const type of ['transitionrun','transitionstart','transitionend','transitioncancel','animationstart','animationend','animationcancel','animationiteration']) {
    document.addEventListener(type,event=>{
      const target=event.target;if(!target?.closest?.('.iw-cursor'))return;
      entries.push({type,at:finite(performance.now()),documentTime:finite(document.timeline?.currentTime),
        eventTime:finite(event.timeStamp),elapsedTime:finite(event.elapsedTime),trusted:!!event.isTrusted,
        property:String(event.propertyName||event.animationName||'').slice(0,120),target:String(target.className||target.tagName||'').slice(0,80)});
      if(entries.length>48)entries.shift();
    },{capture:true,passive:true});
  }
}
