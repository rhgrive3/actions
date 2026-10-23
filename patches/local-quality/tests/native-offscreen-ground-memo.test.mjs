import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';

test('native source-motion bots reuse only identical ground queries within one update at 30/60/120Hz', async () => {
  const f = await sourceLoadedActorFixture({random:()=>.4, extraExports:`
    export {installQuality} from './patches/local-quality/install.mjs';
    export {NativeLevel} from './patches/native-stages/runtime/native-level.mjs';
    export {NativePhysics} from './patches/native-stages/runtime/native-physics.mjs';
    export {buildSourceBVH} from './patches/native-stages/runtime/source-convert.mjs';
  `});
  f.installQuality(JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json', import.meta.url))));
  const {G,THREE}=f;
  const counts=[];
  for (const hz of [30,60,120]) {
    const triangles=new Float32Array([-20,0,-20,-20,0,20,20,0,-20]);
    // One half of the chart is empty. Keep a real dynamic box over its hole.
    G.level=new f.NativeLevel({triangles,...f.buildSourceBVH(triangles),
      normals:new Float32Array([0,1,0]), flags:new Uint32Array([3]),
      objectIds:new Uint32Array([0]),triangleFace:new Int32Array([0]),mask:new Uint8Array(),
      manifest:{id:'memo-hole',bounds:{minX:-20,maxX:20,minZ:-20,maxZ:20},
        spawnPads:[[-15,0,-15],[15,0,15]],spawnBarrier:0,
        objects:[{collidable:true,bounds:[[-20,-.2,-20],[20,0,20]]}],
        faces:[{n:[0,1,0],u:[1,0,0],v:[0,0,1],origin:[-20,0,-20],su:40,sv:40,
          triangles:[0],bounds:[[-20,0,-20],[20,0,20]]}]}});
    G.level._addBlock({kind:'box',min:[.5,-.2,.5],max:[3,.1,3],paint:false,hidden:true});
    G.physics=new f.NativePhysics(G.level);
    G.match={state:'playing',opts:{},local:null};
    G.renderer={info:{render:{frame:100}},getRenderTarget:()=>null};
    const pair=[await f.make(),await f.make()];
    const nativeGround=pair[1].character._ground;
    pair[1].character._ground=function(...args){
      const active=this._oobGroundMemoActive;this._oobGroundMemoActive=false;
      try{return nativeGround.apply(this,args);}finally{this._oobGroundMemoActive=active;}
    };
    const ray=G.physics.raycast;let calls=0;
    G.physics.raycast=function(...args){calls++;return ray.apply(this,args);};
    const totals=[0,0];
    for(const a of pair){a.isLocal=false;a.isBot=true;const c=a.character;
      c.isLocal=false;c.lod.force=-1;c._camFrame=0;c.phys=G.physics;}
    const state={isBot:true,form:'kid',grounded:true,speed:1,vy:0,localMove:{x:0,z:1},ink:1,hp:1};
    for(let frame=0;frame<hz;frame++){
      G.time=(frame+1)/hz;
      // The platform changes between updates. No result may survive a tick.
      G.level.blocks.at(-1).center.y=-.05+.025*Math.sin(frame);
      for(let side=0;side<2;side++){
        const c=pair[side].character;
        c.root.position.set(frame<hz/2?-1:1,.2,frame<hz/2?-1:1);
        const before=calls;
        c.update(1/hz,state);c.root.updateMatrixWorld(true);c.skeleton.update();
        totals[side]+=calls-before;
        assert.equal(c._oobGroundMemoActive,false,'memo ends with the synchronous update');
        assert.equal(c._oobGroundMemo?.length??0,0,'no retained tick results');
      }
      const snap=a=>{const c=a.character;return JSON.stringify({
        bones:c.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.matrixWorld.elements]),
        skin:Array.from(c.skeleton.boneMatrices),muzzle:c.getMuzzle(new THREE.Vector3()).toArray(),
        contacts:c.sourceMotion.retarget.contacts.map(p=>({anchor:p.anchor.toArray(),normal:p.normal.toArray(),locked:p.locked}))});};
      assert.equal(snap(pair[0]),snap(pair[1]),`${hz}Hz frame ${frame}: full pose, support and muzzle`);
    }
    const hits=pair[0].character._oobGroundMemoHits;
    assert.ok(hits>0,'actual source contacts repeat queries');
    assert.equal(totals[1]-totals[0],hits,'each avoided native ray is accounted for');
    counts.push({hz,candidate:totals[0],control:totals[1],memoHits:hits});
    for(const a of pair){G.scene.remove(a.character.root);a.character.dispose();}
    G.actors=[];
  }
  console.log(JSON.stringify({scope:'source-motion/native triangle and dynamic physics; query counts, not device FPS',counts}));
});
