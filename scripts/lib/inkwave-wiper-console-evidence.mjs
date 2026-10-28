// Diagnostic-only bounded WebGL/Three/GPU warnings plus browser console errors.
// Filtered, truncated, late, or dropped data cannot prove absence of warnings.
// Caller must fail closed on each returned 'error' even if text is unavailable.
export function createWiperConsoleEvidence({maxEntries=50,maxChars=512,maxInspect=2048}={}) {
 if(!Number.isSafeInteger(maxEntries)||maxEntries<1||maxEntries>100||!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>1024||!Number.isSafeInteger(maxInspect)||maxInspect<maxChars||maxInspect>4096)throw TypeError('Invalid console bounds');
 const receipt={kind:'bounded-gpu-warnings-and-errors',entries:[],errors:0,warnings:0,dropped:0,filtered:0,unreadable:0,truncated:0,inputTruncated:0};
 return {receipt,record(message){
  let type;try {type=message.type();}catch {receipt.unreadable++;return 'unknown';}
  if(type!=='warning'&&type!=='error')return 'ignored';
  if(type==='error')receipt.errors++;else receipt.warnings++;
  try {
   const raw=String(message.text());if(raw.length>maxInspect)receipt.inputTruncated++;
   let text=raw.slice(0,maxInspect);
   if(type==='warning'&&!/(?:WebGL|THREE\.WebGL|GL_INVALID|GPU)/i.test(text)){receipt.filtered++;return type;}
   if(receipt.entries.length>=maxEntries){receipt.dropped++;return type;}
   text=text.replace(/(?:https?|wss?|file):\/\/[^\s]+/gi,'[url-redacted]');
   if(text.length>maxChars){receipt.truncated++;text=text.slice(0,maxChars);}
   receipt.entries.push({type,text});
  }catch {receipt.unreadable++;}
  return type;
 }};
}
