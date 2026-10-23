// Bridge the displayed, weighted grip to the existing return deadline. Applying
// independent easing to raw angles and their weight creates a late catch-up
// peak. This is an INKWAVE continuity repair, not a retail animation track.
function values(p, ref) {
  return [...p.anchor.map((v,i)=>(v-ref.anchor[i])*p.weight),
    ...p.rotation.map((v,i)=>(v-ref.rotation[i])*p.weight), p.weight, p.coil*p.weight, p.whip*p.weight];
}
function bridge(m, time) {
  const d=m.end-m.start,u=Math.max(0,Math.min(1,(time-m.start)/d)),u2=u*u,u3=u2*u;
  return m.from.map((v,i)=>(2*u3-3*u2+1)*v+(u3-2*u2+u)*d*m.fromV[i]
    +(-2*u3+3*u2)*m.to[i]+(u3-u2)*d*m.toV[i]);
}
function unpack(p, v, ref) {
  const w=v[6];p.weight=w;
  if(Math.abs(w)>1e-10){
    for(let i=0;i<3;i++){p.anchor[i]=ref.anchor[i]+v[i]/w;p.rotation[i]=ref.rotation[i]+v[i+3]/w;}
    p.coil=v[7]/w;p.whip=v[8]/w;
  }
  return p;
}
export function createVerticalRecoverySampler(sample, returnSeconds, endTime) {
  const owners=new WeakMap();
  const pose=(a,t,held)=>sample(t,a.windup,a.swingInterval??a.interval,a.swingShape,held);
  function read(owner,attack){
    const t=attack.elapsed,held=attack.holdRoll===true;
    const signature=[attack.windup,attack.swingInterval??attack.interval,attack.swingShape].join(':');
    let m=owners.get(owner);
    if(!m||m.attack!==attack||t<m.time||m.signature!==signature){
      m={attack,signature,time:t,held,transition:null,ref:pose(attack,0,false)};owners.set(owner,m);
    }
    if(held!==m.held&&t>attack.windup&&t<endTime(attack)){
      const end=Math.min(endTime(attack),t+returnSeconds),h=Math.min(1e-5,(end-t)/4,(t-attack.windup)/4);
      const rawAt=m.transition?(t===m.transition.start?m.transition.rawAt:unpack(pose(attack,t,m.held),bridge(m.transition,t),m.ref)):pose(attack,t,m.held);
      const old=time=>m.transition&&time<m.transition.end?bridge(m.transition,time):values(pose(attack,time,m.held),m.ref);
      const from=old(t),left=old(t-h),right=old(t+h);
      const to=values(pose(attack,end,held),m.ref),toLeft=values(pose(attack,end-h,held),m.ref),toRight=values(pose(attack,end+h,held),m.ref);
      m.transition={start:t,end,from,to,rawAt,fromV:right.map((v,i)=>(v-left[i])/(2*h)),toV:toRight.map((v,i)=>(v-toLeft[i])/(2*h))};
    }else if(t<=attack.windup)m.transition=null;
    m.held=held;m.time=t;
    if(m.transition&&t>=m.transition.end)m.transition=null;
    const p=pose(attack,t,held);
    return m.transition?(t===m.transition.start?m.transition.rawAt:unpack(p,bridge(m.transition,t),m.ref)):p;
  }
  read.clear=owner=>owners.delete(owner);
  return read;
}
