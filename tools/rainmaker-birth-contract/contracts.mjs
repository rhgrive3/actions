export function runContracts(api) {
  const {socketFromMatrix,resolveBirth,horizontalRangeUsed}=api;
  let checks=0;
  const eq=(a,b)=>{checks++; if(JSON.stringify(a)!==JSON.stringify(b))throw Error(JSON.stringify({a,b}));};
  const throws=fn=>{checks++;let yes=false;try{fn();}catch{yes=true;}if(!yes)throw Error('negative accepted');};
  const matrix=[1,0,0,0,0,1,0,0,0,0,1,0,2,3,4,1];
  eq(socketFromMatrix(matrix),[2,2.944,4.899]);
  eq(socketFromMatrix([0,0,-2,0,0,2,0,0,2,0,0,0,0,0,0,1]),[1.798,-.112,0]);
  const input={anchor:[0,1,0],socket:[0,1,1],eventTick:9,poseTick:9};
  eq(resolveBirth({...input,sweep:()=>null}),{birth:[0,1,1],rangeAnchor:[0,1,0],blocked:false});
  eq(resolveBirth({...input,sweep:(a,b)=>{eq(a,[0,1,0]);eq(b,[0,1,1]);return {fraction:.4};}}),
    {birth:[0,1,.4],rangeAnchor:[0,1,0],blocked:true});
  eq(resolveBirth({...input,sweep:()=>({fraction:0})}).birth,[0,1,0]);
  eq(horizontalRangeUsed([0,1,4.4],input.anchor),4.4);
  // Negative control: resetting range to the new muzzle wrongly credits one extra unit.
  eq(horizontalRangeUsed([0,1,4.4],input.socket)<4.4,true);
  for(const bad of [undefined,{}, {fraction:NaN},{fraction:-.1},{fraction:1.1}])
    throws(()=>resolveBirth({...input,sweep:()=>bad}));
  throws(()=>resolveBirth({...input,poseTick:8,sweep:()=>null}));
  throws(()=>resolveBirth({...input}));
  throws(()=>socketFromMatrix(matrix.map((v,i)=>i===15?0:v)));
  throws(()=>resolveBirth({...input,socket:[0,NaN,1],sweep:()=>null}));
  eq(input.anchor,[0,1,0]); eq(input.socket,[0,1,1]);
  return checks;
}
