// Build-only #845 residual. Body/weapon/contact sampling still runs each tick.
// Reconstruct the current hair inputs only at a state boundary or before the
// existing pre-submission accessory catch-up. Never advance the motion clock.
export function adaptOffscreenHairTargets(rel, code, once) {
  if (rel !== 'src/game/motion/source-controller.js') return code;
  code = once(code, '   this.previousHairTargets.copy(this.hairTargets);',
    '   this._ensureHairTargets();this.previousHairTargets.copy(this.hairTargets);',
    '#845 retain exact previous hair at state boundaries');
  code = once(code,
    'this.bodyBalance.clear();this.hairTargets.clear();',
    'this.bodyBalance.clear();this.hairTargets.clear();this._iwHairDeferred=!!c._oobBudget;',
    '#845 defer only hidden hair inputs');
  code = once(code,
    'this.hairTargets.add(this.pose,locomotionProfile(this.bank,special.name),1);',
    'if(!c._oobBudget)this.hairTargets.add(this.pose,locomotionProfile(this.bank,special.name),1);',
    '#845 suppress hidden special hair inputs');
  code = once(code,
    'this.bodyBalance.add(idleProfile,1);this.hairTargets.add(this.pose,idleProfile,1);',
    'this.bodyBalance.add(idleProfile,1);if(!c._oobBudget)this.hairTargets.add(this.pose,idleProfile,1);',
    '#845 suppress hidden idle hair inputs');
  code = once(code, '  // Pivoting changes the feet, not the gaze/weapon pose into a full lateral',
    '  this._iwHairClipCount=this.currentClips.length;this._iwHairLoop=!special;\n' +
    '  // Pivoting changes the feet, not the gaze/weapon pose into a full lateral',
    '#845 retain only clips that contribute hair, before action overlays');
  code = once(code,
    '  if(transition<1&&!c._oobBudget)this.hairTargets.mix(this.previousHairTargets,1-transition);',
    '  this._iwHairTransition=transition;\n  if(transition<1&&!c._oobBudget)this.hairTargets.mix(this.previousHairTargets,1-transition);',
    '#845 retain exact hair transition weight');
  code = once(code, ' applyAccessories(dt){if(this.active&&this.pose){',
    ` _ensureHairTargets(){
  if(!this._iwHairDeferred)return;
  this.hairTargets.clear();
  for(let i=0;i<this._iwHairClipCount;i++){
   const item=this.currentClips[i];
   this.bank.sample(item.name,item.frame,this.tmp,this._iwHairLoop);
   this.hairTargets.add(this.tmp,locomotionProfile(this.bank,item.name),item.weight);
  }
  if(this._iwHairTransition<1)this.hairTargets.mix(this.previousHairTargets,1-this._iwHairTransition);
  this._iwHairDeferred=false;
 }
 applyAccessories(dt){if(this.active&&this.pose){if(!this.manual)this._ensureHairTargets();`,
    '#845 rebuild deferred hair before the first visible accessory solve');
  code = once(code, ' sampleManual(){',
    ' sampleManual(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;',
    '#845 manual poses discard automatic pending hair inputs');
  return once(code, ' clearBankCaches(){',
    ' clearBankCaches(){\n  this._iwHairDeferred=false;this._iwHairClipCount=0;',
    '#845 drop deferred bank inputs on bank changes and disposal');
}
