// Focused PR1604 + Clam v4a acceptance. Actual Actor intent, installed ranked
// input/rule/event path, and real bomb emission; no 66-case steady-pose rerun.
import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceLoadedActorFixture} from './source-loaded-actor-fixture.mjs';
import {RankedWorld} from '../runtime/ranked/world.mjs';

const DT=1/60, STAGE={id:'clam-swim-boundary',clams:{spawns:[],goals:[[0,0,80],[0,0,-80]]}};
const clean=x=>JSON.parse(JSON.stringify(x));
const registry=ch=>ch[Symbol.for('inkwave.s3.bomb-motion.install.v1')].states.get(ch);
function snapshot(a){return {
  pos:a.pos.toArray(),vel:a.vel.toArray(),ink:a.ink,hp:a.hp,alive:a.alive,form:a.form,animForm:a.anim.form,
  submerged:a.submerged,fireBuffer:a.fireBuffer,weapon:a.weapon.id,
  P:Array.from(a.character.P),timers:Array.from(a.character.tr),springs:Array.from(a.character.sp),ik:Array.from(a.character.ikErr),
};}
function muzzle(f,a){const p=new f.THREE.Vector3(),d=new f.THREE.Vector3();
  f.G.projectiles._muzzle(a,p);f.G.projectiles._aimFrom(a,p,d);
  const left=f.G.projectiles._muzzleHand(a,1,new f.THREE.Vector3());
  return {main:p.toArray(),aim:d.toArray(),left:left.toArray()};
}

for(const source of [false,true])test(`clam release survives actual dive/return, duplicate and drop boundaries without changing main shots or ordinary bombs (${source?'loaded Player00':'native'})`,async t=>{
  const f=await sourceLoadedActorFixture({random:()=>.5}),rows=[];
  class NativeCharacter extends f.Character{constructor(options){super({...options,sourceMotion:false});}}
  for(const scenario of ['quick-return','full-dive','duplicate-drop','late-dive']){
    const pair=[];
    for(let lane=0;lane<2;lane++){
      const a=source?await f.make():new f.Actor({team:0,name:'clam-swim-boundary',isLocal:true,weapon:'shooter',CharacterClass:NativeCharacter,style:{hair:0,skin:2,outfit:0,eyes:0}});
      a.nid=1;a.character.actor=a;a.character.onEvent=null;
      a.pos.set(0,0,0);a.grounded=a.ground.hit=true;a.ground.block=0;a.groundN.set(0,1,0);a.aimDir.set(0,0,1);a.aimPoint.set(0,1,20);
      if(!source){f.G.actors.push(a);f.G.scene.add(a.character.root);}
      const ranked=new f.RankedEngine('clams',STAGE),m={mode:'clams',state:'playing',ranked,actors:[a],playing:()=>true,canRespawn:()=>false,rankedGains:[0,0],rankedBarrierHits:[],rankedEffects:{event(){},update(){}}};
      m.playRankedEvents=(events,...rest)=>{pair[lane].events.push(...clean(events));return f.Match.prototype.playRankedEvents.call(m,events,...rest);};
      const world=m.rankedWorld=new RankedWorld(f,m,STAGE);
      const present=world.presentEvent.bind(world);
      // Same rule/input path in both lanes; only successful throw-arm delivery
      // is omitted for the control. Clam meshes and state run identically.
      if(lane===0)world.presentEvent=e=>{if(e.kind!=='clam-throw')present(e);};
      pair.push({a,m,world,events:[],calls:0});
      const trigger=a.character.trigger;
      a.character.trigger=function(name,...args){if(name==='clam-throw')pair[lane].calls++;return trigger.call(this,name,...args);};
    }
    const [control,shown]=pair;f.G.actors=pair.map(x=>x.a);
    const tick=()=>{f.G.time+=DT;for(const p of pair){f.G.match=p.m;p.a.update(DT);f.Match.prototype.advanceRanked.call(p.m,DT);}};
    for(let i=0;i<45;i++)tick();
    for(const p of pair){p.m.ranked.rule.state.inventories['1']={team:0,small:0,power:true};p.a.intent.throw=true;}
    tick();
    assert.equal(shown.calls,1,'One real success reaches the arm');
    assert.equal(shown.a.character.s3ClamGripActive,true);
    assert.deepEqual(clean(control.m.ranked.snapshot()),clean(shown.m.ranked.snapshot()));
    const success=shown.events.find(e=>e.kind==='clam-throw');assert.ok(success);
    let sawSwim=false,sawReturn=false,sawDrop=false,bombCount=0;
    const previousThrow=f.G.projectiles.throwBomb;
    const bombs=[];
    f.G.projectiles.throwBomb=function(a){const before=this.bombs.length;const result=previousThrow.call(this,a);for(const b of this.bombs.slice(before))bombs.push({actor:a,kind:b.kind,pos:b.pos.toArray(),vel:b.vel.toArray()});return result;};
    const diveFrame=scenario==='late-dive'?3:1;
    const returnFrame=scenario==='full-dive'?10:diveFrame+1;
    const subStart=returnFrame+1,subEnd=returnFrame+4;
    for(let i=1;i<=60;i++){
      if(scenario==='duplicate-drop'&&i===1){
        const before=registry(shown.a.character).clamGrip.elapsed;
        f.G.match=shown.m;shown.m.playRankedEvents([success,success]);
        assert.equal(shown.calls,1);assert.equal(registry(shown.a.character).clamGrip.elapsed,before,'Duplicate cannot restart the elapsed clock');
      }
      if(scenario==='duplicate-drop'&&i===2){
        for(const p of pair){p.m.ranked.rule.state.inventories['1']={team:0,small:3,power:true};f.G.match=p.m;f.emit('special:slam',{actor:p.a,pos:p.a.pos.clone(),radius:1});}
      }
      for(const p of pair){p.a.intent.squid=i>=diveFrame&&i<returnFrame;p.a.intent.sub=i>=subStart&&i<subEnd;p.a.intent.fire=i>=subEnd+2&&i<subEnd+8;}
      tick();
      sawSwim||=shown.a.anim.form==='swim';sawReturn||=i>=returnFrame&&shown.a.form==='kid';
      assert.deepEqual(snapshot(control.a),snapshot(shown.a),`${scenario} tick${i}: actual Actor/native pose state`);
      assert.deepEqual(muzzle(f,control.a),muzzle(f,shown.a),`${scenario} tick${i}: actual main/alternate muzzle and aim`);
      assert.deepEqual(clean(control.m.ranked.snapshot()),clean(shown.m.ranked.snapshot()),`${scenario} tick${i}: real ranked rule state`);
      if(i>=subStart)assert.equal(shown.a.character.s3ClamGripActive,false,'Ordinary sub admission retires the bounded visual overlay');
      if(i===returnFrame){
        f.G.match=shown.m;shown.m.playRankedEvents([success]);assert.equal(shown.calls,1,'Stale duplicate cannot resurrect after return');
      }
      if(scenario==='duplicate-drop'&&i===2){sawDrop=shown.events.some(e=>e.kind==='clam-drop');assert.ok(sawDrop);assert.equal(shown.calls,1,'Drop never triggers a throw animation');}
    }
    const by=a=>bombs.filter(b=>b.actor===a).map(({actor,...b})=>b);
    assert.ok(by(control.a).length>0,'Actual sub hold/release creates an ordinary bomb');
    t.diagnostic(JSON.stringify({scenario,source,bombsControl:by(control.a),bombsShown:by(shown.a)}));
    assert.deepEqual(by(control.a),by(shown.a),`${scenario}: actual ordinary bomb position and velocity remain exact through source return`);
    bombCount=by(shown.a).length;assert.ok(sawSwim&&sawReturn);
    assert.equal(shown.calls,1);assert.equal(registry(shown.a.character).clamGrip,null);
    rows.push({scenario,source,ticks:60,sawSwim,sawReturn,sawDrop,throwArmCalls:shown.calls,bombCount,muzzleDifference:0});
    f.G.projectiles.throwBomb=previousThrow;
    for(const p of pair)p.world.dispose();f.reset();
  }
  t.diagnostic(JSON.stringify(rows));
});
