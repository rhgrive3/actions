import fs from 'node:fs';
import path from 'node:path';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
export async function nativeFixture(options={}){
 // Core-only consumers work with the actual emitted engine bundle, where
 // source-only render helper modules are deliberately not separate files.
 const coreExports=options.coreOnly?`
 export {NativeLevel,NativePhysics,nativeRankedStage,nativePaintGoalIds} from './patches/native-stages/runtime/engine.mjs';
 export {BotBrain} from './inkwave-public/src/game/bots.js';
 export {NavGraph} from './inkwave-public/src/game/nav.js';
 `:null;
 return fixture({fullRuntime:true,realProjectiles:true,adaptNative:adaptBuildSource,adaptRuntime:adaptBuildSource,extraExports:coreExports||`
 export { NativeLevel,NativePhysics } from './patches/native-stages/runtime/engine.mjs';
 export { BotBrain } from './inkwave-public/src/game/bots.js';
 export { nativePaintGoalIds } from './patches/native-stages/runtime/engine.mjs';
 export { NavGraph } from './inkwave-public/src/game/nav.js';
 export { nativeRankedStage } from './patches/native-stages/runtime/native-ranked.mjs';
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
