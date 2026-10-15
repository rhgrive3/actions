/** Read-only test instrumentation. A form switch is discrete: it does not
 * imply that the expanded body existed at the previous humanoid pose. Keep
 * ordinary movement sweeps strict and audit actual source solver corrections
 * separately. This helper is never emitted into the game. */
export function createBluefinSourceStepAudit(G, actor, PLAYER, clearance) {
 const physics=G.physics,world=G.level.triangleWorld,V=actor.pos.constructor,EPS=1e-4;
 const profile=form=>{const squid=form==='squid';return{form,radius:(squid?PLAYER.s3SwimTerrainRadiusRaw:PLAYER.s3HumanoidTerrainRadiusRaw)*PLAYER.s3TerrainDistanceScale,lift:squid?PLAYER.squidBodyLift:PLAYER.stepUp,height:squid?PLAYER.squidHeight:PLAYER.height,skipGrates:squid};};
 const vector=values=>new V(...values),near=(a,b)=>vector(a).distanceTo(vector(b))<1e-7;
 const fits=(p,s)=>physics.bodyFits(vector(p),s.radius,s.lift,s.height,s.skipGrates,EPS);
 const clear=(a,b,s)=>clearance.clear(vector(a),vector(b),s.radius,s.lift,s.height,s.skipGrates);
 const fail=reason=>({ok:false,reason});
 function verify(record) {
  const {previous,committed,oldProfile,currentProfile,solves,dt}=record;
  for(const p of [oldProfile,currentProfile]){
   if(!['kid','squid'].includes(p.form))return fail('unknown actual form');
   const expected=profile(p.form);
   if(Object.keys(expected).some(k=>p[k]!==expected[k]))return fail('altered actual body profile');
  }
  if(!(dt>0)||!Number.isFinite(dt)||[...previous,...committed].some(v=>!Number.isFinite(v)))return fail('invalid actual step');
  if(!fits(committed,currentProfile))return fail('committed current body penetrates source');
  if(oldProfile.form===currentProfile.form)return clear(previous,committed,currentProfile)?{ok:true,kind:'continuous'}:fail('same-form source sweep');
  if(!fits(previous,oldProfile))return fail('previous actual body penetrates source');
  // Movement runs after the discrete form selection. The previous actual
  // body must fit its own endpoint; the selected body must sweep the submitted
  // motion. The retired profile does not continue moving after the switch.
  if(clear(previous,committed,currentProfile))return{ok:true,kind:'clear-form-switch'};
  // This exception is only a recorded grounded wall depenetration on a body
  // expansion. Neither endpoint checks nor a hypothetical shape interpolation
  // can establish contact-free travel through the internal solver correction.
  if(currentProfile.radius<=oldProfile.radius||fits(previous,currentProfile))return fail('not a source-contact body expansion');
  const support=physics.raycast(vector(previous).add(new V(0,.3,0)),new V(0,-1,0),.6);
  if(!support.hit||support.triangle<0||support.block>=G.level.staticBlockCount||support.normal.y<.68||support.point.distanceTo(vector(previous))>.01)return fail('unsupported form expansion');
  if(!solves.length||solves.length>4)return fail('missing bounded actual source solve');
  let cursor=previous,contacts=0;
  for(const solve of solves) {
   if(solve.radius!==currentProfile.radius||solve.lift!==currentProfile.lift||solve.height!==currentProfile.height||solve.skipGrates!==currentProfile.skipGrates||solve.ceiling)return fail('wrong actual solve profile or ceiling');
   if(contacts===0){
    const predicted=vector(previous).addScaledVector(vector(solve.velocity),dt).toArray();
    if(!near(predicted,solve.before)||!clear(previous,solve.before,oldProfile)||!fits(solve.before,oldProfile))return fail('unexplained submitted movement');
   }else if(!near(cursor,solve.before))return fail('unrecorded intermediate movement');
   let at=solve.before;
   for(const contact of solve.contacts) {
    if(!near(at,contact.before)||contact.triangle<0||contact.triangle>=world.flags.length||Math.abs(contact.normal[1])>=.6||!Number.isFinite(contact.depth)||contact.depth<=0||contact.depth>currentProfile.radius+EPS)return fail('invalid source wall contact');
    const body=vector(contact.before),s0=body.clone().add(new V(0,solve.lift+solve.radius,0)),s1=body.clone().add(new V(0,Math.max(solve.lift+solve.radius,solve.height-solve.radius),0));
    const distance=world._capsuleDistance(s0,s1,world.triangle(contact.triangle));
    if(distance<1e-8||Math.abs(distance-contact.distance)>1e-7||Math.abs(solve.radius-distance+EPS-contact.depth)>1e-7)return fail('contact differs from original source');
    const normal=world._bests.clone().sub(world._bestp).multiplyScalar(1/distance);
    if(!near(normal.toArray(),contact.normal))return fail('contact normal differs from original source');
    let push=contact.depth;
    if(solve.horizontal){const hl=Math.hypot(normal.x,normal.z);if(!(hl>.3&&normal.y>-.6))return fail('unsupported horizontal correction');push=Math.min(.45,push/hl);normal.set(normal.x/hl,0,normal.z/hl);}
    const expected=body.addScaledVector(normal,push).toArray();
    if(!near(expected,contact.after))return fail('unexplained source correction');
    at=contact.after;contacts++;
   }
   if(!near(at,solve.after))return fail('unrecorded source correction');
   cursor=solve.after;
  }
  if(!contacts||!near(cursor,committed)||!clear(previous,committed,oldProfile))return fail('unexplained committed movement');
  return{ok:true,kind:'discrete-source-expansion',contacts,supportTriangle:support.triangle};
 }
 function run(dt,update) {
  const previous=actor.pos.toArray(),oldProfile=profile(actor.form),solves=[],originalContacts=physics._nativeContacts,originalTriangle=world.triangle,originalDistance=world._capsuleDistance;let active=null,triangle=-1,pending=null;
  const flush=()=>{if(pending){pending.after=active.pos.toArray();pending=null;}};
  world.triangle=function(id,...args){if(active)triangle=id;return originalTriangle.call(this,id,...args);};
  world._capsuleDistance=function(a,b,t){if(active)flush();const distance=originalDistance.call(this,a,b,t);if(active&&distance<active.solve.radius-EPS){
   const normal=this._bests.clone().sub(this._bestp);if(distance>1e-8)normal.multiplyScalar(1/distance);
   pending={triangle,before:active.pos.toArray(),distance,depth:active.solve.radius-distance+EPS,normal:normal.toArray()};active.solve.contacts.push(pending);
  }return distance;};
  physics._nativeContacts=function(pos,radius,lift,height,c,horizontal,skipGrates,iterations){const parent=active;flush();if(pos!==actor.pos)return originalContacts.call(this,pos,radius,lift,height,c,horizontal,skipGrates,iterations);
   const solve={before:pos.toArray(),velocity:actor.vel.toArray(),radius,lift,height,horizontal,skipGrates,contacts:[]};active={pos,solve};
   try{return originalContacts.call(this,pos,radius,lift,height,c,horizontal,skipGrates,iterations);}finally{flush();solve.after=pos.toArray();solve.ceiling=c.ceiling;solves.push(solve);active=parent;}
  };
  let value;try{value=update();}finally{physics._nativeContacts=originalContacts;world.triangle=originalTriangle;world._capsuleDistance=originalDistance;}
  const record={dt,previous,committed:actor.pos.toArray(),oldProfile,currentProfile:profile(actor.form),solves};
  const result=verify(record);return{value,record,result};
 }
 return{run,verify};
}
