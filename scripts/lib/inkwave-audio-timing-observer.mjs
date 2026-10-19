// Test-page observation only. Never changes playback, admission or return values.
// Self-contained for Playwright addInitScript; no production module imports.
export function installAudioTimingObserver(){
  const root=globalThis;if(root.__iwAudioTimings)return;
  const receipt={schema:1,decode:[],digest:[],limit:64};root.__iwAudioTimings=receipt;
  const observe=(owner,key,rows,accept=()=>true)=>{
    const original=owner?.[key];if(typeof original!=='function')return;
    owner[key]=function(...args){
      if(rows.length>=receipt.limit||!accept(args))return Reflect.apply(original,this,args);
      const started=performance.now(),row={startedMs:started,state:'pending',bytes:args[0]?.byteLength??args[1]?.byteLength??null};rows.push(row);
      setTimeout(()=>{row.taskTurnDelayMs=performance.now()-started;},0);
      let result;try{result=Reflect.apply(original,this,args);}catch(error){row.state='threw';row.elapsedMs=performance.now()-started;row.error=String(error?.name||'Error');throw error;}
      if(result&&typeof result.then==='function')result.then(value=>{row.state='fulfilled';row.elapsedMs=performance.now()-started;if(key==='decodeAudioData')row.durationSeconds=value?.duration??null;},error=>{row.state='rejected';row.elapsedMs=performance.now()-started;row.error=String(error?.name||'Error');});
      else {row.state='returned';row.elapsedMs=performance.now()-started;}
      return result;
    };
  };
  const contexts=new Set([root.AudioContext?.prototype,root.webkitAudioContext?.prototype]);
  for(const proto of contexts)if(proto)observe(proto,'decodeAudioData',receipt.decode);
  observe(root.crypto?.subtle,'digest',receipt.digest,args=>String(typeof args[0]==='string'?args[0]:args[0]?.name).toUpperCase()==='SHA-256');
}
