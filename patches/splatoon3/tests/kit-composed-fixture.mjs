// Keep the light Actor fixture but connect the canonical projectile owner used
// by the shipped installer. A native _step must never run an unconfigured API.
import {fixture as sourceFixture} from './source-fixture.mjs';
export async function fixture(){
 const f=await sourceFixture({adaptNative:adaptKitSource,extraExports:"export {installWeaponsFidelity} from './patches/splatoon3/runtime/weapons-fidelity.mjs';"});
 f.installSubSpecialFidelity(f,f.profile);f.installWeaponsFidelity(f,f.profile);
 f.G.physics.segment=(_a,_b,out)=>{out.hit=false;return out;};
 return f;
}

import {adaptSource} from '../adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource} from '../../local-quality/adapter.mjs';
import {adaptNetworkSource} from '../../network-replication/adapter.mjs';
import {adaptRange} from '../../practice-range/adapter.mjs';
export const adaptKitSource=(rel,code)=>adaptRange(rel,adaptNetworkSource(rel,adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))))));
