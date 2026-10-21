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

// QA only. Install once before module evaluation so native `const rand = Math.random`
// aliases retain the same function. Only this closure's PRNG state changes at boundaries.
export function installRollerComparisonRandom({seed}) {
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff)throw Error('Comparison random seed must be uint32');
  if(Object.hasOwn(window,'__rollerComparisonRandom'))throw Error('Comparison random already installed');
  const descriptor=Object.getOwnPropertyDescriptor(Math,'random'),original=Math.random;
  const labels=['startup','steady-180','inspection','movie-180'],phases=[];
  const maxDrawsPerPhase=200000;
  let phase,word,observer=null,restored=false;
  const identity=()=>{if(restored||Math.random!==random)throw Error('Comparison random function identity changed');};
  const begin=label=>{
    identity();
    if(label!==labels[phases.length])throw Error('Unexpected comparison random boundary: '+label);
    word=seed|0;phase={label,seed,initialWord:seed,word:seed,draws:0,firstValues:[],nativeFxDrawIndices:[],capturedAliasWhileGlobalDiffers:0};
    phases.push(phase);
  };
  const random=function(){
    if(restored)return Reflect.apply(original,this,arguments);
    // Native clock temporarily routes Math.random to its own presentation stream.
    // Captured aliases remain callable; enforce property identity only at boundaries.
    if(phase.draws>=maxDrawsPerPhase)throw Error('Comparison random draw bound exceeded');
    let t=word=(word+0x6D2B79F5)|0;
    t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);
    const value=((t^(t>>>14))>>>0)/4294967296,index=phase.draws++;
    if(Math.random!==random)phase.capturedAliasWhileGlobalDiffers++;
    phase.word=word>>>0;if(phase.firstValues.length<8)phase.firstValues.push(value);
    // Diagnostic caller classification only, not a replacement FX implementation.
    // Record exact indices, not an assertion that every random consumer is an FX caller.
    if(/\/src\/fx\/fx\.js:\d+/.test(String(new Error().stack||'')))phase.nativeFxDrawIndices.push(index);
    observer?.(value,phase.label,index);
    return value;
  };
  const copy=p=>({...p,firstValues:[...p.firstValues],nativeFxDrawIndices:[...p.nativeFxDrawIndices]});
  const receipt=()=>({schema:1,diagnosticOnly:true,performanceEvidence:false,algorithm:'mulberry32-u32-v1',seed,
    installation:'page-init-before-module-evaluation',maxDrawsPerPhase,
    nativeFxClassification:'caller stack contains /src/fx/fx.js; not all possible FX consumers',
    nativePresentationDrawsObserved:false,
    identityContract:'QA retains one alias; native presentation routing is untouched and global identity is checked at boundaries',
    stableFunctionRetained:true,originalRestored:restored,phases:phases.map(copy)});
  Math.random=random;
  begin('startup');
  window.__rollerComparisonRandom={
    begin,
    phase(){identity();return copy(phase);},
    observe(fn){identity();if(fn!==null&&typeof fn!=='function')throw Error('Invalid random observer');observer=fn;},
    receipt(){if(!restored)identity();return receipt();},
    restore(){
      if(!restored){identity();observer=null;Object.defineProperty(Math,'random',descriptor);restored=true;}
      if(Math.random!==original)throw Error('Original random function was not restored');
      return receipt();
    }
  };
}
