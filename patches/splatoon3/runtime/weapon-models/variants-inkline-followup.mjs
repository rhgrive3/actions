// Preserve the saved Inkline finish intent on the rebuilt native Tri-Stringer.
// Only authored fixed wood/dark surfaces change; no geometry or marks are added.
import { THREE } from './kit.mjs';
import { MODELS as STRINGERS } from './stringers.mjs';
const base=STRINGERS['s3-stringer-normal'];
const pairs=[['#68452d','#ba9b55'],['#30373b','#535b3b']].map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
export const FOLLOWUP_MODELS=Object.freeze({Stringer_Normal_01:Object.freeze({...base,
 sourceRow:'Stringer_Normal_01',baseId:'s3-stringer-normal',name:'Inkline Tri-Stringer',sourceUrl:'https://splatoonwiki.org/wiki/Inkline_Tri-Stringer',
 build(d){const model=base.build(d);for(const g of [model.body,...Object.values(model.parts).filter(p=>p.mat==='body'&&!p.hidden).map(p=>p.src)]){
  if(!g?.attributes.color)continue;const old=g.attributes.color,next=old.clone();for(let i=0;i<old.count;i++)for(const[from,to]of pairs)if(Math.abs(old.getX(i)-from.r)<1e-6&&Math.abs(old.getY(i)-from.g)<1e-6&&Math.abs(old.getZ(i)-from.b)<1e-6){next.setXYZ(i,to.r,to.g,to.b);break;}g.setAttribute('color',next);
 }return model;}
})});
