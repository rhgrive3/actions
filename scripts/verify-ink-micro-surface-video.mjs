#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const directory=path.resolve(process.argv[2]||'.browser-evidence/ink-micro-surface');
const receipt=JSON.parse(fs.readFileSync(path.join(directory,'receipt.json'),'utf8'));
assert.equal(receipt.status,'passed','Rendering failed');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const clips=[],framesOnly=process.argv.includes('--frames-only');
for(const view of ['floor','wall'])for(const mode of ['sheen','oblique'])for(const age of ['fresh','settled']){
 const name=view+'-'+mode+'-'+age,prefix='texlib-'+name+'-';
 const frames=fs.readdirSync(directory).filter(x=>x.startsWith(prefix)&&/^\d{3}\.png$/.test(x.slice(prefix.length))).sort();
 assert.deepEqual(frames,Array.from({length:24},(_,i)=>prefix+String(i).padStart(3,'0')+'.png'));
 const pngs=frames.map(file=>{const bytes=fs.readFileSync(path.join(directory,file));assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),960);assert.equal(bytes.readUInt32BE(20),360);return {file,sha256:hash(bytes)};});
 if(framesOnly){clips.push({name,frames:pngs});continue;}
 const file=name+'.mp4',bytes=fs.readFileSync(path.join(directory,file));
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration','-show_entries','format=duration','-of','json',path.join(directory,file)],{encoding:'utf8'}));
 assert.equal(probe.streams.length,1);const s=probe.streams[0];
 assert.equal(s.width,960);assert.equal(s.height,360);assert.equal(Number(s.nb_read_frames),24);
 const fps=x=>{const [a,b]=x.split('/').map(Number);return a/b;};
 assert.equal(fps(s.r_frame_rate),30);assert.equal(fps(s.avg_frame_rate),30);
 assert.ok(Math.abs(Number(s.duration)-.8)<.001);assert.ok(Math.abs(Number(probe.format.duration)-.8)<.002);
 clips.push({file,sha256:hash(bytes),bytes:bytes.length,probe,frames:pngs,simulationTimes:{start:1,end:1+23/30,step:1/30},panels:{left:'original existing normal amplitude',right:'experimental 25% reduction'}});
}
const result={status:'passed',sourceSha:receipt.sourceSha,inputHash:receipt.inputHash,contentHash:receipt.contentHash,receiptSha256:hash(fs.readFileSync(path.join(directory,'receipt.json'))),clips};
fs.writeFileSync(path.join(directory,framesOnly?'frame-manifest.json':'video-manifest.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:'passed',sourceSha:result.sourceSha,clips:clips.length,framesEach:24,fps:30,durationEach:.8,width:960,height:360}));
