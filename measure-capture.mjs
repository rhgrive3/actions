// Browser-local submission/readback timings. These are not GPU allocation or whole-game frame times.
export async function measureCapture(renderer, now, capture) {
 const gl=renderer.getContext(), canvas=renderer.domElement, events=[], saved=[];
 const patch=(object,key,label)=>{const own=Object.getOwnPropertyDescriptor(object,key),original=object[key];if(typeof original!=='function')throw Error('Missing measured '+key);saved.push(()=>{if(own)Object.defineProperty(object,key,own);else delete object[key];});object[key]=function(...args){const start=now();let result,operationError,timingError;try{result=original.apply(this,args);}catch(e){operationError=e;}try{const durationMs=now()-start;if(!Number.isFinite(durationMs)||durationMs<0)throw Error('Invalid native timing');events.push({operation:label,durationMs});}catch(e){timingError=e;}if(operationError&&timingError){const error=new AggregateError([operationError,timingError],'Native operation and measurement failed',{cause:operationError});error.capturePartial=operationError.capturePartial;throw error;}if(operationError)throw operationError;if(timingError)throw timingError;return result;};};
 let value,primary;
 try{patch(renderer,'render','render');patch(gl,'readPixels','readPixels');patch(canvas,'toDataURL','png');value=await capture();}
 catch(e){primary=e;}
 const cleanup=[];for(const restore of saved.reverse())try{restore();}catch(e){cleanup.push(e);}
 if(primary||cleanup.length){const e=cleanup.length?new AggregateError([...(primary?[primary]:[]),...cleanup],'Capture measurement cleanup',{cause:primary}):primary;e.capturePartial=primary?.capturePartial;e.processingPartial=events;throw e;}
 try {
 if(!Array.isArray(value.frames)||events.length!==value.frames.length*4)throw Error('Measured capture event count');
 const processing=value.frames.map((f,i)=>{const e=events.slice(i*4,i*4+4);if(e.map(x=>x.operation).join(',')!=='render,render,readPixels,png')throw Error('Measured capture ordering');return{rowId:f.rowId,role:f.role,team:f.team,state:f.state,firstRenderSubmissionMs:e[0].durationMs,secondRenderSubmissionMs:e[1].durationMs,pixelReadbackMs:e[2].durationMs,pngReadbackEncodingMs:e[3].durationMs,totalMeasuredMs:e.reduce((n,x)=>n+x.durationMs,0)};});
 return{value,processing,scope:'Same native scene/camera/output per pair; first and second render CPU submission, blocking pixel readback and PNG readback/encoding. One sample per view; not whole-game frame time or GPU memory.'};
 } catch(error) { error.capturePartial=value;error.processingPartial=events;throw error; }
}
