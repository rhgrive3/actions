// Controlled inverse of the composed Flow surface fixes. This is current QA
// fault injection, never a historical main build or production source change.
import assert from 'node:assert/strict';
const replaceOnce=(source,from,to)=>{
 assert.equal(source.split(from).length,2,'one exact Flow surface counterfactual anchor');
 return source.replace(from,to);
};
export function withoutFlowSurfaceFixes(rel,source,{root=true}={}){
 if(rel!=='patches/splatoon3/runtime/flow-motion.mjs')return source;
 if(root)source=replaceOnce(source,"    if (ch.form === 'swim' && ch.grounded) ch.root.getWorldPosition(s.anchors[0]);\n    else ch.squid.pivot.getWorldPosition(s.anchors[0]);\n    ch.root.worldToLocal(s.anchors[0]);",
  '    ch.root.worldToLocal(ch.squid.pivot.getWorldPosition(s.anchors[0]));');
 source=replaceOnce(source,"    const verticalPhase = ch.form === 'swim' && ch.grounded ? phase : phase - .5;\n    s.point.y += verticalPhase * leg * (ch.kidForm ? .75 : .35);",
  '    s.point.y += (phase - .5) * leg * (ch.kidForm ? .75 : .35);');
 return replaceOnce(source,'    s.point.y = Math.max(s.point.y, swimSurfaceY);\n','');
}
