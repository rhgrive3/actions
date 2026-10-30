// Bound retained encoded bytes before decode. A streamed response may overshoot
// by its final received chunk; browser transport buffers are outside this bound.
// The compatibility arrayBuffer path can only validate after allocation.
export class EncodedAudioResponseError extends Error {}
const BLOCK_BYTES=64*1024;
export async function readEncodedAudioResponse(response,maxBytes,{minBytes=1,scope,label='Invalid encoded audio response'}={}){
  if(!Number.isInteger(maxBytes)||maxBytes<1||!Number.isInteger(minBytes)||minBytes<0||minBytes>maxBytes)throw new RangeError('Invalid encoded audio size policy');
  scope?.check();
  const invalid=()=>new EncodedAudioResponseError(label);
  const reported=Number(response.headers?.get?.('content-length'));
  const body=response.body;
  if(Number.isFinite(reported)&&reported>maxBytes){
    const error=invalid();try{Promise.resolve(body?.cancel?.(error)).catch(()=>{});}catch{}
    scope?.cancel?.(error);throw error;
  }
  if(typeof body?.getReader!=='function'){
    const bytes=await response.arrayBuffer();scope?.check();
    if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<minBytes||bytes.byteLength>maxBytes)throw invalid();
    return bytes;
  }
  // Content-Length is only an allocation hint. Transfer decoding (gzip/br)
  // makes that header describe different bytes, so keep the chunked path then.
  const encoding=response.headers?.get?.('content-encoding');
  const exactLength=Number.isSafeInteger(reported)&&reported>0&&reported<=maxBytes&&(!encoding||encoding.toLowerCase()==='identity')?reported:0;
  const reader=body.getReader(),signal=scope?.signal,blocks=[];
  let total=0,block=null,used=0,cancelled=false,rejectAbort;
  const aborted=new Promise((_,reject)=>{rejectAbort=reject;});aborted.catch(()=>{});
  const cancel=error=>{if(cancelled)return;cancelled=true;try{Promise.resolve(reader.cancel(error)).catch(()=>{});}catch{}};
  const onAbort=()=>{const error=signal.reason||new Error('Recorded audio response cancelled');cancel(error);rejectAbort(error);};
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
    if(signal?.aborted)onAbort();
    for(;;){
      scope?.check();
      const {done,value}=await Promise.race([reader.read(),aborted]);scope?.check();
      if(done)break;
      if(!(value instanceof Uint8Array))throw invalid();
      if(value.byteLength>maxBytes-total)throw invalid();
      let offset=0;
      while(offset<value.byteLength){
        if(!block||used===block.length){block=new Uint8Array(!block&&exactLength?exactLength:Math.min(BLOCK_BYTES,maxBytes-total));blocks.push(block);used=0;}
        const count=Math.min(value.byteLength-offset,block.length-used);
        block.set(value.subarray(offset,offset+count),used);used+=count;offset+=count;total+=count;
      }
    }
    if(total<minBytes)throw invalid();
    // Exact streams already own one tightly sized buffer. Mismatched/unknown
    // lengths retain the bounded concatenation fallback and actual size checks.
    if(blocks.length===1&&used===blocks[0].length)return blocks[0].buffer;
    const result=new Uint8Array(total);let offset=0;
    for(let i=0;i<blocks.length;i++){const part=i===blocks.length-1?blocks[i].subarray(0,used):blocks[i];result.set(part,offset);offset+=part.length;}
    return result.buffer;
  }catch(error){cancel(error);if(error instanceof EncodedAudioResponseError)scope?.cancel?.(error);throw error;}
  finally{signal?.removeEventListener('abort',onAbort);try{reader.releaseLock();}catch{}blocks.length=0;block=null;}
}
