import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../patches/network-replication/tests/robustness-fixture.mjs';

test('actual native remote sampler can restore a retained pre-placement sample after the QA buffer clear',async()=>{
 const f=await fixture({productionComposition:true});
 f.G.physics.groundProbe=(_x,y,_z,_up,_down,_r,out)=>{out.hit=true;out.y=y;out.normal.set(0,1,0);return out;};
 class Visual {
  constructor(){this.root=new f.THREE.Object3D();this.s3HitSpawnMotionEnabled=false;}
  _owner(){return null;} setWeapon(){} setVisible(v){this.root.visible=v;} setHurt(){} trigger(){} update(){}
 }
 const a=new f.Actor({team:0,name:'victim',weapon:'shooter',isLocal:false,CharacterClass:Visual});
 a.nid=0;a.owner='p2';a.remote=true;a.isBot=false;
 a.spawnAt(new f.THREE.Vector3(.91,6.7,-38.58),0);
 const nm=f.makeNetMatch(f.makeSession());f.bind(nm,[a]);
 f.G.match=nm.match;f.G.actors=[a];
 f.clock.set(1000);
 f.tick(nm,'p2',999.8,{a:[f.packActor(a,{f:1|16})],l:{0:a.netLife}});
 nm.update(1/60);nm.applyRemote(a,1/60);
 assert.equal(a.net.ready,true);assert.equal(a.grounded,true);assert.equal(a.form,'kid');
 const previous={pos:a.pos.toArray(),life:a.netLife,cur:a.net.cur};
 a.spawnAt(new f.THREE.Vector3(12.5,0,2),0);
 a.invuln=0;a.grounded=true;a.kidT=99;a.ink=100;a.intent.move.set(0,0,0);
 for(const k of ['fire','jump','squid','sub','special']){a.intent[k]=false;a._prevIntent[k]=false;}
 a.net.buf.length=0;
 assert.deepEqual(Array.from(a.pos.toArray()),[12.5,0,2]);
 assert.equal(a.net.ready,true);assert.equal(a.net.cur,previous.cur);
 assert.equal(a.netLife,previous.life+1);
 nm.update(1/60);
 assert.equal(a.net.buf.length,0);assert.equal(a.net.cur,previous.cur);
 nm.applyRemote(a,1/60);
 assert.deepEqual(a.pos.toArray(),previous.pos);
 assert.equal(a.netLife,previous.life);
});
