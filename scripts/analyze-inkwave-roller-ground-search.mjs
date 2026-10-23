// Check observational equivalence and split alignment from floor selection.
// World and camera projections are INKWAVE diagnostics, never retail scoring.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {gunzipSync}from'node:zlib';
import*as T from '../inkwave-public/vendor/three/build/three.module.js';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]||'ground-search-analysis.json'),published=process.argv.includes('--published');
const read=p=>JSON.parse(p.endsWith('.gz')?gunzipSync(fs.readFileSync(p)):fs.readFileSync(p,'utf8'));
const file=(name,control=false)=>published?path.join(root,(control?'controls/':'layers/')+name+'.json.gz'):control?path.join(root,{before:'matched-before-60',cf9:'matched-cf9-60',weighted:'matched-weighted-60',axis:'axis-check-candidate/released-edge-60'}[name],'receipt.json'):path.join(root,'isolated',name,'receipt.json');
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,i)=>v-b[i]),angle=(a,b)=>new T.Quaternion().fromArray(a).angleTo(new T.Quaternion().fromArray(b));
const clean=rows=>rows.map(({render,...native})=>native),results=[];
for(const name of ['before','cf9','weighted','axis']){
 const p=read(file(name)),control=read(file(name,true));assert.deepEqual(p.matchConditions,control.matchConditions,'observed/control conditions '+name);assert.deepEqual(clean(p.frames),clean(control.frames),'observed/control native output '+name);
 const cam=p.matchConditions.camera,view=new T.Matrix4().compose(new T.Vector3().fromArray(cam.position),new T.Quaternion().fromArray(cam.rotation),new T.Vector3(1,1,1)).invert(),projection=new T.Matrix4().fromArray(cam.projection);
 const screen=a=>{const p=new T.Vector3().fromArray(a).applyMatrix4(view).applyMatrix4(projection);return[(p.x+1)*400,(1-p.y)*300];};
 const rows=p.frames.map((r,i)=>{const e=p.layerEvents.filter(x=>x.tick===i),input=e.find(x=>x.stage==='floorIn'),aligned=e.find(x=>x.stage==='floorOut'),selected=e.find(x=>x.stage==='searchSelected'),consumed=e.find(x=>x.stage==='nativeIKIn'&&x.side==='R');return{tick:i,centre:r.centre,screen:screen(r.centre),floorSearch:r.floorSearch,lowest:r.lowest,
  rawQ:input?.quaternion,alignedQ:aligned?.quaternion,selectedQ:selected?.quaternion,consumedQ:consumed?.quaternion,
  baseFloorError:aligned?.floorError,alignCorrection:input?angle(input.quaternion,aligned.quaternion):null,searchCorrection:aligned?angle(aligned.quaternion,selected.quaternion):null,
  postSearchCorrection:selected?angle(selected.quaternion,consumed.quaternion):null};});
 for(let i=1;i<rows.length;i++){const r=rows[i],prev=rows[i-1];r.delta=sub(r.centre,prev.centre);r.step=norm(r.delta);r.speed=r.step*60;r.screenDelta=sub(r.screen,prev.screen);r.screenStep=norm(r.screenDelta);if(i>1){r.acceleration=norm(sub(r.delta,prev.delta))*3600;r.screenAcceleration=norm(sub(r.screenDelta,prev.screenDelta))*3600;}for(const k of['raw','aligned','selected','consumed'])if(r[k+'Q']&&prev[k+'Q'])r[k+'Step']=angle(r[k+'Q'],prev[k+'Q']);}
 // Identify the actual winning evaluation, rather than comparing its
 // output with a separate baseline evaluation of alignLeft.
 for(const r of rows.filter(r=>r.selectedQ)){
  const events=p.layerEvents.filter(e=>e.tick===r.tick),pairs=[];let input;
  for(const e of events){if(e.stage==='floorIn')input=e;else if(e.stage==='floorOut')pairs.push({input:input.quaternion,out:e.quaternion});}
  const winning=pairs.filter(x=>angle(x.out,r.selectedQ)<1e-7).at(-1);
  assert(winning,'selected evaluation is observed '+name+' '+r.tick);
  r.winningGroundInputQ=winning.input;r.winningAlignOutputQ=winning.out;
  r.winningGroundTurn=angle(r.rawQ,winning.input);r.winningAlignTurn=angle(winning.input,winning.out);
  const prior=rows[r.tick-1];if(prior?.winningGroundInputQ){r.winningGroundStep=angle(prior.winningGroundInputQ,winning.input);r.winningAlignStep=angle(prior.winningAlignOutputQ,winning.out);}
 }
 const windows={};for(const[start,end]of[[31,56],[39,56],[48,56],[50,56]]){const w=rows.filter(r=>r.tick>=start&&r.tick<=end),max=k=>w.reduce((a,b)=>a[k]>b[k]?a:b);windows[start+'-'+end]={maxStep:{tick:max('step').tick,value:max('step').step},maxAcceleration:{tick:max('acceleration').tick,value:max('acceleration').acceleration},maxScreenStep:{tick:max('screenStep').tick,value:max('screenStep').screenStep},totalDistance:w.reduce((s,r)=>s+r.step,0)};}
 results.push({name,observationalEquivalence:true,excluded:['cumulative renderer.info counters'],contentHash:p.contentHash,inputHash:p.inputHash,conditions:p.matchConditions,rows,windows});
}
assert(results.every(r=>JSON.stringify(r.conditions)===JSON.stringify(results[0].conditions)),'all variants have identical selection, geometry, palette, seed and camera');
const before=results[0],candidate=results[3],nativeTailPeak=before.windows['50-56'].maxStep.value;
const acceptance={scope:'INKWAVE regression only; NOT a retail match',lateOldFails:before.windows['48-56'].maxStep.value>nativeTailPeak+1e-12,lateCandidatePasses:candidate.windows['48-56'].maxStep.value<=nativeTailPeak+1e-12,wholeTransitionPasses:candidate.windows['39-56'].maxStep.value<=before.windows['39-56'].maxStep.value+1e-12,status:'REJECTED if any whole transition or browser gate fails'};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({schema:1,acceptance,results},null,2)+'\n');console.log(JSON.stringify({acceptance,summary:results.map(({name,observationalEquivalence,windows})=>({name,observationalEquivalence,windows}))},null,2));
