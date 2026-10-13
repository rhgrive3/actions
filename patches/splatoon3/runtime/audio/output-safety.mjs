// Linear below -1.94 dBFS; smooth knee above it, bounded sample output.
// This is a safety net after the existing dynamics, not a claim of transparent true-peak limiting.
let curve;
export function connectOutputSafety(ctx,from){
  if(!curve){curve=new Float32Array(8193);for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.8?a:.8+.16*Math.tanh((a-.8)/.16));}}
  const guard=ctx.createWaveShaper();guard.curve=curve;guard.oversample='none';from.connect(guard);guard.connect(ctx.destination);return guard;
}
