import {nativeSourceFootSupported} from './native-bot-support.mjs';
const pending=new WeakMap();

/** Keep an admitted ordinary source jump held through ascent. The existing
 * Actor owns launch, the hold/release profile, collision and landing. */
export function nativeOrdinaryJumpInput(brain,G){
 const a=brain.a,it=a.intent,N=G.nav,path=brain.path,node=path?.[brain.pi];
 if(!G.level?.native||!a.alive||brain.target||a.form!=='kid'||a.climbing||a.superJumpState||a.specialActive||!path||brain.pi<=0||N?.edgeType(path[brain.pi-1],node)!=='jump'){
  pending.delete(brain);return;
 }
 const serial=a.s3JumpSerial||0,state=pending.get(brain);
 if(state){
  if(state.path!==path||state.node!==node||state.mode!==brain.mode||state.level!==G.level||state.nav!==N||state.match!==G.match||serial!==state.serial+1||a.grounded||!(a.vel.y>0))pending.delete(brain);
  else {it.jump=true;return;}
 }
 // Observe a press the normal BotBrain already requested. Never create a
 // launch, extend an unrelated airborne impulse or hold a failed admission.
 if(it.jump&&a.grounded&&nativeSourceFootSupported(G,a,N.nodes[path[brain.pi-1]]))pending.set(brain,{path,node,serial,mode:brain.mode,level:G.level,nav:N,match:G.match});
}
