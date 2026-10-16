// Build-only: one bounded propagator per existing strand segment. The three
// axes share K/D/dt; fixed ticks also reuse it on subsequent updates. Keep the
// native Float64 expression order, saturation, bone transforms and public
// springStep unchanged. No cache grows with elapsed time or visited dt values.
export function adaptRootHairSpring(rel, code, replaceOnce) {
  if (rel !== 'src/game/motion/root-hair.js') return code;
  code = replaceOnce(code,
    '   const j=e.offset;for(let k=0;k<3;k++){',
    `   const p=e._iwSpring||(e._iwSpring={dt:NaN,K:NaN,D:NaN,alpha:0,decay:0,cosine:0,sine:0});
   if(!Object.is(p.dt,dt)||!Object.is(p.K,e.K)||!Object.is(p.D,e.D)){
    const alpha=e.D/2,w=Math.sqrt(Math.max(1e-12,e.K-alpha*alpha));
    p.dt=dt;p.K=e.K;p.D=e.D;p.alpha=alpha;
    p.decay=Math.exp(-alpha*dt);p.cosine=Math.cos(w*dt);p.sine=Math.sin(w*dt)/w;
   }
   const j=e.offset;for(let k=0;k<3;k++){`, 'root hair shared propagator');
  code = replaceOnce(code,
    '    springStep(this.state[j+2*k],this.state[j+2*k+1],this.axis.getComponent(k)*e.gain,e.K,e.D,dt,this.result);',
    `    const input=this.axis.getComponent(k)*e.gain;
    const xe=-e.D*input/e.K,ve=input,a=this.state[j+2*k]-xe,b=this.state[j+2*k+1]-ve;
    this.result[0]=xe+p.decay*(a*p.cosine+(b+p.alpha*a)*p.sine);
    this.result[1]=ve+p.decay*(b*p.cosine-(p.alpha*b+e.K*a)*p.sine);`, 'root hair reuse exact axis coefficients');
  code = replaceOnce(code,
    '    const input=this.axis.getComponent(k)*e.gain;\n    if(this.result[0]',
    '    if(this.result[0]', 'root hair reuse axis input');
  return code;
}
