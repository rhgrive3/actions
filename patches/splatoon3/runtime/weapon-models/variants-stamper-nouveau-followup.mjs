// Existing variant finish on the rebuilt native base; geometry and motion stay native.
import { THREE } from './kit.mjs';
import { MODELS as BASES } from './splatanas.mjs';
const base=BASES['s3-saber-normal'];
// The date wheel is xcyl radius .048 at z .062, x endpoints +/-.023.
// The unrelated rubber blade slab has half-width .0145 and must stay dark.
// Side plates occupy |x| <= .0215; steel end axles start at |x| .023 and stay steel.
const pairs=[["#283456", "#eeeae1"], ["#171a1d", "#4d9460"], ["#8e9193", "#4d9460"], ["#505459", "#eeeae1"]].map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
export const FOLLOWUP_MODELS=Object.freeze({Saber_Normal_01:Object.freeze({...base,
 sourceRow:'Saber_Normal_01',baseId:'s3-saber-normal',name:'Splatana Stamper Nouveau',sourceUrl:'https://splatoonwiki.org/wiki/Splatana_Stamper_Nouveau',
 build(d){const model=base.build(d),g=model.body,old=g.attributes.color,next=old.clone(),pos=g.attributes.position;
  for(let i=0;i<old.count;i++)for(let index=0;index<pairs.length;index++){const[from,to]=pairs[index];if(Math.abs(old.getX(i)-from.r)<1e-6&&Math.abs(old.getY(i)-from.g)<1e-6&&Math.abs(old.getZ(i)-from.b)<1e-6){if(index===1&&!(Math.abs(pos.getX(i))>.022&&pos.getZ(i)<.111))continue;if(index===2&&Math.abs(pos.getX(i))>=.022)continue;next.setXYZ(i,to.r,to.g,to.b);break;}}
  g.setAttribute('color',next);return model;}
})});
