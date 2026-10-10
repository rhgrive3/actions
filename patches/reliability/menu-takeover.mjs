import { cancelStormPendingInput } from '../splatoon3/runtime/storm-effects.mjs';
const KEYS=['fire','sub','jump','special','squid'];
function held(c,key) {
 const i=c.input||{},m=i.mobile;
 if(key==='fire') return !!(i.mouse?.left || i.padValue?.(7)>.3 || m?.down?.('fire'));
 if(key==='sub') return !!(i.mouse?.right || i.down?.('KeyE') || i.padButton?.(5) || m?.down?.('sub'));
 if(key==='special') return !!(i.down?.('KeyF') || i.down?.('KeyQ') || i.padButton?.(3) || i.padButton?.(11) || m?.down?.('special'));
 if(key==='jump') return !!(i.down?.('Space') || i.padButton?.(0) || m?.down?.('jump'));
 return !!(i.down?.('ShiftLeft') || i.down?.('ShiftRight') || i.padValue?.(6)>.3 || m?.down?.('squid'));
}
export function cancelMenuGameplay(c, keys=KEYS) {
 const a=c.a;if(!a)return;
 const r=a.weaponRunner,blocked=c._menuGameplayRearm||(c._menuGameplayRearm=new Set());
 // Only revoke the live actions this menu actually interrupted. Unrelated
 // controls retain their existing menu/navigation ownership.
 for(const key of keys)if(a.intent?.[key]||a._prevIntent?.[key]||(keys!==KEYS&&held(c,key)))blocked.add(key);
 if(r?.charging||r?.streaming||r?.s3Stored||r?.s3ReleaseHold)blocked.add('fire');
 if(r?.aimingSub||r?.s3SubReady)blocked.add('sub');
 // A paid Slosher heave is already committed by its press. Map ownership
 // cancels release-triggered input, but must not erase that native windup.
 const committedSlosh=keys!==KEYS&&a.weapon?.kind==='slosher'&&r?.slosh>=0?r.slosh:null;
 r?.cancelPendingInput?.();
 if(committedSlosh!==null)r.slosh=committedSlosh;
 r?.cancelHold?.(true,true);cancelStormPendingInput(a);
 for(const state of [a.intent,a._prevIntent])if(state)for(const key of keys)state[key]=false;
 a.fireBuffer=0;
 if(keys===KEYS){a.jumpBuffer=0;a.intent?.move?.set(0,0,0);}
}
export const cancelMapGameplay = c => cancelMenuGameplay(c,['fire','sub']);
export function rearmMenuGameplay(c) {
 const blocked=c._menuGameplayRearm,a=c.a;if(!blocked||!a)return;
 for(const key of blocked){
  if(!c.menuBlocked&&!c.mapHeld&&!held(c,key))blocked.delete(key);
  else {if(a.intent)a.intent[key]=false;if(a._prevIntent)a._prevIntent[key]=false;if(key==='fire')a.fireBuffer=0;if(key==='jump')a.jumpBuffer=0;}
 }
 if(!blocked.size)delete c._menuGameplayRearm;
}
