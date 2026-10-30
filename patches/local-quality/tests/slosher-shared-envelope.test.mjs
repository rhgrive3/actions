import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { sharedBucketDraw, projectileDrawRadius, projectileVisualKind, bucketSheetHead } from '../../splatoon3/runtime/projectile-visuals.mjs';
import { PROJECTILE_VISUAL_SOURCE } from '../../splatoon3/runtime/projectile-visual-source-data.mjs';

// Independent DrawSizeParam values from Leanny/splat3 11.3.0, commit
// 7280ff9cde8bb1c5dcef46c700c326471584d2e6, /GameParameters/UnitGroupParam/Unit.
// Raw blobs: Diffusion b60f5b48c9f0a2ff30b16222c77e54cbd4fddbd0,
// Double 57ff283be1bfa9350c878563528d5c59bd172c74. These are NOT Bucket radii.
const SOURCE_DRAW = {
  WeaponSlosherDiffusion: [
    [1.4, 1.4, -1.4, -1.4, 0, 2, -1],
    [.8, .8, -.1, -.1, 0, 2, -1],
    [1, 1, 0, 0, 1, 2, -1],
    [1, 1, 0, 0, 2, 2, -1],
  ],
  WeaponSlosherDouble: [
    [0, 1.4, 0, -.16, 0, 4, 1],
    [0, 1.2, 0, -.14, 1, 4, 1],
  ],
};
function sourceDraw(row) {
  const [InitRadius, EndRadius, AfterOffsetInitRadius, AfterOffsetEndRadius,
    TailID, TailLengthMax, TailLengthMaxLastTail] = row;
  return {InitRadius, EndRadius, AfterOffsetInitRadius, AfterOffsetEndRadius,
    TailID, TailLengthMax, TailLengthMaxLastTail, ChangeFrame:0, TailLengthMin:.5, TailSolidFrame:5};
}

test('Tri-Slosher and Dread Wringer share Bucket art but retain source envelopes, including alternate kits', async () => {
  const {THREE,InkVolumes,captureInkVolume,submitInkVolume} = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {InkVolumes} from './patches/local-quality/ink-volume/runtime.mjs'; export {captureInkVolume,submitInkVolume} from './patches/local-quality/ink-volume/recipes.mjs';"});
  const bucketAsset = {};
  const engine = { assets: new Map([['roller', {}], ['projectile:slosher:slosher', bucketAsset]]),
    submitComposite(_p, parts) { this.submission = parts.map(p => ({name:p.name,stretch:p.stretch.toArray(),position:p.position.toArray()})); return true; } };
  for (const [id, actor] of [['s3-slosher-diffusion','WeaponSlosherDiffusion'],['s3-slosher-double','WeaponSlosherDouble']]) {
    for (const kit of ['', '-01', '-02']) for (const [unit,row] of SOURCE_DRAW[actor].entries())
      for (const index of [0, 1, 3, 7, 8]) for (const [age,speed] of [[.01,30],[.1,30],[1,120]]) {
      const p = {wid:id+kit,type:'shot',age,seed:.2,pos:new THREE.Vector3(),vel:new THREE.Vector3(0,0,speed),
        owner:{weapon:{kind:'catalog',behaviorKind:'slosher'}},
        catalog:{r:{sourceActor:actor},descriptor:{key:'slosh',unit,index,b:{DrawSizeParam:{InitRadius:99,EndRadius:99,TailLengthMin:99,TailLengthMax:99}}}}};
      captureInkVolume(p);
      const before = JSON.stringify({catalog:p.catalog,pos:p.pos,vel:p.vel,age:p.age});
      const draw = sourceDraw(row);
      assert.deepEqual(sharedBucketDraw(p), draw, actor+' unit '+unit+' pinned raw source');
      assert.equal(sharedBucketDraw(p), PROJECTILE_VISUAL_SOURCE[actor].slosh[unit].drawSize,
        'reuse the cached per-source record, not a newly allocated envelope');
      assert.notEqual(sharedBucketDraw(p), PROJECTILE_VISUAL_SOURCE.WeaponSlosherStrong.slosh[unit === 1 ? 2 : 1].drawSize,
        'shared artwork must not substitute the generic Bucket envelope');
      const radius = Math.max(0,draw.EndRadius + index * draw.AfterOffsetEndRadius);
      assert.equal(projectileDrawRadius(p), radius, 'unclamped source index; nonpositive envelopes are invisible');
      const remote={...p,catalog:{...p.catalog,index,descriptor:{...p.catalog.descriptor,index:0}}};
      assert.equal(projectileDrawRadius(remote),radius,'wire-restored catalogue index controls the source taper');
      assert.equal(bucketSheetHead(remote),index===0,'later wire fragments are not extra heads');
      assert.equal(projectileVisualKind(p), unit === 1 ? 'bucket-rear' : 'bucket-front');
      assert.equal(p._inkVolumeAssetName, 'projectile:slosher:slosher');
      // A derivative-specific registration must never replace the requested Bucket art.
      engine.assets.set('projectile:'+p.wid+':slosher', {});
      assert(submitInkVolume(engine,p));
      assert.equal(engine.submission[0].name, 'projectile:slosher:slosher');
      assert.equal(engine.assets.get(engine.submission[0].name),bucketAsset,'all kits reuse the same registered art');
      const tail = Math.max(draw.TailLengthMin,Math.min(draw.TailLengthMax,speed*Math.min(age,draw.TailSolidFrame/60)));
      // The owner's Hissen enlargement affects the submitted art, while the
      // pinned source envelope and raw draw radius above stay unscaled.
      const presentationScale = actor === 'WeaponSlosherDiffusion' ? 1.5 : 1;
      assert.deepEqual(Array.from(engine.submission[0].stretch),[radius,radius+tail,radius*.32].map(v=>v*presentationScale));
      assert.deepEqual(Array.from(engine.submission[0].position),[0,0,-tail*.5*presentationScale]);
      assert.equal(JSON.stringify({catalog:p.catalog,pos:p.pos,vel:p.vel,age:p.age}),before,'presentation preserves authoritative projectile state');

      // Only the known shared native sheet or Roller sheet fallback is valid;
      // a derivative-only registration is not permission to use unrelated art.
      engine.assets.delete('projectile:slosher:slosher');
      assert(submitInkVolume(engine,p),'known Roller sheet remains the fallback');
      assert.equal(engine.submission[0].name,'roller');
      engine.assets.set('projectile:slosher:slosher',bucketAsset);
    }
  }
  // Exercise the real reservation engine: missing shared art must reject the
  // whole effect even when derivative-specific registrations exist.
  const invalidEngine = new InkVolumes(new THREE.Group(),{
    sunDir:new THREE.Vector3(0,1,0),sunCol:new THREE.Color('white'),
    sky:new THREE.Color('gray'),ground:new THREE.Color('gray'),
  });
  for(const [id,actor] of [['s3-slosher-diffusion','WeaponSlosherDiffusion'],['s3-slosher-double','WeaponSlosherDouble']]) {
    const p={wid:id,type:'shot',age:.1,seed:.2,pos:new THREE.Vector3(),vel:new THREE.Vector3(0,0,30),
      owner:{weapon:{kind:'catalog',behaviorKind:'slosher'}},
      catalog:{r:{sourceActor:actor},descriptor:{key:'slosh',unit:0,index:0}}};
    captureInkVolume(p);
    invalidEngine.assets.set('projectile:'+id+':slosher',{});
    assert.equal(submitInkVolume(invalidEngine,p),false,'derivative-only assets cannot replace Bucket art');
    invalidEngine.assets.clear();
    assert.equal(submitInkVolume(invalidEngine,p),false,'absent shared art cannot submit');
    assert.equal(invalidEngine.metrics.active,0);
    assert.equal(invalidEngine.root.children.length,0,'invalid assets leave no partial draw');
  }
  invalidEngine.dispose();
  for(const actor of ['WeaponSlosherDiffusion','WeaponSlosherDouble'])
    assert.equal(sharedBucketDraw({catalog:{r:{sourceActor:actor},descriptor:{unit:99}}}),null,'missing source unit has no generic fallback');
  assert.equal(sharedBucketDraw({wid:'s3-slosher-bathtub'}),null);
  assert.equal(sharedBucketDraw({wid:'slosher'}),null,'native Bucket does not use a derivative source record');
});

test('real FX hooks give catalogue Bucket sheets the same flight droplets and head spacing as native Bucket', async () => {
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,
    extraExports:"export {initFxHooks} from './src/fx/fxHooks.js';"});
  const calls=[];f.G.fx={sloshTrail(_p,_v,_c,head){calls.push(['slosh',head]);},shotTrail(){calls.push(['shot']);}};
  f.G.camera={position:new f.THREE.Vector3(0,5,0)};
  const hooks=f.initFxHooks(f.G),owner={color:new f.THREE.Color('#f80')};
  for(const [wid,type,head,catalog]of [
    ['slosher','slosh',true,null],
    ['s3-slosher-diffusion','shot',false,{r:{sourceActor:'WeaponSlosherDiffusion'},descriptor:{key:'slosh',unit:0,index:0}}],
    ['s3-slosher-double-01','shot',false,{r:{sourceActor:'WeaponSlosherDouble'},descriptor:{key:'slosh',unit:0,index:0}}],
  ]){
    calls.length=0;hooks._projectiles({list:[{wid,type,head,catalog,owner,age:.1,pos:new f.THREE.Vector3(0,5,0),vel:new f.THREE.Vector3(0,0,30)}]},.05);
    assert.deepEqual(calls,[['slosh',true]],wid+' shared FX recipe');
  }
});
