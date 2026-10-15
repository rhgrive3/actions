// REEF-LUX 450 Deco: retain the native bow and motion, with fixed dark strings.
// Retained source icon Wst_Stringer_Short_01; this changes no geometry or marks.
import { THREE } from './kit.mjs';
import { MODELS as STRINGERS } from './stringers.mjs';
const base=STRINGERS['s3-stringer-short'];
export const FOLLOWUP_MODELS=Object.freeze({Stringer_Short_01:Object.freeze({...base,
  sourceRow:'Stringer_Short_01',baseId:'s3-stringer-short',name:'REEF-LUX 450 Deco',
  sourceUrl:'https://splatoonwiki.org/wiki/REEF-LUX_450_Deco',
  build(d){const model=base.build(d),black=new THREE.Color('#24272a');
    for(const name of ['string','stringL']){const p=model.parts[name],colors=p.src.attributes.color.clone();
      for(let i=0;i<colors.count;i++)colors.setXYZ(i,black.r,black.g,black.b);
      p.src.setAttribute('color',colors);p.mat='body';}
    return model;}
})});
