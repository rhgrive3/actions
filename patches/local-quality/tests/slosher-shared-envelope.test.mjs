import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from '../../splatoon3/tests/source-fixture.mjs';
import { sharedBucketDraw, projectileDrawRadius, projectileVisualKind, bucketSheetHead } from '../../splatoon3/runtime/projectile-visuals.mjs';
import { PROJECTILE_VISUAL_SOURCE } from '../../splatoon3/runtime/projectile-visual-source-data.mjs';

test('Tri-Slosher and Dread Wringer reuse Bucket head/rear radius, tail and native asset, including alternate kits', async () => {
  const {THREE,captureInkVolume,submitInkVolume} = await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports:"export {captureInkVolume,submitInkVolume} from './patches/local-quality/ink-volume/recipes.mjs';"});
  const base = PROJECTILE_VISUAL_SOURCE.WeaponSlosherStrong.slosh;
  const engine = { assets: new Map([['roller', {}], ['projectile:slosher:slosher', {}]]),
    submitComposite(_p, parts) { this.submission = parts.map(p => ({name:p.name,stretch:p.stretch.toArray(),position:p.position.toArray()})); return true; } };
  for (const [id, actor] of [['s3-slosher-diffusion','WeaponSlosherDiffusion'],['s3-slosher-double','WeaponSlosherDouble']]) {
    for (const kit of ['', '-01', '-02']) for (const unit of [0, 1]) for (const index of [0, 1, 3, 7]) {
      const p = {wid:id+kit,type:'shot',age:.1,seed:.2,pos:new THREE.Vector3(),vel:new THREE.Vector3(0,0,30),
        owner:{weapon:{kind:'catalog',behaviorKind:'slosher'}},
        catalog:{r:{sourceActor:actor},descriptor:{key:'slosh',unit,index,b:{DrawSizeParam:{InitRadius:99,EndRadius:99,TailLengthMin:99,TailLengthMax:99}}}}};
      captureInkVolume(p);
      const before = JSON.stringify({catalog:p.catalog,pos:p.pos,vel:p.vel,age:p.age});
      const draw = base[unit === 1 ? 2 : 1].drawSize;
      assert.equal(sharedBucketDraw(p), draw);
      const radius = draw.EndRadius + Math.min(unit===1?4:3,index) * draw.AfterOffsetEndRadius;
      assert.equal(projectileDrawRadius(p), radius);
      const remote={...p,catalog:{...p.catalog,index,descriptor:{...p.catalog.descriptor,index:0}}};
      assert.equal(projectileDrawRadius(remote),radius,'wire-restored catalogue index controls the shared taper');
      assert.equal(bucketSheetHead(remote),index===0,'later wire fragments are not extra heads');
      assert.equal(projectileVisualKind(p), unit === 1 ? 'bucket-rear' : 'bucket-front');
      assert.equal(p._inkVolumeAssetName, 'projectile:slosher:slosher');
      // A derivative-specific registration must never replace the requested Bucket art.
      engine.assets.set('projectile:'+p.wid+':slosher', {});
      assert(submitInkVolume(engine,p));
      assert.equal(engine.submission[0].name, 'projectile:slosher:slosher');
      const tail = Math.max(draw.TailLengthMin,Math.min(draw.TailLengthMax,30*5/60));
      assert.deepEqual(Array.from(engine.submission[0].stretch),[radius,radius+tail,radius*.32]);
      assert.equal(JSON.stringify({catalog:p.catalog,pos:p.pos,vel:p.vel,age:p.age}),before,'presentation preserves authoritative projectile state');
    }
  }
  assert.equal(sharedBucketDraw({wid:'s3-slosher-bathtub'}),null);
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
