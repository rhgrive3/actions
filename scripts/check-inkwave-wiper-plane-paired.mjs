#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const [site,source,overlay,rootArg]=process.argv.slice(2);if(!rootArg)throw Error('Usage: site source overlay out');
const root=path.resolve(rootArg);fs.mkdirSync(root,{recursive:true});
const same=(a,b)=>assert.deepEqual(a,b,'native paired invariant');
assert.throws(()=>same({seed:1},{seed:2}),assert.AssertionError);assert.throws(()=>same({camera:[1]},{camera:[2]}),assert.AssertionError);
const validAxis=axis=>Array.isArray(axis)&&axis.length===3&&axis.every(Number.isFinite)&&Math.abs(Math.hypot(...axis)-1)<1e-5;
const plane=(axis,horizontal,tolerance)=>validAxis(axis)&&(horizontal?Math.abs(axis[1])<tolerance:Math.abs(axis[1])>1-tolerance);
for(const bad of [[0,0,0],[NaN,0,0],[null,0,0],[1,0]])assert.equal(plane(bad,true,.02),false);
assert.equal(plane([0,1,0],true,.02),false);assert.equal(plane([1,0,0],false,.02),false);
const reports=[];
for(const [id,action]of [['s3-saber-heavy','charged'],['s3-saber-heavy','tap'],['s3-saber-normal','charged'],['s3-saber-lite','charged']]){
 const rows=[];
 for(const variant of ['A','B']){
  const out=path.join(root,id+'-'+action+'-'+variant);
  execFileSync(process.execPath,['scripts/check-inkwave-wiper-plane-native.mjs',site,source,overlay,out,variant,id,action],{stdio:'inherit',timeout:1200000});
  const r=JSON.parse(fs.readFileSync(path.join(out,'receipt.json'),'utf8'));assert.equal(r.status,'passed');assert.equal(r.variant,variant);rows.push(r);
 }
 const [a,b]=rows;for(const k of ['head','baseline','inputHash','contentHash','binding'])same(a[k],b[k]);
 const A=a.result,B=b.result;same(A.setup.initial,B.setup.initial);same(A.setup.target,B.setup.target);same(A.setup.palette,B.setup.palette);same(A.completion,B.completion);
 assert.equal(A.frameCount,161);assert.equal(B.frameCount,161);assert.equal(A.dt,1/60);assert.equal(B.dt,1/60);
 const changed=id==='s3-saber-heavy'&&action==='charged';let live=0,sheets=0,changedPixels=0;
 for(let i=0;i<161;i++){
  const x=A.frames[i],y=B.frames[i];same([x.tick,y.tick],[i,i]);
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
   if(!changed)same(p.pixelHash,q.pixelHash);else if(p.pixelHash!==q.pixelHash)changedPixels++;}
 }
 assert.ok(live>0&&sheets>0,'actual live projectile and firing sheet coverage');
 if(changed)assert.ok(changedPixels>0,'Dental material/plane change must be visible');
 reports.push({id,action,frames:161,live,sheets,changedPixels,physics:'equal',resourceCounts:'equal',visualReview:'pending',performanceAccepted:false});
 // Only the Dental charged pilot gets continuous videos, from consecutive real simulation ticks.
 if(changed)for(const view of ['front','top']){
  for(const [variant,row]of [['A',A],['B',B]])assert.ok(row.frames.every(f=>f.images.some(im=>im.view===view)),'missing continuous frame '+variant);
  const aa=path.join(root,id+'-'+action+'-A',action+'-'+view+'-%04d.png'),bb=path.join(root,id+'-'+action+'-B',action+'-'+view+'-%04d.png'),video=path.join(root,'dental-charged-'+view+'-candidate.mp4');
  execFileSync('ffmpeg',['-y','-framerate','60','-start_number','0','-i',aa,'-framerate','60','-start_number','0','-i',bb,'-filter_complex',
   '[0:v]drawtext=text=Before 7581ca9 | fixed simulation60Hz | seed515e7021:x=12:y=16:fontsize=20:fontcolor=white:box=1:boxcolor=black[left];[1:v]drawtext=text=Candidate0430673 | inspection camera | NOT retail:x=12:y=16:fontsize=20:fontcolor=white:box=1:boxcolor=black[right];[left][right]hstack=inputs=2[v]',
   '-map','[v]','-frames:v','161','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',video],{stdio:'inherit',timeout:300000});
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_entries','stream=width,height,avg_frame_rate,nb_read_frames,duration','-of','json',video],{encoding:'utf8'})).streams[0];
  assert.equal(info.width,1920);assert.equal(info.height,720);assert.equal(info.avg_frame_rate,'60/1');assert.equal(Number(info.nb_read_frames),161);assert.ok(Math.abs(Number(info.duration)-161/60)<.02);
  const hashes=execFileSync('ffmpeg',['-v','error','-i',video,'-f','framemd5','-'],{encoding:'utf8',maxBuffer:8*1024*1024});const frames=hashes.split('\n').filter(x=>x&&!x.startsWith('#'));assert.equal(frames.length,161);assert.ok(new Set(frames.map(x=>x.split(',').at(-1))).size>10);
  fs.writeFileSync(video+'.ffprobe.json',JSON.stringify(info,null,2));fs.writeFileSync(video+'.framemd5',hashes);
 }
 console.log(JSON.stringify({id,action,status:'paired-physics-resource-gates-passed',live,sheets,visualReview:'pending',performanceAccepted:false}));
}
fs.writeFileSync(path.join(root,'paired-result.json'),JSON.stringify({reports,performanceAccepted:false,scope:'one continuous Dental charged pilot and three unchanged native controls; no retail matching or full performance acceptance'},null,2));
