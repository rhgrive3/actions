#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {validateContinuousPair,validateEncodedVideo} from './lib/inkwave-explosher-video-gate.mjs';
const [beforeArg,afterArg,outArg,beforeSha,afterSha]=process.argv.slice(2);
if(!beforeArg||!afterArg||!outArg)throw Error('Usage: before-dir after-dir output.mp4 before-sha after-sha');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read=(dir,name)=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
const before=path.resolve(beforeArg),after=path.resolve(afterArg),out=path.resolve(outArg);
const frames=dir=>read(dir,'manifest.json').map(f=>{
 if(!/^s3-slosher-washtub-t[0-9]{2}-behind\.png$/.test(f.file))throw Error('Unexpected capture filename');
 return {...f,actualFileSha256:hash(path.join(dir,f.file))};
});
const br=read(before,'source-receipt.json'),ar=read(after,'source-receipt.json');
const gate=validateContinuousPair(frames(before),frames(after),br,ar,beforeSha,afterSha);
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
if(!fs.existsSync(font))throw Error('Expected label font is unavailable');
fs.mkdirSync(path.dirname(out),{recursive:true});
if(fs.existsSync(out))throw Error('Refusing to overwrite an existing video');
const input=d=>['-framerate','60','-start_number','0','-i',path.join(d,'s3-slosher-washtub-t%02d-behind.png')];
const filter="[0:v]drawtext=fontfile="+font+":text='BEFORE':x=16:y=16:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.7[b];[1:v]drawtext=fontfile="+font+":text='AFTER':x=16:y=16:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.7[a];[b][a]hstack=inputs=2[v]";
const args=['-hide_banner','-nostdin',...input(before),...input(after),'-filter_complex',filter,'-map','[v]','-frames:v','61','-fps_mode','passthrough','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',out];
const encode=spawnSync('ffmpeg',args,{stdio:'inherit'});if(encode.status!==0)throw Error('Video encoding failed');
const probe=spawnSync('ffprobe',['-v','error','-count_frames','-show_streams','-of','json',out],{encoding:'utf8'});
if(probe.status!==0)throw Error('Video inspection failed');
const parsed=JSON.parse(probe.stdout);validateEncodedVideo(parsed);
const receipt={...gate,beforeSha,afterSha,outputSha256:hash(out),encoderArguments:args,probe:parsed,
 beforeSourceShapeSha256:br.sourceShapeSha256,afterSourceShapeSha256:ar.sourceShapeSha256,
 caption:'INKWAVE 修正前/修正後。正規弾の出生から61連続固定60Hzフレーム。本家動画ではなく、補間なし。視覚受入は別途必要。',
 boundaries:['No sparse-frame interpolation or invented transition frames.','This encoder does not certify retail fidelity or GPU elapsed time.']};
fs.writeFileSync(out+'.receipt.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt));
