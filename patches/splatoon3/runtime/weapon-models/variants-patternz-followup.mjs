// Minimal Patternz shape and broad palette, using only existing Undercover geometry.
// Official rotating showcase: https://x.com/SplatoonJP/status/1932732540173103612
// Lime/violet stripe ownership is an explicitly inferred candidate, not a verified retail mask.
import {THREE} from './kit.mjs';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {MODELS} from './brellas.mjs';
const base=MODELS['s3-shelter-compact'];
const color=s=>new THREE.Color(s);
const cloth=color('#2b2d33'),white=color('#e6e6e0'),wood=color('#7a5230'),woodDark=color('#4a2f1a'),gold=color('#c9a24a');
const pale=color('#e8ede0'),cyan=color('#35bdc4'),dark=color('#252a31');
const matches=(a,i,c)=>Math.abs(a.getX(i)-c.r)<1e-6&&Math.abs(a.getY(i)-c.g)<1e-6&&Math.abs(a.getZ(i)-c.b)<1e-6;
function subset(g,indices,neutral=false){
 const out=new THREE.BufferGeometry(),map=new Map(),vertices=[],ix=[];
 for(const i of indices){if(!map.has(i)){map.set(i,vertices.length);vertices.push(i);}ix.push(map.get(i));}
 for(const [name,a] of Object.entries(g.attributes)){
  const data=new a.array.constructor(vertices.length*a.itemSize);
  vertices.forEach((v,i)=>{for(let c=0;c<a.itemSize;c++)data[i*a.itemSize+c]=neutral&&name==='color'?1:a.array[v*a.itemSize+c];});
  out.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
 }
 out.setIndex(ix);return out;
}
function triangles(g,role){
 const groups=[[],[],[]];
 for(let n=0;n<g.index.count;n+=3){const tri=[g.index.getX(n),g.index.getX(n+1),g.index.getX(n+2)];groups[role(tri,g)].push(...tri);}
 return groups;
}
export const FOLLOWUP_MODELS=Object.freeze({
 Shelter_Compact_02:Object.freeze({...base,baseId:'s3-shelter-compact',sourceRow:'Shelter_Compact_02',name:'Patternz Undercover Brella',
  sourceUrl:'https://x.com/SplatoonJP/status/1932732540173103612',
  visualStatus:'minimal-reference-candidate',
  inkPartition:'inferred-alternating-stripe-sectors',
  referenceLimitations:'Broad sector/slash and cyan motif approximation. Lime stripes/sleeve use owner ink and violet stripes use opponent ink by inference; exact retail mask and graphics remain unverified.',
  build(d){
   d=base.build(d);
   const oldBody=d.body,body=oldBody.attributes.color,bc=body.clone(),bp=oldBody.attributes.position;let handle=0,shaft=0;
   const sleeve=i=>matches(body,i,gold)&&bp.getZ(i)>=.29&&bp.getZ(i)<=.46;
   const [fixedBody,ownerSleeve]=triangles(oldBody,tri=>tri.every(sleeve)?1:0);
   if(!fixedBody.length||!ownerSleeve.length)throw Error('Patternz source sleeve binding absent');
   for(let i=0;i<bc.count;i++){
    let c=null;
    if(matches(body,i,wood)||matches(body,i,woodDark)){c=pale;handle++;}
    else if(matches(body,i,white)){c=dark;shaft++;}
    else if(matches(body,i,gold))c=pale;
    if(c)bc.setXYZ(i,c.r,c.g,c.b);
   }
   if(!handle||!shaft)throw Error('Patternz source handle/shaft binding absent');
   oldBody.setAttribute('color',bc);
   const sleeveGeo=subset(oldBody,ownerSleeve,true),merged=mergeGeometries([d.ink,sleeveGeo],false);
   if(!merged)throw Error('Patternz owner sleeve attributes mismatch');
   d.body=subset(oldBody,fixedBody);oldBody.dispose();d.ink.dispose();sleeveGeo.dispose();d.ink=merged;
   const part=d.parts.canopy,g=part.src,old=g.attributes.color,p=g.attributes.position;
   const classify=tri=>{
    if(!tri.every(i=>matches(old,i,cloth)))return 0;
    // Unfold coordinates for broad palette sampling only. No positions or topology are added.
    const x=tri.reduce((s,i)=>s+p.getX(i)/.11,0)/3,y=tri.reduce((s,i)=>s+(p.getY(i)-.075)/.11,0)/3;
    const sector=Math.floor(((Math.atan2(y,x)+Math.PI*2)%(Math.PI*2))/(Math.PI/4));
    const band=((x+y*.65)/.115%1+1)%1;
    return (sector&1)===0&&band<.40?(sector%4===0?1:2):0;
   };
   const [fixed,owner,opponent]=triangles(g,classify);
   if(!fixed.length||!owner.length||!opponent.length)throw Error('Patternz canopy role binding absent');
   const next=old.clone();
   for(let i=0;i<next.count;i++)if(matches(old,i,cloth)){
    const x=p.getX(i)/.11,y=(p.getY(i)-.075)/.11;
    const sector=Math.floor(((Math.atan2(y,x)+Math.PI*2)%(Math.PI*2))/(Math.PI/4));
    const c=(sector&1)&&Math.hypot(x,y)>.17?cyan:dark;next.setXYZ(i,c.r,c.g,c.b);
   }
   g.setAttribute('color',next);
   part.src=subset(g,fixed);
   d.parts.canopyInk={...part,src:subset(g,owner,true),pivot:part.pivot.clone(),mat:'ink'};
   d.parts.canopyOpponent={...part,src:subset(g,opponent,true),pivot:part.pivot.clone(),mat:'opponentInk',followPart:'canopy'};
   g.dispose();return d;
  }
 })
});
