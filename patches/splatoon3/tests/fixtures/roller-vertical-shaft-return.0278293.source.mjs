// Presentation-only return through the real weapon's upright +Z shaft.
// The existing vertical pose owns the window and deadline; no retail timing
// or guessed joint axis is introduced. Five quaternions/two vectors are reused.
const EPS=1e-10;
export function verticalShaftReturnWindow(attack){
  const release=attack?.windup,interval=attack?.swingInterval??attack?.interval;
  if(!Number.isFinite(release)||!Number.isFinite(interval))return null;
  const end=Math.max(release+2/60,interval),settle=release+Math.min(5/60,(end-release)*.35);
  return {back:Math.max(settle+(end-settle)*.1,end-10/60),end};
}
export function createVerticalShaftReturn(){
  const records=new WeakMap();
  // A path belongs to one attack. Once an active path is interrupted, a later
  // release of the same attack must not capture a second, shorter return.
  // Merely holding before its first eligible sample does not consume it.
  const clear=ch=>{const m=records.get(ch);if(m){if(m.active)m.spent=true;m.active=m.pending=false;}};
  function read(ch,attack,input,socket,kid,enabled){
    let m=records.get(ch);
    if(!attack){clear(ch);return null;}
    if(m&&m.attack!==attack){m.active=m.pending=m.spent=false;m.attack=attack;}
    else if(m&&attack.elapsed<m.lastElapsed-EPS)clear(ch);
    if(!enabled||attack.swingShape==='heavy'){clear(ch);return null;}
    const release=attack.windup,interval=attack.swingInterval??attack.interval;
    if(!Number.isFinite(release)||!Number.isFinite(interval)||!Number.isFinite(attack.elapsed)){clear(ch);return null;}
    const end=Math.max(release+2/60,interval),settle=release+Math.min(5/60,(end-release)*.35),
      back=Math.max(settle+(end-settle)*.1,end-10/60),elapsed=attack.elapsed;
    if(elapsed<back-EPS||elapsed>=end-EPS||!Number.isFinite(kid.scale.x)||!Number.isFinite(kid.scale.y)||!Number.isFinite(kid.scale.z)||Math.abs(kid.scale.x)<=1e-4||Math.abs(kid.scale.y)<=1e-4||Math.abs(kid.scale.z)<=1e-4){clear(ch);return null;}
    if(!m){m={q0:input.clone(),qUp:input.clone(),a:input.clone(),b:input.clone(),result:input.clone(),
      shaft:kid.scale.clone(),up:kid.scale.clone(),captures:0,fallbacks:0};records.set(ch,m);}
    m.attack=attack;m.lastElapsed=elapsed;m.pending=false;
    if(m.spent)return null;
    if(!m.active){m.pending=true;m.t0=elapsed;m.end=end;return null;}
    const x=Math.max(0,Math.min(1,(elapsed-m.t0)/(m.end-m.t0))),u=x*x*(3-2*x);
    m.a.copy(m.q0).slerp(m.qUp,u);m.b.copy(m.qUp).slerp(input,u);
    return m.result.copy(m.a).slerp(m.b,u);
  }
  read.capture=(ch,orientation,socket,kid,floorAxis,floorAngle)=>{const m=records.get(ch);if(!m?.pending)return;
    // Only bridge a real native floor-search correction. If this first
    // eligible sample is already clear, keep its native carry for the rest
    // of this attack rather than arming an unnecessary late waypoint.
    if(!(floorAxis>=0&&floorAngle>0)){m.pending=false;m.spent=true;return;}
    m.q0.copy(orientation);
    m.result.copy(orientation).multiply(m.a.copy(socket).invert());
    m.shaft.set(0,0,1).applyQuaternion(m.result).normalize();
    m.up.set(0,1,0).applyQuaternion(m.a.copy(kid.quaternion).invert()).divide(kid.scale).normalize();
    m.qUp.copy(m.b.setFromUnitVectors(m.shaft,m.up)).multiply(m.result).multiply(socket).normalize();
    m.pending=false;m.active=true;m.captures++;
  };
  read.reject=ch=>{const m=records.get(ch);if(m)m.fallbacks++;};
  read.clear=clear;
  // Explicit QA read only. No payload or arrays are made during normal frames.
  read.snapshot=ch=>{const m=records.get(ch);return m?{active:m.active,pending:m.pending,spent:!!m.spent,t0:m.t0,end:m.end,lastElapsed:m.lastElapsed,
    captures:m.captures,fallbacks:m.fallbacks,q0:m.q0.toArray(),qUp:m.qUp.toArray()}:null;};
  return read;
}
