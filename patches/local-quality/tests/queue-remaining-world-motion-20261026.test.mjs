import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceLoadedActorFixture} from '../../splatoon3/tests/source-loaded-actor-fixture.mjs';
import {adaptRemainingWorld20261026,WORLD_DIRECT_PATHS} from '../queue-remaining-world-20261026-adapter.mjs';
const frozen=JSON.parse(fs.readFileSync(new URL('./fixtures/queue-remaining-world-before.json',import.meta.url)));
const baseline=(rel,source)=>frozen.modules[rel]?.source??source;
const candidate=(rel,source)=>WORLD_DIRECT_PATHS.includes(rel)?source:frozen.modules[rel]?adaptRemainingWorld20261026(rel,frozen.modules[rel].source):source;
const hash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
function pose(ch){
  ch.root.updateMatrixWorld(true);ch.skeleton.update();
  return structuredClone({bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),
    skeleton:[...ch.skeleton.boneMatrices],muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray(),
    contacts:ch.sourceMotion.retarget.contacts.map(f=>[f.locked,f.anchor.toArray(),f.support.toArray(),f.airLift]),
    gaze:ch.face?.verge,phase:ch.phase});
}
function meshes(ch){return structuredClone(ch.lodSets.map(set=>set?.list.map(m=>({name:m.name,cast:m.castShadow,receive:m.receiveShadow,
  mat:m.userData.iwMat,attributes:Object.fromEntries(Object.entries(m.geometry.attributes).map(([k,a])=>[k,[a.itemSize,a.normalized,hash(a.array)]])),
  index:m.geometry.index?hash(m.geometry.index.array):null,bind:[...m.bindMatrix.elements],inverse:[...m.bindMatrixInverse.elements]}))??null));}

test('Remaining world arithmetic preserves actual source-loaded poses and geometry at 30/60/120 Hz',async()=>{
  const randomCalls=[0,0],apis=await Promise.all([baseline,candidate].map((moduleTransform,i)=>sourceLoadedActorFixture({sourceOnly:true,moduleTransform,
    random:()=>{randomCalls[i]++;return .4;}})));
  let comparisons=0;
  try{
    for(const hz of [30,60,120]){
      const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);
      chars.forEach(ch=>{ch.onEvent=null;ch.setLod('hero');});
      for(const weapon of ['shooter','splatling','charger','slosher'])for(let frame=0;frame<18;frame++){
        const dt=frame===4?0:frame===9?.12:1/hz;
        chars.forEach((ch,i)=>{
          if(frame===0)ch.setWeapon(weapon);
          apis[i].G.time+=dt;ch.root.position.x+=dt*(frame%3);ch.root.position.z+=dt*3;
          ch.root.rotation.y+=frame%2?dt*.4:-dt*.3;
          if(frame===5)ch.trigger('jump');if(frame===13)ch.trigger('land');
          ch.update(dt,{form:'kid',grounded:frame<5||frame>=13,speed:3,localMove:{x:.2,z:1},ink:1,hp:1,
            firing:frame%4===0,aimPitch:.15,aimDist:frame<8?20:4,vy:frame<9?2:-2});
        });
        assert.deepEqual(pose(chars[1]),pose(chars[0]),`${hz}/${weapon}/${frame}`);comparisons++;
      }
      assert.deepEqual(meshes(chars[1]),meshes(chars[0]),'shared body geometry remains exact');
      apis.forEach(a=>a.reset());
    }
    assert.equal(randomCalls[1],randomCalls[0]);
    console.log(JSON.stringify({scope:'actual source-loaded Character transforms and mesh bytes; no device FPS claim',comparisons,randomCalls}));
  }finally{apis.forEach(a=>a.reset());}
});

test('quality changes retain same-part mesh identity and refresh geometry, bindings and callbacks exactly',async()=>{
  const apis=await Promise.all([baseline,candidate].map(moduleTransform=>sourceLoadedActorFixture({sourceOnly:true,moduleTransform,random:()=>.4})));
  try{
    const actors=await Promise.all(apis.map(a=>a.make())),chars=actors.map(a=>a.character);
    for(const ch of chars){ch.onEvent=null;for(const tier of ['hero','game','far'])ch.setLod(tier);ch._updateLod(0);}
    const initial=new Map(chars[1].lodSets.flatMap(s=>s.list.map(m=>[m.name,m])));
    for(const quality of ['medium','low','high','low','medium','high']){
      for(let i=0;i<2;i++){
        apis[i].G.settings.quality=quality;chars[i]._updateLod(0);
        for(const tier of ['hero','game','far'])chars[i].setLod(tier);
        chars[i].setLod('hero');chars[i].update(1/60,{form:'kid',grounded:true,speed:0,localMove:{x:0,z:0},ink:1,hp:1});
      }
      assert.deepEqual(meshes(chars[1]),meshes(chars[0]),quality+' human buffers and shadow flags');
      assert.deepEqual(pose(chars[1]),pose(chars[0]),quality+' skeleton/weapon/contact state');
      for(const set of chars[1].lodSets)for(const m of set.list){
        if(initial.has(m.name))assert.equal(m,initial.get(m.name),'stable node '+m.name);
        assert.equal(m.skeleton,chars[1].skeleton);assert.equal(m.parent,chars[1].kid);
        assert.equal(typeof m.onBeforeRender,'function');assert.equal(typeof m.onBeforeShadow,'function');
      }
      assert.ok(chars[1]._driveTierReuse.every(s=>s===null),'no older quality sets accumulate after all tiers refresh');
    }
  }finally{apis.forEach(a=>a.reset());}
});
