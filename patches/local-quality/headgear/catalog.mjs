import {ARMOR_HAT_CLEARANCE,createArmorHelmetReplica} from './armor-helmet.js';
import {TWO_LINE_MESH_HAT,createTwoLineMesh} from './two-line-mesh.js';
import {CAMO_HEADPHONES_FIT,createCamoHeadphones} from './camo-headphones.js';
import {INK_BLACK_FLAP_CAP_FIT,createInkBlackFlapCap} from './character-headgear-ink-black-flap-cap.js';
export const HEADGEAR = Object.freeze([
 {id:4,key:'armor-helmet-replica',fit:ARMOR_HAT_CLEARANCE,create:createArmorHelmetReplica},
 {id:5,key:'two-line-mesh',fit:TWO_LINE_MESH_HAT,create:createTwoLineMesh},
 {id:6,key:'camo-headphones-suiton',fit:CAMO_HEADPHONES_FIT,create:createCamoHeadphones},
 {id:7,key:'ink-black-flap-cap',fit:INK_BLACK_FLAP_CAP_FIT,create:createInkBlackFlapCap},
]);
export const HEADGEAR_FITS=HEADGEAR.map(({fit})=>Object.freeze({...fit,separateAttachment:true}));
