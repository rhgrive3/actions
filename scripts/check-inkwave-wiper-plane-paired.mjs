#!/usr/bin/env node
import {createHash} from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const [site,source,overlay,rootArg,compareArg]=process.argv.slice(2);assert.ok([4,5].includes(process.argv.slice(2).length));const compareDental=compareArg==='--compare-dental-only';assert.ok(compareArg===undefined||compareDental);if(!rootArg)throw Error('Usage: site source overlay out');
const root=path.resolve(rootArg);fs.mkdirSync(root,{recursive:true});
const same=(a,b)=>assert.deepEqual(a,b,'native paired invariant');
assert.throws(()=>same({seed:1},{seed:2}),assert.AssertionError);assert.throws(()=>same({camera:[1]},{camera:[2]}),assert.AssertionError);
const validAxis=axis=>Array.isArray(axis)&&axis.length===3&&axis.every(Number.isFinite)&&Math.abs(Math.hypot(...axis)-1)<1e-5;
const plane=(axis,horizontal,tolerance)=>validAxis(axis)&&(horizontal?Math.abs(axis[1])<tolerance:Math.abs(axis[1])>1-tolerance);
for(const bad of [[0,0,0],[NaN,0,0],[null,0,0],[1,0]])assert.equal(plane(bad,true,.02),false);
assert.equal(plane([0,1,0],true,.02),false);assert.equal(plane([1,0,0],false,.02),false);
const reports=[];
const cases=compareDental?[['s3-saber-heavy','charged']]:[['s3-saber-heavy','charged'],['s3-saber-heavy','tap'],['s3-saber-normal','charged'],['s3-saber-lite','charged']];
for(const [id,action]of cases){
 const rows=[];
 for(const variant of ['A','B']){
  const out=path.join(root,id+'-'+action+'-'+variant);
  if(!compareDental)execFileSync(process.execPath,['scripts/check-inkwave-wiper-plane-native.mjs',site,source,overlay,out,variant,id,action],{stdio:'inherit',timeout:1200000});
  const r=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(r.status,'passed');assert.equal(r.variant,variant);assert.equal(r.id,id);assert.equal(r.action,action);assert.equal(r.result?.id,id);assert.equal(r.result?.action,action);rows.push(r);
 }
 const [a,b]=rows;if(compareDental){assert.equal(a.head,'0430673b09a5009628fc87baa414b3560090fc1d');assert.equal(a.baseline,'7581ca9be8cf87d253918b8abb3b8ebe728c2093');assert.equal(a.contentHash,'8e350111a0469095d2872093322809f70da7d31237e520226946cbb0740c4c16');}for(const k of ['head','baseline','inputHash','contentHash','binding'])same(a[k],b[k]);
 const A=a.result,B=b.result;assert.equal(A.setup.initial.ambientState?.schema,1);assert.equal(B.setup.initial.ambientState?.schema,1);same(A.setup.initial,B.setup.initial);same(A.setup.target,B.setup.target);same(A.setup.palette,B.setup.palette);same(A.completion,B.completion);
 assert.equal(A.frameCount,161);assert.equal(B.frameCount,161);assert.equal(A.dt,1/60);assert.equal(B.dt,1/60);
 if(compareDental){assert.equal(A.dentalPilot,true);assert.equal(B.dentalPilot,true);assert.equal(A.costProbe,false);assert.equal(B.costProbe,false);assert.equal(A.completion.gpuDrained,true);assert.equal(B.completion.gpuDrained,true);same(A.setup.capturePolicy,B.setup.capturePolicy);same(A.setup.capturePolicy.continuous,{view:'front',firstTick:75,lastTick:160});}
 const topTicks=compareDental?[...new Set([75,A.completion.firstBirth?.tick,A.completion.firstRetirement,160])]:[];if(compareDental){assert.ok(Number.isInteger(A.completion.firstBirth?.tick)&&A.completion.firstBirth.tick>=75&&A.completion.firstBirth.tick<160);assert.ok(Number.isInteger(A.completion.firstRetirement)&&A.completion.firstRetirement>A.completion.firstBirth.tick&&A.completion.firstRetirement<=160);}
 const changed=id==='s3-saber-heavy'&&action==='charged';let live=0,sheets=0,changedPixels=0,changedLivePixels=0;
 for(let i=0;i<161;i++){
  const x=A.frames[i],y=B.frames[i];same([x.tick,y.tick],[i,i]);
  for(const [variant,row]of [['A',x],['B',y]]){
   if(compareDental)same(row.images.map(im=>im.view),[...(i>=75?['front']:[]),...(topTicks.includes(i)?['top']:[])]);
   for(const im of row.images){assert.ok(['front','top'].includes(im.view));const expected=action+'-'+im.view+'-'+String(i).padStart(4,'0')+'.png';assert.equal(im.file,expected);const bytes=fs.readFileSync(path.join(root,id+'-'+action+'-'+variant,expected));assert.ok(bytes.length>1000);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.subarray(12,16).toString(),'IHDR');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),720);assert.equal(createHash('sha256').update(bytes).digest('hex'),im.pngSha256,'PNG bytes must bind to the observed frame receipt');}
  }
  assert.equal(x.state.ambientState?.schema,1);assert.equal(y.state.ambientState?.schema,1);
  for(const k of ['state','paintHash','paintEvents','aimTrace','memory','census'])same(x[k],y[k]);
  // Whole-scene burden remains an actual gate; no inherited Explosher exception.
  for(const k of ['calls','triangles','points','lines'])same(x.nativeRender[k],y.nativeRender[k]);
  same(x.axes.counts,y.axes.counts);same(x.images.map(q=>q.view),y.images.map(q=>q.view));
  if(y.axes.main){live++;const horizontal=changed||action==='tap';
   assert.ok(plane(y.axes.main,horizontal,.02));assert.ok(plane(y.axes.trailing,horizontal,.18));
   if(changed){assert.ok(plane(x.axes.main,false,.02));assert.ok(!plane(x.axes.main,true,.02));}
   else same(x.axes,y.axes);
   if(y.axes.sheet){sheets++;assert.ok(plane(y.axes.sheet,horizontal,.02));}
  }
  for(let j=0;j<x.images.length;j++){const p=x.images[j],q=y.images[j];same(p.camera,q.camera);
   if(!changed)same(p.pixelHash,q.pixelHash);else if(p.pixelHash!==q.pixelHash){changedPixels++;if(y.axes.main)changedLivePixels++;}}
 }
 assert.ok(live>0&&sheets>0,'actual live projectile and firing sheet coverage');
 if(changed)assert.ok(changedPixels>0,'Dental material/plane change must be visible');if(compareDental)assert.ok(changedLivePixels>0,'Dental changed live projectile frame required');
 reports.push({id,action,frames:161,live,sheets,changedPixels,physics:'equal',resourceCounts:'equal',visualReview:'pending',performanceAccepted:false});
 // Only the Dental charged pilot gets continuous videos, from consecutive real simulation ticks.
 if(changed)for(const view of (compareDental?['front']:['front','top'])){
  const firstTick=compareDental?75:0,frameCount=161-firstTick;
  for(const [variant,row]of [['A',A],['B',B]])assert.ok(row.frames.slice(firstTick).every(f=>f.images.some(im=>im.view===view)),'missing continuous frame '+variant);
  const aa=path.join(root,id+'-'+action+'-A',action+'-'+view+'-%04d.png'),bb=path.join(root,id+'-'+action+'-B',action+'-'+view+'-%04d.png'),video=path.join(root,'dental-charged-'+view+'-candidate.mp4');
  execFileSync('ffmpeg',['-y','-framerate','60','-start_number',String(firstTick),'-i',aa,'-framerate','60','-start_number',String(firstTick),'-i',bb,'-filter_complex',
   '[0:v]drawtext=text=Before 7581ca9 | simulation60Hz | seed515e7021:x=12:y=16:fontsize=20:fontcolor=white:box=1:boxcolor=black[left];[1:v]drawtext=text=Candidate0430673 | inspection view | NOT retail:x=12:y=16:fontsize=20:fontcolor=white:box=1:boxcolor=black[right];[left][right]hstack=inputs=2[v]',
   '-map','[v]','-frames:v',String(frameCount),'-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',video],{stdio:'inherit',timeout:300000});
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames,duration','-of','json',video],{encoding:'utf8'})).streams[0];
  assert.equal(info.width,1920);assert.equal(info.height,720);assert.equal(info.avg_frame_rate,'60/1');assert.equal(Number(info.nb_read_frames),frameCount);assert.ok(Math.abs(Number(info.duration)-frameCount/60)<.02);
  const hashes=execFileSync('ffmpeg',['-v','error','-i',video,'-f','framemd5','-'],{encoding:'utf8',maxBuffer:8*1024*1024});const frames=hashes.split('\n').filter(x=>x&&!x.startsWith('#'));assert.equal(frames.length,frameCount);assert.ok(new Set(frames.map(x=>x.split(',').at(-1))).size>10);
  fs.writeFileSync(video+'.ffprobe.json',JSON.stringify(info,null,2));fs.writeFileSync(video+'.framemd5',hashes);
 }
 console.log(JSON.stringify({id,action,status:'paired-physics-resource-gates-passed',live,sheets,visualReview:'pending',performanceAccepted:false}));
}
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify({reports,pendingNativeControls:compareDental?['s3-saber-heavy tap','s3-saber-normal charged','s3-saber-lite charged']:[],capturedContinuousTicks:compareDental?[75,160]:[0,160],uncapturedTicksArePixelCompared:false,performanceAccepted:false,scope:compareDental?'Dental-only front continuous ticks75–160; top milestone stills; ticks0–74 numerical only; three native controls pending; no retail/full performance acceptance':'one continuous Dental charged pilot and three unchanged native controls; no retail matching or full performance acceptance'},null,2));
