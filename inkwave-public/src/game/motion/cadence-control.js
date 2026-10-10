/** Cadence policy for INKWAVE's retargeted source locomotion.
 *
 * The 40-frame Walk / 32-frame Run clip lengths are sourced from the BFRES
 * animation bank. The world-speed mapping below is a HOST adaptation, not an
 * assertion about Splatoon's original runtime playback-speed state machine.
 *
 * A full gait cycle includes left and right footfalls. In particular, a
 * diagonal blend must not count distance once per cardinal source clip.
 */
export function motionCadence({speed, walkSpeed, runSpeed, runWeight, nominalHz, stride}) {
 const worldSpeed=Math.max(0,Number.isFinite(speed)?speed:0);
 const walkRun=Math.min(1,Math.max(0,runWeight));
 const referenceSpeed=Math.max(1e-6,walkSpeed*(1-walkRun)+runSpeed*walkRun);
 const authoredHz=Math.max(0,nominalHz);
 const stepAmplitude=Math.sqrt(Math.min(1,worldSpeed/Math.max(1e-6,stride*authoredHz)));
 // Both the height/length of a step and the cadence shrink on a weak stick.
 // This avoids a high-knee march played at a nearly frozen phase.
 const rate=authoredHz*Math.sqrt(Math.min(1,worldSpeed/referenceSpeed));
 // Do not advance farther than the actual travelled distance can plausibly
 // support at the current shortened stride; never enforce a minimum cadence.
 const distanceRate=worldSpeed/Math.max(1e-6,stride*stepAmplitude);
 const cadenceHz=Math.min(rate,distanceRate);
 return {cadenceHz,stepAmplitude,referenceSpeed,authoredHz};
}