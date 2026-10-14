// Diagnostic only. Serialize installControlledLaunch into each fresh Game page.
// Only ordinary rig and mouse input are written; actor, source and collision data are never replaced.
export function installControlledLaunch(){
 const G=globalThis.NG,g=G.game;
 delete globalThis.__controlledLaunchAim;
 const finite=v=>Array.isArray(v)&&v.length>0&&v.every(Number.isFinite);
 const snapshot=()=>{
  const a=G.local,s=a.s3?.squidSpawn;
  const row={sourceSha256:G.level.manifest?.sourceSha256,team:a.team,actor:a.pos.toArray(),velocity:a.vel.toArray(),target:s?.target?{...s.target}:null,phase:s?.phase??null,grounded:a.grounded,groundHit:!!a.ground?.hit,rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},camera:{position:G.camera.position.toArray(),quaternion:G.camera.quaternion.toArray(),projection:G.camera.projectionMatrix.toArray()},time:G.time};
  if(!row.sourceSha256||![row.actor,row.velocity,row.camera.position,row.camera.quaternion,row.camera.projection].every(finite)||!Number.isFinite(row.time)||!Number.isFinite(row.rig.yaw)||!Number.isFinite(row.rig.pitch))throw Error('Incomplete controlled identity');
  return row;
 };
 const requireAim=()=>{const a=G.local;if(!a.alive||!G.level.native||G.level.layout.id!=='inkblot'||G.match?.state!=='playing'||G.match?.controller?.a!==a||a.s3?.squidSpawn?.phase!=='aim')throw Error('Controlled launch requires fresh native Inkblot playing aim phase');return a;};
 globalThis.__prepareControlledLaunch=()=>{
  delete globalThis.__controlledLaunchAim;
  const initial=G.local;
  if(!initial?.alive||!G.level.native||G.level.layout.id!=='inkblot'||G.match?.controller?.a!==initial)throw Error('Controlled preparation requires native local actor/controller');
  g.debug.freeze();g._skipRender=true;g.input.mouse.left=false;
  // preparePair's 240 ticks stop at 4s, before the actual 4.2s intro ends.
  // Advance native lifecycle with released input; never assign match/spawn state.
  let introTicks=0;
  while(G.match.state==='intro'&&introTicks<60){g._frame(1/60);introTicks++;}
  const a=requireAim(),original=snapshot();
  if(a.intent.fire)throw Error('Controlled intro retained fire intent');
  g.rig.yaw=0;g.rig.pitch=-.12;g.rig.follow(a,true);
  for(let i=0;i<60;i++)g._frame(1/60);
  requireAim();if(a.intent.fire||g.input.mouse.left||g.rig.yaw!==0||g.rig.pitch!==-.12)throw Error('Controlled aim/input changed');
  const target=a.s3.squidSpawn.target;if(!target||![target.x,target.y,target.z].every(Number.isFinite))throw Error('Ordinary launch target unavailable');
  const hit=G.physics.raycast(a.pos.clone().set(target.x,target.y+.35,target.z),a.pos.clone().set(0,-1,0),1);
  if(!hit.hit||!Number.isInteger(hit.triangle)||hit.triangle<0||!Number.isInteger(hit.block)||hit.block<0||hit.block>=G.level.staticBlockCount||!Number.isFinite(hit.normal?.y)||hit.normal.y<.62||!Number.isFinite(hit.point?.y)||Math.abs(hit.point.y-target.y)>.35)throw Error('Ordinary target lacks native supported surface');
  const receipt={...snapshot(),support:{triangle:hit.triangle,block:hit.block,point:hit.point.toArray(),normal:hit.normal.toArray()},introTicks,settleTicks:60};
  if(!finite(receipt.support.point)||!finite(receipt.support.normal))throw Error('Invalid support identity');
  globalThis.__controlledLaunchAim={receipt:structuredClone(receipt),state:JSON.stringify(snapshot()),actor:a};
  return {scope:'controlled ordinary camera aim; no actor/muzzle/source override',original,receipt};
 };
 globalThis.__executeControlledLaunch=({expectedAim,maxFlightTicks=180}={})=>{
  const saved=globalThis.__controlledLaunchAim;delete globalThis.__controlledLaunchAim;
  const a=requireAim();if(!saved||saved.actor!==a||JSON.stringify(saved.receipt)!==JSON.stringify(expectedAim)||saved.state!==JSON.stringify(snapshot())||a.intent.fire||g.input.mouse.left)throw Error('Controlled aim receipt missing, stale or mismatched');
  if(!Number.isInteger(maxFlightTicks)||maxFlightTicks<90||maxFlightTicks>240)throw Error('Invalid flight bound');
  let launch;
  try{g.input.mouse.left=true;g._frame(1/60);const s=a.s3?.squidSpawn;if(s?.phase!=='flight'||!a.intent.fire||G.match.controller.a!==a)throw Error('Ordinary mouse/controller did not launch');launch={from:{...s.from},to:{...s.to},duration:s.duration,mouseFire:g.input.mouse.left,intentFire:a.intent.fire,controllerActor:true};if(![...Object.values(s.from),...Object.values(s.to),s.duration].every(Number.isFinite))throw Error('Invalid native flight identity');}
  finally{g.input.mouse.left=false;}
  let ticks=0;while(a.s3?.squidSpawn&&ticks<maxFlightTicks){g._frame(1/60);ticks++;}
  if(a.s3?.squidSpawn||!a.alive||!a.grounded||!a.ground?.hit)throw Error('Ordinary flight did not finish on real ground');
  const landed=snapshot();g.rig.follow(a,true);for(let i=0;i<60;i++)g._frame(1/60);
  if(!a.alive||!a.grounded||!a.ground?.hit||a.s3?.squidSpawn||a.intent.fire||g.input.mouse.left||JSON.stringify(a.pos.toArray())!==JSON.stringify(landed.actor)||g.rig.yaw!==0||g.rig.pitch!==-.12)throw Error('Landing did not remain stable');
  return {launch,ticks,settleTicks:60,landed,final:snapshot()};
 };
}
export function compareControlledIdentities(left,right){
 if(!left||!right||typeof left!=='object'||typeof right!=='object'||!Object.keys(left).length||!Object.keys(right).length)return {matched:false,reason:'Missing identity'};
 const invalid=value=>value===undefined||(typeof value==='number'&&!Number.isFinite(value))||(value&&typeof value==='object'&&Object.values(value).some(invalid));
 if(invalid(left)||invalid(right))return {matched:false,reason:'Incomplete identity'};
 return {matched:JSON.stringify(left)===JSON.stringify(right),reason:JSON.stringify(left)===JSON.stringify(right)?null:'Strict controlled identity mismatch'};
}
