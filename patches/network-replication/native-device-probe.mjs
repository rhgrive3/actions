// Read-only contact probes keep ghost damage/paint suppression enabled, while
// asking the ordinary defensive geometry to include native-only blockers.
// Packet properties cannot opt into this receiver-private capability.
const probes=new WeakSet();
export const isNativeDeviceProbe=p=>!!p&&probes.has(p);
export function withNativeDeviceProbe(p,read){
  if(!p||probes.has(p))return null;
  probes.add(p);try{return read();}finally{probes.delete(p);}
}
