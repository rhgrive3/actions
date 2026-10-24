// Regression evidence for attack ownership and unnecessary late carry only.
import fs from'node:fs';import path from'node:path';import assert from'node:assert/strict';import{gunzipSync}from'node:zlib';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),published=process.argv.includes('--published');
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p));
const location=(role,scenario,hz)=>published?path.join(root,'raw',`${role}-${scenario}-${hz}.json.gz`):path.join(root,`${role}-edges`,`${scenario}-${hz}`,'receipt.json');
const load=(role,scenario,hz)=>read(location(role,scenario,hz));
const sub=(a,b)=>a.map((v,i)=>v-b[i]),norm=v=>Math.hypot(...v),clean=({render,...r})=>r;
function motion(rows,start=48,end=58){
 const v=rows.map((r,i)=>i?sub(r.centre,rows[i-1].centre):[0,0,0]),a=v.map((r,i)=>i?sub(r,v[i-1]).map(x=>x*3600):[0,0,0]),j=a.map((r,i)=>i?sub(r,a[i-1]).map(x=>x*60):[0,0,0]);
 const ticks=rows.map((r,i)=>({tick:r.frame??r.tick,step:norm(v[i]),acceleration:norm(a[i]),finiteJerk:norm(j[i])})),range=ticks.slice(start,end+1),max=k=>range.reduce((a,b)=>a[k]>b[k]?a:b);
 return{range:[start,end],maxStep:max('step'),maxAcceleration:max('acceleration'),maxFiniteJerk:max('finiteJerk'),totalDistance:range.reduce((s,r)=>s+r.step,0),ticks:ticks.slice(39,59)};
}
const cases=[],refreshChecks=[];
for(const scenario of['repress-edge','late-edge']){
 const roles=Object.fromEntries(['before','ecf5','candidate'].map(role=>[role,load(role,scenario,60)])),base=roles.before;
 for(const[role,p]of Object.entries(roles)){
  assert.deepEqual(p.matchConditions,base.matchConditions,role+' same selected style/geometry/palette/camera');assert.equal(p.scriptSha256,base.scriptSha256);assert.equal(p.metricsScriptSha256,base.metricsScriptSha256);assert.deepEqual(p.errors,[]);assert.equal(p.frames.length,66);
  const native=rows=>rows.map(r=>Object.fromEntries(['ink','cooldown','projectiles','elapsed','windup','released','vertical','rolling'].map(k=>[k,r[k]])));
  assert.deepEqual(native(p.frames),native(base.frames),role+' actual runner/projectiles');
  for(const hz of[30,120]){if(!fs.existsSync(location(role,scenario,hz))){refreshChecks.push({role,scenario,hz,status:'not accepted',reason:role==='before'&&hz===120?'Baseline reused-context repress-edge tick65 screenshot timed out at60000ms; late-edge was not reached.':'No completed actual-browser receipt; fixed-clock source/emitted success is separate.'});continue;}const refreshRun=load(role,scenario,hz);refreshChecks.push({role,scenario,hz,status:'passed'});const refresh=refreshRun;assert.deepEqual(refresh.frames.map(clean),p.frames.map(clean),role+' same native ticks '+hz);assert.equal(refresh.renderFrames,Math.ceil(hz*1.1));assert.deepEqual(refresh.matchConditions,p.matchConditions);
   for(let i=1;i<refresh.intermediateFrames.length;i++){const r=refresh.intermediateFrames[i],prev=refresh.intermediateFrames[i-1];if(r.ticks===0){const{display,ticks,...pose}=r,{display:pd,ticks:pt,...previous}=prev;assert.deepEqual(pose,previous,role+' zero-tick render pose');}}
  }
 }
 const c=roles.candidate,b=roles.before,e=roles.ecf5;
 // Do not omit the incoming56 step or the57/58 deceleration samples.
 for(let i=scenario==='repress-edge'?51:0;i<66;i++)assert.deepEqual(clean(c.frames[i]),clean(b.frames[i]),scenario+' native carry '+i);
 const at=rows=>motion(rows).ticks.find(r=>r.tick===56).step;
 assert(at(e.frames)>at(b.frames),'frozen candidate is a failing negative control');assert.equal(at(c.frames),at(b.frames));
 const bm=motion(b.frames),cm=motion(c.frames);assert(cm.maxAcceleration.acceleration<=bm.maxAcceleration.acceleration+1e-9,'full48–58 finite acceleration');assert(cm.maxFiniteJerk.finiteJerk<=bm.maxFiniteJerk.finiteJerk+1e-9,'full48–58 finite jerk');
 cases.push({scenario,conditions:base.matchConditions,scriptSha256:base.scriptSha256,roles:Object.fromEntries(Object.entries(roles).map(([role,p])=>[role,{contentHash:p.contentHash,renderFrames:p.renderFrames,motion:motion(p.frames),minVertex:Math.min(...p.frames.map(r=>r.vertexLowest)),maxGripGap:Math.max(...p.frames.flatMap(r=>r.gripGap)),constraintWindow48to58:{minVertex:Math.min(...p.frames.slice(48,59).map(r=>r.vertexLowest)),maxGripGap:Math.max(...p.frames.slice(48,59).flatMap(r=>r.gripGap))},renderWork:{calls:p.frames.at(-1).render.calls-p.frames[0].render.calls,triangles:p.frames.at(-1).render.triangles-p.frames[0].render.triangles}}]))});
}
const currentCases=read(published?path.join(root,'raw/cases-source.json.gz'):path.join(root,'cases-source.json')),
 frozenCases=read(new URL('../reports/roller-shaft-return-20261023/raw/operation-cases-source.json.gz',import.meta.url).pathname),knownRemaining=[];
for(const release of[40,46]){const original=frozenCases.find(r=>r.options.release===release),current=currentCases.find(r=>r.options.release===release);
 assert.deepEqual(current.candidate,original.candidate,'early-release limitation was not erased from the result '+release);
 knownRemaining.push({release,status:'not repaired; not accepted',before:motion(original.before,46,58),ecf5:motion(original.candidate,46,58),candidate:motion(current.candidate,46,58)});
}
const result={scope:'Actual Chromium production composition at60Hz, matching selected character/gear/palette/geometry/camera/native phase. FX particles differ across fresh/reused contexts; not whole-image pixel parity. Two specified input traces; completed30Hz and missing/failed120Hz tracked separately. INKWAVE world units and finite simulation-tick derivatives, not encoded retail frames or Nintendo acceptance.',status:'two regressions repaired; whole motion/retail/early-release acceptance open',refresh:refreshChecks,knownRemaining,cases};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cases:cases.map(c=>({scenario:c.scenario,roles:Object.fromEntries(Object.entries(c.roles).map(([k,v])=>[k,{...v,motion:{...v.motion,ticks:undefined}}]))}))},null,2));
