// Intentionally limited native birth subset. Input must come from private accepted-birth owner,
// never by a packet callback, public actor metadata, or a synthetic receipt.
import {classifyAnyAim} from './torpedo-launch-set.mjs';
export function eligibleLimitedTorpedoBirth({receipt,snapshot,event,spec,speed,normalMoveTarget}){
 if(receipt?.subId!=='torpedo'||event?.phase!=='spawn'||event.subId!=='torpedo'||
   receipt.life!==event.life||receipt.life!==event.sourceLife||receipt.serial!==event.seq||
   snapshot?.t!==receipt.packetTime||snapshot.life!==receipt.life||
   ![snapshot.vx,snapshot.vy,snapshot.vz,normalMoveTarget,speed,event.x,event.y,event.z,event.vx,event.vy,event.vz].every(Number.isFinite)||
   !(normalMoveTarget>0)||speed<spec.throwSpeedTiers.low||speed>spec.throwSpeedTiers.high)return false;
 const h=Math.hypot(snapshot.vx,snapshot.vz);
 // This deliberately incomplete subset is NOT a claim about all legal motion.
 if(h>normalMoveTarget)return false;
 if(!Array.isArray(receipt.pose)||receipt.pose.length!==3||!receipt.pose.every(Number.isFinite)||
   Math.hypot(event.x-receipt.pose[0],event.y-receipt.pose[1],event.z-receipt.pose[2])>7.5)return false;
 // Independent of aim and of exact birth-time actor pose. Existing quantizer only.
 const H=Math.hypot(Math.abs(snapshot.vx)+.005,Math.abs(snapshot.vz)+.005);
 return classifyAnyAim({x:event.vx,y:event.vy,z:event.vz},spec,speed,H)==='compatible-not-authorized';
}
