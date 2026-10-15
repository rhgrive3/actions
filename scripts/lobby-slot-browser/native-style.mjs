export function observeNativeStyle(el,onWrite){
  const native=el.style,own=Object.getOwnPropertyDescriptor(el,'style');
  if(!native||typeof native.getPropertyValue!=='function'||typeof native.setProperty!=='function'||(own&&!own.configurable))throw Error('Unobservable native element style');
  const methods=new Map(),proxy=new Proxy(native,{get(target,key){const v=Reflect.get(target,key,target);if(typeof v!=='function')return v;if(!methods.has(key))methods.set(key,v.bind(target));return methods.get(key);},set(target,key,value){const ok=Reflect.set(target,key,value,target);if(ok&&(key==='transform'||key==='opacity'))onWrite(key,String(value));return ok;}});
  Object.defineProperty(el,'style',{configurable:true,enumerable:own?.enumerable??true,get:()=>proxy});
  const restore=()=>{if(own)Object.defineProperty(el,'style',own);else delete el.style;if(el.style!==native)throw Error('Native style restoration failed');};
  try{if(el.style!==proxy||el.style.getPropertyValue('transform')!==native.getPropertyValue('transform'))throw Error('Native style proxy readback failed');}catch(error){restore();throw error;}
  return restore;
 }
