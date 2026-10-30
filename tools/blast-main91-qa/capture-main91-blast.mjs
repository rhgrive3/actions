// Private QA helper. No product source extraction, replacement FX, or browser launch.
// Caller owns normal native-match boot and a sandboxed browser. Not executed yet.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export const HEAD='0cc5ce3712f93c275095d36c1f35ffdbd8565e2e';
// Source clip onset is approximately frame955. F0 is first positive FX tick, burst age1/60. Keep both encoded frames and seconds.
export const FRAMES=[0,1,3,5,9,13,21,29];
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function captureBlastPair({page,out,expectedContentHash,prepareCase,admitRoll,camera,blastPosition}) {
  assert.match(expectedContentHash,/^[a-f0-9]{64}$/);
  assert.equal(typeof prepareCase,'function','native lane must prepare each case through actual game inputs');
  assert.equal(typeof admitRoll,'function','real input roll admission callback required');
  assert.equal(camera.position.length,3);assert.equal(camera.target.length,3);assert.equal(blastPosition.length,3);
  fs.mkdirSync(out,{recursive:true});
  const report={head:HEAD,expectedContentHash,status:'incomplete',sourceReference:'https://x.com/rougsmth/status/1632258225746903041',referenceOnsetFrame:955,referenceDate:'2023-03-05',scope:'isolated actual composed FX API capture in normally booted game; manual local Actor/FX stepping is NOT full native controller/match frame equivalence; not weapon hit/damage or target feedback test',cases:[]};
  const write=()=>fs.writeFileSync(path.join(out,'capture-receipt.json'),JSON.stringify(report,null,2));
  write();
  try {
    for (const withRoll of [false,true]) {
      // Required integration contract: independently reset native match, use actual
      // movement input for roll admission, stop just before its first FX tick.
      // Never write s3.actions.roll or add a fake actor/Character/FX implementation.
      const preparation=await prepareCase(page,{withRoll});
      assert.equal(preparation?.nativeMatch,true);
      assert.equal(preparation?.verifiedHead,HEAD,'lane must independently verify pinned Git head/build closure');
      assert.equal(preparation?.contentHash,expectedContentHash);
      assert.equal(preparation?.allArtifactHashesVerified,true);

      const setup=await page.evaluate(async({withRoll,hash,camera,blastPosition})=>{
        const manifest=await(await fetch('/inkwave-build.json')).json();
        if(manifest.contentHash!==hash)throw Error('served build contentHash mismatch');
        const G=window.__G,g=window.__inkwave,a=g?.match?.local;
        if(!G?.fx?.explosion||!g?.debug?.freeze||!g?.R?.render||g.match.state!=='playing'||g.match.attract||!a?.isLocal)throw Error('native playing match required');
        if(typeof window.__iwResetScenarioRandom!=='function')throw Error('existing projectile QA random diagnostic required');
        const roll=a.s3?.actions?.roll;
        if(roll?.time>0)throw Error('prepare must precede roll admission');
        if(a.weapon?.id!=='blaster'||!(a.weapon.burstRadius>0))throw Error('native equipped Hot Blaster required');
        const radius=a.weapon.burstRadius;
        if(!withRoll&&G.actors.some(x=>(x.s3?.actions?.roll?.time||x.remoteSquidrollVisual?.remaining||0)>0))throw Error('single-burst case has an active roll');
        g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.R.setDynamicScale(1);
        G.settings.cameraShake=0;g.rig.setMap(false);
        G.camera.position.fromArray(camera.position);G.camera.lookAt(...camera.target);G.camera.updateMatrixWorld(true);
        G.projectiles.clear();G.fx.clear();
        window.__iwBlastRng=window.__iwResetScenarioRandom(0x42535431);
        const V=G.camera.position.constructor;
        // Public production FX API. Radius is recorded, not tuned to fake a match.
        window.__iwBlastPosition=blastPosition;window.__iwBlastRadius=radius;
        window.__iwBlastBeforeAdmissionFxTicks=0;window.__iwBlastOriginalFxUpdate=G.fx.update;
        G.fx.update=function(dt,...args){if(dt>0)window.__iwBlastBeforeAdmissionFxTicks++;return window.__iwBlastOriginalFxUpdate.call(this,dt,...args);};
        window.__iwBlastFrame=0;
        return {manifestRevision:manifest.build?.revision,contentHash:manifest.contentHash,position:blastPosition,radius,ink:a.color.getHexString(),camera:G.camera.matrixWorld.toArray(),roll:roll?{time:roll.time,armorHP:roll.armorHP}:null,quality:G.fx.q,weaponId:a.weapon.id,nativeBurstRadius:radius};
      },{withRoll,hash:expectedContentHash,camera,blastPosition});
      if(withRoll){const admission=await admitRoll(page);assert.equal(admission?.realInputRollAdmission,true);setup.admission=admission;}
      setup.firstTick=await page.evaluate(({withRoll})=>{
        const G=__G,g=__inkwave,a=g.match.local,roll=a.s3?.actions?.roll;
        G.fx.update=window.__iwBlastOriginalFxUpdate;
        if(window.__iwBlastBeforeAdmissionFxTicks!==0)throw Error('FX advanced between clear and admission; reject stale first-launch state');
        if(withRoll&&(!(roll?.time>0)||a.form!=='squid'||a.grounded||!a.alive||a.climbing||a.specialActive||a.superJumpState||a.character?.root?.visible===false))throw Error('real eligible airborne roll required');
        if(a.weapon.id!=='blaster'||a.weapon.burstRadius!==window.__iwBlastRadius)throw Error('weapon changed during admission');
        const V=G.camera.position.constructor;
        G.fx.explosion(new V(...window.__iwBlastPosition),a.color,a.weapon.burstRadius);
        const born=G.time;G.time+=1/60;g.time+=1/60;G.fx.update(1/60,G.camera);
        window.__iwBlastLighting=()=>({fov:G.camera.fov,aspect:G.camera.aspect,toneMapping:G.renderer.toneMapping,exposure:G.renderer.toneMappingExposure,outputColorSpace:G.renderer.outputColorSpace,quality:G.fx.q,projectionMatrix:G.camera.projectionMatrix.toArray(),matrixWorld:G.camera.matrixWorld.toArray(),fxLight:Object.fromEntries(Object.entries(G.fx._light||{}).map(([k,v])=>[k,v?.toArray?v.toArray():v])),environmentGrade:G.env?.grade??null,bloom:g.R.bloom?{strength:g.R.bloom.strength,radius:g.R.bloom.radius,threshold:g.R.bloom.threshold}:null,lights:(()=>{const x=[];G.scene.traverse(o=>{if(o.isLight)x.push({type:o.type,color:o.color.getHexString(),intensity:o.intensity,position:o.position.toArray()});});return x;})()});
        window.__iwBlastLightingBaseline=JSON.stringify(window.__iwBlastLighting());
        return {burstBorn:born,firstFrameTime:G.time,burstAgeAtF0:1/60,actorPosition:a.pos.toArray(),actorProjection:a.pos.clone().add(new V(0,.35,0)).project(G.camera).toArray(),fxTicksBeforeAdmission:0,lighting:window.__iwBlastLighting(),roll:roll?{remaining:roll.time,armorTime:roll.armorTime,armorHP:roll.armorHP,grounded:a.grounded,visible:a.character?.root?.visible,climbing:a.climbing,special:!!a.specialActive,superJump:!!a.superJumpState}:null};
      },{withRoll});
      if(report.cases.length)assert.deepEqual(setup.firstTick.lighting,report.cases[0].setup.firstTick.lighting,'both case camera/light/exposure must match');
      const record={withRoll,preparation,setup,captures:[]};report.cases.push(record);write();
      for(const frame of FRAMES){
        const data=await page.evaluate(({frame,withRoll})=>{
          const G=window.__G,g=window.__inkwave,dt=1/60;
          while(window.__iwBlastFrame<frame){
            G.time+=dt;g.time+=dt;
            // Advance genuine actor action clocks only in the combined case.
            if(withRoll){g.match.updateController(dt);g.match.local.update(dt);g.input.endFrame();}
            G.projectiles.update(dt);G.fx.update(dt,G.camera);g.fxHooks?.update?.(dt);G.paint.flush(dt);
            window.__iwBlastFrame++;
          }
          if(JSON.stringify(window.__iwBlastLighting())!==window.__iwBlastLightingBaseline)throw Error('camera/light/exposure changed');
          const before=G.camera.matrixWorld.toArray();G.renderer.info.reset();g.R.render();
          if(before.some((v,i)=>v!==G.camera.matrixWorld.elements[i]))throw Error('renderer changed fixed camera');
          const gl=G.renderer.getContext(),error=gl.getError();if(error)throw Error('WebGL error '+error);
          // Same synchronous task as actual render: no composited placeholder PNG.
          const png=G.renderer.domElement.toDataURL('image/png');
          return {png,frame,seconds:(frame+1)/60,burstAgeSeconds:(frame+1)/60,roll: g.match.local.s3?.actions?.roll?{remaining:g.match.local.s3.actions.roll.time,armorTime:g.match.local.s3.actions.roll.armorTime,grounded:g.match.local.grounded}:null,actorPosition:g.match.local.pos.toArray(),actorProjection:g.match.local.pos.clone().project(G.camera).toArray(),pools:{glows:G.fx.glows.n,drops:G.fx.dN,shells:G.fx.shells.n},gameTime:G.time,fx:G.fx.stats?.()??null,drawCalls:G.renderer.info.render.calls,triangles:G.renderer.info.render.triangles,camera:before,rng:window.__iwBlastRng.snapshot(),glError:error};
        },{frame,withRoll});
        const file=`${withRoll?'blast-roll':'blast-only'}-F${String(frame).padStart(2,'0')}.png`;
        const bytes=Buffer.from(data.png.split(',')[1],'base64');fs.writeFileSync(path.join(out,file),bytes);
        delete data.png;record.captures.push({...data,file,sha256:sha(bytes),sourceReferenceFrame:956+frame});write();
      }
    }
    report.status='captured-not-reviewed';write();return report;
  }catch(e){report.error=String(e.stack||e);write();throw e;}
}
