import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parse} from '../../patches/loading-cache/vendor/acorn.mjs';
import {installContextMediaTrace,correlateContextMediaRequests,classifyContextRequestFailures} from '../check-inkwave-context-recovery-browser.mjs';
import crypto from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { serveProjectileCaptureFile } from '../lib/inkwave-projectile-http-file.mjs';
import { observeStreamedMusic } from '../lib/inkwave-streamed-music-diagnostics.mjs';
import { installProjectileCaptureUiGate, withProjectileCaptureUi } from '../lib/inkwave-projectile-capture-ui.mjs';
import { installProjectileCaptureProjection } from '../lib/inkwave-projectile-capture-projection.mjs';
const assetURL='http://127.0.0.1:9999/_versions/rev/assets/audio/Jet_Arrow.mp3';
async function fixture({ fail=false, ownerGlobal='__G' }={}) {
 const events=new Map(), calls=[], receipt={};
 const media={currentSrc:assetURL,currentTime:1,duration:120,paused:false,ended:false,seeking:false,readyState:4,networkState:1,error:null,getAttribute:()=>assetURL};
 const player={id:'battle',disposed:false,failed:false,element:media};
 const window={__G:{music:{track:'battle',_desiredTrack:'battle',current:player,players:[player],ctx:{state:'running',currentTime:10}},match:{state:'playing'}}};
 const cdp={on:(name,fn)=>events.set(name,fn),send:async name=>calls.push(name)};
 const emit=(name,data)=>events.get(name)?.(data);
 const page={evaluate:async (fn,arg)=>vm.runInNewContext('('+fn.toString()+')(arg)', {window,arg})};
 const context={newCDPSession:async()=>{if(fail)throw Error('unsupported');return cdp;},close:async()=>{
  calls.push('close');emit('Network.loadingFailed',{requestId:'jet',timestamp:12,errorText:'net::ERR_ABORTED',canceled:true,type:'Media'});return 'closed';}};
 const observer=await observeStreamedMusic({context,page,assetURL,receipt,ownerGlobal});
 const request=(id,url=assetURL)=>emit('Network.requestWillBeSent',{requestId:id,timestamp:1,wallTime:2,type:'Media',request:{url,method:'GET',headers:{Range:'bytes=0-'}}});
 return {emit,calls,receipt,media,player,page,context,observer,request,window};
}
test('records only exact Jet request IDs and preserves HTTP/range evidence',async()=>{
 const f=await fixture();f.request('other',assetURL.replace('Jet_Arrow','other'));f.request('query',assetURL+'?x=1');f.request('jet');
 f.emit('Network.responseReceived',{requestId:'jet',timestamp:2,type:'Media',response:{url:assetURL,status:206,mimeType:'audio/mpeg',headers:{'Content-Range':'bytes 0-9/10'}}});
 f.emit('Network.loadingFinished',{requestId:'other',encodedDataLength:10});f.emit('Network.loadingFinished',{requestId:'jet',encodedDataLength:10});
 assert.deepEqual(f.calls,['Network.enable','Media.enable']);assert.deepEqual(f.receipt.network.map(x=>x.event),['request','response','finished']);assert.equal(f.receipt.network[0].range,'bytes=0-');assert.equal(f.receipt.network[1].status,206);
});
test('expected context-close cancel is distinguished but never automatically accepted',async()=>{
 const f=await fixture();f.request('jet');await f.observer.snapshot('playing');f.media.currentTime=5;
 assert.equal(await f.observer.close(),'closed');const row=f.receipt.network.at(-1);assert.equal(row.phase,'context-close');assert.equal(row.cancellationObserved,true);assert.equal(row.autoAccepted,false);
 assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);assert.equal(f.receipt.snapshots[1].state.current.element.currentTime,5);assert.equal(f.calls.at(-1),'close');
});
test('real transport failure and MediaError stay explicit during capture',async()=>{
 const f=await fixture();f.request('jet');f.emit('Network.loadingFailed',{requestId:'jet',errorText:'net::ERR_CONNECTION_RESET',canceled:false,type:'Media'});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});f.emit('Media.playerErrorsRaised',{playerId:'p',errors:[{errorType:'PipelineError',code:2}]});
 f.media.error={code:2,message:'network failure'};await f.observer.snapshot('failed');assert.equal(f.receipt.network.at(-1).phase,'capture');assert.equal(f.receipt.network.at(-1).cancellationObserved,false);assert.equal(f.receipt.media.at(-1).event,'playerErrorsRaised');assert.equal(f.receipt.snapshots[0].state.current.element.error.code,2);
});
test('observes only Jet players including bounded pre-URL history',async()=>{
 const f=await fixture();f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kPlay'})}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'other',properties:[{name:'kURL',value:'https://example.org/other.mp3'}]});assert.equal(f.receipt.media.length,0);
 f.emit('Media.playerEventsAdded',{playerId:'p',events:[{value:JSON.stringify({event:'kLoad',url:assetURL})}]});
 assert.equal(f.receipt.media.length,2);assert.ok(f.receipt.media.every(x=>x.data.playerId==='p'));
});
test('event volume, unknown player histories, and huge values are bounded',async()=>{
 const f=await fixture();for(let i=0;i<10000;i++)f.emit('Media.playerEventsAdded',{playerId:'unknown'+i,events:[{value:'x'.repeat(20000)}]});
 f.emit('Media.playerPropertiesChanged',{playerId:'p',properties:[{name:'kURL',value:assetURL}]});for(let i=0;i<1000;i++)f.emit('Media.playerMessagesLogged',{playerId:'p',messages:[{message:'x'.repeat(20000)}]});
 for(let i=0;i<1000;i++)f.request('jet'+i);assert.ok(f.receipt.media.length<=256);assert.ok(f.receipt.network.length<=128);assert.ok(f.receipt.dropped.media>0);assert.ok(f.receipt.dropped.network>0);assert.ok(JSON.stringify(f.receipt).length<600000);
});
test('unavailable CDP and closed-page snapshots remain diagnostic failures',async()=>{
 const f=await fixture({fail:true});assert.equal(f.receipt.enabled,false);assert.match(f.receipt.diagnostics[0].error,/unsupported/);f.page.evaluate=async()=>{throw Error('page closed');};await f.observer.close();assert.match(f.receipt.snapshots[0].error,/page closed/);assert.equal(f.calls.at(-1),'close');
});
test('observer does not call playback, seek, network mutation, or schedule timers',async()=>{
 const f=await fixture();Object.defineProperty(f.media,'currentTime',{get:()=>1,set:()=>assert.fail('seek')});f.media.play=()=>assert.fail('play');f.media.pause=()=>assert.fail('pause');f.media.load=()=>assert.fail('load');await f.observer.snapshot('observe');assert.deepEqual(f.calls,['Network.enable','Media.enable']);
});
// Reviewed protocol-2 capture-only additions: recover the exact 22a runner
// first, then retain the historical workload/error restoration below unchanged.
// Hunk bodies are fixed review inputs, never derived from the executing runner.
const PROTOCOL2_RUNNER_HUNKS=[["const report = {\n  schema: 1,\n  visualProtocol: 2,\n  mode,\n  site,\n","const report = {\n  schema: 1,\n  mode,\n  site,\n"],["async function renderAndCapture(page, scenario, phase, perspective, seed) {\n  const camera = await setCamera(page, perspective);\n  const runtime = await page.evaluate(scenario => {\n    const G = window.__G;\n    G.paint.flush(1 / 60);\n","async function renderAndCapture(page, scenario, phase, perspective, seed) {\n  const camera = await setCamera(page, perspective);\n  const runtime = await page.evaluate(() => {\n    const G = window.__G;\n    G.paint.flush(1 / 60);\n"],["      throw new Error(`WebGL reported errors around native render (pre=${staleGlErrors.join(',') || 'none'}; post=${glErrors.join(',') || 'none'})`);\n    }\n    let washtubResources = null;\n    if (scenario === 'floor-washtub') {\n      const P = G.projectiles, R = P._s3Shapes;\n      if (!R?.sparks?.isPoints || !R.sparkPos || !R.sparkSize) throw Error('Missing native Explosher sparkle owner');\n      const refs = [R, R.sparks, R.sparks.geometry, R.sparks.material, R.sparkPos, R.sparkSize, R.sparkPos.array, R.sparkSize.array];\n      const previous = window.__iwWashtubResourceRefs;\n      if (previous && refs.some((r, i) => r !== previous[i])) throw Error('Explosher resource owner/buffer replaced between captures');\n      window.__iwWashtubResourceRefs = refs;\n      const count = P.list.filter(p => p.delay <= 0 && p.catalog?.r?.sourceActor === 'WeaponSlosherWashtub').length;\n      const rngBefore = window.__iwScenarioRandomRecorder?.snapshot?.();\n      const countsBefore = JSON.stringify(P.s3ShapeCounts);\n      P._draw(); P._draw();\n      if (refs.some((r, i) => r !== [P._s3Shapes, R.sparks, R.sparks.geometry, R.sparks.material, R.sparkPos, R.sparkSize, R.sparkPos.array, R.sparkSize.array][i])) throw Error('Repeated native draw replaces Explosher buffers');\n      const rngAfter = window.__iwScenarioRandomRecorder?.snapshot?.();\n      if (!rngBefore || !rngAfter || ['seed','draws','state'].some(k => rngBefore[k] !== rngAfter[k])) throw Error('Repeated Explosher draw changes scenario RNG');\n      if (JSON.stringify(P.s3ShapeCounts) !== countsBefore) throw Error('Repeated Explosher draw changes native shape counts');\n      const sparkles = P.s3ShapeCounts?.sparkles;\n      const arrayLengths = [R.sparkPos.array.length, R.sparkSize.array.length];\n      const positionCount = R.sparks.geometry.getAttribute('position')?.count, sizeCount = R.sparks.geometry.getAttribute('aSize')?.count;\n      if (count > 1 || sparkles !== count * 28 || positionCount !== 160 || sizeCount !== 160 || arrayLengths[0] !== 480 || arrayLengths[1] !== 160) throw Error('Explosher fixed sparkle budget violated');\n      if (R.sparks.geometry.getAttribute('position') !== R.sparkPos || R.sparks.geometry.getAttribute('aSize') !== R.sparkSize || R.sparks.material.map != null) throw Error('Explosher attribute/texture ownership changed');\n      washtubResources = { protocol: 1, scope: 'one native catalog Explosher round; fixed existing sparkle resources, not whole-scene GPU cost',\n        liveRounds: count, sparkles, positionCount, sizeCount, arrayLengths, totalBufferBytes: R.sparkPos.array.byteLength + R.sparkSize.array.byteLength,\n        stableOwners: true, stableArrays: true, repeatedDraws: 2, rngUnchanged: true, shapeCountsUnchanged: true, textureOwners: 0 };\n    }\n    const read = G.projectiles.list.map(p => ({\n      type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(),\n      mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),\n      seed: p.seed, unit: p.fidelitySloshUnitIndex ?? p.fidelityRollerUnitIndex ?? null,\n      ...(p.wid === 's3-slosher-washtub' ? { weapon:p.wid, life:p.life, damage:p.damage, sourceActor:p.catalog?.r?.sourceActor, catalogUnit:p.catalog?.descriptor?.unit, shape:p.s3Shape } : {}),\n    }));\n    const visibleHeadProjectiles = G.projectiles.list.filter(p => p.delay <= 0 && !p._s3SloshBirthPending);\n","      throw new Error(`WebGL reported errors around native render (pre=${staleGlErrors.join(',') || 'none'}; post=${glErrors.join(',') || 'none'})`);\n    }\n    const read = G.projectiles.list.map(p => ({\n      type: p.type, age: p.age, delay: p.delay || 0, pos: p.pos.toArray(), vel: p.vel.toArray(),\n      mode: p.fidelityMode || (p.s3Vertical ? 'vertical' : p.s3FlickUnit === undefined ? null : 'horizontal'),\n      seed: p.seed, unit: p.fidelitySloshUnitIndex ?? p.fidelityRollerUnitIndex ?? null,\n    }));\n    const visibleHeadProjectiles = G.projectiles.list.filter(p => p.delay <= 0 && !p._s3SloshBirthPending);\n"],["    return {\n      projectiles: read,\n      washtubResources,\n      roster: window.__iwProjectileRosterSnapshot(),\n      projectileScreen,\n","    return {\n      projectiles: read,\n      roster: window.__iwProjectileRosterSnapshot(),\n      projectileScreen,\n"],["      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],\n    };\n  }, scenario);\n  if ((perspective === 'front' || perspective === 'side') && runtime.liveHeadCount > 0 &&\n      (runtime.visibleCenters <= 0 || !runtime.projectileCrop)) {\n","      drawingBuffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],\n    };\n  });\n  if ((perspective === 'front' || perspective === 'side') && runtime.liveHeadCount > 0 &&\n      (runtime.visibleCenters <= 0 || !runtime.projectileCrop)) {\n"],["        wallDropTransition: extra.wallDropTransition ?? null,\n        impactPaintContact: extra.impactPaintContact ?? null,\n        washtubContact: extra.washtubContact ?? null,\n      });\n    };\n","        wallDropTransition: extra.wallDropTransition ?? null,\n        impactPaintContact: extra.impactPaintContact ?? null,\n      });\n    };\n"],["      // returns. Treat that face-bearing receipt plus retirement as the\n      // production contact state; validate the face against live stage geometry.\n      let washtubContact = null;\n      if (retired && p.catalog?.r?.sourceActor === 'WeaponSlosherWashtub' && p.catalog.lobes?.length === 1) {\n        const chosen = p.catalog.lobes[0].hit;\n        const point = chosen?.point?.toArray?.(), normal = chosen?.normal?.toArray?.();\n        const stageFace = chosen?.hit ? stageFaceFor(chosen.face, point) : null;\n        const paint = stepContext.paintReceipts.find(r => r.face === chosen?.face && r.stageFace?.valid && r.matchingNativeRaycast && r.matchingNativeRaycast.face === chosen.face);\n        if (chosen?.hit && stageFace?.valid && normal?.[1] > .68 && point && p.pos.distanceTo(chosen.point) < 1e-7 && paint) {\n          washtubContact = { source: 'sole catalog lobe native swept hit equals retired explosion centre and native floor paint face',\n            valid: true, sourceActor: p.catalog.r.sourceActor, seed:p.seed, weapon:p.wid, catalogUnit:p.catalog.descriptor.unit, life:p.life, damage:p.damage, point, normal, face: chosen.face, block: stageFace.block,\n            retiredPosition: p.pos.toArray(), matchingNativeRaycast: paint.matchingNativeRaycast, paintReceipt: paint };\n          record('MainWeaponCatalog.P._step:washtub', p, { ...chosen, block: stageFace.block }, { retired: true, stageFace, paintReceipts: stepContext.paintReceipts, washtubContact });\n        }\n      }\n      const paintContact = p.catalog && retired ? stepContext.paintReceipts.find(receipt =>\n        receipt.stageFace?.valid && receipt.sourceHint === 'non-raycast-paint') : null;\n","      // returns. Treat that face-bearing receipt plus retirement as the\n      // production contact state; validate the face against live stage geometry.\n      const paintContact = p.catalog && retired ? stepContext.paintReceipts.find(receipt =>\n        receipt.stageFace?.valid && receipt.sourceHint === 'non-raycast-paint') : null;\n"],["  window.__iwResetProjectileRoster();\n  const weapon = impact === 'wall' ? 'shooter' :\n    name === 'floor-washtub' ? 's3-slosher-washtub' : name === 'shooter' ? 'shooter' : name.startsWith('roller') ? 'roller' : 'slosher';\nasync function resetCaptureCharacter(actor) {\n  const old = actor.character, parent = old.root.parent;\n","  window.__iwResetProjectileRoster();\n  const weapon = impact === 'wall' ? 'shooter' :\n    name === 'shooter' ? 'shooter' : name.startsWith('roller') ? 'roller' : 'slosher';\nasync function resetCaptureCharacter(actor) {\n  const old = actor.character, parent = old.root.parent;\n"],["    { name: 'wall-shooter', seed: 0x7a11, method: 'controller-shooter', impact: 'wall', maxFrames: 120 },\n    { name: 'floor-slosher9', seed: 0x7a12, method: 'slosher9', impact: 'floor', maxFrames: 150 },\n    { name: 'floor-washtub', seed: 0x7a13, method: 'controller-washtub', impact: 'floor', maxFrames: 150 },\n  ]) {\n    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });\n","    { name: 'wall-shooter', seed: 0x7a11, method: 'controller-shooter', impact: 'wall', maxFrames: 120 },\n    { name: 'floor-slosher9', seed: 0x7a12, method: 'slosher9', impact: 'floor', maxFrames: 150 },\n  ]) {\n    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });\n"],["      const fireRng = window.__iwResetScenarioRandom(seed);\n      const beforeNativeFire = fireRng.snapshot();\n      if (method === 'controller-washtub') {\n        if (a.weaponId !== 's3-slosher-washtub' || a.weapon?.catalogRecord?.sourceActor !== 'WeaponSlosherWashtub') throw Error('Wrong native Explosher catalog selection');\n        const actorBefore = a.pos.toArray(), prior = G.projectiles.list.length, dt = 1 / 60;\n        if (prior || a.s3?.squidSpawn) throw Error('Explosher controller setup is not neutral');\n        a.intent.fire = true;\n        for (let i = 0; i < 60 && !G.projectiles.list.some(p => p.owner === a && p.delay <= 0 && !p.catalog?.birthPending); i++) {\n          controllerFramesHeld = i + 1;\n          G.time += dt; window.__inkwave.time += dt; a.update(dt);\n          G.projectiles.update(dt); G.fx.update(dt, G.camera); window.__inkwave.fxHooks?.update?.(dt); G.paint.flush(dt);\n        }\n        a.intent.fire = false;\n        const rounds = G.projectiles.list.filter(p => p.owner === a);\n        if (rounds.length !== 1 || rounds[0].wid !== 's3-slosher-washtub' || rounds[0].catalog?.r?.sourceActor !== 'WeaponSlosherWashtub' || rounds[0].catalog?.birthPending || rounds[0].delay > 0) throw Error('Native controller did not release exactly one admitted catalog Explosher round');\n        controllerProbe = { source: 'normal Actor.update intent.fire path after native Actor.spawnAt reset', heldFrames: controllerFramesHeld,\n          actorBefore, actorAtBirth: a.pos.toArray(), weapon: a.weaponId, sourceActor: rounds[0].catalog.r.sourceActor,\n          unit: rounds[0].catalog.descriptor.unit, lifecycleAtBirth: a.s3?.squidSpawn ? { phase: a.s3.squidSpawn.phase ?? null } : null };\n        if (controllerProbe.lifecycleAtBirth || controllerProbe.unit !== 0) throw Error('Explosher birth lifecycle/unit mismatch');\n      } else if (method === 'controller-shooter') {\n        const prior = G.projectiles.list.length, dt = 1 / 60;\n        const V = G.camera.position.constructor;\n","      const fireRng = window.__iwResetScenarioRandom(seed);\n      const beforeNativeFire = fireRng.snapshot();\n      if (method === 'controller-shooter') {\n        const prior = G.projectiles.list.length, dt = 1 / 60;\n        const V = G.camera.position.constructor;\n"],["        route: p.catalog ? 'MainWeaponCatalog.P._step' : p.inkProfile ? 'InkFlightRuntime.stepHead' : 'legacy-projectile-step',\n        sourceActor: p.catalog?.r?.sourceActor ?? p.s3Weapon?.sourceActor ?? p.inkKey ?? null,\n        controllerInput: method.startsWith('controller-') ? 'Actor.update intent.fire=true' : null,\n        controllerFramesHeld, ...(method === 'controller-washtub' ? { weapon:p.wid, life:p.life, damage:p.damage, catalogUnit:p.catalog?.descriptor?.unit } : {}) }));\n      return { births, controllerProbe, rng: { afterVisualSetup: window.__iwCurrentVisualSetupRng ?? null,\n        betweenSetupAndFire, beforeNativeFire, afterNativeFire: fireRng.snapshot() } };\n","        route: p.catalog ? 'MainWeaponCatalog.P._step' : p.inkProfile ? 'InkFlightRuntime.stepHead' : 'legacy-projectile-step',\n        sourceActor: p.catalog?.r?.sourceActor ?? p.s3Weapon?.sourceActor ?? p.inkKey ?? null,\n        controllerInput: method === 'controller-shooter' ? 'Actor.update intent.fire=true' : null,\n        controllerFramesHeld }));\n      return { births, controllerProbe, rng: { afterVisualSetup: window.__iwCurrentVisualSetupRng ?? null,\n        betweenSetupAndFire, beforeNativeFire, afterNativeFire: fireRng.snapshot() } };\n"],["          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };\n      });\n      if (scenario.name === 'floor-washtub' && [5, 15].includes(frame)) {\n        if (!row.afterCount) throw Error('Explosher retired before required early/midflight view');\n        await renderAndCapture(page, scenario.name, 'F' + frame, 'side', scenario.seed);\n      }\n      captureFrame = frame;\n      flightHistory.push({ frame, heads: row.heads, retired: row.retired, attempts: row.attempts,\n","          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };\n      });\n      captureFrame = frame;\n      flightHistory.push({ frame, heads: row.heads, retired: row.retired, attempts: row.attempts,\n"],["          hit.block === setup.wall?.block && hit.face === setup.wall?.face &&\n          hit.normal.reduce((sum, value, i) => sum + value * setup.wall.normal[i], 0) > 0.9)\n        : scenario.name === 'floor-washtub' ? row.surfaceHits.find(hit => hit.route === 'MainWeaponCatalog.P._step:washtub' && hit.retired === true && hit.nativeStageContact === true && hit.washtubContact?.valid === true)\n        : row.surfaceHits.find(hit => hit.route === 'Projectiles._impact' && hit.retired === true && hit.nativeStageContact === true &&\n          hit.stageFace && hit.normal && hit.normal[1] > 0.68 && hit.impactPaintContact?.valid === true &&\n","          hit.block === setup.wall?.block && hit.face === setup.wall?.face &&\n          hit.normal.reduce((sum, value, i) => sum + value * setup.wall.normal[i], 0) > 0.9)\n        : row.surfaceHits.find(hit => hit.route === 'Projectiles._impact' && hit.retired === true && hit.nativeStageContact === true &&\n          hit.stageFace && hit.normal && hit.normal[1] > 0.68 && hit.impactPaintContact?.valid === true &&\n"],["      evidence: scenario.impact === 'wall'\n        ? 'The actor controller fired the legacy shooter; InkFlightRuntime.world returned the chosen valid live-stage Hit, and the same step entered the retained fidelityWallDrop phase at hit.point + hit.normal × 0.025.'\n        : scenario.name === 'floor-washtub' ? 'Actual catalog Explosher Actor input released one round; its sole native swept lobe hit equals its retired explosion centre on the live floor face, matching native floor-raycast blast paint.'\n        : 'Projectiles._impact received a validated native floor Hit; its scoped impact paint matched the source .14-normal offset and CPU PaintSystem recorded the same live face.' });\n  }\n","      evidence: scenario.impact === 'wall'\n        ? 'The actor controller fired the legacy shooter; InkFlightRuntime.world returned the chosen valid live-stage Hit, and the same step entered the retained fidelityWallDrop phase at hit.point + hit.normal × 0.025.'\n        : 'Projectiles._impact received a validated native floor Hit; its scoped impact paint matched the source .14-normal offset and CPU PaintSystem recorded the same live face.' });\n  }\n"]];
const PRE_PROTOCOL2_RUNNER_SHA256="15633a814076abc11c5fbe8a5a0d9cfa156943f3e0ff69c2c7b096c30945a827";
// Fixed review inputs from the accepted d3ee -> 8bcc phase observer addition.
// Reverse only those exact capture-only hunks before applying the unchanged
// protocol-2 and historical workload/error-gate seals. Never infer hunks from
// the runner being verified or normalize arbitrary observer code.
const PHASE_OBSERVER_RUNNER_HUNKS = [
  [
    "import { installProjectileCaptureRoster } from './lib/inkwave-projectile-ci-roster.mjs';\nimport { installProjectileCaptureUiGate, withProjectileCaptureUi } from './lib/inkwave-projectile-capture-ui.mjs';\nimport { installSlosherPhaseObserver } from './lib/inkwave-slosher-phase-observer.mjs';\n\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\n",
    "import { installProjectileCaptureRoster } from './lib/inkwave-projectile-ci-roster.mjs';\nimport { installProjectileCaptureUiGate, withProjectileCaptureUi } from './lib/inkwave-projectile-capture-ui.mjs';\n\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\n"
  ],
  [
    "  schema: 1,\n  visualProtocol: 2,\n  sourceIdentity,\n  phaseRuntimeInputSha256:manifest.files['patch/runtime/main-weapon-catalog.mjs'],\n  mode,\n  site,\n",
    "  schema: 1,\n  visualProtocol: 2,\n  mode,\n  site,\n"
  ],
  [
    "  provenance: {\n    harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),\n    slosherPhaseObserverSha256:hash(fs.readFileSync(new URL('./lib/inkwave-slosher-phase-observer.mjs',import.meta.url))),\n    captureUiGateSha256: hash(fs.readFileSync(new URL('./lib/inkwave-projectile-capture-ui.mjs', import.meta.url))),\n    capture: 'Normal INKWAVE bootstrap then real PLAY/TURF/Tidewater/START menu gestures into full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',\n",
    "  provenance: {\n    harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),\n    captureUiGateSha256: hash(fs.readFileSync(new URL('./lib/inkwave-projectile-capture-ui.mjs', import.meta.url))),\n    capture: 'Normal INKWAVE bootstrap then real PLAY/TURF/Tidewater/START menu gestures into full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',\n"
  ],
  [
    "  };\n  report.screenshots.push(receipt);\n  if(scenario==='floor-washtub')await page.evaluate(label=>window.__iwSlosherPhaseObserver?.snapshot(label),phase);\n  return receipt;\n}\n",
    "  };\n  report.screenshots.push(receipt);\n  return receipt;\n}\n"
  ],
  [
    "    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });\n    const { setup, lifecycleReset } = setupResult;\n    if(scenario.name==='floor-washtub')await page.evaluate(installSlosherPhaseObserver);\n    if (scenario.impact === 'wall' && !setup.wall) throw new Error('Could not find a native Tidewater wall for the wall impact receipt');\n    const birthResult = await page.evaluate(({ method, seed, expectedWall }) => {\n",
    "    const setupResult = await page.evaluate(visualSetup, { name: scenario.name, seed: scenario.seed, impact: scenario.impact });\n    const { setup, lifecycleReset } = setupResult;\n    if (scenario.impact === 'wall' && !setup.wall) throw new Error('Could not find a native Tidewater wall for the wall impact receipt');\n    const birthResult = await page.evaluate(({ method, seed, expectedWall }) => {\n"
  ],
  [
    "    const flightHistory = [];\n    for (let frame = 1; frame <= scenario.maxFrames; frame++) {\n      const row = await page.evaluate(frame => {\n        const G = window.__G, g = window.__inkwave, dt = 1 / 60;\n        window.__iwSlosherPhaseObserver?.frame(frame);\n        G.time += dt; g.time += dt;\n        const before = G.projectiles.list.map(p => ({ seed: p.seed, pos: p.pos.toArray() }));\n",
    "    const flightHistory = [];\n    for (let frame = 1; frame <= scenario.maxFrames; frame++) {\n      const row = await page.evaluate(() => {\n        const G = window.__G, g = window.__inkwave, dt = 1 / 60;\n        G.time += dt; g.time += dt;\n        const before = G.projectiles.list.map(p => ({ seed: p.seed, pos: p.pos.toArray() }));\n"
  ],
  [
    "          catalogSteps: window.__iwProjectileCatalogSteps.slice(catalogStepStart),\n          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };\n      },frame);\n      if (scenario.name === 'floor-washtub' && [5, 15].includes(frame)) {\n        if (!row.afterCount) throw Error('Explosher retired before required early/midflight view');\n",
    "          catalogSteps: window.__iwProjectileCatalogSteps.slice(catalogStepStart),\n          paintCoverage: G.paint.coverage?.() ?? null, fx: G.fx.stats?.() ?? null };\n      });\n      if (scenario.name === 'floor-washtub' && [5, 15].includes(frame)) {\n        if (!row.afterCount) throw Error('Explosher retired before required early/midflight view');\n"
  ],
  [
    "          hit.stageFace && hit.normal && hit.normal[1] > 0.68 && hit.impactPaintContact?.valid === true &&\n          hit.impactPaintContact.cpuFace === hit.face);\n      if (expectedContact) { impactFrame = frame; impactState = row; impactEvidence = expectedContact;\n        if(scenario.name==='floor-washtub')await page.evaluate(()=>window.__iwSlosherPhaseObserver.snapshot('impact')); }\n      if (impactFrame != null && frame >= impactFrame + 8) break;\n      // One controller-fired native projectile is used for the wall receipt.\n",
    "          hit.stageFace && hit.normal && hit.normal[1] > 0.68 && hit.impactPaintContact?.valid === true &&\n          hit.impactPaintContact.cpuFace === hit.face);\n      if (expectedContact) { impactFrame = frame; impactState = row; impactEvidence = expectedContact; }\n      if (impactFrame != null && frame >= impactFrame + 8) break;\n      // One controller-fired native projectile is used for the wall receipt.\n"
  ],
  [
    "      JSON.stringify({ wall: setup.wall, births: born, flightHistory }));\n    const capture = await renderAndCapture(page, scenario.name, `${scenario.impact}-contact-F${impactFrame}-capture-F${captureFrame}`, scenario.impact === 'wall' ? 'side' : 'shoulder', scenario.seed);\n    if(scenario.name==='floor-washtub')report.slosherPhase=await page.evaluate(()=>window.__iwSlosherPhaseObserver.finish());\n    report.visualScenarios.push({ name: scenario.name, seed: scenario.seed, setup, lifecycleReset, births: born, rng: birthResult.rng,\n      controllerProbe: birthResult.controllerProbe, impactFrame, captureFrame,\n",
    "      JSON.stringify({ wall: setup.wall, births: born, flightHistory }));\n    const capture = await renderAndCapture(page, scenario.name, `${scenario.impact}-contact-F${impactFrame}-capture-F${captureFrame}`, scenario.impact === 'wall' ? 'side' : 'shoulder', scenario.seed);\n    report.visualScenarios.push({ name: scenario.name, seed: scenario.seed, setup, lifecycleReset, births: born, rng: birthResult.rng,\n      controllerProbe: birthResult.controllerProbe, impactFrame, captureFrame,\n"
  ]
];
const PRE_PHASE_OBSERVER_RUNNER_SHA256 = "5718370b5a02e38cb591d10e72b70d7f6e2b31832ffc5a631e2c5472830f3377";
// Preserve the original nine-hunk phase history by reversing only the sealed
// primitive Character timeline epoch to the complete committed 331 runner.
const characterTimelineBytes=fs.readFileSync(new URL('../fixtures/inkwave-projectile-character-timeline-1915.json',import.meta.url));
assert.equal(crypto.createHash('sha256').update(characterTimelineBytes).digest('hex'),'9186af6ae24966b5d5d25abaf897fbd8c34deea1d0b63e78b517adc47790b462','sealed Character timeline inverse descriptor');
const characterTimelineEpoch=JSON.parse(characterTimelineBytes);
const characterTimelineHash=text=>crypto.createHash('sha256').update(text).digest('hex');
// The separately sealed retirement/partition QA epoch reverses to the complete
// official main runner; all older timeline/protocol pins below stay unchanged.
const mediaEpochBytes=fs.readFileSync(new URL('../fixtures/inkwave-projectile-media-retirement-epoch-e5f3-20261031.json',import.meta.url));
assert.equal(characterTimelineHash(mediaEpochBytes),'ef9f167482e2d1159773afb70220aab82ab76e8ce243274935ba0c5ca237ecf9','sealed media retirement inverse descriptor');
const mediaEpoch=JSON.parse(mediaEpochBytes);
assert.equal(mediaEpoch.schema,1);assert.equal(mediaEpoch.beforeSHA256,'31fa499c8650b8dbcd2260f088e586f0e7d41312aa3061d40fb755665d97a27f');
assert.equal(mediaEpoch.currentSHA256,'9c13cb324400af285b3b67d4852c39880f37822cf128a2630e4a0b2fdd644c7e');
function restoreReviewedMediaRetirementRunner(source){
 if(characterTimelineHash(source)===mediaEpoch.beforeSHA256)return source;
 assert.equal(characterTimelineHash(source),mediaEpoch.currentSHA256,'exact current projectile runner with primitive timeline and reviewed media retirement');
 assert.equal(mediaEpoch.hunks.length,8,'all reviewed retirement/strict-listener/partition regions');
 for(const {current,prior,label}of mediaEpoch.hunks){assert.equal(source.split(current).length,2,'exact singular retirement epoch region: '+label);source=source.replace(current,prior);}
 assert.equal(characterTimelineHash(source),'31fa499c8650b8dbcd2260f088e586f0e7d41312aa3061d40fb755665d97a27f','complete official pre-retirement runner');return source;
}

function revertCharacterTimelineHunks(source){
 assert.equal(characterTimelineEpoch.hunks.length,3,'all reviewed timeline regions');
 for(const {current,prior,label} of characterTimelineEpoch.hunks){
  assert.equal(source.split(current).length,2,'exact singular Character timeline region: '+label);
  source=source.replace(current,prior);
 }
 assert.equal(characterTimelineHash(source),'84fa9bf827fe699b0b9929c915678f6bc2063d45226a6e547117bbb1fa14e7c4','exact complete 331 projectile runner');
 return source;
}
function restoreCharacterTimelineRunner(source){
 source=restoreReviewedMediaRetirementRunner(source);
 assert.equal(characterTimelineHash(source),'31fa499c8650b8dbcd2260f088e586f0e7d41312aa3061d40fb755665d97a27f','exact current projectile runner with primitive timeline');
 return revertCharacterTimelineHunks(source);
}

function restoreReviewedPhaseObserverRunner(source){
 let restored=source;
 for(const [current,prior]of PHASE_OBSERVER_RUNNER_HUNKS){
  assert.equal(restored.split(current).length,2,'exact singular reviewed phase-observer runner hunk');
  restored=restored.replace(current,prior);
 }
 assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),PRE_PHASE_OBSERVER_RUNNER_SHA256,
  'Only exact reviewed phase observation may precede the unchanged runner');
 return restored;
}
function restoreProtocol2Runner(source){
 return restoreProtocol2BaseRunner(restoreReviewedPhaseObserverRunner(source));
}
function restoreProtocol2BaseRunner(source){
 let restored=source;
 for(const [current,prior]of PROTOCOL2_RUNNER_HUNKS){
  assert.equal(restored.split(current).length,2,'exact singular reviewed protocol-2 runner hunk');
  restored=restored.replace(current,prior);
 }
 assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),PRE_PROTOCOL2_RUNNER_SHA256,
  'Only approved protocol-2 additions may precede the exact 22a runner');
 return restored;
}
test('runner keeps historical workload and failure gates after reviewed capture updates',()=>{
 const runner=restoreCharacterTimelineRunner(fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8'));
 const gate="page.on('requestfailed', r => mimeErrors.push(`request failed ${r.url()}: ${r.failure()?.errorText || 'unknown'}`));";
 assert.ok(runner.includes("report.status = report.errors.length ? 'failed' : 'passed';"));
 let restored=restoreProtocol2Runner(runner);
 const revert=(current,prior)=>{assert.equal(restored.split(current).length,2);restored=restored.replace(current,prior);};
 // The verified local S3 cancellation gate is exercised below using the actual
 // listeners and manifest verifier. Restore only that reviewed hunk here so
 // the historical hash still protects every unrelated workload/error gate.
 const cancellationGate=runner.match(/page\.on\('requestfailed', r => \{[\s\S]*?\n  \}\);/);
 assert.ok(cancellationGate);revert(cancellationGate[0],gate);
 // The current-pair verifier adds only exact-build admission before the
 // historical workload. Its own strict source/site negative controls stay active.
 revert("import {verifyCurrentPairCaptureBuild} from './lib/inkwave-projectile-current-pair.mjs';\n", "");
 revert("const hash = b => crypto.createHash('sha256').update(b).digest('hex');\nconst exactBuildClosure=verifyCurrentPairCaptureBuild({site,mode,root:ROOT,\n  eventFile:process.env.GITHUB_EVENT_PATH,eventName:process.env.GITHUB_EVENT_NAME,\n  repository:process.env.GITHUB_REPOSITORY,baseline:process.env.INKWAVE_REFERENCE_ROOT,evidence,profile});\nfs.mkdirSync(evidence, { recursive: true });\nfs.mkdirSync(profile, { recursive: true });\nif(exactBuildClosure)fs.writeFileSync(path.join(evidence,'main3003-build-closure.json'),JSON.stringify(exactBuildClosure,null,2)+'\\n');\n", "fs.mkdirSync(evidence, { recursive: true });\nfs.mkdirSync(profile, { recursive: true });\n\nconst hash = b => crypto.createHash('sha256').update(b).digest('hex');\n");
 // Reviewed capture-only projection setup/checks are additive. Remove each
 // exact hunk once; retain the unchanged historical workload/failure-gate hash.
 revert("import { installProjectileCaptureProjection } from './lib/inkwave-projectile-capture-projection.mjs';\n", "");
 revert("  await page.addInitScript(installProjectileCaptureProjection);\n", "");
 revert("    window.__iwSetProjectileCaptureProjection();\n", "");
 revert("    window.__iwAssertProjectileCaptureProjection('before-render');\n", "");
 revert("    window.__iwAssertProjectileCaptureProjection('after-render');\n", "");
 revert("  await page.evaluate(() => window.__iwAssertProjectileCaptureProjection('before-screenshot'));\n", "");
 revert("  await page.evaluate(() => window.__iwAssertProjectileCaptureProjection('after-screenshot'));\n", "");
 revert("    await page.evaluate(() => window.__iwAssertProjectileCaptureProjection('before-crop'));\n", "");
 revert("    await page.evaluate(() => window.__iwAssertProjectileCaptureProjection('after-crop'));\n", "");
 // Reviewed phase-correct cinematic preparation: structural admission does
 // not grant capture permission; the native timers run under a cinematic-only hold.
 revert("import { nativeTurfIntroWithUiFunction } from './lib/inkwave-projectile-intro-ui.mjs';\n", "");
 revert("atomicIntroFunction(nativeTurfIntroWithUiFunction(completeNativeTurfIntro,deadline),", "atomicIntroFunction(completeNativeTurfIntro,");
 revert("withProjectileCaptureUi(admissionReady,{phase:'admission',allowIntro:true,settled:false,cinematicAdmission:true}),\n        {asyncIntro:true})", "withProjectileCaptureUi(admissionReady,{phase:'admission',allowIntro:true,settled:false}))");
 revert("      cinematicUi:window.__iwProjectileIntroUiReceipt,\n", "");
 revert("        cinematicUi:window.__iwProjectileIntroUiReceipt??null,\n", "");
 // Reviewed native UI admission/capture and bounded history additions only.
 revert("import { installProjectileCaptureRoster } from './lib/inkwave-projectile-ci-roster.mjs';\nimport { installProjectileCaptureUiGate, withProjectileCaptureUi } from './lib/inkwave-projectile-capture-ui.mjs';\n\n","import { installProjectileCaptureRoster } from './lib/inkwave-projectile-ci-roster.mjs';\n\n");
 revert("    harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),\n    captureUiGateSha256: hash(fs.readFileSync(new URL('./lib/inkwave-projectile-capture-ui.mjs', import.meta.url))),\n    capture: 'Normal INKWAVE bootstrap then real PLAY/TURF/Tidewater/START menu gestures into full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',\n","    harnessSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),\n    capture: 'Normal INKWAVE bootstrap then real PLAY/TURF/Tidewater/START menu gestures into full match; production Projectiles fire methods; live stage Physics, Paint and FX update; native Three/WebGL renderer screenshots.',\n");
 revert("  await page.addInitScript(installAudioTimingObserver);\n  await page.addInitScript(installProjectileCaptureUiGate);\n  await page.addInitScript(({ setting, bootSeed }) => {\n","  await page.addInitScript(installAudioTimingObserver);\n  await page.addInitScript(({ setting, bootSeed }) => {\n");
 revert("    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,\n        withProjectileCaptureUi(playingReady,{phase:'playing',settled:false}),\n        withProjectileCaptureUi(admissionReady,{phase:'admission',allowIntro:true,settled:false})),\n      deadline,{receipt:phaseReceipt.atomicIntro={}});\n    phaseMark('admission','end');\n","    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,playingReady,admissionReady),deadline,{receipt:phaseReceipt.atomicIntro={}});\n    phaseMark('admission','end');\n");
 revert("    (report.provenance.atomicPlayingReceipts ||= []).push({mobile,...atomicReceipt.readiness,playingReady:atomicReceipt.playingReady});\n    // Let native timers/animations remove startup banners. This remains inside\n    // the original admission deadline; no forced HUD reveal or overlay removal.\n    phaseMark('ui','begin');\n    await requireNativePhase(() => window.__iwProjectileCaptureUiGate({phase:'settled'}).ready === true, 'native UI completion');\n    phaseMark('ui','end');\n    (report.provenance.nativeUiReceipts ||= []).push({mobile,...await page.evaluate(() => ({\n      admission:window.__iwProjectileCaptureUiAdmission, playing:window.__iwProjectileCaptureUiPlaying,\n      settled:window.__iwProjectileCaptureUiReceipt,\n    }))});\n  } catch (error) {\n","    (report.provenance.atomicPlayingReceipts ||= []).push({mobile,...atomicReceipt.readiness,playingReady:atomicReceipt.playingReady});\n  } catch (error) {\n");
 revert("      return { observedAtMs:Date.now(),atomicIntro:window.__iwProjectileAtomicIntroReceipt??null,\n        captureUi:window.__iwProjectileCaptureUiReceipt??null,\n        captureUiHistory:window.__iwProjectileCaptureUiHistory??null,\n        mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n","      return { observedAtMs:Date.now(),atomicIntro:window.__iwProjectileAtomicIntroReceipt??null,\n        mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n");
 revert("  }\n  const placement = await page.evaluate(() => {\n","  }\n  await page.waitForFunction(() => !document.querySelector('.iw-lineup') && !!window.__inkwave?.hud?._visible, null, { timeout: 30000 }).catch(() => {});\n  const placement = await page.evaluate(() => {\n");
 revert("    const g = window.__inkwave, G = window.__G;\n    window.__iwProjectileCaptureUiGate({phase:'before-freeze',requireReady:true});\n    g.debug.freeze(); g.debug.freezeBots();\n","    const g = window.__inkwave, G = window.__G;\n    g.debug.freeze(); g.debug.freezeBots();\n");
 revert("  const target = path.join(evidence, name);\n  runtime.captureUi = await page.evaluate(() => window.__iwProjectileCaptureUiGate({phase:'before-screenshot',requireReady:true}));\n  await page.screenshot({ path: target, animations: 'disabled', timeout: 90000 });\n","  const target = path.join(evidence, name);\n  await page.screenshot({ path: target, animations: 'disabled', timeout: 90000 });\n");
 revert("    const cropTarget = path.join(evidence, cropFile);\n    runtime.cropCaptureUi = await page.evaluate(() => window.__iwProjectileCaptureUiGate({phase:'before-crop',requireReady:true}));\n    await page.screenshot({ path: cropTarget, clip: runtime.projectileCrop, animations: 'disabled', timeout: 90000 });\n","    const cropTarget = path.join(evidence, cropFile);\n    await page.screenshot({ path: cropTarget, clip: runtime.projectileCrop, animations: 'disabled', timeout: 90000 });\n");
 // Reviewed capture updates since adc983c3: checkout identity, HTTP file serving,
 // atomic admission/intro and bounded failure diagnostics. Restore only these
 // explicit hunks before the unchanged historical workload/failure-gate hash.
 revert("// fixtures used by the numeric weapon tests.\nimport fs from 'node:fs';\nimport { captureSourceIdentity } from './lib/inkwave-capture-source-identity.mjs';\nimport { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\nimport {installAudioTimingObserver} from './lib/inkwave-audio-timing-observer.mjs';","// fixtures used by the numeric weapon tests.\nimport fs from 'node:fs';\nimport { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\nimport {installAudioTimingObserver} from './lib/inkwave-audio-timing-observer.mjs';");
 revert("\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\nconst sourceIdentity = captureSourceIdentity({ cwd: ROOT });\nconst option = (name, fallback) => {\n  const i = process.argv.indexOf(name);","\nconst ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');\nconst option = (name, fallback) => {\n  const i = process.argv.indexOf(name);");
 revert("  if (!fs.existsSync(built) || hash(fs.readFileSync(built)) !== expected) throw new Error('Built artifact checksum mismatch: ' + file);\n}\nconst { serveProjectileCaptureFile } = await import('./lib/inkwave-projectile-http-file.mjs');\nconst mime = {\n  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',","  if (!fs.existsSync(built) || hash(fs.readFileSync(built)) !== expected) throw new Error('Built artifact checksum mismatch: ' + file);\n}\nconst mime = {\n  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',");
 revert("    if (file !== site && !file.startsWith(site + path.sep)) throw new Error('Path outside build');\n    if (!fs.statSync(file).isFile()) throw new Error('Not a file');\n    serveProjectileCaptureFile(req, res, file, mime);\n  } catch {\n    res.writeHead(404); res.end('Not found');","    if (file !== site && !file.startsWith(site + path.sep)) throw new Error('Path outside build');\n    if (!fs.statSync(file).isFile()) throw new Error('Not a file');\n    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });\n    fs.createReadStream(file).pipe(res);\n  } catch {\n    res.writeHead(404); res.end('Not found');");
 revert("  try {\n  const audioNetwork = [], audioSnapshots = [];\n  const audioReceipt = { ...sourceIdentity,\n    build: audioBuildManifestReceipt(site), network: audioNetwork, snapshots: audioSnapshots };\n  report.audioReadiness ||= [];","  try {\n  const audioNetwork = [], audioSnapshots = [];\n  const audioReceipt = { checkoutSha: process.env.GITHUB_SHA || null,\n    build: audioBuildManifestReceipt(site), network: audioNetwork, snapshots: audioSnapshots };\n  report.audioReadiness ||= [];");
 revert("        G.projectiles && G.renderer);\n    };\n    const playingReady = () => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;","        G.projectiles && G.renderer);\n    };\n    // SwiftShader may finish the transition between timer ticks. Probe once\n    // synchronously first, then retain the identical strict timed gate.\n    phaseMark('admission','begin');\n    await requireNativePhase(admissionReady, 'native Turf actor/controller admission');\n    phaseMark('admission','end');\n    const playingReady = () => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;");
 revert("        !m.attract && m.local?.isLocal && m.controller && G.projectiles && G.renderer);\n    };\n    // Admission and intro share one browser task: no redundant queued hop\n    // after admission succeeds. Incomplete admission polls without frame steps.\n    phaseMark('admission','begin');\n    phaseMark('intro','begin');\n    phaseMark('playing','begin');\n    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,playingReady,admissionReady),deadline,{receipt:phaseReceipt.atomicIntro={}});\n    phaseMark('admission','end');\n    phaseMark('intro','end');\n    phaseMark('playing','end');","        !m.attract && m.local?.isLocal && m.controller && G.projectiles && G.renderer);\n    };\n    phaseMark('intro','begin');\n    phaseMark('playing','begin');\n    const atomicReceipt = await requireAtomicIntro(page,\n      atomicIntroFunction(completeNativeTurfIntro,playingReady),deadline);\n    phaseMark('intro','end');\n    phaseMark('playing','end');");
 revert("  } catch (error) {\n    const failedAt=Date.now();phaseReceipt.events.push({phase:'failure',event:'caught',atMs:failedAt,elapsedMs:failedAt-phaseReceipt.startedAtMs,remainingMs:Math.max(0,phaseReceipt.deadlineAtMs-failedAt)});\n    phaseReceipt.failureSnapshotRequestedAtMs=Date.now();\n    try {\n    const observed = await page.evaluate(() => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;\n      return { observedAtMs:Date.now(),atomicIntro:window.__iwProjectileAtomicIntroReceipt??null,\n        mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n        matchIdentity: m === G?.match, local: m?.local?.isLocal, controller: !!m?.controller, debug: !!g?.debug,\n        projectiles: !!G?.projectiles,","  } catch (error) {\n    const failedAt=Date.now();phaseReceipt.events.push({phase:'failure',event:'caught',atMs:failedAt,elapsedMs:failedAt-phaseReceipt.startedAtMs,remainingMs:Math.max(0,phaseReceipt.deadlineAtMs-failedAt)});\n    const observed = await page.evaluate(() => {\n      const g = window.__inkwave, G = window.__G, m = g?.match;\n      return { mode: G?.mode, state: m?.state, stateT: m?.stateT, attract: m?.attract,\n        matchIdentity: m === G?.match, local: m?.local?.isLocal, controller: !!m?.controller, debug: !!g?.debug,\n        projectiles: !!G?.projectiles,");
 revert("        bootError: document.querySelector('#boot-error')?.textContent };\n    }).catch(error => ({ snapshotFailure: error.message }));\n    phaseReceipt.failureSnapshotReturnedAtMs=Date.now();\n    await snapshotAudio('native-startup-timeout');\n    report.browserDiagnostics.push({ event: 'native-startup-timeout', mobile, observed });\n    } catch (diagnosticError) {\n      report.browserDiagnostics.push({event:'native-startup-diagnostics-failed',mobile,error:String(diagnosticError?.message||diagnosticError).slice(0,500)});\n    }\n    throw error;\n  }","        bootError: document.querySelector('#boot-error')?.textContent };\n    }).catch(error => ({ snapshotFailure: error.message }));\n    await snapshotAudio('native-startup-timeout');\n    report.browserDiagnostics.push({ event: 'native-startup-timeout', mobile, observed });\n    throw error;\n  }");
  revert('  const serverClosed = new Promise(resolve => server.close(resolve));', '  await new Promise(resolve => server.close(resolve));');
  revert('  await serverClosed;\n', '');
  revert(`    let visualFailed = false;
    try { await runVisuals(visual.page); }
    catch (error) { visualFailed = true; throw error; }
    finally {
      try { await visual.close(); }
      catch (cleanupError) {
        if (!visualFailed) throw cleanupError;
        report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'visual',
          error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
      }
    }`, '    try { await runVisuals(visual.page); } finally { await visual.close(); }');
  revert(`  try { await browser.close(); }
  catch (cleanupError) {
    report.browserDiagnostics.push({ event: 'browser-cleanup-failed',
      error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    if (report.status !== 'failed') {
      report.status = 'failed';
      report.error = String(cleanupError?.stack || cleanupError).slice(0, 4000);
    }
  }`, '  await browser.close();');
  // Remove the exception-safe cleanup hunks first; the original exact-byte
  // assertion below still protects every workload and failure-gate statement.
  revert('  try {\n  const audioNetwork = [], audioSnapshots = [];', '  const audioNetwork = [], audioSnapshots = [];');
  revert(`  return { context, page, close: streamedMusic.close };
  } catch (error) {
    try { await streamedMusic.close(); }
    catch (cleanupError) {
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'open', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
    throw error;
  }
}`, '  return { context, page, close: streamedMusic.close };\n}');
  revert('  let performanceFailed = false;\n  try {\n', '');
  revert(`  return record;
  } catch (error) {
    performanceFailed = true;
    throw error;
  } finally {
    try { await close(); }
    catch (cleanupError) {
      if (!performanceFailed) throw cleanupError;
      report.browserDiagnostics.push({ event: 'streamed-music-cleanup-failed', route: 'performance', mobile,
        error: String(cleanupError?.message || cleanupError).slice(0, 1000) });
    }
  }
}`, '  await close();\n  return record;\n}');
 revert("import { observeStreamedMusic } from './lib/inkwave-streamed-music-diagnostics.mjs';\n",'');
 revert(`  const streamedMusicReceipt = { mobile };
  (report.streamedMusicDiagnostics ||= []).push(streamedMusicReceipt);
  const streamedMusic = await observeStreamedMusic({ context, page,
    assetURL: new URL(\`_versions/\${manifest.build.revision}/assets/audio/Jet_Arrow.mp3\`, address).href,
    receipt: streamedMusicReceipt });\n`,'');
 revert("  await streamedMusic.snapshot('native-playing-capture-ready');\n  return { context, page, close: streamedMusic.close };",'  return { context, page };');
 revert('  const { context, page, close } = await openGameContext({ mobile });','  const { context, page } = await openGameContext({ mobile });');
 revert('  await close();\n  return record;','  await context.close();\n  return record;');
 revert('finally { await visual.close(); }','finally { await visual.context.close(); }');
 assert.equal(crypto.createHash('sha256').update(restored).digest('hex'),'1fc5fa3f71f92e5b267b3db306ae0112900f255231791780a01ecd4fd941f9d3','Removing observation-only hunks restores the exact 67db runner, including workload and error gate');
 assert.equal(runner.match(/await close\(\);/g).length,1);assert.equal(runner.match(/await visual.close\(\);/g).length,1);
});


test('protocol-2 reversal rejects missing, duplicate, unknown and failure-gate runner changes',()=>{
 const runner=restoreReviewedPhaseObserverRunner(restoreCharacterTimelineRunner(fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8')));
 assert.equal(PROTOCOL2_RUNNER_HUNKS.length,14);
 assert.equal(crypto.createHash('sha256').update(restoreProtocol2BaseRunner(runner)).digest('hex'),PRE_PROTOCOL2_RUNNER_SHA256);
 for(const [current,prior]of PROTOCOL2_RUNNER_HUNKS){
  assert.throws(()=>restoreProtocol2BaseRunner(runner.replace(current,prior)),'missing reviewed hunk');
  assert.throws(()=>restoreProtocol2BaseRunner(runner+'\n'+current),'duplicate reviewed hunk');
 }
 const mutations=[
  ['visualProtocol: 2','visualProtocol: 3'],
  ["report.status = report.errors.length ? 'failed' : 'passed';","report.status = 'passed';"],
  ["throw new Error('Built artifact checksum mismatch: ' + file)","void ('ignored checksum ' + file)"],
  ["throw error;","return null;"],
  ["if (!performanceFailed) throw cleanupError;","if (false) throw cleanupError;"],
  ['sparkles !== count * 28','sparkles !== count * 29'],
 ];
 for(const [current,changed]of mutations){assert(runner.includes(current));assert.throws(()=>restoreProtocol2BaseRunner(runner.replace(current,changed)),current);}
 assert.throws(()=>restoreProtocol2BaseRunner('// unreviewed runner addition\n'+runner),'unknown addition');
 assert.throws(()=>restoreProtocol2BaseRunner(restoreProtocol2BaseRunner(runner)),'old runner is not current protocol-2 input');
});

test('phase-observer reversal rejects missing, duplicate, relocated or changed capture-only additions',()=>{
 const runner=restoreCharacterTimelineRunner(fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8'));
 assert.equal(PHASE_OBSERVER_RUNNER_HUNKS.length, 9);
 assert.equal(crypto.createHash('sha256').update(restoreReviewedPhaseObserverRunner(runner)).digest('hex'),PRE_PHASE_OBSERVER_RUNNER_SHA256);
 for(const [current,prior]of PHASE_OBSERVER_RUNNER_HUNKS){
  assert.throws(()=>restoreReviewedPhaseObserverRunner(runner.replace(current,prior)),'missing reviewed phase observation');
  assert.throws(()=>restoreReviewedPhaseObserverRunner(runner.replace(current,current+current)),'duplicate reviewed phase observation');
  assert.throws(()=>restoreReviewedPhaseObserverRunner(runner.replace(current,prior)+'\n'+current),'relocated reviewed phase observation');
 }
 for(const [current,changed]of [
  ["scenario.name==='floor-washtub'","scenario.name==='shooter'"],
  ['window.__iwSlosherPhaseObserver?.frame(frame)','window.__iwSlosherPhaseObserver?.frame(0)'],
  ["window.__iwSlosherPhaseObserver.snapshot('impact')","window.__iwSlosherPhaseObserver.snapshot('end')"],
  ["report.status = report.errors.length ? 'failed' : 'passed';","report.status = 'passed';"],
 ]){
  assert(runner.includes(current));
  assert.throws(()=>restoreReviewedPhaseObserverRunner(runner.replace(current,changed)),current);
 }
 assert.throws(()=>restoreReviewedPhaseObserverRunner('// unreviewed addition\n'+runner));
 assert.throws(()=>restoreReviewedPhaseObserverRunner(restoreReviewedPhaseObserverRunner(runner)),'old runner cannot impersonate current observation input');
});

test('primitive Character timeline inverse preserves the exact prior runner and rejects altered regions',()=>{
 const current=restoreReviewedMediaRetirementRunner(fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8'));
 const prior=restoreCharacterTimelineRunner(current);
 assert.equal(characterTimelineHash(prior),'84fa9bf827fe699b0b9929c915678f6bc2063d45226a6e547117bbb1fa14e7c4');
 for(const {current:region,prior:before} of characterTimelineEpoch.hunks){
  assert.throws(()=>revertCharacterTimelineHunks(current.replace(region,before)),'missing reviewed timeline region');
  assert.throws(()=>revertCharacterTimelineHunks(current+region),'duplicate reviewed timeline region');
  assert.throws(()=>restoreCharacterTimelineRunner(current.replace(region,before)),'historical region cannot impersonate current');
 }
 const changed=current.replace("traceCapturePhase('source-loader', 'await');","traceCapturePhase('source-loader', 'changed');");
 assert.notEqual(changed,current);assert.throws(()=>restoreCharacterTimelineRunner(changed),'altered phase rejected');
 assert.throws(()=>restoreCharacterTimelineRunner(current+'\n// unreviewed addition'));
 assert.throws(()=>restoreCharacterTimelineRunner(prior),'prior epoch cannot impersonate current');
});

test('snapshot cap is explicit and close failures keep their original rejection',async()=>{
 const f=await fixture();for(let i=0;i<20;i++)await f.observer.snapshot('bounded');assert.equal(f.receipt.snapshots.length,8);assert.equal(f.receipt.dropped.snapshots,12);
 f.context.close=async()=>{throw Error('close failed');};await assert.rejects(f.observer.close(),/close failed/);assert.ok(f.receipt.closeStartedAt);assert.ok(f.receipt.closeFinishedAt);
});

test('all supported harnesses explicitly resolve their actual game global and report missing bindings',async()=>{
 for(const ownerGlobal of ['__G','s3ProbeG','RG']) {
  const f=await fixture({ownerGlobal});if(ownerGlobal!=='__G'){f.window[ownerGlobal]=f.window.__G;delete f.window.__G;}
  await f.observer.snapshot('bound');assert.equal(f.receipt.snapshots[0].state.ownerGlobal,ownerGlobal);assert.equal(f.receipt.snapshots[0].state.ownerPresent,true);assert.equal(f.receipt.snapshots[0].state.musicPresent,true);assert.equal(f.receipt.snapshots[0].state.current.element.currentTime,1);
  delete f.window[ownerGlobal];await f.observer.snapshot('unbound');assert.equal(f.receipt.snapshots[1].state.ownerPresent,false);assert.equal(f.receipt.snapshots[1].state.musicPresent,false);
 }
 for(const ownerGlobal of ['', 'G', '__proto__', 'constructor']) await assert.rejects(fixture({ownerGlobal}),/Explicit supported game owner required/);
});

// Execute the verbatim runner functions with bounded Playwright API doubles.
// These test cleanup ownership, not browser playback or native game behavior.
const runnerSource=fs.readFileSync(process.env.INKWAVE_MEDIA_RUNNER_TEST_SOURCE || new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8');
const functionText=(from,to)=>{
 const start=runnerSource.indexOf(from), end=runnerSource.indexOf(to,start+from.length);
 assert.ok(start>=0&&end>start,'runner function boundaries exist');return runnerSource.slice(start,end).trim().replaceAll('import.meta.url',JSON.stringify(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url).href));
};
const openText=functionText('async function openGameContext(', 'async function setCamera(');
const performanceText=functionText('async function runFiringPerformance(', '\ntry {\n  if (capture');
const summaryText=functionText('function summary(', 'async function runFiringPerformance(');
const mediaErrorHeader=runnerSource.includes('const mediaRetirementErrorIndices=')?functionText('const mediaRetirementErrorIndices=',"browser.on('disconnected'"):'';
const emptyMediaSnapshot={records:[],dropped:0,hooks:JSON.parse(fs.readFileSync(new URL('./fixtures/context-media-retirement-5a1c-41158474432.json',import.meta.url),'utf8')).mediaTrace.hooks};
async function lifecycleFixture({failAt=null,closeFailure=false}={}) {
 const calls=[],events=new Map(), primary=new Error('injected '+failAt), cleanup=new Error('injected close');
 const report={browserDiagnostics:[],provenance:{},performanceWarmups:[],performanceFailures:[]};
 const state={__G:{music:{track:'battle',players:[]},match:{state:'playing'}}};
 const observed={nativeFrames:3,frameSamples:3,rafSamples:3,renderSamples:3,fireCalls:1,nonemptyProjectileUpdates:1,end:{inputMouseLeft:true,actorIntentFire:true}};
 const measured={elapsedMs:200,simulatedSeconds:.2,rAF:[16,16],nativeLoopTimestamps:[0,16,32],frameCpuMs:[1,1,1],projectileCpuMs:[1],renderCpuMs:[1,1,1],
  visualGeometryCpuMs:[0],visualBodies:[1],visualVertices:[3],visualOwnerCounts:[],nonemptyVisualRenders:3,visualBackend:'legacy-native',renderCalls:[1],triangles:[1],
  gpuRenderMs:[],gpuTimer:'unavailable',gpuDisjoint:false,maxProjectiles:1,projectileUpdates:3,nonemptyProjectileUpdates:3,fireCalls:1,renderer:{},game:{state:'playing'},browser:{viewport:[1280,720],dpr:1}};
 const cdp={on:(n,fn)=>events.set(n,fn),off:n=>events.delete(n),send:async name=>{
  calls.push(name);if(failAt==='performance-enable'&&name==='Performance.enable')throw primary;
  if(name==='Network.enable')events.get('Network.requestWillBeSent')?.({requestId:'jet',request:{url:assetURL,method:'GET',headers:{}},type:'Media'});
  if(name==='Tracing.end')events.get('Tracing.tracingComplete')?.({});return {metrics:[]};
 }};
 const page={on:()=>{},setDefaultTimeout:()=>{},isClosed:()=>false,bringToFront:async()=>{},
  addInitScript:async(fn)=>{calls.push('init:'+fn.name);if(failAt==='open-init'||failAt==='open-ui-init'&&fn===installProjectileCaptureUiGate||failAt==='open-projection-init'&&fn===installProjectileCaptureProjection)throw primary;if(fn===installProjectileCaptureUiGate||fn===installProjectileCaptureProjection)vm.runInNewContext('('+fn.toString()+')()',{window:state});},goto:async()=>{calls.push('goto');if(failAt==='open-goto')throw primary;},
  waitForFunction:async()=>{if(failAt==='performance-warmup')throw primary;},evaluate:async(fn,arg)=>{
   if(arg?.ownerGlobal){calls.push('snapshot');return vm.runInNewContext('('+fn.toString()+')(arg)',{window:state,arg});}
   const text=fn.toString();
   if(text.includes('__contextMediaTraceSnapshot'))return structuredClone(emptyMediaSnapshot);
   if(text.includes('g.R.setDynamicScale')&&failAt==='open-placement')throw primary;
   if(text.includes('const G = window.__G, g = window.__inkwave, perf = window.__inkwavePerf, w = perf.warmup'))return observed;
   if(text.includes('window.__inkwavePerfDone'))return {status:failAt==='performance-window'?'failed':'passed'};
   if(text.includes('windowStatus: perf.windowStatus'))return measured;
   if(text==='() => navigator.userAgent')return 'bounded-double';
   return {};
  }};
 const context={newPage:async()=>page,newCDPSession:async()=>cdp,close:async()=>{
  calls.push('context-close');events.get('Network.loadingFailed')?.({requestId:'jet',errorText:'net::ERR_ABORTED',canceled:true});if(closeFailure)throw cleanup;
 }};
 const realm={browser:{newContext:async()=>context},report,observeStreamedMusic,sourceIdentity:{checkoutSha:'a'.repeat(40),eventSha:null,checkoutIdentityStatus:'verified-git-head'},manifest:{build:{revision:'rev'}},address:'http://127.0.0.1:9999/',
  fs,hash:characterTimelineHash,installContextMediaTrace,correlateContextMediaRequests,classifyContextRequestFailures,
  URL,Date,setTimeout,clearTimeout,process:{env:{}},quality:'low',BOOT_SEED:1,NATIVE_BOOT_TIMEOUT_MS:50,MIN_PERFORMANCE_FRAMES:3,PERFORMANCE_TIMEOUT_MS:200,durationMs:50,
  installProjectileCaptureUiGate,withProjectileCaptureUi,installProjectileCaptureProjection,installAudioTimingObserver(){},audioBuildManifestReceipt:()=>({}),audioDiagnosticURL:x=>x,audioReceiptSha256:()=>'',site:'/site',mimeErrors:[],
  nativeTurfIntroWithUiFunction:()=>()=>{},startProjectileThroughMenu:async()=>{if(failAt==='open-menu')throw primary;},completeNativeTurfIntro(){},atomicIntroFunction(){},
  requireAtomicIntro:async()=>({intro:{},readiness:{},playingReady:true}),installProjectileCaptureRoster(){}};
 vm.createContext(realm);vm.runInContext(mediaErrorHeader+'\n'+summaryText+'\n'+openText+'\n'+performanceText,realm);
 return {realm,report,calls,primary,cleanup,context,page,state};
}
const assertClosed=(f)=>{
 assert.equal(f.calls.filter(x=>x==='context-close').length,1,'one observed context close');
 const receipt=f.report.streamedMusicDiagnostics[0];assert.ok(receipt.closeStartedAt);assert.ok(receipt.closeFinishedAt);
 assert.equal(receipt.snapshots.at(-1).reason,'before-context-close');
 assert.equal(receipt.network.at(-1).phase,'context-close');assert.equal(receipt.network.at(-1).autoAccepted,false);
 assert.ok(f.calls.lastIndexOf('snapshot')<f.calls.indexOf('context-close'),'snapshot precedes context close');
};
for(const failAt of ['open-init','open-ui-init','open-projection-init','open-goto','open-menu','open-placement'])test('open route closes observed context after '+failAt+' and preserves the error',async()=>{
 const f=await lifecycleFixture({failAt});await assert.rejects(f.realm.openGameContext(),e=>e===f.primary);assertClosed(f);
});
for(const failAt of ['performance-enable','performance-warmup','performance-window'])test('performance route closes observed context after '+failAt,async()=>{
 const f=await lifecycleFixture({failAt});await assert.rejects(f.realm.runFiringPerformance(),e=>failAt==='performance-enable'?e===f.primary:/warmup|performance window/.test(e.message));assertClosed(f);
 if(failAt==='performance-warmup')assert.equal(f.report.performanceWarmups[0].admitted,false);
 if(failAt==='performance-window')assert.equal(f.report.performanceFailures.length,1);
});
test('successful opening transfers cleanup ownership and successful performance closes exactly once',async()=>{
 const f=await lifecycleFixture();const opened=await f.realm.openGameContext();assert.equal(f.calls.includes('context-close'),false);await opened.close();assertClosed(f);
 const p=await lifecycleFixture();const result=await p.realm.runFiringPerformance();assert.equal(result.scenario,'desktop-long-fire');assert.equal(result.warmup.admitted,true);assertClosed(p);
});
for(const failAt of ['open-goto','performance-enable'])test('secondary close error cannot replace '+failAt+' error',async()=>{
 const f=await lifecycleFixture({failAt,closeFailure:true});await assert.rejects(f.realm[failAt.startsWith('open')?'openGameContext':'runFiringPerformance'](),e=>e===f.primary);assertClosed(f);
 assert.equal(f.report.browserDiagnostics.at(-1).event,'streamed-music-cleanup-failed');assert.equal(f.report.browserDiagnostics.at(-1).error,f.cleanup.message);
});
test('normal performance close rejection remains a failure and is not retried',async()=>{
 const f=await lifecycleFixture({closeFailure:true});await assert.rejects(f.realm.runFiringPerformance(),e=>e===f.cleanup);assertClosed(f);
});

test('performance opening failure leaves cleanup with the opener and does not close twice',async()=>{
 const f=await lifecycleFixture({failAt:'open-goto'});await assert.rejects(f.realm.runFiringPerformance(),e=>e===f.primary);assertClosed(f);
});

const outerText=runnerSource.slice(runnerSource.indexOf("\ntry {\n  if (capture !== 'performance')"));
async function outerFixture({visualFailure=false,contextFailure=false,browserFailure=false,performanceFailure=false,requestFailure=false,longCleanup=false,serverPending=false}={}) {
 const primary=new Error('first capture failure'), secondary=new Error(longCleanup?'secondary context '+ 'x'.repeat(12000):'secondary context close'),
  tertiary=new Error(longCleanup?'secondary browser '+ 'x'.repeat(12000):'secondary browser close');
 let finishServer, persistedWhileServerPending=false;
 const writes=[],calls=[],report={errors:[],performance:[],screenshots:[],visualScenarios:[],browserDiagnostics:[]};
 const realm={capture:performanceFailure?'performance':'visuals',device:'desktop',mode:'diagnostic',report,
  mimeErrors:requestFailure?['request failed Jet_Arrow.mp3: net::ERR_ABORTED']:[],NATIVE_BOOT_TIMEOUT_MS:180000,evidence:'/evidence',process:{},
  path:{join:(...args)=>args.join('/')},console:{log(){}},fs:{writeFileSync:(p,b)=>writes.push({path:p,body:b})},
  browser:{close:async()=>{calls.push('browser-close');if(browserFailure)throw tertiary;}},server:{close:done=>{calls.push('server-close');if(serverPending)finishServer=done;else done();}},
  openGameContext:async()=>({page:{},characterTrace:[['source-loader','await',123]],close:async()=>{calls.push('context-close');if(contextFailure)throw secondary;}}),
  runVisuals:async()=>{calls.push('visual');if(visualFailure)throw primary;},
  runFiringPerformance:async()=>{calls.push('performance');if(performanceFailure)throw primary;return {};}};
 vm.createContext(realm);const completing=vm.runInContext(mediaErrorHeader+'\n'+'(async()=>{'+outerText+'})()',realm);
 if(serverPending){
  for(let i=0;i<12;i++)await Promise.resolve();
  assert.equal(typeof finishServer,'function','server close was initiated');
  persistedWhileServerPending=writes.some(x=>x.path.endsWith('/projectile-visuals-result.json'));
  finishServer();
 }
 await completing;
 const saved=writes.find(x=>x.path.endsWith('/projectile-visuals-result.json'));
 assert.ok(saved,'bounded result is persisted even on cleanup rejection');
 assert.equal(writes.length,2);assert.equal(calls.filter(x=>x==='browser-close').length,1);assert.equal(calls.at(-1),'server-close');
 return {report:JSON.parse(saved.body),primary,secondary,tertiary,calls,exitCode:realm.process.exitCode,persistedWhileServerPending};
}
for(const options of [
 {name:'normal',expected:'passed'},
 {name:'visual failure',visualFailure:true},
 {name:'visual and context close failure',visualFailure:true,contextFailure:true},
 {name:'visual and browser close failure',visualFailure:true,browserFailure:true},
 {name:'visual and both cleanup failures',visualFailure:true,contextFailure:true,browserFailure:true},
 {name:'performance and browser close failure',performanceFailure:true,browserFailure:true},
 {name:'normal capture then context close failure',contextFailure:true},
 {name:'normal capture then browser close failure',browserFailure:true},
 {name:'failed request then browser close failure',requestFailure:true,browserFailure:true},
])test('outer report preserves first failure and writes result: '+options.name,async()=>{
 const f=await outerFixture(options);assert.equal(f.report.status,options.expected||'failed');
 assert.equal(f.exitCode,options.expected==='passed'?undefined:1);
 if(options.visualFailure||options.performanceFailure)assert.equal(f.report.error,f.primary.stack);
 else if(options.contextFailure)assert.equal(f.report.error,f.secondary.stack);
 else if(options.browserFailure&&!options.requestFailure)assert.equal(f.report.error,f.tertiary.stack);
 if(options.visualFailure)assert.deepEqual(JSON.parse(JSON.stringify(f.report.browserDiagnostics.find(x=>x.event==='visual-character-lifecycle')?.timeline)),[['source-loader','await',123]]);
 if(options.requestFailure){assert.deepEqual(f.report.errors,['request failed Jet_Arrow.mp3: net::ERR_ABORTED']);assert.equal(f.report.error,undefined);}
 const cleanup=f.report.browserDiagnostics.filter(x=>x.event.endsWith('cleanup-failed'));
 assert.equal(cleanup.length,Number(!!(options.visualFailure&&options.contextFailure))+Number(!!options.browserFailure));
 if(options.visualFailure&&options.contextFailure)assert.equal(cleanup[0].route,'visual');
});
test('cleanup-only diagnostics are bounded and do not truncate an existing primary error',async()=>{
 const f=await outerFixture({visualFailure:true,contextFailure:true,browserFailure:true,longCleanup:true});
 assert.equal(f.report.error,f.primary.stack);
 const cleanup=f.report.browserDiagnostics.filter(row=>row.event.endsWith('cleanup-failed'));
 assert.equal(cleanup.length,2);
 for(const row of cleanup)assert.equal(row.error.length,1000);
 assert.deepEqual(JSON.parse(JSON.stringify(f.report.browserDiagnostics.find(row=>row.event==='visual-character-lifecycle')?.timeline)),[['source-loader','await',123]]);
 const g=await outerFixture({browserFailure:true,longCleanup:true});assert.equal(g.report.status,'failed');assert.equal(g.report.error.length,4000);
});

test('browser close rejection persists result before a delayed server close callback',async()=>{
 const f=await outerFixture({browserFailure:true,serverPending:true});assert.equal(f.persistedWhileServerPending,true);
 assert.equal(f.report.status,'failed');assert.equal(f.exitCode,1);assert.equal(f.report.error,f.tertiary.stack);
});


// These run the real installer in the extracted-open fixture; no browser readiness is claimed.
test('real UI and projection installers precede native navigation and preserve observed cleanup',async()=>{
 const f=await lifecycleFixture();const opened=await f.realm.openGameContext();
 assert.equal(typeof f.state.__iwProjectileCaptureUiGate,'function');
 assert.equal(f.state.__iwProjectileCaptureUiHistory.admissionCount,0);
 assert.equal(typeof f.state.__iwSetProjectileCaptureProjection,'function');
 assert.equal(typeof f.state.__iwAssertProjectileCaptureProjection,'function');
 assert.ok(f.calls.indexOf('init:installProjectileCaptureUiGate')<f.calls.indexOf('init:installProjectileCaptureProjection'));
 assert.ok(f.calls.indexOf('init:installProjectileCaptureProjection')<f.calls.indexOf('goto'));
 assert.ok(f.calls.indexOf('init:installAudioTimingObserver')<f.calls.indexOf('init:installProjectileCaptureUiGate'));
 await opened.close();assertClosed(f);
});
test('missing UI installer fails initialization and still closes the observed context',async()=>{
 const f=await lifecycleFixture();delete f.realm.installProjectileCaptureUiGate;
 await assert.rejects(f.realm.openGameContext(),/installProjectileCaptureUiGate is not defined/);assertClosed(f);
});

test('missing projection installer fails initialization and still closes the observed context',async()=>{
 const f=await lifecycleFixture();delete f.realm.installProjectileCaptureProjection;
 await assert.rejects(f.realm.openGameContext(),/installProjectileCaptureProjection is not defined/);assertClosed(f);
 assert.equal(f.calls.includes('goto'),false);
});

// Execute the runner's actual failure listeners, not a copy of their predicate.
// These bounded API doubles test classification, not native audio playback.
const cancellationAddress='http://127.0.0.1:9999/';
const cancellationRevision='a'.repeat(64);
const cancellationAsset='patches/splatoon3/runtime/audio/s3-real/probe.mp3';
const cancellationVersioned=`_versions/${cancellationRevision}/${cancellationAsset}`;
const cancellationURL=new URL(cancellationVersioned,cancellationAddress).href;
function strictNativeListenerText(openText){
 const ast=parse(openText,{ecmaVersion:'latest',sourceType:'module'}).body[0];
 const owners=[];
 const visit=n=>{if(!n||typeof n!=='object'||['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(n.type))return;
  if(n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.type==='MemberExpression'&&n.expression.callee.object.name==='page'&&n.expression.callee.property.name==='on'){owners.push(n);return;}
  for(const value of Object.values(n))if(Array.isArray(value)){for(const child of value)visit(child);}else if(value&&typeof value==='object')visit(value);
 };visit(ast.body);
 const selected=owners.filter(n=>{
  const [event,callback]=n.expression.arguments,body=openText.slice(callback.start,callback.end);
  return ['crash','pageerror','console','response'].includes(event.value)&&(event.value==='crash'||body.includes('mimeErrors'))||event.value==='requestfailed'&&callback.body.type==='BlockStatement'&&callback.body.body[0]?.declarations?.[0]?.id?.name==='failure';
 });
 assert.equal(selected.length,4,'exact original strict listener owners, no async setup or added telemetry listener');
 assert.deepEqual(selected.map(n=>n.expression.arguments[0].value),['crash','pageerror','console','requestfailed']);
 return selected.map(n=>openText.slice(n.start,n.end)).join('\n');
}
function cancellationFixture({artifacts={[cancellationAsset]:'verified-root',[cancellationVersioned]:'verified-versioned'}}={}) {
 const callbacks=new Map(),mimeErrors=[],report={browserDiagnostics:[]};
 const page={on(name,fn){const rows=callbacks.get(name)||[];rows.push(fn);callbacks.set(name,rows);}};
 const text=strictNativeListenerText(openText);
 vm.runInNewContext(text,{page,mimeErrors,report,mobile:false,URL,Date,address:cancellationAddress,manifest:{build:{revision:cancellationRevision},artifacts}});
 const emit=(name,value)=>{for(const fn of callbacks.get(name)||[])fn(value);};
 return {mimeErrors,report,emit,request(url=cancellationURL,error='net::ERR_ABORTED'){
  emit('requestfailed',{url:()=>url,failure:()=>error===null?null:{errorText:error}});
 }};
}
test('runner accepts only verified same-origin versioned S3 MP3 cancellation',()=>{
 for(const suffix of ['', '?cache=1']) {
  const f=cancellationFixture();f.request(cancellationURL+suffix);
  assert.deepEqual(f.mimeErrors,[]);assert.equal(f.report.browserDiagnostics.length,1);
  assert.equal(f.report.browserDiagnostics[0].event,'verified-audio-fetch-cancelled');
  assert.equal(f.report.browserDiagnostics[0].asset,cancellationAsset);
 }
});
test('runner rejects other origins, revisions, missing manifest leaves, and non-S3/non-MP3 aborts',()=>{
 const cases=[
  ['other host',cancellationURL.replace('127.0.0.1','localhost')],
  ['other port',cancellationURL.replace(':9999',':9998')],
  ['other scheme',cancellationURL.replace('http:','https:')],
  ['other revision',cancellationURL.replace(cancellationRevision,'b'.repeat(64))],
  ['unlisted MP3',cancellationURL.replace('probe.mp3','missing.mp3')],
  ['non-MP3',cancellationURL.replace('probe.mp3','probe.json')],
  ['nested MP3',cancellationURL.replace('probe.mp3','nested/probe.mp3')],
  ['unversioned MP3',new URL(cancellationAsset,cancellationAddress).href],
  ['other audio directory',new URL(`_versions/${cancellationRevision}/assets/audio/Jet_Arrow.mp3`,cancellationAddress).href],
  ['missing root manifest leaf',cancellationURL,{[cancellationVersioned]:'verified-versioned'}],
  ['missing served manifest leaf',cancellationURL,{[cancellationAsset]:'verified-root'}],
 ];
 for(const [label,url,artifacts]of cases){
  const f=cancellationFixture(artifacts?{artifacts}:{});f.request(url);
  assert.equal(f.report.browserDiagnostics.length,0,label);assert.equal(f.mimeErrors.length,1,label);
  assert.match(f.mimeErrors[0],/request failed .*net::ERR_ABORTED/,label);
 }
});
test('runner retains all non-abort and unknown request failures for known MP3s',()=>{
 for(const error of ['net::ERR_FAILED','net::ERR_CONNECTION_RESET','net::ERR_TIMED_OUT','net::ERR_FILE_NOT_FOUND','unknown',null]){
  const f=cancellationFixture();f.request(cancellationURL,error);
  assert.equal(f.report.browserDiagnostics.length,0);assert.equal(f.mimeErrors.length,1);
  assert.ok(f.mimeErrors[0].endsWith(error||'unknown'));
 }
});
test('404 and corrupt-audio console/page errors remain fatal beside an accepted cancellation',()=>{
 const f=cancellationFixture();f.request();
 f.emit('console',{type:()=> 'error',text:()=> 'Failed to load resource: the server responded with a status of 404 (Not Found)'});
 f.emit('console',{type:()=> 'error',text:()=> 'MP3 decode failed: corrupt data'});
 f.emit('pageerror',new Error('audio decode rejected'));
 assert.equal(f.report.browserDiagnostics.length,1);
 assert.deepEqual(f.mimeErrors,[
  'Failed to load resource: the server responded with a status of 404 (Not Found)',
  'MP3 decode failed: corrupt data','audio decode rejected',
 ]);
});
function cancellationBuildFixture(t) {
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-audio-cancellation-'));
 t.after(()=>fs.rmSync(site,{recursive:true,force:true}));
 const bytes=Buffer.from('synthetic bytes for integrity/network tests, not playback');
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const artifacts={};
 for(const relative of [cancellationAsset,cancellationVersioned]){
  const file=path.join(site,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);artifacts[relative]=hash(bytes);
 }
 const manifest={build:{revision:cancellationRevision},artifacts,contentHash:hash(JSON.stringify(artifacts))};
 fs.writeFileSync(path.join(site,'inkwave-build.json'),JSON.stringify(manifest));
 const startup=functionText('const manifest = JSON.parse',"const { serveProjectileCaptureFile }");
 const verify=()=>vm.runInNewContext(startup,{fs,path,site,hash});
 return {site,bytes,manifest,verify};
}
test('actual startup verifier rejects corrupt or missing root and served-version MP3 bytes',t=>{
 const f=cancellationBuildFixture(t);f.verify();
 for(const relative of [cancellationAsset,cancellationVersioned]){
  const file=path.join(f.site,relative);fs.writeFileSync(file,'corrupt');
  assert.throws(f.verify,/Built artifact checksum mismatch/);
  fs.unlinkSync(file);assert.throws(f.verify,/Built artifact checksum mismatch/);
  fs.writeFileSync(file,f.bytes);f.verify();
 }
 f.manifest.artifacts[cancellationVersioned]='0'.repeat(64);
 fs.writeFileSync(path.join(f.site,'inkwave-build.json'),JSON.stringify(f.manifest));
 assert.throws(f.verify,/Build artifact manifest identity mismatch/);
});
test('actual loopback file handler serves the verified leaf and still returns 404 for missing assets',async t=>{
 const f=cancellationBuildFixture(t);f.verify();
 const serverText=functionText('const server = http.createServer','await new Promise(resolve => server.listen');
 const realm={fs,path,http,URL,site:f.site,mime:{},serveProjectileCaptureFile};
 vm.runInNewContext(serverText+'\nglobalThis.captureServer=server;',realm);
 const server=realm.captureServer;
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/${cancellationVersioned}`;
 const valid=await fetch(url);assert.equal(valid.status,200);assert.equal(valid.headers.get('content-type'),'audio/mp3');
 assert.deepEqual(Buffer.from(await valid.arrayBuffer()),f.bytes);
 const missing=await fetch(url.replace('probe.mp3','missing.mp3'));assert.equal(missing.status,404);assert.equal(await missing.text(),'Not found');
 fs.unlinkSync(path.join(f.site,cancellationVersioned));
 const removed=await fetch(url);assert.equal(removed.status,404);assert.equal(await removed.text(),'Not found');
});

test('reviewed media epoch preserves complete prior source and every older pin with an exact inverse',()=>{
 const current=fs.readFileSync(new URL('../check-inkwave-projectile-visuals.mjs',import.meta.url),'utf8'),prior=restoreReviewedMediaRetirementRunner(current);
 assert.equal(characterTimelineHash(prior),mediaEpoch.beforeSHA256);
 let projected=prior;
 for(const {current:after,prior:before}of mediaEpoch.hunks){assert.equal(projected.split(before).length,2);projected=projected.replace(before,after);}
 assert.equal(projected,current);assert.equal(characterTimelineHash(projected),mediaEpoch.currentSHA256);
 for(const {current:region}of mediaEpoch.hunks){
  assert.equal(current.split(region).length,2);
  for(const changed of [current.replace(region,''),current.replace(region,region+region),current.replace(region,region+'\n// unreviewed change')])
   assert.throws(()=>restoreReviewedMediaRetirementRunner(changed));
 }
 assert.throws(()=>restoreReviewedMediaRetirementRunner(current+'\n'));
 assert.equal(characterTimelineHash(restoreCharacterTimelineRunner(current)),'84fa9bf827fe699b0b9929c915678f6bc2063d45226a6e547117bbb1fa14e7c4');
});
test('selected native failure listeners stay byte-identical across the media epoch and exclude async setup',()=>{
 const prior=restoreReviewedMediaRetirementRunner(runnerSource),start=prior.indexOf('async function openGameContext('),end=prior.indexOf('async function setCamera(',start);
 assert(start>=0&&end>start);const original=strictNativeListenerText(prior.slice(start,end));
 const current=strictNativeListenerText(openText);assert.equal(current,original);assert.doesNotMatch(current,/\bawait\b|addInitScript|mediaErrorStarts|mediaRawFailures/);
 const changed=openText.replace("failure==='net::ERR_ABORTED'","failure==='net::ERR_FAILED'");assert.notEqual(changed,openText);assert.notEqual(strictNativeListenerText(changed),original);
});
test('current extracted opener keeps real media dependency and exact module metadata bindings',async()=>{
 const f=await lifecycleFixture(),opened=await f.realm.openGameContext();
 assert.equal(f.realm.installContextMediaTrace,installContextMediaTrace);assert.equal(f.realm.correlateContextMediaRequests,correlateContextMediaRequests);assert.equal(f.realm.classifyContextRequestFailures,classifyContextRequestFailures);
 assert.equal(f.report.mediaRetirementObservations[0].helperSha256,characterTimelineHash(fs.readFileSync(new URL('../check-inkwave-context-recovery-browser.mjs',import.meta.url))));
 await opened.close();assertClosed(f);
});
test('missing current media init dependency fails and retains one observed cleanup instead of skipping it',async()=>{
 const f=await lifecycleFixture();delete f.realm.installContextMediaTrace;
 await assert.rejects(f.realm.openGameContext(),/installContextMediaTrace is not defined/);assertClosed(f);assert.equal(f.calls.includes('goto'),false);
});
