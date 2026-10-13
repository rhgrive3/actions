// Shared by catalogue replay and causal paint admission.
export function cataloguePayload(event) {
  if(!event||typeof event!=='object')return null;
  const payload={};
  for(const [key,value] of Object.entries(event)){
    if(['actor','owner','victim'].includes(key))continue;
    if(key==='__proto__'||key==='constructor'||key==='prototype')return null;
    if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>4294967295)return null;payload[key]=value;}
    else if(typeof value==='string'){if(value.length>96)return null;payload[key]=value;}
    else if(typeof value==='boolean')payload[key]=value;
    else if(Array.isArray(value)){if(value.length>64||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))return null;payload[key]=value.slice();}
  }
  return JSON.stringify(payload).length<=4096?payload:null;
}
