// Consumer fixtures enter the sourced readiness/launch phase. Admission and
// movement stay covered by brella-special-controls.test.mjs.
export function readySpecialEvidence(actor,{placeAtFixtureOrigin=false}={}) {
 const origin=actor.pos.clone();actor._startSpecial();const state=actor._s3AllSpecialState;
 if(actor.weapon?.special==='inkVac')actor.intent.fire=true;
 if(state?.id==='booyahBomb'){for(let i=0;i<30;i++)actor._updateSpecial(1/60);state.charge=1;}
 if(state?.id==='inkjet')state.nextShot=0;
 if(placeAtFixtureOrigin)actor.pos.copy(origin);
 return state;
}
export function useSpecialEvidence(f,actor) {
 const id=actor.specialActive?.id;
 if(['booyahBomb','ultraStamp','tripleInkstrike','waveBreaker','splattercolorScreen'].includes(id)){
  actor.intent.sub=true;actor._updateSpecial(1/60);actor.intent.sub=false;actor._updateSpecial(1/60);
  for(let i=0;i<16&&actor.specialActive;i++)actor._updateSpecial(1/60);
 }else{
  if(id==='tentaMissiles'&&!f.G.actors.some(a=>a.alive&&a.team!==actor.team)){const enemy=f.make();enemy.team=1-actor.team;enemy.pos.copy(actor.pos).addScaledVector(actor.aimDir,8);f.G.actors.push(enemy);}
  actor.intent.fire=true;actor._updateSpecial(1/60);
 }
}
