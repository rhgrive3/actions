// Alternate weapon finishes, keyed by pinned 11.3.0 WeaponInfoMain source rows.
// The existing base builders own shape, rig, muzzle and gameplay contracts.
import { THREE, Pieces, M } from './kit.mjs';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MODELS as CHARGERS } from './chargers.mjs';
import { MODELS as SPLATLINGS } from './splatlings.mjs';
import { MODELS as DUALIES } from './dualies.mjs';
import { MODELS as BRELLAS } from './brellas.mjs';
import { MODELS as STRINGERS } from './stringers.mjs';
const BASE = { ...CHARGERS, ...SPLATLINGS, ...DUALIES, ...BRELLAS, ...STRINGERS };
const colors = new Map();
const color = value => { if (!colors.has(value)) colors.set(value,new THREE.Color(value)); return colors.get(value); };
const close = (a, i, c) => Math.abs(a.getX(i)-c.r)<1e-6 && Math.abs(a.getY(i)-c.g)<1e-6 && Math.abs(a.getZ(i)-c.b)<1e-6;
/** Fresh-definition-only finish. Never visits team ink, lamps, charge glow or materials.
 * Color arrays are copied so even an externally shared attribute cannot be modified. */
function finish(d, palette, detail) {
  const changes = Object.entries(palette).map(([from,to]) => [color(from),color(to)]);
  for (const [channel,g] of [['body',d.body], ...Object.entries(d.parts ?? {}).filter(([,p])=>p.mat==='body'&&!p.hidden).map(([n,p])=>[n,p.src])]) {
    if (!g?.attributes?.color) continue;
    const original=g.attributes.color, next=original.clone(), pos=g.attributes.position;
    for(let i=0;i<next.count;i++) {
      for(const [from,to] of changes) if(close(original,i,from)) { next.setXYZ(i,to.r,to.g,to.b); break; }
      const extra=detail?.(channel,pos,i,original);
      if(extra) { const c=color(extra); next.setXYZ(i,c.r,c.g,c.b); }
    }
    g.setAttribute('color',next);
  }
  return d;
}
const definitions = [];
function variant(sourceRow,baseId,name,palette,detail,referenceName=name) {
  const base=BASE[baseId];
  definitions.push([sourceRow,Object.freeze({...base,baseId,sourceRow,name,
    sourceUrl:`https://splatoonwiki.org/wiki/File:S3_${referenceName.replaceAll(' ','_').replaceAll('+','%2B')}_model_rotating.mp4`,
    build(d){return finish(base.build(d),palette,detail);}})]);
}
// Small markings are vertex-color approximations, not imported retail textures.
const within = (p,i,x,y,z,w,h,l) => Math.abs(p.getX(i)-x)<w && Math.abs(p.getY(i)-y)<h && Math.abs(p.getZ(i)-z)<l;
variant('Charger_Normal_01','charger','Z+F Splat Charger',{'#e9b726':'#e94046','#2b62de':'#78d8e9'});
variant('Charger_NormalScope_01','s3-charger-normalscope','Z+F Splatterscope',{'#e9b726':'#e94046','#2b62de':'#78d8e9'});
variant('Charger_Long_01','s3-charger-long','Custom E-liter 4K',{'#1d58d6':'#ad2939'});
variant('Charger_LongScope_01','s3-charger-longscope','Custom E-liter 4K Scope',{'#1d58d6':'#ad2939'});
variant('Charger_Quick_01','s3-charger-quick','New Squiffer',{'#5aa5da':'#42a873','#e9b51f':'#e6b92c','#2b49c8':'#d94135'});
variant('Charger_Keeper_01','s3-charger-keeper','Custom Goo Tuber',{'#d4301c':'#249cd1'});
variant('Charger_Light_01','s3-charger-light','Bamboozler 14 Mk II',{},(n,p,i,c)=>n==='body'&&close(c,i,color('#5fa83a'))&&within(p,i,0,.032,.255,.04,.018,.035)?'#3665ae':null);
variant('Spinner_Quick_01','s3-spinner-quick','Zink Mini Splatling',{'#493098':'#28516a','#e5bc21':'#dadbd9'});
variant('Spinner_Downpour_01','s3-spinner-downpour','Ballpoint Splatling Nouveau',{},(n,p,i,c)=>n==='body'&&p.getZ(i)<-.04&&close(c,i,color('#eceae4'))?'#a83b3c':null);
variant('Spinner_Serein_01','s3-spinner-serein','Nautilus 79',{'#aeb8bb':'#4d5358','#d0d5d4':'#baa352'});
variant('Maneuver_Gallon_01','s3-maneuver-gallon','Glooga Dualies Deco',{'#2346c0':'#e2c42d','#b8262c':'#e2c42d'});
variant('Maneuver_Dual_01','s3-maneuver-dual','Custom Dualie Squelchers',{},(n,p,i,c)=>n==='body'&&within(p,i,0,.09,-.02,.035,.028,.04)&&close(c,i,color('#c0281e'))?'#d8c22c':null);
variant('Maneuver_Short_01','s3-maneuver-short','Dapple Dualies Nouveau',{'#a01a5c':'#26438b'});
variant('Maneuver_Stepper_01','s3-maneuver-stepper','Light Tetra Dualies',{'#1b1c20':'#e5e5df','#6a2fb3':'#d3423c'});
variant('Shelter_Focus_01','s3-shelter-focus','Recycled Brella 24 Mk II',{'#d9532a':'#ad723b'},(n,p,i,c)=>n==='body'&&p.getZ(i)>.53&&close(c,i,color('#d9532a'))?'#885294':null);
variant('Stringer_Explosion_01','s3-stringer-explosion','Custom Wellstring V',{},(n,p,i,c)=>n==='body'&&p.getY(i)<.02&&Math.abs(p.getZ(i))<.04&&close(c,i,color('#1f5d46'))?'#25292c':null);
variant('Maneuver_Normal_01','dualies','Enperry Splat Dualies',{'#2f8a3a':'#d3ab33','#c02a8e':'#ecebe6'});
variant('Shelter_Wide_01','s3-shelter-wide','Tenta Sorella Brella',{'#d8262c':'#dcc536'});
variant('Stringer_Short_01','s3-stringer-short','REEF-LUX 450 Deco',{},(n,p,i,c)=>n==='body'&&p.getZ(i)>.09&&close(c,i,color('#a9adb4'))?'#24272a':null);
variant('Spinner_Hyper_01','s3-spinner-hyper','Custom Hydra Splatling',{'#e8c22a':'#8ccddc'});
// The Custom Hydra reference retains a reflective silver rear can.
// Classify only its fixed body-owned silver surface; retain labels/cage/barrels.
{
 const [row,definition]=definitions[definitions.length-1];
 definitions[definitions.length-1]=[row,Object.freeze({...definition,build(d){
  const model=definition.build(d),c=model.body.attributes.color,material=model.body.attributes.aMat.clone(),silver=color('#c7cacd');
  let count=0;for(let i=0;i<c.count;i++)if(close(c,i,silver)){material.setX(i,3);count++;}
  if(!count)throw Error('Custom Hydra silver can surface absent');
  model.body.setAttribute('aMat',material);return model;
 }})];
}
variant('Charger_Pencil_01','s3-charger-pencil','Snipewriter 5B',{'#2452c9':'#8b3037'});

// Transfer existing complete triangles into the native team-ink channel. No
// positions are moved, no faces are added, and unrelated channels are untouched.
function subset(g, indices) {
  const out=new THREE.BufferGeometry(), remap=new Map(), vertices=[], ix=[];
  for(const i of indices) { if(!remap.has(i)) {remap.set(i,vertices.length);vertices.push(i);} ix.push(remap.get(i)); }
  for(const [name,a] of Object.entries(g.attributes)) {
    const data=new a.array.constructor(vertices.length*a.itemSize);
    vertices.forEach((v,i)=>{for(let c=0;c<a.itemSize;c++)data[i*a.itemSize+c]=a.array[v*a.itemSize+c];});
    out.setAttribute(name,new THREE.BufferAttribute(data,a.itemSize,a.normalized));
  }
  out.setIndex(ix);return out;
}
function moveAmmoBoxToInk(d) {
  const g=d.body,c=g.attributes.color,grey=color('#d9d8d3'),body=[],ink=[];
  for(let i=0;i<g.index.count;i+=3) {
    const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];
    (tri.every(v=>close(c,v,grey))?ink:body).push(...tri);
  }
  if(!ink.length)throw new Error('Heavy Edit ammo-box source surface was not found');
  const transferred=subset(g,ink),fixed=subset(g,body),merged=mergeGeometries([d.ink,transferred],false);
  if(!merged)throw new Error('Heavy Edit ink partition attributes do not match');
  g.dispose();d.ink.dispose();transferred.dispose();d.body=fixed;d.ink=merged;
  return d;
}
{
  const base=BASE['s3-spinner-hypershort'];
  definitions.push(['Spinner_HyperShort_01',Object.freeze({...base,baseId:'s3-spinner-hypershort',sourceRow:'Spinner_HyperShort_01',name:'Heavy Edit Splatling Nouveau',
    sourceUrl:'https://splatoonwiki.org/wiki/Heavy_Edit_Splatling_Nouveau',inkPartition:'ammoBox',
    build(d){return moveAmmoBoxToInk(base.build(d));}})]);
}
{
  const base=BASE.dualies;
  definitions.push(['Maneuver_Normal_02',Object.freeze({...base,baseId:'dualies',sourceRow:'Maneuver_Normal_02',name:'Twinklez Splat Dualies',
    sourceUrl:'https://splatoonwiki.org/wiki/Twinklez_Splat_Dualies',inkPartition:'silverTank',
    build(d){
      d=finish(base.build(d),{'#1d1e22':'#dc4e99','#2f8a3a':'#e1e1df'});
      const g=d.ink,p=g.attributes.position,tank=[],tip=[];
      for(let i=0;i<g.index.count;i+=3){const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];(tri.every(v=>p.getY(v)<-.035)?tank:tip).push(...tri);}
      if(!tank.length||!tip.length)throw new Error('Twinklez tank/tip source surfaces were not found');
      const silver=subset(g,tank),remaining=subset(g,tip),c=silver.attributes.color,m=silver.attributes.aMat,tint=color('#bfc6cc');
      for(let i=0;i<c.count;i++){c.setXYZ(i,tint.r,tint.g,tint.b);m.setX(i,3);}
      const merged=mergeGeometries([d.body,silver],false);
      if(!merged)throw new Error('Twinklez fixed partition attributes do not match');
      d.body.dispose();g.dispose();silver.dispose();d.body=merged;d.ink=remaining;return d;
    }} )]);
}
// Broad fixed palettes verified against pinned 11.3.0 weapon icon pixels.
// Collection-specific accessory silhouettes and exact graphics remain documented gaps.
variant('Charger_Normal_02','charger','Splat Charger CAM-O',{'#3b2ca2':'#8c8b78','#e9b726':'#595e43','#2b62de':'#6f7040'});
variant('Charger_NormalScope_02','s3-charger-normalscope','Splatterscope CAM-O',{'#3b2ca2':'#8c8b78','#e9b726':'#595e43','#2b62de':'#6f7040'});
variant('Maneuver_Long_01','s3-maneuver-long','Custom Douser Dualies FF',{'#c4272b':'#d9b42e'});
variant('Maneuver_Short_02','s3-maneuver-short','Dapple Dualies NOC-T',{'#a01a5c':'#726342','#2f6fd0':'#e87935','#ecebe6':'#c6c6b8'});
variant('Maneuver_Dual_02','s3-maneuver-dual','Hoofz Dualie Squelchers',{'#c0281e':'#d5d7d0'},(n,p,i,c)=>n==='body'&&close(c,i,color('#c0281e'))?(p.getX(i)>0?'#7288a0':Math.sin(p.getZ(i)*145+p.getY(i)*70)>0?'#e6e6e0':'#24272a'):null);
variant('Spinner_Quick_02','s3-spinner-quick','Mini Splatling RTL-R',{'#493098':'#5b6846','#e5bc21':'#d6c18c','#255cd2':'#b56130'});
variant('Spinner_Hyper_02','s3-spinner-hyper','Torrentz Hydra Splatling',{'#e2702a':'#db4d40','#e8c22a':'#e6d9c6'},(n,p,i,c)=>close(c,i,color('#c7cacd'))?(n==='body'?'#3ba0b5':'#3d4345'):n==='body'&&close(c,i,color('#17181b'))&&p.getZ(i)<-.03?'#d8584a':null);
variant('Shelter_Wide_02','s3-shelter-wide','Tenta Brella CRE-M',{'#5c6440':'#c5c4b3','#2c302c':'#646c69','#d8262c':'#545c54'});
variant('Stringer_Normal_01','s3-stringer-normal','Inkline Tri-Stringer',{'#7a3b22':'#ba9b55','#2b2c31':'#535b3b'});
variant('Stringer_Normal_02','s3-stringer-normal','Bulbz Tri-Stringer',{'#7a3b22':'#b58085'});
{
  const base=BASE['s3-stringer-short'];
  definitions.push(['Stringer_Short_02',Object.freeze({...base,baseId:'s3-stringer-short',sourceRow:'Stringer_Short_02',name:'REEF-LUX 450 MIL-K',
    sourceUrl:'https://splatoonwiki.org/wiki/REEF-LUX_450_MIL-K',inkPartition:'redString',
    build(d){d=finish(base.build(d),{'#17181b':'#d5d5c9','#2a2b30':'#dadad0','#a9adb4':'#d3d2c8','#9a9ea6':'#b76d61'});
      for(const n of ['string','stringL']){const p=d.parts[n];p.mat='body';const c=p.src.attributes.color.clone(),red=color('#b76d61');for(let i=0;i<c.count;i++)c.setXYZ(i,red.r,red.g,red.b);p.src.setAttribute('color',c);}return d;}})]);
}
function splitSurface(g, matches) {
  const fixed=[],owned=[];
  for(let i=0;i<g.index.count;i+=3){const tri=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)];(matches(tri,g)?owned:fixed).push(...tri);}
  if(!fixed.length||!owned.length)throw new Error('Variant surface partition must retain both roles');
  return [subset(g,fixed),subset(g,owned)];
}
{
 const base=BASE['s3-shelter-compact'];
 definitions.push(['Shelter_Compact_01',Object.freeze({...base,baseId:'s3-shelter-compact',sourceRow:'Shelter_Compact_01',name:'Undercover Sorella Brella',
  sourceUrl:'https://splatoonwiki.org/wiki/Undercover_Sorella_Brella',inkPartition:'checkedCanopy',
  build(d){
   d=base.build(d);const white=color('#e6e6e0'),cloth=color('#2b2d33');
   const [body,shaft]=splitSurface(d.body,(tri,g)=>tri.every(i=>close(g.attributes.color,i,white)));
   const ink=mergeGeometries([d.ink,shaft],false);if(!ink)throw new Error('Undercover shaft attributes mismatch');
   d.body.dispose();d.ink.dispose();shaft.dispose();d.body=body;d.ink=ink;
   const old=d.parts.canopy,cs=old.src;
   const [canopy,stripes]=splitSurface(cs,(tri,g)=>{
    if(!tri.every(i=>close(g.attributes.color,i,cloth)))return false;
    const p=g.attributes.position,x=tri.reduce((s,i)=>s+p.getX(i)/.11,0)/3,y=tri.reduce((s,i)=>s+(p.getY(i)-.075)/.11,0)/3;
    // Existing tessellation limits these source-backed check lines to coarse bands.
    return Math.abs(x)<.025||Math.abs(y)<.025;
   });
   cs.dispose();old.src=canopy;d.parts.canopyInk={...old,src:stripes,pivot:old.pivot.clone(),mat:'ink'};
   return finish(d,{'#7a5230':'#b6a58c','#4a2f1a':'#84765f'},(n,p,i,c)=>n==='canopy'&&close(c,i,cloth)?(((Math.floor(p.getX(i)/.0066)+Math.floor((p.getY(i)-.075)/.0066))&1)?'#34363a':'#65676a'):null);
  }} )]);
}
{
 const base=BASE.splatling;
 definitions.push(['Spinner_Standard_01',Object.freeze({...base,baseId:'splatling',sourceRow:'Spinner_Standard_01',name:'Heavy Splatling Deco',
  sourceUrl:'https://splatoonwiki.org/wiki/Heavy_Splatling_Deco',addedDetail:'rhinestones',
  build(d){d=base.build(d);const stones=new Pieces();
   for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<4;col++){
    const g=new THREE.OctahedronGeometry(.003,0);g.translate(side*.0715,.099+row*.026,-.109+col*.0227);
    stones.add(g,(row+col)%2?'#efb5d9':'#f1efec',M.gloss);
   }
   const details=stones.build(),merged=mergeGeometries([d.body,details],false);if(!merged)throw new Error('Deco rhinestone attributes mismatch');
   d.body.dispose();details.dispose();d.body=merged;return d;
  }} )]);
}
export const VARIANT_MODELS = Object.freeze(Object.fromEntries(definitions));
