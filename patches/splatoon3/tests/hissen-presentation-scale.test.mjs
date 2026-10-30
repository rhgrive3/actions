import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';

const extraExports = `
export {submitInkVolume} from './patches/local-quality/ink-volume/recipes.mjs';
export {projectileDrawRadius,projectileVisualWidth,projectilePresentationScale,sharedBucketTailLength,ProjectileHistory,ProjectileVisualRuntime} from './patches/splatoon3/runtime/projectile-visuals.mjs';
export {appendSourcedSplashVisuals} from './patches/splatoon3/runtime/projectile-presentation.mjs';`;
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function snapshot(p) {return JSON.stringify({pos:p.pos,vel:p.vel,age:p.age,seed:p.seed,damage:p.damage,radius:p.radius,size:p.size,vis:p.vis,ink:p.owner.ink,catalog:p.catalog?.descriptor,draw:p.fidelitySloshDraw});}

test('all Hissen kits enlarge every native airborne lobe in full and contour rendering, without touching source/gameplay',async()=>{
  const f=await fixture({fullRuntime:true,productionComposition:true,realProjectiles:true,extraExports});
  f.G.physics.segment=(_a,_b,h)=>{h.hit=false;return h;};
  for(const id of ['s3-slosher-diffusion','s3-slosher-diffusion-01','s3-slosher-diffusion-02','slosher','s3-slosher-double']) {
    f.G.projectiles.clear();
    const a=f.make(id);a.pos.set(0,2,0);a.intent.fire=true;a.aimDir.set(0,0,1);a.aimPoint.set(0,3,50);
    for(let i=0;i<60;i++){f.tick(a);f.G.projectiles.update(1/60);if(f.G.projectiles.list.some(p=>p.age>0))break;}
    a.intent.fire=false;
    const rounds=f.G.projectiles.list.filter(p=>p.delay<=0&&f.projectileDrawRadius(p)>0);assert(rounds.length>0,id);
    for(const p of rounds) {
      const before=snapshot(p),factor=id.startsWith('s3-slosher-diffusion')?1.5:1;
      assert.equal(f.projectilePresentationScale(p),factor);
      for(const tier of ['full','contour']) {
        let part;
        const assets=new Map(tier==='full'?[[p._inkVolumeAssetName,{}],['roller',{}]]:[['hissen-fallback',{}]]);
        if(tier==='contour'&&factor===1)continue;
        const engine={assets,metrics:{active:0},submitComposite:(_p,parts)=>{part=parts[0];return true;}};
        assert.equal(f.submitInkVolume(engine,p),true);
        const radius=f.projectileDrawRadius(p),width=radius*2*.5,tail=f.sharedBucketTailLength(p,p.vel.length());
        close(part.stretch.x,width*factor);close(part.stretch.z,width*.32*factor);
        if(tail!==null){close(part.stretch.y,(width+tail)*factor);close(part.position.distanceTo(p.pos),tail*.5*factor);}
      }
      assert.equal(snapshot(p),before);
    }
  }
});
test('Hissen falling child matrices grow 50%; paint footprints, headings and other weapons remain unchanged',async()=>{
  const f=await fixture({productionComposition:true,extraExports}),T=f.THREE;
  const child={owner:{color:new T.Color('red')},pos:new T.Vector3(1,2,3),vel:new T.Vector3(0,-4,0),radius:3,drawRadius:.3,dirX:1,dirZ:0,seed:.2};
  for(const actor of ['WeaponSlosherDiffusion','WeaponSlosherDouble','WeaponSlosherStrong','WeaponShooterNormal']) {
    child.sourceActor=actor;const before=JSON.stringify(child),matrices=[];
    const mesh={setMatrixAt:(_i,m)=>matrices.push(m.clone()),setColorAt:()=>{}};
    const n=f.appendSourcedSplashVisuals({_s3SplashDrops:[child]},mesh,new Float32Array(4),new Float32Array(4),new Float32Array(2),0,48,new T.Matrix4(),new T.Quaternion(),new T.Vector3(),new T.Vector3(),new T.Vector3(0,0,1));
    assert.equal(n,1);const scale=new T.Vector3(),position=new T.Vector3(),rotation=new T.Quaternion();matrices[0].decompose(position,rotation,scale);
    const expected=actor==='WeaponSlosherDiffusion'?.225:actor==='WeaponSlosherDouble'||actor==='WeaponSlosherStrong'?.15:.3;
    for(const v of scale.toArray())close(v,expected);
    assert.deepEqual(position.toArray(),child.pos.toArray());assert.equal(JSON.stringify(child),before);
  }
});
test('history fallback enlarges length, width and thickness about the same projectile head',async t=>{
  const f=await fixture({productionComposition:true,extraExports}),T=f.THREE;
  const system={scene:new T.Scene(),list:[]},renderer=new f.ProjectileVisualRuntime(system,T);t.after(()=>renderer.dispose());
  const h=new f.ProjectileHistory();h.record(0,0,0,0,2,1,10);h.record(.1,.2,.1,1,2,1,10);
  const p={wid:'s3-slosher-diffusion',catalog:{r:{sourceActor:'WeaponSlosherDiffusion'},descriptor:{unit:0,index:0,key:'slosh'}},
    _iwVisualKind:'bucket-front',_iwVisualHistory:h,age:.1,delay:0,seed:.2,owner:{color:new T.Color('red')}};
  const radius=f.projectileVisualWidth(p)/1.5;
  renderer.bodies=0;renderer._body(h,.1-5/60,.1,radius,'bucket-front',1,0,0,.2);
  const control=Array.from(renderer.position.array.slice(0,renderer.bodies*13*12*3));
  renderer.bodies=0;renderer._drawRound(p,1);
  assert.equal(renderer.bodies,1);
  // Check every emitted coordinate, including tail displacement, rather than
  // only a display helper's return value. History remains read-only.
  const head=[.2,.1,1];
  for(let i=0;i<control.length;i++)close(renderer.position.array[i],head[i%3]+(control[i]-head[i%3])*1.5);
  assert.equal(h.latestAge,.1);
});
