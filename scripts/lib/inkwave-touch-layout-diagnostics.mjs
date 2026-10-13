// Bounded passive observation for the browser fixture, without relayout or input replay.
export function installTouchLayoutDiagnostics(){
 const events=window.__touchLayoutEvents=[];
 const snapshot=(phase,event)=>{const m=window.mobile,t=event?.target;return {phase,at:performance.now(),type:event?.type||null,pointerId:event?.pointerId??null,x:event?.clientX??null,y:event?.clientY??null,target:{tag:t?.tagName||null,id:t?.id||null,className:typeof t?.className==='string'?t.className.slice(0,120):null},viewport:{width:innerWidth,height:innerHeight,visualWidth:visualViewport?.width??null,visualHeight:visualViewport?.height??null},editing:!!m?.editing,editPresent:!!m?._edit,points:m?._edit?.pts?[...m._edit.pts.keys()].slice(0,8):[],layoutHeight:m?._H??null,rootConnected:!!m?.root?.isConnected};};
 const record=(phase,event)=>{events.push(snapshot(phase,event));if(events.length>64)events.shift();};
 window.__touchLayoutSnapshot=()=>snapshot('snapshot');
 for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,e=>{record('capture',e);queueMicrotask(()=>record('after-dispatch',e));},{capture:true,passive:true});
 for(const type of ['resize','orientationchange'])window.addEventListener(type,e=>{record('capture',e);queueMicrotask(()=>record('after-dispatch',e));},{capture:true,passive:true});
}
