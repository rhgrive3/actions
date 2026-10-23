// Rejected prototype: ensure a cached JSON packet contains no nested getter,
// toJSON, typed-array or class-instance hooks before native broadcast reuse.
// No prototype implementation was committed to the application.
function plain(value,seen=new Set(),depth=0) {
 if(value===null||typeof value!=='object')return typeof value!=='function'&&typeof value!=='symbol'&&typeof value!=='bigint';
 if(depth>12||seen.has(value))return false;seen.add(value);
 if(Object.getPrototypeOf(value)!==(Array.isArray(value)?Array.prototype:Object.prototype))return false;
 if('toJSON'in value)return false;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 for(const key of Object.keys(descriptors)){const d=descriptors[key];if(!Object.hasOwn(d,'value'))return false;if(d.enumerable&&!plain(d.value,seen,depth+1))return false;}
 seen.delete(value);return true;
}
const prepared=new WeakMap(),p={k:'t',ts:1,a:Array.from({length:8},(_,i)=>[i,1,2,3,4,5,6,7,8,9,10,11,12]),pe:['v3',[[1,2,3,'shot',4,5,6,7,8,'match',0]],Array.from({length:40},(_,i)=>[1,0,i/60,2,3,4,5,i,i,i])],pn:'a'.repeat(32)},json=JSON.stringify(p);
const guard=()=>{if(plain(p))prepared.set(p,json);prepared.delete(p);};
for(let i=0;i<1000;i++){guard();JSON.stringify(p);}
let t=performance.now();for(let i=0;i<10000;i++)JSON.stringify(p);const jsonMs=performance.now()-t;
t=performance.now();for(let i=0;i<10000;i++)guard();const guardMs=performance.now()-t;
console.log(JSON.stringify({scope:'isolated V8 synthetic packet, no device/frame-time claim',iterations:10000,jsonMs,guardMs,ratio:guardMs/jsonMs,adopted:false}));
