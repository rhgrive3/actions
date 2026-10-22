// QA-only observation. Never adjusts clocks, timers, RNG state, or production return values.
export function createWiperAmbientObserver(readRng,readWorld){
 const events=[],samples=[],errors=[],groups=new Map(),restores=[];
 let phase='boot',scope='outside',sequence=0,eventOverflow=0,sampleOverflow=0;
 const error=e=>{if(errors.length<16)errors.push(String(e?.message||e));};
 const snapshot=()=>{try{return {rng:readRng(),world:readWorld()};}catch(e){error(e);return null;}};
 const mark=label=>{const row={sequence:sequence++,phase,scope,label,...snapshot()};if(events.length<512)events.push(row);else eventOverflow++;return row;};
 const setPhase=value=>{phase=value;mark('phase');};
 const onRandom=()=>{try{
  const key=phase+'|'+scope;let g=groups.get(key);
  if(!g){if(groups.size>=256){sampleOverflow++;return;}g={phase,scope,calls:0};groups.set(key,g);}g.calls++;
  // Separate phase/scope buckets prevent early UUID calls from consuming ambient samples.
  if(g.calls<=8){if(samples.length<2048)samples.push({phase,scope,...snapshot(),stack:new Error().stack});else sampleOverflow++;}
 }catch(e){error(e);}};
 const wrap=(owner,key)=>{
  if(!owner||typeof owner[key]!=='function')throw Error('Missing native observer method '+key);
  const original=owner[key],descriptor=Object.getOwnPropertyDescriptor(owner,key);
  function observed(...args){const previous=scope;scope=key;mark('before:'+key);
   try{return original.apply(this,args);}finally{mark('after:'+key);scope=previous;}}
  owner[key]=observed;restores.push(()=>{if(owner[key]!==observed)throw Error('Observer ownership changed '+key);if(descriptor)Object.defineProperty(owner,key,descriptor);else delete owner[key];});
 };
 const report=()=>({events:events.slice(),samples:samples.slice(),groups:[...groups.values()].map(x=>({...x})),errors:errors.slice(),eventOverflow,sampleOverflow});
 return {mark,setPhase,onRandom,wrap,report,restore(){for(const fn of restores.reverse())fn();restores.length=0;}};
}
