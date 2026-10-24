// Bounded passive observation for the browser fixture, without relayout or input replay.
export function installTouchLayoutDiagnostics(){
 const events=window.__touchLayoutEvents=[];
 const snapshot=(phase,event)=>{const m=window.mobile,t=event?.target;return {phase,at:performance.now(),type:event?.type||null,pointerId:event?.pointerId??null,x:event?.clientX??null,y:event?.clientY??null,target:{tag:t?.tagName||null,id:t?.id||null,className:typeof t?.className==='string'?t.className.slice(0,120):null},viewport:{width:innerWidth,height:innerHeight,visualWidth:visualViewport?.width??null,visualHeight:visualViewport?.height??null},editing:!!m?.editing,editPresent:!!m?._edit,points:m?._edit?.pts?[...m._edit.pts.keys()].slice(0,8):[],layoutHeight:m?._H??null,rootConnected:!!m?.root?.isConnected};};
 const record=(phase,event)=>{events.push(snapshot(phase,event));if(events.length>64)events.shift();};
 window.__touchLayoutSnapshot=()=>snapshot('snapshot');
 for(const type of ['pointerdown','pointerup','pointercancel'])document.addEventListener(type,e=>{record('capture',e);queueMicrotask(()=>record('after-dispatch',e));},{capture:true,passive:true});
 for(const type of ['resize','orientationchange'])window.addEventListener(type,e=>{record('capture',e);queueMicrotask(()=>record('after-dispatch',e));},{capture:true,passive:true});
}

// Artifact access can fail independently of the browser job. Keep the latest
// passive observations visible in its log, without page text or input replay.
export function touchLayoutFailureLog(entry) {
 const text=(v,n)=>typeof v==='string'?v.slice(0,n):null;
 const number=v=>Number.isFinite(v)?v:null;
 const event=r=>r&&typeof r==='object'?{phase:text(r.phase,24),at:number(r.at),type:text(r.type,24),pointerId:number(r.pointerId),x:number(r.x),y:number(r.y),target:{tag:text(r.target?.tag,24),id:text(r.target?.id,48),className:text(r.target?.className,80)},viewport:{width:number(r.viewport?.width),height:number(r.viewport?.height),visualWidth:number(r.viewport?.visualWidth),visualHeight:number(r.viewport?.visualHeight)},editing:r.editing===true,editPresent:r.editPresent===true,points:Array.isArray(r.points)?r.points.slice(0,8).filter(Number.isFinite):[],layoutHeight:number(r.layoutHeight),rootConnected:r.rootConnected===true}:null;
 const d=entry?.diagnostics,all=Array.isArray(d?.events)?d.events:[];
 const row={kind:'touch-layout-failure',engine:text(entry?.engine,16),name:text(entry?.name,48),diagnosticError:text(d?.error,160),current:event(d?.current),events:all.slice(-8).map(event),omittedEvents:Math.max(0,all.length-8)};
 const encoder=new TextEncoder();let line=JSON.stringify(row);
 while(encoder.encode(line).byteLength>4096&&row.events.length){row.events.shift();row.omittedEvents++;line=JSON.stringify(row);}
 return line;
}
