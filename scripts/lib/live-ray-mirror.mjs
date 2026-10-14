// Diagnostic observer only. Never substitutes the live result or changes game owners.
const KEYS = ['triangles','nodes','normals','order','flags','objectIds'];
const fields = v => [v.x,v.y,v.z];
const same = (a,b) => a.length === b.length && a.every((x,i)=>Object.is(x,b[i]));
function compare(a,b,path='hit') {
  if(Object.is(a,b))return null;
  if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return path;
  const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();
  if(!same(ka,kb))return path+'.keys';
  for(const key of ka){const d=compare(a[key],b[key],path+'.'+key);if(d)return d;}
  return null;
}
function caller(stack){
 for(const [name,needle]of[['FX','/fx/fx.js'],['Character','/game/character.js'],['Bot','/game/bots.js'],['Physics','/game/physics.js'],['Projectile','/game/inkFlightRuntime.js'],['Camera','/game/cameraRig.js']])if(stack.includes(needle))return name;
 return 'other';
}
export function installLiveRayMirror(prototype, OriginalTriangleWorld, readRng=()=>null) {
 if(prototype===OriginalTriangleWorld.prototype)throw Error('Mirror prototype must be independent');
 const original=prototype.ray,bindings=new WeakMap(),records=[],state={calls:0,verticalDown:0,general:0,hits:0,misses:0,invalidInputs:0,mismatches:[],mismatchCount:0,callers:{},frames:{},counterDeltas:{query:0,triangleTests:0},frame:null};
 const fail=(kind,detail={})=>{state.mismatchCount++;if(state.mismatches.length<20)state.mismatches.push({kind,frame:state.frame,call:state.calls,...detail});};
 function bind(world){
  let r=bindings.get(world);
  if(r&&KEYS.every(k=>r.arrays[k]===world[k]))return r;
  const arrays=Object.fromEntries(KEYS.map(k=>[k,world[k]])),rng=readRng();
  const mirror=new OriginalTriangleWorld(arrays);
  if(compare(rng,readRng(),'rng'))fail('mirror-constructor-consumed-rng');
  r={id:records.length,arrays,mirror,bytes:Object.fromEntries(KEYS.map(k=>[k,new Uint8Array(arrays[k].buffer,arrays[k].byteOffset,arrays[k].byteLength).slice()]))};
  records.push(r);bindings.set(world,r);return r;
 }
 function wrapped(...args){
  const o=args[0],d=args[1],of=fields(o),df=fields(d),options=args[3],optionKeys=options&&typeof options==='object'?Object.keys(options).sort():null;
  if(options!=null&&(typeof options!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(options))||Object.values(Object.getOwnPropertyDescriptors(options)).some(d=>d.get||d.set)))fail('unsupported-options-contract');
  const savedOptions=optionKeys?Object.fromEntries(optionKeys.map(k=>[k,options[k]])):options;
  const r=bind(this),mirror=r.mirror,mo=mirror._ta.clone().set(...of),md=mirror._ta.clone().set(...df);
  const mirrorArgs=[mo,md,...args.slice(2)];if(args.length>3)mirrorArgs[3]=savedOptions;
  const cq=this.queryCount,ct=this.triangleTests,mq=mirror.queryCount,mt=mirror.triangleTests;
  let result,error;try{result=original.apply(this,args);}catch(e){error=e;}
  state.calls++;const vertical=of.every(Number.isFinite)&&df[0]===0&&df[1]===-1&&df[2]===0;
  state[vertical?'verticalDown':'general']++;
  if(!Number.isFinite(of[0]+of[1]+of[2]+df[0]+df[1]+df[2]))state.invalidInputs++;
  const stack=new Error().stack||'',name=caller(stack),row=state.callers[name]||(state.callers[name]={calls:0,verticalDown:0,general:0,exampleStack:stack});row.calls++;row[vertical?'verticalDown':'general']++;
  const frame=String(state.frame);state.frames[frame]=(state.frames[frame]||0)+1;
  if(!same(of,fields(o))||!same(df,fields(d))||compare(savedOptions,options,'options'))fail('live-input-mutated');
  const rng=readRng();let expected,mirrorError;try{expected=mirror.ray(...mirrorArgs);}catch(e){mirrorError=e;}
  if(compare(rng,readRng(),'rng'))fail('mirror-ray-consumed-rng');
  if(error||mirrorError){if(error?.constructor?.name!==mirrorError?.constructor?.name||error?.message!==mirrorError?.message)fail('exception-difference');}
  else {const difference=compare(result,expected);if(difference)fail('hit-difference',{field:difference});state[result===null?'misses':'hits']++;}
  const dq=this.queryCount-cq,dt=this.triangleTests-ct;
  state.counterDeltas.query+=dq;state.counterDeltas.triangleTests+=dt;
  if(!Object.is(dq,mirror.queryCount-mq)||!Object.is(dt,mirror.triangleTests-mt))fail('counter-difference',{live:[dq,dt],mirror:[mirror.queryCount-mq,mirror.triangleTests-mt]});
  if(error)throw error;
  return result; // EXACT live object; mirror objects never enter the game.
 }
 prototype.ray=wrapped;
 return {state,setFrame(frame){state.frame=frame;},restore(){if(prototype.ray!==wrapped)throw Error('Ray wrapper ownership changed');prototype.ray=original;},async finish(){
   const geometry=[];
   for(const r of records){const hashes={};for(const key of KEYS){const before=r.bytes[key],a=r.arrays[key],after=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);let equal=before.length===after.length;for(let i=0;equal&&i<before.length;i++)if(before[i]!==after[i])equal=false;if(!equal)fail('collision-array-mutated',{binding:r.id,key});const digest=await crypto.subtle.digest('SHA-256',before);hashes[key]={bytes:before.length,sha256:Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join(''),unchanged:equal};}geometry.push({binding:r.id,arrays:hashes});}
   return {...state,geometry,allEquivalent:state.mismatchCount===0,limitations:['Live differential observer; dual evaluation and stack sampling add overhead. No speed measurement.','Candidate and mirror share collision arrays only. Scratch vectors and counters are independent.']};
 }};
}
