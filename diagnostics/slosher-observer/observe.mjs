// Diagnostic-only wrapper. Invoked through page.evaluate after visualSetup.
export function installCollisionObserver() {
  const w=window,G=w.__G,P=G.projectiles;
  if(w.__iwCollisionObserver) return w.__iwCollisionObserver.reset();
  for(const key of ['applyHit','_impact','_bossImpact','_step'])if(typeof P[key]!=='function')throw Error('Missing native observer hook '+key);
  const originals=[],events=[],steps=[],identities=new Map();let current=null,next=0;
  const id=a=>{if(!a)return null;if(!identities.has(a))identities.set(a,next++);return identities.get(a);};
  const identity=v=>v==null?null:(typeof v==='object'||typeof v==='function')?{objectId:id(v)}:v;
  const vec=v=>v?[v.x,v.y,v.z]:null;
  const state=a=>({id:id(a),nid:a.nid??null,name:a.name??null,team:a.team,owner:identity(a.owner),alive:!!a.alive,hp:a.hp,invuln:a.invuln,form:a.form,submerged:!!a.submerged,pos:vec(a.pos),vel:vec(a.vel),remote:!!a.remote,isLocal:!!a.isLocal,hurtboxRadius:a.hurtboxRadius??null,hurtboxHeight:a.hurtboxHeight??null,s3MotionEpoch:a.s3MotionEpoch??0,s3Motion:a.s3Motion?{...a.s3Motion,owner:identity(a.s3Motion.owner)}:null,net:a.net?{ready:!!a.net.ready,tp:a.net.tp??null}:null});
  const actors=()=>{if(G.actors.length>64)throw Error('Observer Actor bound exceeded');return G.actors.map(state);};
  const shot=p=>({seed:p.seed,type:p.type,age:p.age,life:p.life,delay:p.delay??0,team:p.team,owner:id(p.owner),pos:vec(p.pos),prev:vec(p.prev),vel:vec(p.vel),ghost:!!p.ghost,fidelityImpactActor:id(p.fidelityImpactActor),fidelityImpactT:p.fidelityImpactT??null,wallDropDone:!!p.fidelityWallDrop?.done});
  const recordEvent=row=>{if(events.length>=2048)throw Error('Observer event bound exceeded');events.push(row);};
  const wrap=(object,key,make)=>{const original=object[key];if(typeof original!=='function')throw Error('Missing native observer hook '+key);const replacement=make(original);object[key]=replacement;originals.push({object,key,original,replacement});};
  wrap(P,'applyHit',fn=>function(owner,victim,...args){const row={route:'applyHit',seed:current?.seed??null,owner:id(owner),victimBefore:state(victim),damage:args[0]};recordEvent(row);try{return fn.call(this,owner,victim,...args);}finally{row.victimAfter=state(victim);}});
  for(const key of ['_impact','_bossImpact'])wrap(P,key,fn=>function(p,hit,...args){recordEvent({route:key,seed:p.seed,point:vec(hit?.point),face:hit?.face??null,block:hit?.block??null});return fn.call(this,p,hit,...args);});
  wrap(P,'_step',fn=>function(p,dt){if(steps.length>=512||events.length>=2048)throw Error('Observer record bound exceeded');const prior=current,start=events.length;current=p;const row={time:G.time,dt,before:shot(p),actorsBefore:actors()};let result;
    try{result=fn.call(this,p,dt);return result;}finally{row.after=shot(p);row.actorsAfter=actors();row.returned=result;row.events=events.slice(start);row.retirementEvidence=!result?'live':row.events.some(e=>e.route==='applyHit')?'actor-hit-call':row.events.some(e=>e.route==='_impact')?'world-impact-call':row.events.some(e=>e.route==='_bossImpact')?'boss-impact-call':row.after.fidelityImpactActor!==null?'actor-admission-field':p.age>p.life?'age-exceeded':'unresolved';steps.push(row);current=prior;}
  });
  const api={reset(){events.length=0;steps.length=0;return {actors:actors()};},snapshot(){return {actors:actors(),steps:steps.slice(),events:events.slice()};},restore(){for(const r of originals.reverse()){if(r.object[r.key]!==r.replacement)throw Error('Observer hook changed '+r.key);r.object[r.key]=r.original;}delete w.__iwCollisionObserver;}};
  w.__iwCollisionObserver=api;return api.reset();
}
