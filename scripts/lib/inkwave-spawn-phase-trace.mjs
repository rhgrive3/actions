// Serialized into the actual frozen Game page. JSON only; no forced draw, state
// replacement, actor/support mutation, or suppression of native Match soft-push.
export async function traceSpawnPhases({frames=320,maxEvents=2048}={}){
 if(!Number.isInteger(frames)||frames<254||frames>360||!Number.isInteger(maxEvents)||maxEvents<1||maxEvents>4096)throw Error('Unsafe trace bounds');
 const G=globalThis.NG,g=G.game;g.debug.freeze();globalThis.__resetPairRandom();g._skipRender=true;g.menus.wipe.cancel();g.input.mouse.left=false;
 if(g.settings.quality!=='low')throw Error('Trace requires original low/day setup');g._setSettings({shadows:false,bloom:false});
 const picker=g._pickPalette;let picks=0;g._pickPalette=function(...args){const random=Math.random;Math.random=()=>.7;try{picks++;return picker.apply(this,args);}finally{Math.random=random;}};
 try{await g.startMatch({mapId:'inkblot',mode:'turf',difficulty:'normal',time:'day'});}finally{g._pickPalette=picker;}
 if(picks!==1||g.palette.id!=='aqua-cherry'||!G.level.native||G.level.layout.id!=='inkblot')throw Error('Fresh native trace start failed');
 g.debug.freeze();g.debug.freezeBots();g._skipRender=true;g.input.mouse.left=false;
 const match=G.match,actors=[...G.actors],local=G.local,localIndex=actors.indexOf(local),time0=G.time;
 if(localIndex<0||match.controller?.a!==local)throw Error('Native local controller missing');
 const snap=a=>({position:a.pos.toArray(),velocity:a.vel.toArray(),alive:a.alive,grounded:a.grounded,phase:a.s3?.squidSpawn?.phase??null,target:a.s3?.squidSpawn?.target?{...a.s3.squidSpawn.target}:null,from:a.s3?.squidSpawn?.from?{...a.s3.squidSpawn.from}:null,to:a.s3?.squidSpawn?.to?{...a.s3.squidSpawn.to}:null,flightT:a.s3?.squidSpawn?.t??null,fire:!!a.intent.fire});
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),moved=(a,b)=>!same(a.position,b.position);
 const report={acceptanceEvidence:false,scope:'Actual native Game start/Actor.update/Match.update boundary trace; no render captures',source:G.level.manifest?.sourceSha256,teamHex:[...G.teamHex],pads:G.level.spawnPads.map(p=>p.toArray()),localIndex,initial:{matchState:match.state,time:time0,rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},actors:actors.map((a,index)=>({index,team:a.team,slot:a.slot,isLocal:a===local,isBot:!!a.isBot,...snap(a)}))},events:[],frameSamples:[],dropped:0,errors:[],complete:false};
 const add=e=>{if(report.events.length<maxEvents)report.events.push(e);else report.dropped++;};
 const actorMethods=actors.map(a=>({a,fn:a.update,own:Object.getOwnPropertyDescriptor(a,'update')})),matchFn=match.update,matchOwn=Object.getOwnPropertyDescriptor(match,'update');
 let tick=0,matchCalls=0,inMatch=false,lastPost=new Map();
 for(const {a,fn}of actorMethods){a.update=function(...args){const before=snap(this),index=actors.indexOf(this);let result;try{return result=fn.apply(this,args);}finally{const after=snap(this);if(inMatch)lastPost.set(this,after);if(moved(before,after)||before.phase!==after.phase)add({tick,stage:'actor-update',index,dt:args[0],before,after});}};}
 match.update=function(...args){const before=actors.map(snap);lastPost=new Map();inMatch=true;matchCalls++;try{return matchFn.apply(this,args);}finally{inMatch=false;for(let index=0;index<actors.length;index++){const a=actors[index],after=snap(a),postActor=lastPost.get(a);if(postActor&&moved(postActor,after))add({tick,stage:'post-actor-match-correction',index,beforeActor:before[index],postActor,after,neighbors:actors.map((other,j)=>({index:j,...snap(other)})).filter(other=>other.index!==index&&Math.hypot(other.position[0]-after.position[0],other.position[2]-after.position[2])<2&&Math.abs(other.position[1]-after.position[1])<2)});}}};
 try{
  for(tick=1;tick<=frames;tick++){
   if(G.match!==match||G.local!==local||actors.length!==G.actors.length||actors.some((a,i)=>a!==G.actors[i]))throw Error('Trace actor identities changed');
   if(g.input.mouse.left||local.intent.fire)throw Error('Unrequested trace input');
   g._frame(1/60);
   if(tick<=3||tick===13||tick===60||tick===120||tick===240||tick===253||tick===frames)report.frameSamples.push({tick,time:G.time,elapsed:G.time-time0,matchState:match.state,rig:{yaw:g.rig.yaw,pitch:g.rig.pitch},local:snap(local)});
  }
  report.final={tick:frames,matchState:match.state,time:G.time,elapsed:G.time-time0,actors:actors.map(snap)};
 }catch(error){report.errors.push(String(error?.stack||error));}
 finally{
  for(const {a,fn,own}of actorMethods){if(own)Object.defineProperty(a,'update',own);else delete a.update;if(a.update!==fn)report.errors.push('Actor update restoration failed');}
  if(matchOwn)Object.defineProperty(match,'update',matchOwn);else delete match.update;
  report.restored=actorMethods.every(({a,fn})=>a.update===fn)&&match.update===matchFn;report.matchCalls=matchCalls;
  report.complete=!!report.final&&report.restored&&!report.errors.length&&!report.dropped;
 }
 return report;
}
export function compareSpawnTraceRepeats(a,b){
 if(!a?.complete||!b?.complete)return {matched:false,reason:'Incomplete trace'};
 const normalize=r=>{const c=structuredClone(r);delete c.initial.time;delete c.final.time;for(const f of c.frameSamples){delete f.time;delete f.elapsed;}delete c.final.elapsed;return c;};
 // Global G.time remains untouched in the Game. Only reporting excludes its
 // cumulative offset between two fresh matches in the same parked page.
 return {matched:JSON.stringify(normalize(a))===JSON.stringify(normalize(b)),excluded:['initial.time','final.time','final.elapsed','frameSamples.time','frameSamples.elapsed']};
}
