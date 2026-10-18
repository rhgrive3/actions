import {GOLDFISH_MASK_FIT,createGoldfishMask} from './goldfish-mask.js';
import {SAMURAI_HELMET_FIT,createSamuraiHelmet} from './samurai-helmet.js';
import {FACE_GOGGLES_FIT,createFaceGoggles} from './face-goggles.js';
import {THIEF_HOOK_FIT,createThiefHook} from './thief-hook.js';
import {ARMOR_HAT_CLEARANCE,createArmorHelmetReplica} from './armor-helmet.js';
import {TWO_LINE_MESH_HAT,createTwoLineMesh} from './two-line-mesh.js';
import {CAMO_HEADPHONES_FIT,createCamoHeadphones} from './camo-headphones.js';
import {INK_BLACK_FLAP_CAP_FIT,createInkBlackFlapCap} from './character-headgear-ink-black-flap-cap.js';
export const HEADGEAR = Object.freeze([
 {id:4,key:'armor-helmet-replica',fit:ARMOR_HAT_CLEARANCE,create:createArmorHelmetReplica},
 {id:5,key:'two-line-mesh',fit:TWO_LINE_MESH_HAT,create:createTwoLineMesh},
 {id:6,key:'camo-headphones-suiton',fit:CAMO_HEADPHONES_FIT,create:createCamoHeadphones},
 {id:7,key:'ink-black-flap-cap',fit:INK_BLACK_FLAP_CAP_FIT,create:createInkBlackFlapCap},
 {id:8,key:'goldfish-mask',fit:GOLDFISH_MASK_FIT,create:createGoldfishMask},
 {id:9,key:'samurai-helmet',fit:SAMURAI_HELMET_FIT,create:createSamuraiHelmet},
 {id:10,key:'face-goggles',fit:FACE_GOGGLES_FIT,create:createFaceGoggles},
 {id:11,key:'thief-hook',fit:THIEF_HOOK_FIT,create:createThiefHook},
]);
export const HEADGEAR_FITS=HEADGEAR.map(({fit})=>Object.freeze({...fit,separateAttachment:true}));
