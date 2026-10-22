// Presentation-only stable prefix. PaintSystem's circular table/replacement
// policy stays authoritative and untouched. Evaluate visibility afresh for
// every draw, including ripples created between reflection/main passes.
export function updateRippleUniforms(U,P,capacity){
 if(!U.uInkClock)return;
 const clock=P.clock||0;U.uInkClock.value=clock;
 const A=P.rip,B=P.ripP,count=U.uRipActiveCount;
 const packed=!!count&&count.packed!==false;
 if(!A||!B){if(packed)count.value=0;return;}
 const ra=U.uRip.value,rb=U.uRipP.value,shaderClock=Math.fround(clock);
 let n=0;
 for(let i=0;i<capacity;i++){
  const o=i*4;
  // GPU uniforms are float32. Testing the unrounded JS clock can incorrectly
  // drop a ripple at its birth/expiry boundary; retain the shader's comparison
  // form as well, including NaN's existing behavior for custom tables.
  const age=Math.fround(shaderClock-Math.fround(A[o+3]));
  if(packed&&(age<=0||age>=Math.fround(B[o+3])))continue;
  ra[n].set(A[o],A[o+1],A[o+2],A[o+3]);
  rb[n].set(B[o],B[o+1],B[o+2],B[o+3]);n++;
 }
 if(count)count.value=n;
}
