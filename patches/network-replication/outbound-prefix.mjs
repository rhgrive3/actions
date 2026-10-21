// Local send acceptance only. No relay acknowledgement or timestamp invention.
export const OUTBOUND_LIMITS=Object.freeze({rows:512,bytes:512*1024,packetRows:256,frameBytes:64*1024});
export const OUTBOUND_RECEIPT=Symbol('inkwave outbound local acceptance');
// Browser and hermetic VM fixtures do not expose the same globals. Preserve
// exact UTF-8 queue accounting in either environment; never allocate a new
// encoder per send on the native browser path.
const encoder=typeof TextEncoder==='function'?new TextEncoder():null, states=new WeakMap();
function utf8ByteLength(text){
 let size=0;
 for(let i=0;i<text.length;i++){
  const unit=text.charCodeAt(i);
  if(unit<0x80){size++;continue;}
  if(unit<0x800){size+=2;continue;}
  if(unit>=0xd800&&unit<=0xdbff&&i+1<text.length){
   const next=text.charCodeAt(i+1);
   if(next>=0xdc00&&next<=0xdfff){size+=4;i++;continue;}
  }
  size+=3;
 }
 return size;
}
const bytes=value=>{
 const json=JSON.stringify(value);
 return encoder?encoder.encode(json).byteLength:utf8ByteLength(json??'');
};
function state(n){let s=states.get(n);if(!s){s={window:256,failed:false,rows:0,bytes:0,backlogged:false};states.set(n,s);}return s;}
function abort(n,s,reason,G){
 if(s.failed)return false;
 s.failed=true;s.reason=reason;s.discardedRows=n.out.length;n.out.length=0;s.rows=s.bytes=0;
 const session=n.s,transport=session?.tr,match=n.match,game=G?.game,gameMatch=game?.match,globalMatch=G?.match,globalNet=G?.netm;
 // Never let an obsolete owner's cleanup abort a replacement match.
 if(session?.match!==n)return false;
 transport?.close?.();
 if(n.s===session&&n.match===match&&session.match===n&&session.tr===transport
   &&(!G||(globalNet===n&&globalMatch===match&&G.netm===globalNet&&G.match===globalMatch&&G.game===game&&game?.match===gameMatch)))session._closed?.(reason);
 return false;
}
function sync(n,s,refresh=false){
 if(refresh||s.rows!==n.out.length){s.rows=n.out.length;s.bytes=n.out.length?bytes(n.out)-1:0;}
 return s.rows<=OUTBOUND_LIMITS.rows&&s.bytes<=OUTBOUND_LIMITS.bytes;
}
export function queueOutboundEvent(n,event,G){
 const s=state(n);if(s.failed)return event;
 // Count is bounded immediately. Exact bytes, including later producer metadata,
 // are measured at each send boundary; retained backlog also accounts additions.
 if(n.out.length>=OUTBOUND_LIMITS.rows){abort(n,s,'Outbound event backlog exceeded',G);return event;}
 if(s.backlogged){
  if(!sync(n,s)){abort(n,s,'Outbound event backlog exceeded',G);return event;}
  const size=bytes(event)+1;
  if(size>OUTBOUND_LIMITS.frameBytes){abort(n,s,'Outbound event exceeds frame limit',G);return event;}
  if(s.bytes+size>OUTBOUND_LIMITS.bytes){abort(n,s,'Outbound event backlog exceeded',G);return event;}
  s.bytes+=size;
 }
 n.out.push(event);s.rows=n.out.length;return event;
}
export function sendOutboundTick(n,msg,pack,G){
 const s=state(n);if(s.failed)return false;
 if(!sync(n,s,true))return abort(n,s,'Outbound event backlog exceeded',G);
 const count=Math.min(n.out.length,s.window,OUTBOUND_LIMITS.packetRows),prefix=n.out.slice(0,count);
 if(count){msg.r=2;msg.e=prefix;}
 const session=n.s,transport=session?.tr,owner=session?.match,match=n.match;
 if(session&&'match' in session&&owner!==n)return false;
 const wire=pack(n,msg);
 // Codec announcements may synchronously replace the session or its match.
 if(n.s!==session||n.match!==match||session?.tr!==transport||session?.match!==owner)return false;
 // Symbol fields survive local object spread but are never JSON wire fields.
 const receipt={reason:null};wire[OUTBOUND_RECEIPT]=receipt;
 let accepted=false;
 try{accepted=transport?.broadcast(wire)===true;}catch(error){s.lastError=String(error?.message||error).slice(0,256);}
 if(!accepted){
  s.backlogged=true;
  if(receipt.reason==='frame-too-large'&&count<=1)return abort(n,s,count?'Outbound event envelope exceeds frame limit':'Outbound snapshot exceeds frame limit',G);
  if(count)s.window=Math.max(1,Math.floor(count/2));return false;
 }
 if(n.s!==session||n.match!==match||session?.tr!==transport||session?.match!==owner)return false;
 // Synchronous sends can append new events. Remove only this exact prefix.
 if(prefix.some((event,i)=>n.out[i]!==event))return abort(n,s,'Outbound queue changed during send',G);
 n.out.splice(0,count);s.rows=n.out.length;s.bytes=n.out.length?bytes(n.out)-1:0;s.window=256;s.backlogged=n.out.length>0;
 if(s.bytes>OUTBOUND_LIMITS.bytes)return abort(n,s,'Outbound event backlog exceeded',G);
 return true;
}
export function outboundQueueStatus(n){const s=state(n);return {...s};}
