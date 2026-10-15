// The retained Custom Wellstring reference has a dark grip, with green cast arms.
// The rebuilt base authors that grip in #527e91; preserve the saved target finish.
import { THREE } from './kit.mjs';
import { MODELS as STRINGERS } from './stringers.mjs';
const base=STRINGERS['s3-stringer-explosion'],from=new THREE.Color('#527e91'),to=new THREE.Color('#25292c');
export const FOLLOWUP_MODELS=Object.freeze({Stringer_Explosion_01:Object.freeze({...base,
 sourceRow:'Stringer_Explosion_01',baseId:'s3-stringer-explosion',name:'Custom Wellstring V',sourceUrl:'https://splatoonwiki.org/wiki/Custom_Wellstring_V',
 build(d){const model=base.build(d),g=model.body,old=g.attributes.color,next=old.clone();
  for(let i=0;i<old.count;i++)if(Math.abs(old.getX(i)-from.r)<1e-6&&Math.abs(old.getY(i)-from.g)<1e-6&&Math.abs(old.getZ(i)-from.b)<1e-6)next.setXYZ(i,to.r,to.g,to.b);
  g.setAttribute('color',next);return model;}
})});
