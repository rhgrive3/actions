// Native Actor._resolve landing contact, shared by receiver support checks.
// This 2cm interval is the source owner's landing probe, not a network grace.
export const ACTOR_LANDING_CONTACT_DOWN=.02;
export const ACTOR_STEP_VISUAL_OFFSET_MAX=.7;
export function actorLandingContact(hit,y,verticalVelocity){
 return !!hit?.hit&&hit.y>=y-ACTOR_LANDING_CONTACT_DOWN&&
  (verticalVelocity<=0||hit.y-y<ACTOR_LANDING_CONTACT_DOWN);
}
