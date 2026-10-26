// Presentation filters only. Actor position, velocity, input and collision are
// never written here. Response values are host calibration, not retail data.
export function advanceStepPresentation(actor,dt){
  if(!(dt>0))return;
  const omega=24,y=actor.smoothY,v=actor.smoothYV,j=v+omega*y,decay=Math.exp(-omega*dt);
  actor.smoothY=(y+j*dt)*decay;
  actor.smoothYV=(v-omega*j*dt)*decay;
}

export function walkPresentationSpeed(controller,raw,dt,reset=false){
  const speed=Math.max(0,Number.isFinite(raw)?raw:0);
  if(reset||!Number.isFinite(controller.walkSpeedFiltered))controller.walkSpeedFiltered=speed;
  else if(dt>0)controller.walkSpeedFiltered+=(speed-controller.walkSpeedFiltered)*(-Math.expm1(-24*dt));
  // An idle pose has a real endpoint. Do not let the filter tail perpetually
  // advance a tiny gait after physical movement has stopped.
  if(speed===0&&controller.walkSpeedFiltered<.002)controller.walkSpeedFiltered=0;
  return controller.walkSpeedFiltered;
}
