export const CLIP={duration:10,fps:30,simulationHz:60,size:720,fov:25,centerY:.5,radius:1.1,distance:1.1/Math.sin(25*Math.PI/360)*1.1};
// Driven Actor input, matching the existing native harness. No animation overrides.
export function inputAt(t){
 if(t<1)return {state:'dry',form:'squid',submerged:false,speed:0,dir:[0,1]};
 if(t<1.84)return {state:'jump',form:'squid',submerged:false,speed:.7,dir:[0,1],airborne:true};
 if(t<2.6)return {state:'land',form:'squid',submerged:false,speed:0,dir:[0,1]};
 if(t<3.7)return {state:'swim',form:'squid',submerged:true,speed:4,dir:[0,1]};
 if(t<4.8)return {state:'turn90',form:'squid',submerged:true,speed:4,dir:[1,0]};
 if(t<5.9)return {state:'turn180',form:'squid',submerged:true,speed:4,dir:[0,-1]};
 if(t<6.6)return {state:'stop',form:'squid',submerged:true,speed:0,dir:[0,-1]};
 if(t<8)return {state:'emerge',form:'kid',submerged:false,speed:0,dir:[0,-1]};
 if(t<8.5)return {state:'dive',form:'squid',submerged:true,speed:0,dir:[0,-1]};
 if(t<9)return {state:'return-settle',form:'kid',submerged:false,speed:0,dir:[0,-1]};
 if(t<9.05)return {state:'dive-reverse-start',form:'squid',submerged:true,speed:0,dir:[0,-1]};
 if(t<9.1)return {state:'dive-reverse',form:'kid',submerged:false,speed:0,dir:[0,-1]};
 if(t<9.4)return {state:'dive-double-reverse',form:'squid',submerged:true,speed:0,dir:[0,-1]};
 return {state:'return-final',form:'kid',submerged:false,speed:0,dir:[0,-1]};
}
export function driveInput(state,t,dt){
 const spec=inputAt(t),a=state.a;a.form=spec.form;a.submerged=spec.submerged;
 if(spec.airborne){if(state.previous!=='jump'){state.jumpVelocity=4;a.grounded=a.ground.hit=false;}a.vel.set(spec.dir[0]*spec.speed,state.jumpVelocity,spec.dir[1]*spec.speed);a.pos.addScaledVector(a.vel,dt);state.jumpVelocity-=9.8*dt;if(a.pos.y<=0&&state.jumpVelocity<0){a.pos.y=0;a.vel.y=0;a.grounded=a.ground.hit=true;}}
 else{a.grounded=a.ground.hit=true;a.pos.y=0;a.vel.set(spec.dir[0]*spec.speed,0,spec.dir[1]*spec.speed);a.pos.addScaledVector(a.vel,dt);}
 state.previous=spec.state;return spec;
}
