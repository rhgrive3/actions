// Exact read-only state for the shared FX pools used by ambient effects.
// This is not an ambient-only particle attribution or a performance measurement.
export function readWiperAmbientState(G,g){
 const h=g?.fxHooks,f=G?.fx;if(!h||!f||typeof f.stats!=='function')throw Error('Native ambient state unavailable');
 const finite=(x,label)=>{if(!Number.isFinite(x))throw Error('Non-finite ambient '+label);return x;};
 const count=(n,label)=>{if(!Number.isInteger(n)||n<0)throw Error('Invalid ambient count '+label);return n;};
 const statsCopy=(value,label='stats',parents=new Set())=>{
  if(value===null)return null;if(typeof value==='number')return finite(value,label);
  if(typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype||parents.has(value))throw Error('Invalid ambient stats '+label);
  parents.add(value);try{return Object.fromEntries(Reflect.ownKeys(value).map(key=>{const d=Object.getOwnPropertyDescriptor(value,key);if(typeof key!=='string'||!('value' in d))throw Error('Invalid ambient stats property '+label);return [key,statsCopy(d.value,label+'.'+key,parents)];}));}finally{parents.delete(value);}
 };
 const active=(a,n,stride,label)=>{count(n,label);if(!ArrayBuffer.isView(a)||a.length<n*stride)throw Error('Missing active FX array '+label);const out=Array.from(a.subarray(0,n*stride));for(const x of out)finite(x,label);return out;};
 const sprite=(p,width,label)=>{if(!p)throw Error('Missing shared FX pool '+label);return {n:count(p.n,label),P:active(p.P,p.n,3,label+'.P'),V:active(p.V,p.n,3,label+'.V'),C:active(p.C,p.n,3,label+'.C'),X:active(p.X,p.n,width,label+'.X')};};
 const rings=sprite(f.rings,8,'rings');rings.N=active(f.rings.N,f.rings.n,3,'rings.N');
 return {schema:1,scope:'shared-pools-used-by-ambient',time:finite(h.time,'time'),stamp:count(h.stamp,'stamp'),sprayT:finite(h.sprayT,'sprayT'),featherT:finite(h.featherT,'featherT'),seaState:finite(G.env?.seaState,'seaState'),
  triggerCounts:{seaSpray:count(h.count?.seaSpray??0,'seaSpray'),feather:count(h.count?.feather??0,'feather')},
  edgeLevelMatches:h.edgeLevel===G.level,edges:h.edges.map(e=>['x','z','nx','nz'].map(k=>finite(e[k],'edge.'+k))),
  sharedFxQuality:finite(f.q,'quality'),sharedFxStats:statsCopy(f.stats()),sharedFxPools:{drops:{n:count(f.dN,'drops'),P:active(f.dP,f.dN,3,'drops.P'),V:active(f.dV,f.dN,3,'drops.V'),C:active(f.dC,f.dN,3,'drops.C'),K:active(f.dK,f.dN,3,'drops.K'),A:active(f.dA,f.dN,8,'drops.A')},
   puffs:sprite(f.puffs,14,'puffs'),glows:sprite(f.glows,14,'glows'),rings,scheduler:{n:count(f._sqN,'scheduler'),values:active(f._sq,f._sqN,14,'scheduler')}}};
}
