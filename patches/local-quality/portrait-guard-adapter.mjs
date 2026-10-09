export function adaptPortraitGuard(rel,code,once){
 if(rel==='src/core/mobile.js'){
  code="import { guardPortraitPointer } from '../../patches/local-quality/portrait-guard.mjs';\n"+code;
  for(const method of ['_down','_move','_up'])code=once(code,`  ${method}(e) {`,`  ${method}(e) {\n    if (guardPortraitPointer(this,e)) return;`,'portrait '+method+' ownership');
  code=once(code,"    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture'])", "    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture']) root.addEventListener(ty, e => { if (guardPortraitPointer(this,e)) e.stopImmediatePropagation?.(); }, { signal: sig, capture: true });\n    for (const ty of ['pointerup', 'pointercancel', 'lostpointercapture'])",'portrait release capture before delegated wrappers');
  return code;
 }
 if(rel==='src/main.js'){
  code="import { syncPortraitFrame } from '../patches/local-quality/portrait-guard.mjs';\n"+code;
  return once(code,'    runSimulation(this, dt);','    const portraitFrame=syncPortraitFrame(this,G);\n    if (!portraitFrame.offline) runSimulation(this, portraitFrame.released ? 0 : dt);','portrait fixed simulation gate');
 }
 if(rel==='src/game/match.js')return once(code,'    this.controller.update(dt);','    if (this.controller.orientationBlocked) { this.controller.enabled=false; this.controller.navigationEnabled=false; }\n    this.controller.update(dt);','portrait independent local controller gate');
 return code;
}
