// Broad authored finishes only; native geometry, material classes and motion are retained.
import {THREE} from './kit.mjs';
import {MODELS as SPLATLINGS} from './splatlings.mjs';
function variant(base,sourceRow,baseId,name,palette){
 const pairs=Object.entries(palette).map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
 return Object.freeze({...base,sourceRow,baseId,name,sourceUrl:'https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/Wst_'+sourceRow+'.png',visualStatus:'broad-palette-awaiting-browser-review',build(d){
  d=base.build(d);const hits=pairs.map(()=>0);
  const channels=[d.body,...Object.values(d.parts||{}).filter(p=>p.mat==='body'&&!p.hidden).map(p=>p.src)];
  for(const g of new Set(channels.filter(Boolean))){const original=g.attributes.color,c=original.clone();
   for(let i=0;i<c.count;i++){const j=pairs.findIndex(([a])=>Math.abs(original.getX(i)-a.r)<1e-6&&Math.abs(original.getY(i)-a.g)<1e-6&&Math.abs(original.getZ(i)-a.b)<1e-6);if(j>=0){const b=pairs[j][1];c.setXYZ(i,b.r,b.g,b.b);hits[j]++;}}
   g.setAttribute('color',c);
  }
  if(hits.some(n=>n===0))throw Error('Missing authored palette source: '+sourceRow);
  return d;
 }});
}
export const FOLLOWUP_MODELS=Object.freeze({
 Spinner_Quick_01:variant(SPLATLINGS['s3-spinner-quick'],'Spinner_Quick_01','s3-spinner-quick','Zink Mini Splatling',{'#493098':'#28516a','#e5bc21':'#dadbd9'}),
 Spinner_Quick_02:variant(SPLATLINGS['s3-spinner-quick'],'Spinner_Quick_02','s3-spinner-quick','Mini Splatling RTL-R',{'#493098':'#5b6846','#e5bc21':'#d6c18c','#255cd2':'#b56130'})
});
