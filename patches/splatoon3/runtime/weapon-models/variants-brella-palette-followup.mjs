// Current PR1271 base-color bindings for three existing source-backed broad finishes.
// No added geometry, channels, animation or gameplay changes. Artwork remains approximate.
import {THREE} from './kit.mjs';
import {MODELS} from './brellas.mjs';
const same=(a,i,c)=>Math.abs(a.getX(i)-c.r)<1e-6&&Math.abs(a.getY(i)-c.g)<1e-6&&Math.abs(a.getZ(i)-c.b)<1e-6;
function variant(row,id,name,palette,detail){
 const base=MODELS[id],changes=Object.entries(palette).map(([a,b])=>[new THREE.Color(a),new THREE.Color(b)]);
 return Object.freeze({...base,sourceRow:row,baseId:id,name,sourceUrl:'https://github.com/Leanny/splat3/blob/7280ff9cde8bb1c5dcef46c700c326471584d2e6/images/weapon/Wst_'+row+'.png',referenceVersion:'11.3.0',visualStatus:'broad-source-palette-awaiting-browser-review',build(d){
  d=base.build(d);const hits=new Array(changes.length).fill(0);
  for(const [name,g] of [['body',d.body],...Object.entries(d.parts).filter(([,p])=>p.mat==='body'&&!p.hidden).map(([k,p])=>[k,p.src])]){
   const old=g.attributes.color,c=old.clone(),p=g.attributes.position;
   for(let i=0;i<c.count;i++)for(let j=0;j<changes.length;j++)if(same(old,i,changes[j][0])){
    const v=detail?.(name,p,i)||changes[j][1];c.setXYZ(i,v.r,v.g,v.b);hits[j]++;break;
   }
   g.setAttribute('color',c);
  }
  if(hits.some(n=>n===0))throw Error('Brella variant source-color binding absent: '+row);
  return d;
 }});
}
const purple=new THREE.Color('#885294');
export const FOLLOWUP_MODELS=Object.freeze({
 Shelter_Wide_01:variant('Shelter_Wide_01','s3-shelter-wide','Tenta Sorella Brella',{'#b72328':'#dcc536'}),
 Shelter_Wide_02:variant('Shelter_Wide_02','s3-shelter-wide','Tenta Brella CRE-M',{'#48503b':'#c5c4b3','#30352e':'#646c69','#b72328':'#545c54'}),
 Shelter_Focus_01:variant('Shelter_Focus_01','s3-shelter-focus','Recycled Brella 24 Mk II',{'#bd4728':'#ad723b'},(name,p,i)=>name==='body'&&p.getZ(i)>.53?purple:null)
});
