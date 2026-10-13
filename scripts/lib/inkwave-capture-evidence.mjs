import fs from 'node:fs';
import path from 'node:path';
import {verifySavedPngCapture} from './inkwave-png-evidence.mjs';

// Retrieve only the immutable snapshot; never render or reread the live canvas.
export function createCaptureEvaluator({page,out,onPersistenceError,writeFile=fs.writeFileSync}){
 let failureIndex=0;
 return async(fn,arg)=>{
  let captured;
  try{captured=await page.evaluate(fn,arg);captured.capture.exactPngValidation=verifySavedPngCapture(captured);return captured;}catch(error){
   try{
    const evidence=captured?{...captured.capture,mode:captured.mode,png:captured.png,rawRGBA:captured.rawRGBA,error:String(error?.stack||error),exactPngValidation:error.validation}:await page.evaluate(()=>{const captured=globalThis.__nativeCanvasCaptureFailure;globalThis.__nativeCanvasCaptureFailure=null;return captured;});
    if(evidence){
     const stem=`capture-failure-${++failureIndex}`,{png,rawRGBA,...metadata}=evidence;
     const files=[];
     if(png?.startsWith('data:image/png;base64,'))files.push([stem+'.png',Buffer.from(png.slice('data:image/png;base64,'.length),'base64')]);
     if(rawRGBA)files.push([stem+'.rgba',Buffer.from(rawRGBA,'base64')]);
     files.push([stem+'.json',JSON.stringify(metadata,null,2)]);
     // A failed write must not prevent attempts to preserve the other inputs.
     const failures=[];
     for(const [name,bytes] of files)try{writeFile(path.join(out,name),bytes);}catch(e){failures.push(`${name}: ${e.message}`);}
     if(failures.length)throw Error(failures.join('; '));
    }
   }catch(persistError){onPersistenceError('Capture failure evidence could not be saved: '+persistError.message);}
   throw error;
  }
 };
}

// Restoration always runs, but it must never replace a failed measurement.
export async function withCaptureRestoration(measure,restore){
 let primary,failed=false,result;
 try{result=await measure();}catch(error){primary=error;failed=true;}
 try{await restore();}catch(restoreError){
  if(failed)throw new AggregateError([primary,restoreError],`Capture failed: ${primary?.stack||primary}\nRestoration also failed: ${restoreError?.stack||restoreError}`);
  throw restoreError;
 }
 if(failed)throw primary;
 return result;
}

// Collect every requested mode without turning a partial matrix into a pass.
export async function collectCaptureModes({modes,runMode,onFailure}){
 const errors=[];
 for(const mode of modes)try{await runMode(mode);}catch(error){errors.push(error);await onFailure({mode,error:String(error?.stack||error)});}
 if(errors.length)throw new AggregateError(errors,'Capture mode failures: '+errors.map(e=>String(e?.stack||e)).join('\n'));
}
