// Source-backed Splatana step envelope. The recent-input maximum and normalized
// geometric MoveStepKd recurrence are reconstruction choices, not recovered
// Nintendo code. Preserve the exported startup, duration and total distance.
const HZ=60,EPS=1e-9;
const finite=(x,f)=>Number.isFinite(x)?x:f;
export function recordSaberStick(state,actor,frames,window){
  if(!(frames>0))return;
  const move=actor.intent?.move,aim=actor.aimDir;
  const length=Math.hypot(aim?.x||0,aim?.z||0);
  const raw=length>EPS?((move?.x||0)*aim.x+(move?.z||0)*aim.z)/length:0;
  const value=Math.max(-1,Math.min(1,raw));
  const size=Math.max(1,Math.ceil(finite(window,1)));
  if(!state.stepStick||state.stepStick.length!==size){state.stepStick=new Float64Array(size);state.stepStickAt=0;state.stepStickFrames=0;}
  // The production clock is fixed at 60 Hz. Fractional callers accumulate;
  // duplicate 120-Hz render samples cannot stretch the five-frame history.
  state.stepStickFrames+=frames;
  while(state.stepStickFrames+EPS>=1){state.stepStick[state.stepStickAt]=value;state.stepStickAt=(state.stepStickAt+1)%size;state.stepStickFrames-=1;}
}
export function saberStepRequested(state,swing){
  if(swing.IsEnableStep===false)return false;
  const threshold=finite(swing.StepStartStickThresholdY,.9);
  for(const value of state.stepStick||[])if(value+EPS>=threshold)return true;
  return false;
}
function totalWeights(k,n){return Math.abs(k-1)<1e-8?n:(1-Math.pow(k,n))/(1-k);}
export function createSaberStep(actor,swing){
  const p=swing.SideStepParam;
  const direction=actor.aimDir.clone().setY(0).normalize();
  const duration=Math.max(0,finite(p.MoveFrame,0)),delay=Math.max(0,finite(p.ChargeFrame,0));
  return {direction,param:p,elapsed:0,delay,duration,remaining:(delay+duration)/HZ,speed:0};
}
export function saberStepSpeed(step,dt,grounded,sliding=false){
  const start=step.elapsed,end=Math.min(step.delay+step.duration,start+Math.max(0,dt)*HZ);
  let distance=0;
  const p=step.param,k=Math.max(0,Math.min(1,finite(grounded?p.MoveStepKd:p.MoveStepKd_Air,finite(p.MoveStepKd,1))));
  const total=finite(p.MoveDist,0)*(grounded&&sliding?finite(p.MoveDistKd_OnSlideGnd,1):1);
  const norm=totalWeights(k,step.duration);
  let f=Math.max(start,step.delay)-step.delay,last=Math.max(0,end-step.delay);
  // Integrate each source-frame bucket exactly. This preserves the finite
  // MoveDist also when this helper is observed at 30/60/120 Hz.
  while(f<last-EPS){const boundary=Math.min(last,Math.floor(f+EPS)+1);distance+=total*Math.pow(k,Math.floor(f+EPS))/norm*(boundary-f);f=boundary;}
  step.elapsed=end;step.remaining=Math.max(0,(step.delay+step.duration-end)/HZ);
  step.speed=dt>0?distance/dt:0;return step.speed;
}
