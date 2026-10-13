import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import {prepareNativeStageBuild} from '../../../scripts/lib/inkwave-native-stages.mjs';
export async function nativeFixture(options={}){
 const prepared=prepareNativeStageBuild(process.env.INKWAVE_NATIVE_STAGE_ASSETS||null);
 // Use the builder's real sealed catalog, including independent definitions.
 // The checked-in placeholder intentionally contains no enabled native stages.
 const adaptRuntime=(rel,source)=>rel==='patches/native-stages/runtime/build-config.mjs'
  ? `export const nativeStageBuild = ${JSON.stringify(prepared.config)};`
  : adaptBuildSource(rel,source);
 return fixture({fullRuntime:true,realProjectiles:true,includeCharacter:!!options.includeCharacter,adaptNative:adaptBuildSource,adaptRuntime,extraExports:`
 export {nativeStageBuild} from './patches/native-stages/runtime/build-config.mjs';
 export {nativeStageRuleStatus} from './patches/native-stages/runtime/rule-availability.mjs';
 export {NATIVE_MAPS,UNAVAILABLE_NATIVE_STAGES} from './patches/native-stages/runtime/registry.mjs';
 export { NativeLevel,NativePhysics } from './patches/native-stages/runtime/engine.mjs';
 export {Match} from './inkwave-public/src/game/match.js';
 export {installRankedBots} from './patches/splatoon3/runtime/ranked/bots.mjs';
 export {RankedEngine} from './patches/splatoon3/runtime/ranked/engine.mjs';
 export { BotBrain } from './inkwave-public/src/game/bots.js';
 export { nativePaintGoalIds } from './patches/native-stages/runtime/engine.mjs';
 export { NavGraph } from './inkwave-public/src/game/nav.js';
 export { nativeRankedStage } from './patches/native-stages/runtime/native-ranked.mjs';
 export { nativeClimbTransition,updateNativeClimb,nativeClimbTravelForm } from './patches/native-stages/runtime/engine.mjs';
 export {nativeWallApproachTransition,nativeApproachJumpTransition,updateNativeApproach} from './patches/native-stages/runtime/engine.mjs';
 export {nativeJumpAttachTransition,updateNativeJumpAttach} from './patches/native-stages/runtime/engine.mjs';
 export { nativeDropClearance,nativeDropTransition,nativeDropTravelForm } from './patches/native-stages/runtime/engine.mjs';
 export {nativeSurgeTransition,updateNativeSurge} from './patches/native-stages/runtime/engine.mjs';
 export {nativeOrdinaryJumpInput} from './patches/native-stages/runtime/native-jump-input.mjs';
 export { nativeSourceWaypointReached,nativeSourceTravelInput,nativeSourceFootSupported } from './patches/native-stages/runtime/native-bot-support.mjs';
 export {nativeSourceGroundedForm} from './patches/native-stages/runtime/native-bot-form.mjs';

 export { NativeInkMesh,partitionNativeInk } from './patches/native-stages/runtime/native-ink-chunks.mjs';
 export { nativeInkGeometry,nativeInkMaterial } from './patches/native-stages/runtime/native-render.mjs';
 `});
}
export function readStage(root,id){
 const names={vertices:Float32Array,indices:Uint32Array,triangles:Float32Array,normals:Float32Array,flags:Uint32Array,objectIds:Uint32Array,nodes:Float32Array,order:Uint32Array,triangleFace:Int32Array,mask:Uint8Array},files={triangles:'collision',objectIds:'objects',nodes:'bvh'},dir=path.join(root,id);
 const data={manifest:JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'))};
 for(const [name,Type] of Object.entries(names)){const b=fs.readFileSync(path.join(dir,(files[name]||name)+'.bin'));data[name]=new Type(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
 return data;
}
