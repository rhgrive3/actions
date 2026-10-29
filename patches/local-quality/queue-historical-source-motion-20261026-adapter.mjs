// Restore the safe source-controller subset of historical PR #1870 queues.
// Source-owned world modules and other current composition changes stay intact.
const REL='src/game/motion/source-controller.js';
function once(code,before,after,label){
 const index=code.indexOf(before);
 if(index<0||code.indexOf(before,index+before.length)>=0)throw new Error('Historical source motion composition conflict: '+label);
 return code.slice(0,index)+after+code.slice(index+before.length);
}
const PATCHES=[
  [
    "  const names=event==='slosh'||event==='shoot'&&family==='BBll'?['Attack_BBll']:event==='flick'||event==='shoot'&&family==='Rllr'?['Attack_Rllr']:event==='charge_release'?[`Shoot_${family}`]:event==='throw'?[`ThrowBomb_${family}`,'ThrowBomb_Nrml']:event==='hit'?['Damage']:event==='spawn'?['ToHumanRespawn']:[];\n  return names.find(n=>this.bank.clips.has(n))||null;",
    "  // Keep every live bank/clip/has lookup at its original candidate position.\n  // The throw fallback may see a bank replaced by the first has callback.\n  let name;\n  if(event==='slosh'||event==='shoot'&&family==='BBll')name='Attack_BBll';\n  else if(event==='flick'||event==='shoot'&&family==='Rllr')name='Attack_Rllr';\n  else if(event==='charge_release')name=`Shoot_${family}`;\n  else if(event==='throw'){\n   name=`ThrowBomb_${family}`;\n   if(this.bank.clips.has(name))return name;\n   return this.bank.clips.has('ThrowBomb_Nrml')?'ThrowBomb_Nrml':null;\n  }else if(event==='hit')name='Damage';\n  else if(event==='spawn')name='ToHumanRespawn';\n  else return null;\n  return this.bank.clips.has(name)?name:null;",
    "allocation-free live action clip candidates"
  ],
  [
    "1-Math.exp(-(releasedBackpedal?24:12)*dt)",
    "(releasedBackpedal?iwMotionResponse24Exp(dt):iwMotionResponse12Exp(dt))",
    "released shoot response"
  ],
  [
    "-Math.expm1(-10*dt)",
    "iwMotionResponse10Expm1(dt)",
    "pivot response"
  ],
  [
    "-Math.expm1(-HOST_MOTION.runBlendResponse*dt)",
    "iwMotionResponse12Expm1(dt)",
    "run response"
  ],
  [
    "1-Math.exp(-HOST_MOTION.directionResponse*dt)",
    "iwMotionResponse7Exp(dt)",
    "direction response"
  ],
  [
    "-Math.expm1(-8*dt)",
    "iwMotionResponse8Expm1(dt)",
    "strafe response"
  ]
];
const HELPERS="\n// Historical queue: one exact dt slot per immutable response, shared by actors.\n// No time quantization. Replaced Math callbacks retain their original receiver\n// and every call; only the module's native numeric path can reuse a result.\nconst IW_MOTION_NATIVE_EXP=Math.exp,IW_MOTION_NATIVE_EXPM1=Math.expm1;\nlet iwMotionResponse24ExpDt,iwMotionResponse24ExpGain,iwMotionResponse24ExpReady=false;\nfunction iwMotionResponse24Exp(dt){\n const fn=Math.exp;\n if(fn!==IW_MOTION_NATIVE_EXP||typeof dt!=='number')return 1-Reflect.apply(fn,Math,[-24*dt]);\n if(!iwMotionResponse24ExpReady||!Object.is(iwMotionResponse24ExpDt,dt)){\n  const gain=1-IW_MOTION_NATIVE_EXP(-24*dt);\n  iwMotionResponse24ExpDt=dt;iwMotionResponse24ExpGain=gain;iwMotionResponse24ExpReady=true;\n }\n return iwMotionResponse24ExpGain;\n}\nlet iwMotionResponse12ExpDt,iwMotionResponse12ExpGain,iwMotionResponse12ExpReady=false;\nfunction iwMotionResponse12Exp(dt){\n const fn=Math.exp;\n if(fn!==IW_MOTION_NATIVE_EXP||typeof dt!=='number')return 1-Reflect.apply(fn,Math,[-12*dt]);\n if(!iwMotionResponse12ExpReady||!Object.is(iwMotionResponse12ExpDt,dt)){\n  const gain=1-IW_MOTION_NATIVE_EXP(-12*dt);\n  iwMotionResponse12ExpDt=dt;iwMotionResponse12ExpGain=gain;iwMotionResponse12ExpReady=true;\n }\n return iwMotionResponse12ExpGain;\n}\nlet iwMotionResponse10Expm1Dt,iwMotionResponse10Expm1Gain,iwMotionResponse10Expm1Ready=false;\nfunction iwMotionResponse10Expm1(dt){\n const fn=Math.expm1;\n if(fn!==IW_MOTION_NATIVE_EXPM1||typeof dt!=='number')return -Reflect.apply(fn,Math,[-10*dt]);\n if(!iwMotionResponse10Expm1Ready||!Object.is(iwMotionResponse10Expm1Dt,dt)){\n  const gain=-IW_MOTION_NATIVE_EXPM1(-10*dt);\n  iwMotionResponse10Expm1Dt=dt;iwMotionResponse10Expm1Gain=gain;iwMotionResponse10Expm1Ready=true;\n }\n return iwMotionResponse10Expm1Gain;\n}\nlet iwMotionResponse12Expm1Dt,iwMotionResponse12Expm1Gain,iwMotionResponse12Expm1Ready=false;\nfunction iwMotionResponse12Expm1(dt){\n const fn=Math.expm1;\n if(fn!==IW_MOTION_NATIVE_EXPM1||typeof dt!=='number')return -Reflect.apply(fn,Math,[-12*dt]);\n if(!iwMotionResponse12Expm1Ready||!Object.is(iwMotionResponse12Expm1Dt,dt)){\n  const gain=-IW_MOTION_NATIVE_EXPM1(-12*dt);\n  iwMotionResponse12Expm1Dt=dt;iwMotionResponse12Expm1Gain=gain;iwMotionResponse12Expm1Ready=true;\n }\n return iwMotionResponse12Expm1Gain;\n}\nlet iwMotionResponse7ExpDt,iwMotionResponse7ExpGain,iwMotionResponse7ExpReady=false;\nfunction iwMotionResponse7Exp(dt){\n const fn=Math.exp;\n if(fn!==IW_MOTION_NATIVE_EXP||typeof dt!=='number')return 1-Reflect.apply(fn,Math,[-7*dt]);\n if(!iwMotionResponse7ExpReady||!Object.is(iwMotionResponse7ExpDt,dt)){\n  const gain=1-IW_MOTION_NATIVE_EXP(-7*dt);\n  iwMotionResponse7ExpDt=dt;iwMotionResponse7ExpGain=gain;iwMotionResponse7ExpReady=true;\n }\n return iwMotionResponse7ExpGain;\n}\nlet iwMotionResponse8Expm1Dt,iwMotionResponse8Expm1Gain,iwMotionResponse8Expm1Ready=false;\nfunction iwMotionResponse8Expm1(dt){\n const fn=Math.expm1;\n if(fn!==IW_MOTION_NATIVE_EXPM1||typeof dt!=='number')return -Reflect.apply(fn,Math,[-8*dt]);\n if(!iwMotionResponse8Expm1Ready||!Object.is(iwMotionResponse8Expm1Dt,dt)){\n  const gain=-IW_MOTION_NATIVE_EXPM1(-8*dt);\n  iwMotionResponse8Expm1Dt=dt;iwMotionResponse8Expm1Gain=gain;iwMotionResponse8Expm1Ready=true;\n }\n return iwMotionResponse8Expm1Gain;\n}\n";

const MOT01_PATCHES=[
  [
    "   const item=(j?runClips:walkClips)[mode][i],p=locomotionProfile(this.bank,item.name);",
    "   const item=(j?runClips:walkClips)[mode][i],p=item._prof||(item._prof=locomotionProfile(this.bank,item.name));",
    "MOT-01a cache locomotionProfile on directionClips item"
  ],
  [
    "   let entry=locoPool[locoIdx];if(!entry)entry=locoPool[locoIdx]={name:'',weight:0,profile:null};locoIdx++;\n   entry.name=item.name;entry.weight=weight;entry.profile=p;list.push(entry);",
    "   let entry=locoPool[locoIdx];if(!entry)entry=locoPool[locoIdx]={name:'',clip:null,weight:0,profile:null};locoIdx++;\n   entry.name=item.name;entry.clip=item._clip||(item._clip=this.bank.clips.get(item.name));entry.weight=weight;entry.profile=p;list.push(entry);",
    "MOT-01b cache clip reference on pooled locomotion list entry"
  ],
  [
    "  let nominalCadence=0;for(let i=0;i<list.length;i++){const item=list[i];nominalCadence+=item.weight*HOST_MOTION.fps/this.bank.clips.get(item.name).frames;}",
    "  let nominalCadence=0;for(let i=0;i<list.length;i++){const item=list[i];nominalCadence+=item.weight*HOST_MOTION.fps/item.clip.frames;}",
    "MOT-01c use cached clip.frames in nominalCadence loop"
  ],
  [
    "    const clip=this.bank.clips.get(item.name),p=item.profile;",
    "    const clip=item.clip,p=item.profile;",
    "MOT-01d use cached clip reference in locomotion sample loop"
  ]
];

// Separate current epoch: profile reuse is keyed by item, bank and name.
// Incoming clip-reference caches above remain historical data, never relabelled.
const MOT01_PROFILE_PATCH=[
  "   const item=(j?runClips:walkClips)[mode][i],p=locomotionProfile(this.bank,item.name);",
  "   const item=(j?runClips:walkClips)[mode][i],bank=this.bank,name=item.name;\n   const p=item._profBank===bank&&item._profName===name?item._prof:\n    (item._prof=locomotionProfile(bank,name),item._profName=name,item._profBank=bank,item._prof);",
  "MOT-01a cache locomotionProfile by direction item, bank and name"
];

export function adaptHistoricalSourceMotion20261026(rel,code){
 if(rel!==REL)return code;
 for(const [before,after,label] of PATCHES)code=once(code,before,after,label);
 return code+HELPERS;
}
// Test-only inversion checks that the rest of the current composition is exact.
export function restoreHistoricalSourceMotion20261026(rel,code){
 if(rel!==REL||!code.endsWith(HELPERS))return code;
 code=code.slice(0,-HELPERS.length);
 const mot01Sites=MOT01_PATCHES.map(([,after])=>code.includes(after));
 const profileEpoch=code.includes(MOT01_PROFILE_PATCH[1].split('\n')[0])||
  code.includes('item._profBank')||code.includes('item._profName')||code.includes('item._prof=locomotionProfile(bank,name)');
 if(profileEpoch){
  if(mot01Sites.some(Boolean))throw Error('Historical source motion: mixed MOT01 epochs cannot be restored');
  const [before,after,label]=MOT01_PROFILE_PATCH;
  if(!code.includes(after))throw Error('Historical source motion: partial MOT01 profile owner cannot be restored');
  for(const [nativeSite] of MOT01_PATCHES.slice(1))
   if(code.split(nativeSite).length!==2)throw Error('Historical source motion: mixed MOT01 clip-reference owner cannot be restored');
  code=once(code,after,before,'reverse '+label);
 }else if(mot01Sites.some(Boolean)){
  if(!mot01Sites.every(Boolean))throw Error('Historical source motion: partial MOT01 owner cannot be restored');
  for(const [before,after,label] of [...MOT01_PATCHES].reverse())code=once(code,after,before,'reverse '+label);
 }
 for(const [before,after,label] of [...PATCHES].reverse())code=once(code,after,before,'reverse '+label);
 return code;
}
