import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './source-fixture.mjs';

// #1431: a native hit reaction has separate gameplay and displayed muzzles.
// Real Actor -> Runner -> Character, fixed clock, OBB physics and projectile
// serializer. This tests INKWAVE's presentation/authority split, not retail
// aperture or Nintendo animation calibration.
const extraExports = "export {NetMatch} from './src/net/netmatch.js'; export {installCatalogPoseBirth} from './patches/splatoon3/runtime/catalog-pose-birth.mjs';";
const plain = value => JSON.parse(JSON.stringify(value));
const distance = (a,b) => Math.hypot(...a.map((v,i)=>v-b[i]));

let worldPromise;
const world=()=>worldPromise??=createWorld();
async function createWorld() {
  const f=await fixture({productionComposition:true,fullRuntime:true,
    includeCharacter:true,realProjectiles:true,vmMathRandom:()=>.5,extraExports});
  const {G,THREE}=f;
  G.scene=new THREE.Scene();G.teamColors=[new THREE.Color('#ff8825'),new THREE.Color('#484ce8')];
  G.match={playing:()=>true,canRespawn:()=>false};
  G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},
    spawnPads:[[-20,0,-20],[20,0,20]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-30,-1,-30],max:[30,0,30]}]});
  G.physics=new f.Physics(G.level);G.paint={sample:()=>1,splat:()=>0};
  G.projectiles=new f.Projectiles(G.scene);G.actors=[];G.time=0;
  return f;
}

function run(f,{id,hz,pitch=0,hand=0,wall=false,connection=true}) {
  const {G,THREE}=f;G.time=0;G.actors=[];G.projectiles.clear();
  G.level=new f.Level({bounds:{minX:-30,maxX:30,minZ:-30,maxZ:30},
    spawnPads:[[-20,0,-20],[20,0,20]],spawnBarrier:0,half:[],
    single:[{kind:'box',min:[-30,-1,-30],max:[30,0,30]},
      ...(wall?[{kind:'box',min:[-4,0,.04],max:[4,4,.06]}]:[])]});
  G.physics=new f.Physics(G.level);
  const a=new f.Actor({team:0,weapon:id,isLocal:true,CharacterClass:f.Character,
    style:{hair:0,skin:2,outfit:0,eyes:0}});
  a.nid=7;a.character.actor=a;a.character.onEvent=null;
  G.scene.add(a.character.root);G.actors=[a];
  a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);
  a.aimPitch=pitch*Math.PI/180;a.aimYaw=a.yaw=0;
  a.aimDir.set(0,Math.sin(a.aimPitch),Math.cos(a.aimPitch));
  a.aimPoint.copy(a.pos).add(new THREE.Vector3(0,1.05,0)).addScaledVector(a.aimDir,80);
  a.weaponRunner.hand=hand^1;
  const ps=G.projectiles,fx=[],paint=[],births=[],physical=[],clock=new f.FixedClock();
  G.paint.splat=(at,radius,team,opts)=>{paint.push({at:at.toArray(),radius,team,owner:opts?.claimOwner?.nid});return 0;};
  G.fx=new Proxy({muzzle:at=>fx.push(at.toArray())},{get:(t,k)=>k in t?t[k]:()=>{}});
  // Disable only this round's optional display connection. All source/runtime
  // physics and event owners remain live for the authority comparison.
  const tag=Symbol.for('inkwave.s3.catalog-pose-birth.v1');
  const resolve=f.Actor.prototype[tag].resolve,finish=a._finishFrame;
  if(!connection)a._finishFrame=function(...args){resolve(this,false);return finish.apply(this,args);};
  const acquire=ps._new,created=[];ps._new=function(...args){const p=acquire.apply(this,args);created.push(p);return p;};
  let tick=0;
  try{
    for(let frame=0;frame<hz*2;frame++)clock.advance(1/hz,dt=>{
      a.intent.fire=tick>=30&&tick<110;a.ink=100;
      // Keep an actual native hit reaction active at first and steady births.
      if(tick>=30&&tick%6===0)a.character.trigger('hit',{x:.4,z:1,amount:1});
      G.time+=dt;created.length=0;const fxStart=fx.length;a.update(dt);
      a.character.root.updateMatrixWorld(true);
      for(const p of created)if(p.catalog?.r.id===id){
        const h=id==='s3-maneuver-stepper'?a.weaponRunner.hand:null;
        const socket=h===1?a.character.weapon.left.muzzle:a.character.weapon.muzzle;
        const shown=socket.getWorldPosition(new THREE.Vector3());
        const game=h===null?a.character.getMuzzle(new THREE.Vector3()):a.character.getMuzzleHand(new THREE.Vector3(),h);
        let packet;f.NetMatch.prototype.recProj.call({_rec:row=>packet=[0,...row,0,1],cfg:{id:'hit-pose-birth'}},p);
        physical.push({tick,start:p.start.toArray(),pos:p.pos.toArray(),prev:p.prev.toArray(),vel:p.vel.toArray(),
          damage:p.damage,seed:p.seed,ink:a.ink,meta:plain(p.inkMeta),packet:plain(packet)});
        births.push({tick,hand:h,shown:shown.toArray(),game:game.toArray(),start:p.start.toArray(),
          fx:fx.slice(fxStart),offset:p._s3PoseBirthOffset?{...p._s3PoseBirthOffset}:null});
      }
      ps.update(dt);tick++;
    });
    return plain({births,physical,paint,pos:a.pos.toArray(),vel:a.vel.toArray()});
  }finally{ps._new=acquire;a.character.dispose();G.actors=[];ps.clear();}
}

test('#1431 hit reactions attach first/steady Quad left/right and Explosher FX to the displayed socket at fixed render schedules',async()=>{
  const f=await world(),proof=[];
  for(const id of ['s3-maneuver-stepper','s3-slosher-washtub'])for(const hand of id==='s3-maneuver-stepper'?[0,1]:[0])for(const pitch of [-45,0,40]){
    let baseline;
    for(const hz of [30,60,120]){
      const got=run(f,{id,hand,pitch,hz}),control=run(f,{id,hand,pitch,hz,connection:false});
      assert.ok(got.births.length>=2,'first and steady actual emissions');
      assert.deepEqual(got.physical,control.physical,'connection changes no birth, velocity, damage, RNG, ink or serialized packet');
      assert.deepEqual(got.paint,control.paint,'connection changes no authoritative contact paint');
      assert.deepEqual(got.pos,control.pos);assert.deepEqual(got.vel,control.vel);
      let split=0,connected=0,maxFormerGap=0;
      for(const b of got.births){
        if(!b.offset)continue; // intentional prediction/LOS fallback remains physical
        assert.equal(b.fx.length,1);
        assert.ok(distance(b.fx[0],b.shown)<1e-9,'FX reaches actual displayed socket '+JSON.stringify({id,pitch,hz,b}));
        assert.ok(distance(b.start.map((v,i)=>v+[b.offset.x,b.offset.y,b.offset.z][i]),b.shown)<1e-9,'drawn birth shares the displayed endpoint');
        const gap=distance(b.game,b.shown);maxFormerGap=Math.max(maxFormerGap,gap);if(gap>1e-4)split++;connected++;
      }
      assert.ok(connected>1,'real same-tick connections observed');
      assert.ok(split>0,'negative control: gameplay getter measurably differs from the drawn mesh');
      if(baseline)assert.deepEqual(got,baseline,'same authoritative and displayed traces at each render cadence');else baseline=got;
      proof.push({id,hand,pitch,hz,births:got.births.length,connected,split,maxFormerGap});
    }
  }
  console.log(JSON.stringify({hitPoseBirth:proof}));
});

test('#1431 hit reaction never connects a chest/LOS fallback birth through cover',async()=>{
  const f=await world();
  for(const id of ['s3-maneuver-stepper','s3-slosher-washtub']){
    const got=run(f,{id,hz:60,wall:true});
    assert.ok(got.births.length>0);
    for(const b of got.births){assert.equal(b.offset,null);assert.equal(b.fx.length,1);assert.ok(distance(b.fx[0],b.start)<1e-12);}
  }
});

test('#1431 displayed connection checks the final LOS margin against real solid OBBs and ignores grates',async()=>{
  const f=await world(),{G,THREE}=f;
  for(const grate of [false,true]){
    const block={id:0,solid:true,grate,center:new THREE.Vector3(0,1,.185),half:new THREE.Vector3(1,1,.005),
      axes:[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],faces:[-1,-1,-1,-1,-1,-1]};
    G.level={blocks:[block],faces:[],queryBlocks:(_a,_b,_c,_d,out)=>{out.length=0;out.push(0);return out;}};
    G.physics=new f.Physics(G.level);
    const start=new THREE.Vector3(0,1,0),end=new THREE.Vector3(0,1,.2),node=new THREE.Object3D();node.position.copy(start);
    const fx=[];G.fx={muzzle:at=>fx.push(at.toArray())};G.time=0;
    let api,p;
    class Actor{
      constructor(){this.alive=true;this.character={weapon:{muzzle:node},getMuzzle:out=>node.getWorldPosition(out)};}
      update(){api.begin(this,null,start,null);p={owner:this,seed:.5,delay:0};api.attach(p,start);api.commit(this,start,new THREE.Vector3(0,0,1),null,'shooter',true);this._finishFrame();}
      _finishFrame(){node.position.copy(end);}
    }
    api=f.installCatalogPoseBirth({Actor,THREE,G,Hit:f.Hit});
    assert.equal(G.physics.los(start,end),true,'old endpoint-trimmed LOS misses the final wall sliver');
    assert.equal(G.physics.segment(start,end,new f.Hit(),true).hit,!grate,'real full segment distinguishes solid/grate');
    const a=new Actor();a.update();
    if(grate){assert.ok(p._s3PoseBirthOffset);assert.deepEqual(fx,[end.toArray()]);}
    else{assert.equal(p._s3PoseBirthOffset??null,null);assert.deepEqual(fx,[start.toArray()]);}
  }
});
