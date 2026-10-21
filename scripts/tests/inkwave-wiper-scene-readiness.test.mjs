import test from 'node:test';import assert from 'node:assert/strict';
import {awaitWiperSceneSources} from '../lib/inkwave-wiper-scene-readiness.mjs';
class NativeDummy {}
function fixture(){
 const scene={},a={},ch={_warmed:Promise.resolve()},o={status:'ready',bank:{},squidBank:{},ready:Promise.resolve(),character:ch};
 ch.sourceMotion=o;a.character=ch;
 const target={},dummy=new NativeDummy();target.character=dummy;target.rangeTarget={index:0};dummy.actor=target;dummy.root={parent:scene};
 return {actors:[a,target],local:a,scene,match:{range:{targets:[target]}}};
}
test('awaits actual source actor and explicitly verifies legitimate native target dummy',async()=>{
 const g=fixture(),r=await awaitWiperSceneSources(g,NativeDummy);
 assert.equal(r[0].kind,'source-motion-character');assert.equal(r[0].status,'ready');
 assert.equal(r[1].kind,'native-range-target-dummy');assert.equal(r[1].status,'native-no-rig');
});
for(const [name,mutate]of [
 ['missing actual loader',g=>delete g.local.character.sourceMotion.ready],
 ['wrong actual owner',g=>g.local.character.sourceMotion.character={}],
 ['failed source status',g=>g.local.character.sourceMotion.status='failed'],
 ['disposed source owner',g=>g.local.character.sourceMotion.disposed=true],
 ['missing source bank',g=>delete g.local.character.sourceMotion.squidBank],
 ['unregistered dummy',g=>g.match.range.targets=[]],
 ['wrong dummy index',g=>g.actors[1].rangeTarget.index=1],
 ['wrong dummy backref',g=>g.actors[1].character.actor={}],
 ['detached dummy',g=>g.actors[1].character.root.parent=null],
 ['lookalike nonclass dummy',g=>g.actors[1].character={...g.actors[1].character}],
 ['dummy becomes local',g=>g.local=g.actors[1]],
 ['unexpected dummy source owner',g=>g.actors[1].character.sourceMotion={}],
])test('rejects '+name,async()=>{const g=fixture();mutate(g);await assert.rejects(awaitWiperSceneSources(g,NativeDummy));});
