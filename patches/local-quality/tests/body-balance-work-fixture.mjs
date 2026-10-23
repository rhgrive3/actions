import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
export const balanceRel='src/game/motion/body-balance.js';
export const balanceBefore=fs.readFileSync(new URL('./fixtures/motion-balance/body-balance-26a4db41.js.txt',import.meta.url),'utf8');
if(createHash('sha256').update(balanceBefore).digest('hex')!=='c5d204af3e91dcb544941eaa2c0da9ffb920087866d4c3571aee484a2e896a9e')throw Error('Immutable main26a4 BodyBalance fixture changed');
export const baselineBalanceSource=(rel,raw)=>adaptBuildSource(rel,rel===balanceRel?balanceBefore:raw);
export function poseSnapshot(p){return p&&{p:p.p.map(v=>v.toArray()),q:p.q.map(v=>v.toArray()),s:p.s.map(v=>v.toArray()),world:p.world.map(m=>[...m.elements]),wp:p.wp.map(v=>v.toArray()),wq:p.wq.map(v=>v.toArray()),flags:[...p.flags]};}
export function characterSnapshot(ch){
 const c=ch.sourceMotion;
 return {pose:poseSnapshot(c.pose),body:poseSnapshot(c.bodyPose),
  bones:ch.boneList.map(b=>[...b.position.toArray(),...b.quaternion.toArray(),...b.scale.toArray(),...b.matrixWorld.elements]),
  skeleton:Array.from(ch.skeleton.boneMatrices),
  gait:c.gaitTargets.indices.map(i=>[...c.gaitTargets.wp[i].toArray(),...c.gaitTargets.wq[i].toArray()]),
  contact:[...c.contact],lift:[...c.lift],
  muzzle:ch.getMuzzle(new ch.root.position.constructor()).toArray(),
  contacts:c.retarget.contacts.map(f=>({locked:f.locked,anchor:f.anchor.toArray(),actual:f.actual.toArray(),slip:f.slip,clearance:f.lastClearance}))};
}
