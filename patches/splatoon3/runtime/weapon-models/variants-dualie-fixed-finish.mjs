// Two reviewed broad fixed finishes. Values retain the authored source-backed approximations.
// No new geometry, animation, materials, or owner-ink assignment.
import {THREE} from './kit.mjs';
import {MODELS} from './dualies.mjs';
function finish(row,baseId,name,palette){
 const base=MODELS[baseId],pairs=Object.entries(palette).map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
 return Object.freeze({...base,sourceRow:row,baseId,name,sourceUrl:`https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/Wst_${row}.png`,referenceVersion:'11.3.0',visualStatus:'broad-fixed-finish-awaiting-browser-review',build(d){
  d=base.build(d);const hits=pairs.map(()=>0);
  for(const g of [d.body,...Object.values(d.parts||{}).filter(p=>p.mat==='body'&&!p.hidden).map(p=>p.src)]){
   const old=g.attributes.color,c=old.clone();
   for(let i=0;i<c.count;i++)for(let j=0;j<pairs.length;j++){
    const [a,b]=pairs[j];if(Math.abs(old.getX(i)-a.r)<1e-6&&Math.abs(old.getY(i)-a.g)<1e-6&&Math.abs(old.getZ(i)-a.b)<1e-6){c.setXYZ(i,b.r,b.g,b.b);hits[j]++;break;}
   }
   g.setAttribute('color',c);
  }
  if(hits.some(n=>n===0))throw Error('Fixed shooter source-color binding absent: '+row);
  d.variantSourceRow=row;d.baseModelId=baseId;return d;
 }});
}
export const FOLLOWUP_MODELS=Object.freeze({
 Maneuver_Short_01:finish('Maneuver_Short_01','s3-maneuver-short','Dapple Dualies Nouveau',{"#a01a5c": "#26438b"}),
 Maneuver_Normal_01:finish('Maneuver_Normal_01','dualies','Enperry Splat Dualies',{"#2f8a3a": "#d3ab33", "#c02a8e": "#ecebe6"})
});
