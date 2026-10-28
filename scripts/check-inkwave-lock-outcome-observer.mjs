// Diagnostic wrapper prototype. This necessarily changes callable identity and
// attaches a Promise reaction; it does not claim unhandled-rejection or timing equivalence.
export function installLockOutcomeObserver(){
 const buffer={calls:[],count:0,limit:128,installed:false,reason:null,identityNotice:'Callable identity/toString and Promise reaction ordering necessarily differ.',requestCountNotice:'Exactly one original native invocation per observed invocation; existing application fallback is not suppressed and is recorded as another invocation.'};
 const now=()=>{try{return performance.now();}catch{return null;}};
 const context=()=>{try{const g=window.__inkwave,i=g?.input;return {time:now(),active:navigator.userActivation?.isActive??null,hasBeenActive:navigator.userActivation?.hasBeenActive??null,focus:document.hasFocus(),lockElementId:document.pointerLockElement?.id??null,inputLocked:i?.locked??null,pending:!!i?._pointerLockPending,ticketCancelled:i?._pointerLockPending?.cancelled??null,device:i?.lastDevice??null,relock:g?._relock??null,menu:g?.menus?.current??null,paused:!!window.__G?.match?.paused};}catch{return {time:now(),observationError:'metadata unavailable'};}};
 const safeError=e=>{try{const name=e?.name,message=e?.message;return {name:typeof name==='string'?name:null,message:typeof message==='string'?message:null};}catch{return {name:null,message:null,unreadable:true};}};
 const record=x=>{try{buffer.count++;if(buffer.calls.length<buffer.limit)buffer.calls.push(x);}catch{}};
 try{
  let owner=HTMLCanvasElement.prototype,descriptor;while(owner&&!(descriptor=Object.getOwnPropertyDescriptor(owner,'requestPointerLock')))owner=Object.getPrototypeOf(owner);
  if(!owner||typeof descriptor?.value!=='function'||!descriptor.writable){buffer.reason='native method unavailable or not writable';window.__nativeLockOutcome=buffer;return;}
  const original=descriptor.value;
  function observed(...args){
   let entry;try{entry={sequence:buffer.count+1,phase:'invoke',argumentCount:args.length,argumentTypes:args.map(x=>typeof x),isCanvas:this instanceof HTMLCanvasElement,context:context()};record(entry);}catch{entry={sequence:buffer.count+1,phase:'invoke',metadataError:true};record(entry);}
   let result;try{result=Reflect.apply(original,this,args);}catch(e){try{const error=safeError(e);if(error.name==='NotAllowedError'||error.name==='SecurityError')buffer.stopFurtherInput=true;record({sequence:entry.sequence,phase:'throw',error,context:context()});}catch{}throw e;}
   try{if(result&&Object.getPrototypeOf(result)===Promise.prototype)Reflect.apply(Promise.prototype.then,result,[()=>{try{record({sequence:entry.sequence,phase:'fulfilled',context:context()});}catch{}},e=>{try{const error=safeError(e);if(error.name==='NotAllowedError'||error.name==='SecurityError')buffer.stopFurtherInput=true;record({sequence:entry.sequence,phase:'rejected',error,context:context()});}catch{}}]);else record({sequence:entry.sequence,phase:'non-promise',context:context()});}catch{record({sequence:entry.sequence,phase:'outcome-unavailable',context:context()});}
   return result;
  }
  try{Object.defineProperty(observed,'name',{value:original.name,configurable:true});Object.defineProperty(observed,'length',{value:original.length,configurable:true});}catch{}
  Object.defineProperty(owner,'requestPointerLock',{...descriptor,value:observed});
  const after=Object.getOwnPropertyDescriptor(owner,'requestPointerLock');buffer.installed=after.value===observed;buffer.attributes={writable:descriptor.writable,enumerable:descriptor.enumerable,configurable:descriptor.configurable};buffer.attributeMatch=after.writable===descriptor.writable&&after.enumerable===descriptor.enumerable&&after.configurable===descriptor.configurable;
 }catch(e){buffer.reason='observer install failed: '+String(e);}
 window.__nativeLockOutcome=buffer;
}
