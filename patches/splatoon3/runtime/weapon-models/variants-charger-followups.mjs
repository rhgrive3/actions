// Existing pinned charger finishes; fresh native builders retain all geometry and ink.
import { THREE } from './kit.mjs';
import { MODELS as CHARGERS } from './chargers.mjs';
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
  const base=CHARGERS[baseId];
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
variant('Charger_Keeper_01','s3-charger-keeper','Custom Goo Tuber',{'#d4301c':'#249cd1'});
variant('Charger_Light_01','s3-charger-light','Bamboozler 14 Mk II',{},(n,p,i,c)=>n==='body'&&close(c,i,color('#5fa83a'))&&within(p,i,0,.032,.255,.04,.018,.035)?'#3665ae':null);
variant('Charger_Pencil_01','s3-charger-pencil','Snipewriter 5B',{'#2452c9':'#8b3037'});
variant('Charger_Normal_02','charger','Splat Charger CAM-O',{'#3b2ca2':'#8c8b78','#e9b726':'#595e43','#2b62de':'#6f7040'});
variant('Charger_NormalScope_02','s3-charger-normalscope','Splatterscope CAM-O',{'#3b2ca2':'#8c8b78','#e9b726':'#595e43','#2b62de':'#6f7040'});
export const FOLLOWUP_MODELS=Object.freeze(Object.fromEntries(definitions));
