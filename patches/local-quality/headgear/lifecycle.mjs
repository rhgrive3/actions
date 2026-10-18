// Owned rigid head-bone attachments; no shared body/hair geometry is modified or disposed.
import {G} from '../../../src/core/ctx.js';
import {headSurf} from '../../../src/game/character-geo.js';
import {HEADGEAR} from './catalog.mjs';
import {withHeadgearSignals} from '../../../src/game/character-mats.js';
const states=new WeakMap();
const tiers=['hero','game','far'];
// Face accessories deliberately bypass hat analysis: no crown, curl flattening, or hair variants.
const neutralFit=Object.freeze({offIn:()=>0,preserveHair:true});
function disposeGroup(group){const fn=group.userData.dispose||group.dispose;if(fn)fn.call(group);group.removeFromParent();}
export function disposeHeadgear(c){const s=states.get(c);if(!s)return;states.delete(c);for(const group of s.groups.values())disposeGroup(group);s.groups.clear();}
function state(c){
 const item=HEADGEAR.find(x=>x.id===c.style.hat);if(!item){disposeHeadgear(c);return null;}
 const signature=[c.style.hair,c.style.hat,c.style.brows,G.settings?.quality||'high'].join(':');
 let s=states.get(c);if(s?.signature!==signature){disposeHeadgear(c);s={signature,item,groups:new Map(),active:null};states.set(c,s);}return s;
}
// Native fit analysis precedes tessellation and is identical across LODs. Borrow it
// from Character's live owned hair entry, including during headgear-only warmup.
// Never call legacy getHairStyle: it permanently retains geometry in native _hair.
function ownedFit(c,lod){
 const held=c.hairKeys483||[];
 return (held.find(r=>r.lod===lod)?.entry||held[0]?.entry||c.hairAnatomy483?.entry)?.hatContext;
}
function obtain(c,s,lod){
 if(!tiers.includes(lod))throw Error('Invalid headgear LOD: '+lod);
 let group=s.groups.get(lod);if(!group){const fit=s.item.fit.preserveHair?neutralFit:ownedFit(c,lod);if(!fit)throw Error('Native headgear clearance missing');group=s.item.create({lod,inkColor:c.color,headSurface:headSurf,offIn:fit.offIn,clearance:fit.offIn,ctx:fit,helpers:{headSurf}});group.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])withHeadgearSignals(m,c.u);});group.name='headgear:'+s.item.key+':'+lod;group.visible=false;c.bones.head.add(group);s.groups.set(lod,group);}return group;
}
export function syncHeadgear(c,lod){if(!c.bones?.head)return;const s=state(c);if(!s)return;const next=obtain(c,s,lod);for(const group of s.groups.values())group.visible=group===next;s.active=lod;}
export function warmHeadgear(c){if(!c.bones?.head)return;const s=state(c);if(!s)return;for(const lod of tiers)obtain(c,s,lod);if(s.active)syncHeadgear(c,s.active);}
export function setHeadgearColor(c,color){const s=states.get(c);if(!s)return;for(const group of s.groups.values()){const fn=group.userData.setInkColor||group.setInkColor;if(fn)fn.call(group,color);}}
export function headgearState(c){const s=states.get(c);return s?{signature:s.signature,active:s.active,groups:[...s.groups.entries()].map(([lod,group])=>({lod,group}))}:null;}
