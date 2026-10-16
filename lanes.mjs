import assert from 'node:assert/strict';
import {captureVipr} from './vipr/capture-vipr.mjs';
import {validateViprFrames} from './vipr/capture-contract.mjs';
import {validateViprVisiblePairs} from './vipr/visible-pairs.mjs';
import {captureGcko} from './gcko/capture-gcko.mjs';
import {validateGckoFrames} from './gcko/capture-contract.mjs';
import {validateGckoVisiblePairs} from './gcko/visible-pairs.mjs';
import {captureGlitterz} from './glitterz/capture-glitterz.mjs';
import {validateGlitterzFrames} from './glitterz/capture-contract.mjs';
import {validateGlitterzVisiblePairs} from './glitterz/visible-pairs.mjs';
const lanes=Object.freeze({vipr:{row:'Shooter_TripleMiddle_02',capture:captureVipr,validateFrames:validateViprFrames,validateVisiblePairs:validateViprVisiblePairs},gcko:{row:'Shooter_Precision_02',capture:captureGcko,validateFrames:validateGckoFrames,validateVisiblePairs:validateGckoVisiblePairs},glitterz:{row:'Shooter_TripleQuick_02',capture:captureGlitterz,validateFrames:validateGlitterzFrames,validateVisiblePairs:validateGlitterzVisiblePairs}});
export function getLane(name){assert.ok(Object.hasOwn(lanes,name),'Known explicit lane required');return lanes[name];}
