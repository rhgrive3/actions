import {fixture} from '../../patches/splatoon3/tests/source-fixture.mjs';
const f=await fixture({productionComposition:true,fullRuntime:true,extraExports:"export {PlayerController} from './src/game/player.js';"});
const ws=Object.entries(f.WEAPONS).filter(([k,w])=>w?.behaviorKind||w?.kind==='catalog');
console.log('count',ws.length);for(const k of ['reticleRange','combatRange','inkFlightProfile','ballistics','firstChargeTime','referenceGravity']) {let v=ws.filter(([id,w])=>Object.hasOwn(w,k));console.log(k,v.length,v.slice(0,8).map(([id,w])=>[id,w.behaviorKind,w[k]]));}
