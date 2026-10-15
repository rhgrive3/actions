// Broad authored finishes only; native geometry, material classes and motion are retained.
import {THREE} from './kit.mjs';
import {MODELS as SLOSHERS} from './sloshers.mjs';
function variant(base,sourceRow,baseId,name,palette){
 const pairs=Object.entries(palette).map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
 return Object.freeze({...base,sourceRow,baseId,name,sourceUrl:'https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/Wst_'+sourceRow+'.png',visualStatus:'broad-palette-awaiting-browser-review',build(d){
  d=base.build(d);const hits=pairs.map(()=>0);
  const channels=[d.body,d.drumCaps,...Object.values(d.parts||{}).filter(p=>p.mat==='body'&&!p.hidden).map(p=>p.src)];
  for(const g of new Set(channels.filter(Boolean))){const original=g.attributes.color,c=original.clone();
   for(let i=0;i<c.count;i++){const j=pairs.findIndex(([a])=>Math.abs(original.getX(i)-a.r)<1e-6&&Math.abs(original.getY(i)-a.g)<1e-6&&Math.abs(original.getZ(i)-a.b)<1e-6);if(j>=0){const b=pairs[j][1];c.setXYZ(i,b.r,b.g,b.b);hits[j]++;}}
   g.setAttribute('color',c);
  }
  if(hits.some(n=>n===0))throw Error('Missing authored palette source: '+sourceRow);
  return d;
 }});
}
export const FOLLOWUP_MODELS=Object.freeze({
 Slosher_Launcher_01:variant(SLOSHERS['s3-slosher-launcher'],'Slosher_Launcher_01','s3-slosher-launcher','Sloshing Machine Neo',{'#e4d9bd':'#27282c','#b9b6ab':'#34353a'}),
 Slosher_Bathtub_01:variant(SLOSHERS['s3-slosher-bathtub'],'Slosher_Bathtub_01','s3-slosher-bathtub','Bloblobber Deco',{'#1c1d21':'#e6c739'})
});
