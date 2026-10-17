import {Character} from './character.js';
import {HAT_KINDS,getHairStyle,headSurf} from './character-geo.js';
import {HATS,HAT_NAMES} from './character-style.js';
import {ARMOR_HAT_CLEARANCE,createArmorHelmetReplica} from './armor-helmet.js';
import {TWO_LINE_MESH_HAT,createTwoLineMesh} from './two-line-mesh.js';
import {CAMO_HEADPHONES_FIT,createCamoHeadphones} from './camo-headphones.js';
import {INK_BLACK_FLAP_CAP_FIT,createInkBlackFlapCap} from './character-headgear-ink-black-flap-cap.js';
export const GEARS=[{id:4,key:'armor',descriptor:ARMOR_HAT_CLEARANCE,create:createArmorHelmetReplica},{id:5,key:'two-line',descriptor:TWO_LINE_MESH_HAT,create:createTwoLineMesh},{id:6,key:'camo',descriptor:CAMO_HEADPHONES_FIT,create:createCamoHeadphones},{id:7,key:'shading',descriptor:INK_BLACK_FLAP_CAP_FIT,create:createInkBlackFlapCap}];
for(const g of GEARS){if(HAT_KINDS.length!==g.id||HATS.length!==g.id)throw Error('Unexpected native hat table');HAT_KINDS.push({...g.descriptor,qaSeparateAttachment:true});HATS.push(g.key);HAT_NAMES.push(g.key);}
export function createFittedCharacter(options={}){
 const {hat=4,lod='game',inkColor=0x20bc91,...rest}=options;const item=GEARS.find(g=>g.id===hat||g.key===hat);if(!item)throw Error('Unknown QA hat');
 const character=new Character({...rest,sourceMotion:false,style:{hair:0,skin:2,outfit:0,eyes:0,...rest.style,hat:item.id}});character.setLod(lod);
 let currentInk=inkColor;let gear;function replaceGear(nextLod){if(gear)disposeGear(gear);const fit=getHairStyle(character.style,nextLod).hatContext;if(!fit)throw Error('Native clearance missing');gear=item.create({lod:nextLod,inkColor:currentInk,headSurface:headSurf,clearance:fit.offIn,offIn:fit.offIn,ctx:fit,helpers:{headSurf}});character.bones.head.add(gear);return gear;}
 replaceGear(lod);const originalDispose=character.dispose.bind(character);let disposed=false;
 const handle={character,get gear(){return gear;},setLod(next){character.setLod(next);return replaceGear(next);},setInkColor(c){currentInk=c;(gear.setInkColor||gear.userData.setInkColor)?.call(gear,c);},dispose(){if(disposed)return;disposed=true;disposeGear(gear);originalDispose();}};
 return handle;
}
function disposeGear(gear){const fn=gear.userData.dispose||gear.dispose;if(fn)fn.call(gear);gear.removeFromParent();}
