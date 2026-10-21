import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './source-fixture.mjs';
import { specialVfxDirector } from '../runtime/special-vfx.mjs';

test('production-composed Inkjet FX emits 120 nozzle glows/sec at 30/60/120 Hz without authoring gameplay', async () => {
  const f = await fixture({ fullRuntime: true, productionComposition: true, realProjectiles: true });
  const { G, THREE } = f, api=f.installedRuntime;
  G.scene=new THREE.Scene();G.projectiles=new api.Projectiles(G.scene);
  const fx=new api.FX(G.scene,{quality:'high'});fx.setCollider(()=>null);G.fx=fx;
  G.camera=new THREE.PerspectiveCamera(60,1,.1,300);G.camera.position.set(0,4,-8);G.camera.updateMatrixWorld(true);
  G.physics={los:()=>true,raycast:(from,dir,max,h)=>{h.hit=false;return h;},segment:(from,to,h)=>{h.hit=false;return h;}};
  const d=specialVfxDirector(fx);
  try {
    for(const hz of [30,60,120]){
      const a=f.make('shooter');a.isLocal=true;a.pos.set(0,2,0);a.form='kid';
      a.weapon={...a.weapon,special:'inkjet',specialCost:200};a.special=200;
      a._startSpecial();d.track(a);
      const original=d.spark;let glows=0;
      d.spark=function(...args){glows++;return original.apply(this,args);};
      const before={pos:a.pos.toArray(),hp:a.hp,special:a.special,seed:a._s3AllSpecialState.seed,t:a._s3AllSpecialState.t};
      let paint=0,hits=0,events=0;
      G.paint={splat(){paint++;return 0;}};
      const applyHit=G.projectiles.applyHit;G.projectiles.applyHit=()=>{hits++;};
      const off=f.on('all:special',()=>events++);
      try {
        for(let i=0;i<hz*2;i++){G.time+=1/hz;fx.update(1/hz,G.camera);}
        assert.equal(glows,240,hz+'Hz glows over two seconds');
        assert.deepEqual({pos:a.pos.toArray(),hp:a.hp,special:a.special,seed:a._s3AllSpecialState.seed,t:a._s3AllSpecialState.t},before);
        assert.deepEqual({paint,hits,events},{paint:0,hits:0,events:0});
        a.form='squid';a.intent.squid=true;const prior=glows;
        fx.update(.1,G.camera);assert.equal(glows,prior,'submerged exhaust stops');
      } finally {off?.();d.spark=original;G.projectiles.applyHit=applyHit;}
      fx.clear();G.projectiles.clear();G.actors.length=0;
    }
  } finally {fx.dispose?.();f.reset?.();}
});
