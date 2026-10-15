// Existing variant finish on the rebuilt native base; geometry and motion stay native.
import { THREE } from './kit.mjs';
import { MODELS as BASES } from './splatanas.mjs';
const base=BASES['s3-saber-heavy'];
const pairs=[["#f3f4e8", "#20212e"], ["#67b9db", "#c8a64d"], ["#dde9e6", "#4b4b5e"], ["#92dcca", "#20212e"]].map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
export const FOLLOWUP_MODELS=Object.freeze({Saber_Heavy_01:Object.freeze({...base,
 sourceRow:'Saber_Heavy_01',baseId:'s3-saber-heavy',name:'Charcoal Decavitator',sourceUrl:'https://splatoonwiki.org/wiki/Charcoal_Decavitator',
 build(d){const model=base.build(d),g=model.body,old=g.attributes.color,next=old.clone(),pos=g.attributes.position;
  for(let i=0;i<old.count;i++)for(let index=0;index<pairs.length;index++){const[from,to]=pairs[index];if(Math.abs(old.getX(i)-from.r)<1e-6&&Math.abs(old.getY(i)-from.g)<1e-6&&Math.abs(old.getZ(i)-from.b)<1e-6){next.setXYZ(i,to.r,to.g,to.b);break;}}
  g.setAttribute('color',next);return model;}
})});
