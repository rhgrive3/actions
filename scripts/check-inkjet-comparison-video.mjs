#!/usr/bin/env node
// Every output video frame is a rendered simulation step. No interpolation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const opt=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];};
const site=path.resolve(opt('--site','_site')),root=path.resolve(opt('--evidence-dir','.ci-scratch/inkjet-video'));
const overlay=path.resolve(opt('--baseline-overlay','.ci-scratch/inkjet-baseline/special-vfx.mjs'));
const hz=30,actors=4,seconds=2,receipts=[];
for(const variant of ['A','B']){
 const out=path.join(root,variant);
 const args=['scripts/check-inkwave-splashdown-browser.mjs','--site',site,'--inkjet','--hz',String(hz),'--actors',String(actors),'--layout','near','--warmup-seconds','1','--sample-seconds',String(seconds),'--video-frames','--evidence-dir',out];
 if(variant==='A')args.push('--baseline-overlay',overlay);
 execFileSync(process.execPath,args,{stdio:'inherit',timeout:240000});
 const receipt=JSON.parse(fs.readFileSync(path.join(out,'result.json'),'utf8'));
 assert.deepEqual(receipt.failures,[]);assert.deepEqual(receipt.errors,[]);
 assert.equal(receipt.cases[0].frames.length,hz*seconds);
 for(let f=1;f<=hz*seconds;f++)assert.ok(fs.statSync(path.join(out,'inkjet-near-4p-f'+String(f).padStart(3,'0')+'.png')).size>1000);
 receipts.push(receipt);
}
assert.equal(receipts[0].contentHash,receipts[1].contentHash);
for(const key of ['seed','camera','viewport','clock','hz','actorCount','layout'])assert.deepEqual(receipts[0].cases[0][key],receipts[1].cases[0][key],key+' identical comparison conditions');
const overlayReceipt=receipts[0].baselineOverlay;
assert.ok(overlayReceipt);
const input=variant=>path.join(root,variant,'inkjet-near-4p-f%03d.png');
const output=path.join(root,'inkjet-before-after-candidate.mp4');
const labelA='OLD MAIN '+overlayReceipt.baseline.slice(0,8)+' | 4 actors | 30 simulated FPS';
const labelB='CANDIDATE '+overlayReceipt.candidate.slice(0,8)+' | NOT ACCEPTED | same camera and seeds';
const filter="[0:v]pad=iw:ih+90:0:90:black,drawtext=text='"+labelA+"':x=10:y=10:fontcolor=white:fontsize=20,drawtext=text='Continuous VFX only - frozen gameplay - no frame interpolation':x=10:y=44:fontcolor=white:fontsize=16[a];[1:v]pad=iw:ih+90:0:90:black,drawtext=text='"+labelB+"':x=10:y=10:fontcolor=white:fontsize=20,drawtext=text='Simulation t 1.0 to 3.0 seconds - not Switch footage':x=10:y=44:fontcolor=white:fontsize=16[b];[a][b]hstack=inputs=2[v]";
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(hz),'-start_number','1','-i',input('A'),'-framerate',String(hz),'-start_number','1','-i',input('B'),'-filter_complex',filter,'-map','[v]','-frames:v',String(hz*seconds),'-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-movflags','+faststart',output],{stdio:'inherit',timeout:120000});
const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,nb_read_frames,duration','-of','json',output],{encoding:'utf8'})).streams[0];
assert.equal(Number(probe.nb_read_frames),hz*seconds);assert.equal(probe.r_frame_rate,hz+'/1');assert.equal(probe.width,1920);assert.equal(probe.height,810);
const framehash=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',output,'-f','framemd5','-'],{encoding:'utf8',timeout:120000});
const frameRows=framehash.split('\n').filter(line=>line && !line.startsWith('#'));assert.equal(frameRows.length,hz*seconds);assert.ok(new Set(frameRows.map(line=>line.split(',').at(-1).trim())).size>1,'decoded video frames are not a frozen image');
fs.writeFileSync(path.join(root,'video-framemd5.txt'),framehash);
const report={scope:'Unaccepted candidate comparison of INKWAVE continuous VFX, not retail S3 or real gameplay video',baseline:overlayReceipt.baseline,candidate:overlayReceipt.candidate,contentHash:receipts[0].contentHash,frames:hz*seconds,hz,seconds,interpolatedFrames:0,simulationTimeStart:1,simulationTimeEnd:3,seed:receipts[0].cases[0].seed,camera:receipts[0].cases[0].camera,viewport:receipts[0].cases[0].viewport,sha256:createHash('sha256').update(fs.readFileSync(output)).digest('hex'),probe,performanceAccepted:false,visualAccepted:false};
fs.writeFileSync(path.join(root,'video-receipt.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
