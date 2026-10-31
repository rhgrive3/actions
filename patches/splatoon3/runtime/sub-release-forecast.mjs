// The existing readiness owner uses one independent 60 Hz startup frame.
// Both its admission path and the optional "release now" guide use this value.
export const SUB_USE_STARTUP_SECONDS=1/60;
const STEP=1/60,EPS=1e-10;

// Predict only the already-owned readiness/charge clocks. Actor movement, aim,
// and new Fizzy shake inputs are future user actions and are not manufactured.
// The default remains an immediate throw snapshot for admitted release calls.
export function forecastSubRelease(runner,{anticipateRelease=false,queuedFrames=0,queueFramesPerSecond=0}={}){
  const result={hold:runner?.s3SubHold||0,ticks:0,heldTicks:0,delay:0};
  const ready=runner?.s3SubReady;
  if(!anticipateRelease||!ready||!Number.isFinite(ready.age)||!Number.isFinite(ready.minimum)||
    ready.useStartup!==null&&!Number.isFinite(ready.useStartup))return result;
  let age=ready.age,startup=ready.useStartup,queue=Math.max(0,queuedFrames||0);
  const budget=Math.ceil((Math.max(0,ready.minimum-age)+Math.max(0,startup??SUB_USE_STARTUP_SECONDS))/STEP)+3;
  if(!Number.isFinite(budget)||budget>1800)return result;
  for(let tick=0;tick<budget;tick++){
    // Catalogue Fizzy drains already queued bonuses before the inner
    // readiness/kit owner, including the final emission tick.
    const drain=Math.min(queue,Math.max(0,queueFramesPerSecond)*STEP);
    queue-=drain;result.hold+=drain/60;
    age+=STEP;result.ticks++;result.delay+=STEP;
    if(age+EPS>=ready.minimum){
      if(startup===null)startup=SUB_USE_STARTUP_SECONDS;
      else {startup=Math.max(0,startup-STEP);if(startup<=EPS)return result;}
    }
    result.hold+=STEP;result.heldTicks++;
  }
  return result;
}
