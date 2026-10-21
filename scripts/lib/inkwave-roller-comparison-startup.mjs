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
    const derived={schema:1,diagnosticOnly:true,performanceEvidence:false,maxFaceCalls:720,maxTurfCalls:1024,faces:[],credits:[],inputs:[]};
    const vector=(v,n,label)=>{const a=v?.toArray?.();if(!Array.isArray(a)||a.length!==n||!a.every(Number.isFinite))throw Error('Invalid derived observer '+label);return a;};
    const creditState=()=>({special:scalar(a.special),cost:scalar(a.specialCost()),turf:scalar(a.stats?.turf),active:!!a.specialActive});
    const headChain=()=>{const chain=[];let bone=c.bones?.head;while(bone&&bone!==c.kid){
      if(chain.length>=16)throw Error('Derived head chain bound exceeded');
      chain.push({position:vector(bone.position,3,'head position'),quaternion:vector(bone.quaternion,4,'head quaternion')});bone=bone.parent;
    }if(bone!==c.kid||!chain.length)throw Error('Missing derived head chain');return chain;};
    const rngDescriptor=Object.getOwnPropertyDescriptor(c,'rng'),updateDescriptor=Object.getOwnPropertyDescriptor(c,'update'),
      faceDescriptor=Object.getOwnPropertyDescriptor(c,'_applyFace'),turfDescriptor=Object.getOwnPropertyDescriptor(a,'addTurf');
    const originalRng=c.rng,originalUpdate=c.update,originalFace=c._applyFace,originalTurf=a.addTurf;
    if([originalRng,originalUpdate,originalFace,originalTurf,a.specialCost].some(fn=>typeof fn!=='function'))throw Error('Missing native Character/credit methods');
    c._applyFace=function(...args){
      if(this!==c||derived.faces.length>=derived.maxFaceCalls)throw Error('Derived face observer bound exceeded');
      const row={index:derived.faces.length,update:receipt.frames.length,time:G.time,dt:scalar(args[1]),
        attentionOn:!!c.att.on,target:vector(c.att.p,3,'attention point'),headChain:headChain(),beforeDist:scalar(c.att.dist)};
      try{return Reflect.apply(originalFace,this,args);}finally{
        row.afterDist=scalar(c.att.dist);row.verge=scalar(c.face?.verge);row.kidMatrix=Array.from(c.kid?.matrix?.elements||[]);
        if(row.kidMatrix.length!==16||!row.kidMatrix.every(Number.isFinite))throw Error('Invalid derived kid matrix');derived.faces.push(row);
      }
    };
    a.addTurf=function(...args){
      if(this!==a||derived.credits.length>=derived.maxTurfCalls)throw Error('Derived turf observer bound exceeded');
      const row={index:derived.credits.length,update:receipt.frames.length,time:G.time,area:scalar(args[0]),before:creditState()};
      try{return Reflect.apply(originalTurf,this,args);}finally{row.after=creditState();derived.credits.push(row);}
    };
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
      derived.inputs.push({update:frame.index,time:G.time,inputSpecial:scalar(args[1]?.special),credit:creditState()});
      const result=Reflect.apply(originalUpdate,this,args);
      frame.after=state();frame.drawEnd=receipt.draws.length;receipt.frames.push(frame);
      return result;
    };
    window.__rollerCharacterObserver={receipt,diagnostics(){return JSON.parse(JSON.stringify(derived));},restore(){
      if(rngDescriptor)Object.defineProperty(c,'rng',rngDescriptor);else delete c.rng;
      if(updateDescriptor)Object.defineProperty(c,'update',updateDescriptor);else delete c.update;
      if(faceDescriptor)Object.defineProperty(c,'_applyFace',faceDescriptor);else delete c._applyFace;
      if(turfDescriptor)Object.defineProperty(a,'addTurf',turfDescriptor);else delete a.addTurf;
      receipt.restored=c.rng===originalRng&&c.update===originalUpdate&&c._applyFace===originalFace&&a.addTurf===originalTurf;
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
  const recentCalls=[];
  const identity=()=>{if(restored||Math.random!==random)throw Error('Comparison random function identity changed');};
  const begin=label=>{
    identity();
    if(label!==labels[phases.length])throw Error('Unexpected comparison random boundary: '+label);
    word=seed|0;phase={label,seed,initialWord:seed,word:seed,draws:0,firstValues:[],nativeFxDrawIndices:[],capturedAliasWhileGlobalDiffers:0};
    phases.push(phase);recentCalls.length=0;
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
    const stack=String(new Error().stack||'');
    if(/\/src\/fx\/fx\.js:\d+/.test(stack))phase.nativeFxDrawIndices.push(index);
    recentCalls.push({index,phase:phase.label,globalDiffers:Math.random!==random,gameTime:window.__G?.time??null,
      stack:stack.split('\n').slice(1,7).map(line=>line.replace(/http:\/\/127\.0\.0\.1:\d+/g,'<local>').replace(/\/_versions\/[a-f0-9]{64}\//g,'/_versions/<content>/').slice(0,512))});
    if(recentCalls.length>16)recentCalls.shift();
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
    diagnostics(){return {schema:1,bound:16,calls:recentCalls.map(call=>({...call,stack:[...call.stack]}))};},
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
