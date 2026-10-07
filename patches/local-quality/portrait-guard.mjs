const frames=new WeakMap();
export function portraitBlocked(mobile,env=globalThis){
 if(!mobile?.root||mobile.root.isConnected===false||mobile._destroyed||mobile.editing||!mobile.root.classList.contains('is-active')||!env.document?.documentElement?.classList.contains('iw-touch'))return false;
 const portrait=env.matchMedia?env.matchMedia('(orientation: portrait)').matches:env.innerWidth>0&&env.innerHeight>=env.innerWidth;
 return !!portrait;
}
function neutral(input){
 if(!input)return;
 input.mobile?.reset();input.mobile?.pressed?.clear();input.mobile?.gyro?.discard();
 input.keys?.clear();input.pressed?.clear();input.padPressed?.clear();input.padMenuPressed?.clear();
 if(input.mouse){input.mouse.dx=input.mouse.dy=input.mouse.wheel=0;input.mouse.left=input.mouse.right=input.mouse.leftPressed=input.mouse.rightPressed=false;}
 for(let i=0;i<(input.pad?.buttons?.length||0);i++)if(input.pad.buttons[i]?.pressed)input.padMenuBlocked?.add(i);
}
export function guardPortraitPointer(mobile,event,env=globalThis){
 if(mobile.editing)return false;
 if(!event?.target?.closest?.('.iwm-rotate')&&!portraitBlocked(mobile,env))return false;
 event.preventDefault?.();event.stopPropagation?.();mobile.reset();mobile.pressed?.clear();return true;
}
export function syncPortraitFrame(game,G,env=globalThis){
 let s=frames.get(game);if(!s){s={match:null,blocked:false,offline:false,released:false};frames.set(game,s);}
 const m=game.match,mobile=game.input?.mobile;
 const blocked=!!(m&&!m.attract&&(m.state==='intro'||m.state==='playing')&&portraitBlocked(mobile,env));
 const changed=s.match!==m||s.blocked!==blocked;
 s.released=s.blocked&&!blocked;
 if(s.match!==m&&s.match?.controller)s.match.controller.orientationBlocked=false;
 if(changed&&(s.blocked||blocked)){neutral(game.input);game.s3Clock?.reset();}
 s.match=m;s.blocked=blocked;s.offline=blocked&&!G.netm;
 if(m?.controller){m.controller.orientationBlocked=blocked;if(blocked||s.released)m.controller.clearMapGyro?.();if(blocked){m.controller.navigationEnabled=false;m.controller.enabled=false;const it=m.local?.intent;if(it){it.move?.set(0,0,0);it.fire=it.jump=it.sub=it.special=it.squid=false;}}}
 if(blocked){neutral(game.input);game._s3Ticked=0;if(s.offline)game.s3Clock?.reset();}
 return s;
}
