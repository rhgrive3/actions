// Bloblobber yaw-sweep bridge: match the already-installed S3 Slosher family
// windup sampling contract. The 11.3.0 source table supplies each unit's
// AfterOffsetDelayFrame (5F for the three late bubbles). The existing native
// Slosher interpreter uses the most recent clamped 60Hz yaw delta multiplied
// by the cumulative spacing. Retail-specific pitch sweep/FrameOffsetDegreeRate
// semantics have NOT been recovered; avoid inventing those here.
export const BLOBLOBBER_MAX_SWEEP_STEP = Math.PI / 18; // existing native Slosher 10 degrees/F

export function resetBloblobberYawSweep(state){
  if(!state)return;
  state.bloblobberPreviousYaw=null;
  state.bloblobberYawStep=0;
}

export function sampleBloblobberWindupYaw(state, direction){
  if(!state)return 0;
  const x=direction?.x,z=direction?.z;
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.hypot(x,z)<1e-8){
    resetBloblobberYawSweep(state);
    return 0;
  }
  const yaw=Math.atan2(x,z),before=state.bloblobberPreviousYaw;
  const delta=Number.isFinite(before)
    ?Math.atan2(Math.sin(yaw-before),Math.cos(yaw-before)):0;
  state.bloblobberPreviousYaw=yaw;
  state.bloblobberYawStep=Math.max(-BLOBLOBBER_MAX_SWEEP_STEP,
    Math.min(BLOBLOBBER_MAX_SWEEP_STEP,delta));
  return state.bloblobberYawStep;
}

// The Japanese S3 parameter reference specifies FrameOffsetMaxDegree as
// the maximum total sweeping angle (default 10 degrees), distinct from the
// Bloblobber-only FrameOffsetDegreeRate (.3 in the pinned 11.3.0 weapon row).
// Clamp each emitted bubble's source-rate-adjusted cumulative offset to the
// total sweep limit rather than allowing 15F * one-turn-frame to exceed it.
export function bloblobberSweepOffset(step,cumulativeFrames,rate=1,maxDegrees=10){
  if(!Number.isFinite(step)||!Number.isFinite(cumulativeFrames)||cumulativeFrames<0||
      !Number.isFinite(rate)||!Number.isFinite(maxDegrees))return 0;
  const max=Math.max(0,maxDegrees)*Math.PI/180,offset=step*cumulativeFrames*rate;
  return Math.max(-max,Math.min(max,offset));
}
