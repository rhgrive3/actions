// Existing variant finish on the rebuilt native base; geometry and motion stay native.
import { THREE } from './kit.mjs';
import { MODELS as BASES } from './splatanas.mjs';
const base=BASES['s3-saber-lite'];
const pairs=[["#191c20", "#815c40"]].map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
export const FOLLOWUP_MODELS=Object.freeze({Saber_Lite_02:Object.freeze({...base,
 sourceRow:'Saber_Lite_02',baseId:'s3-saber-lite',name:'Splatana Wiper RUS-T',sourceUrl:'https://splatoonwiki.org/wiki/Splatana_Wiper_RUS-T',
 build(d){const model=base.build(d),g=model.body,old=g.attributes.color,next=old.clone(),pos=g.attributes.position;
  for(let i=0;i<old.count;i++)for(let index=0;index<pairs.length;index++){const[from,to]=pairs[index];if(Math.abs(old.getX(i)-from.r)<1e-6&&Math.abs(old.getY(i)-from.g)<1e-6&&Math.abs(old.getZ(i)-from.b)<1e-6){next.setXYZ(i,to.r,to.g,to.b);break;}}
  g.setAttribute('color',next);return model;}
})});
