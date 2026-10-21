// QA only: ordinary saved profile/settings before native startup; no pose or clock writes.
export function bindRollerComparisonStartup() {
  const profile={name:'プレイヤー',weapon:'roller',style:{hair:0,skin:0,outfit:0,eyes:0,hat:0,brows:0}};
  localStorage.setItem('inkwave.profile',JSON.stringify(profile));
  localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja',colorblind:true}));
  window.__rollerComparisonRequest={schema:1,preset:'rookie',profile,paletteSetting:'colorblind',teamHex:['#ffd21a','#2a52ff']};
  window.__beginRollerCharacterObserver=()=>{
    const G=window.__G,g=window.__inkwave,a=G.local,c=a.character,request=window.__rollerComparisonRequest;
    const same=(x,y,label)=>{if(JSON.stringify(x)!==JSON.stringify(y))throw Error('Comparison setup mismatch: '+label);};
    same(c.name,profile.name,'name');same(c.style,profile.style,'resolved locker style');
    same(g.profile.style,profile.style,'saved locker style');same(G.teamHex,request.teamHex,'normal palette');
    if(g.settings.colorblind!==true)throw Error('Comparison palette setting missing');
    const scalar=x=>{if(typeof x==='number'&&!Number.isFinite(x))throw Error('Non-finite observer input');return x===undefined?null:x;};
    const fields=['t','phase','brPh','brN','brAmp','brRate','exert','wTired','sigh','sighT','gs','gv','hs','landAmp',
      'lifeLv','idleT','gaitW','wAir','wDance','kidForm','inWorld','dance','grounded','lookT','mxT','gripT','earT',
      'shiftT','nextFidget','shufT','fidget','fidgetT','yawRate','moving','wAim','lastShot','lastRelease'];
    const simple=o=>Object.fromEntries(Object.entries(o||{}).filter(([,v])=>v===null||['number','boolean','string'].includes(typeof v)).map(([k,v])=>[k,scalar(v)]));
    const state=()=>({character:Object.fromEntries(fields.map(k=>[k,scalar(c[k])])),
      triggers:Array.from(c.tr||[]),blink:simple(c.bl),attention:simple(c.att),
      actor:{pos:a.pos.toArray(),vel:a.vel.toArray(),yaw:a.yaw,aimYaw:a.aimYaw,aimPitch:a.aimPitch,
        grounded:a.grounded,form:a.form,hp:a.hp,ink:a.ink,dead:a.dead,groundTeam:a.groundTeam,
        groundFace:a.ground?.face??null,rolling:a.weaponRunner.rolling},sceneClocks:window.__rollerVideoClocks()});
    const input=s=>{const keys=['time','speed','grounded','vy','aimPitch','firing','charge','rolling','form','ink',
      'lowInk','special','invuln','turnRate','hp','inEnemyInk','surface','subAim'];
      return {scalars:Object.fromEntries(keys.map(k=>[k,scalar(s?.[k])])),localMove:s?.localMove?{x:s.localMove.x,z:s.localMove.z}:null,
        wallNormal:s?.wallNormal?{x:s.wallNormal.x,y:s.wallNormal.y,z:s.wallNormal.z}:null};};
    const receipt={schema:1,diagnosticOnly:true,performanceEvidence:false,maxFrames:360,maxDraws:4096,restored:false,
      request,initial:{style:{...c.style},name:c.name,seed:c.seed,team:a.team,teamHex:[...G.teamHex],
        teamColors:G.teamColors.map(v=>v.toArray()),color:c.color.toArray(),enemyColor:c.enemyColor.toArray(),
        hairStrands:c.hairMeta.length,hairPhase:Array.from(c.hairPh),state:state()},frames:[],draws:[]};
    const rngDescriptor=Object.getOwnPropertyDescriptor(c,'rng'),updateDescriptor=Object.getOwnPropertyDescriptor(c,'update');
    const originalRng=c.rng,originalUpdate=c.update;
    if(typeof originalRng!=='function'||typeof originalUpdate!=='function')throw Error('Missing native Character methods');
    c.rng=function(...args){
      if(receipt.draws.length>=receipt.maxDraws)throw Error('Character observer draw bound exceeded');
      const value=Reflect.apply(originalRng,this,args);
      if(!Number.isFinite(value)||value<0||value>=1)throw Error('Invalid native Character RNG output');
      receipt.draws.push({index:receipt.draws.length,update:receipt.frames.length,time:G.time,characterTime:c.t,value});
      return value;
    };
    c.update=function(...args){
      if(this!==c||receipt.frames.length>=receipt.maxFrames)throw Error('Character observer update bound exceeded');
      const frame={index:receipt.frames.length,dt:args[0],input:input(args[1]),before:state(),drawStart:receipt.draws.length};
      const result=Reflect.apply(originalUpdate,this,args);
      frame.after=state();frame.drawEnd=receipt.draws.length;receipt.frames.push(frame);
      return result;
    };
    window.__rollerCharacterObserver={receipt,restore(){
      if(rngDescriptor)Object.defineProperty(c,'rng',rngDescriptor);else delete c.rng;
      if(updateDescriptor)Object.defineProperty(c,'update',updateDescriptor);else delete c.update;
      receipt.restored=c.rng===originalRng&&c.update===originalUpdate;
      if(!receipt.restored)throw Error('Native Character methods were not restored');
      return receipt;
    }};
    return receipt.initial;
  };
}
