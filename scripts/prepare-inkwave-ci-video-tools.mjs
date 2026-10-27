#!/usr/bin/env node
// Capability-first provisioning for the two observed native-video QA jobs.
// Never installs during --probe-only. No runner-image or version-only pass.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

export const VIDEO_LABEL = "drawtext=text='ORIGINAL (left) | CANDIDATE (right)':x=10:y=10:fontsize=18:fontcolor=white:box=1:boxcolor=black@0.7";
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function checked(run,command,args,options={}){
  const r=run(command,args,{encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024,killSignal:'SIGKILL',...options});
  if(r.error||r.status!==0||r.signal)throw Error(command+' capability/provision command failed: '+(r.error?.code||r.signal||String(r.status))+' '+String(r.stderr||'').slice(-1200));
  return r;
}
function text(run,command,args){const r=checked(run,command,args);return String(r.stdout||'')+String(r.stderr||'');}

// Synthetic PNG fixture, not captured/reference media. Also binds the real
// PNG->RGBA decoder required by the historical Explosher stage admission.
export function videoProbePng(width,height){
  const raw=Buffer.alloc(width*height*4);for(let i=0;i<raw.length;i+=4){raw[i]=24;raw[i+1]=64;raw[i+2]=96;raw[i+3]=255;}
  const scan=Buffer.alloc(height*(width*4+1));for(let y=0;y<height;y++)raw.copy(scan,y*(width*4+1)+1,y*width*4,(y+1)*width*4);
  const crc=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,data])),data.length+8);return out;};
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  return{raw,png:Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(scan)),chunk('IEND',Buffer.alloc(0))])};
}
export function requireVideoProbeMetadata(probe){
  assert.equal(probe.streams?.length,1,'one real encoded stream required');const s=probe.streams[0];
  assert.equal(s.codec_name,'h264');assert.equal(s.pix_fmt,'yuv420p');assert.equal(s.width,960);assert.equal(s.height,360);
  assert.equal(Number(s.nb_read_frames),24);
  const fps=x=>{const[a,b]=String(x).split('/').map(Number);return a/b;};
  assert.equal(fps(s.r_frame_rate),30);assert.equal(fps(s.avg_frame_rate),30);
  assert(Math.abs(Number(s.duration)-.8)<.001);assert(Math.abs(Number(probe.format?.duration)-.8)<.002);
  return{codec:'h264',pixelFormat:'yuv420p',width:960,height:360,frames:24,fps:30,duration:.8};
}
export function probeVideoTools({run=spawnSync,fontExists=()=>fs.existsSync(font)&&fs.statSync(font).isFile()}={}){
  const version=text(run,'ffmpeg',['-version']).split(/\r?\n/)[0],probeVersion=text(run,'ffprobe',['-version']).split(/\r?\n/)[0];
  assert.match(version,/^ffmpeg version \S+/);assert.match(probeVersion,/^ffprobe version \S+/);
  assert.match(text(run,'ffmpeg',['-hide_banner','-encoders']),/^\s*V\S*\s+libx264\s/m,'libx264 encoder required');
  assert.match(text(run,'ffmpeg',['-hide_banner','-pix_fmts']),/^\s*IO\S*\s+yuv420p\s/m,'yuv420p input/output required');
  assert.match(text(run,'ffmpeg',['-hide_banner','-filters']),/^\s*\S+\s+drawtext\s/m,'drawtext filter required');
  assert(fontExists(),'DejaVu font required by the existing Explosher video gate');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inkwave-video-capability-'));
  try{
    const decoded=videoProbePng(800,450);
    const bytes=checked(run,'ffmpeg',['-v','error','-xerror','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{input:decoded.png,encoding:null,timeout:15000}).stdout;
    assert(Buffer.isBuffer(bytes)&&bytes.length===800*450*4,'actual PNG decoder returned wrong byte count');
    assert.equal(sha(bytes),sha(decoded.raw),'actual PNG decoder changed RGBA pixels');
    const frame=videoProbePng(960,360).png;
    for(let i=0;i<24;i++)fs.writeFileSync(path.join(directory,'probe-'+String(i).padStart(3,'0')+'.png'),frame);
    const clip=path.join(directory,'probe.mp4');
    checked(run,'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(directory,'probe-%03d.png'),'-vf',VIDEO_LABEL,'-c:v','libx264','-pix_fmt','yuv420p',clip],{timeout:20000});
    const metadata=JSON.parse(text(run,'ffprobe',['-v','error','-count_frames','-select_streams','v:0','-show_entries','stream=codec_name,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration','-show_entries','format=duration','-of','json',clip]));
    return{version,probeVersion,libx264:true,drawtext:true,font:true,pngDecode:{width:800,height:450,format:'rgba',sha256:sha(bytes)},encoded:requireVideoProbeMetadata(metadata)};
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}

export function ensureVideoTools({probe=probeVideoTools,run=spawnSync,probeOnly=false,readOs=()=>fs.readFileSync('/etc/os-release','utf8')}={}){
  const report={schema:1,kind:'ci-video-tool-capability-and-provisioning',nativeAcceptance:false,status:'failed',mode:'existing-capability-probe',initialFailure:null,fallback:[],capabilities:null};
  try{
    try{report.capabilities=probe();report.status='passed';report.mode='reused-existing';return report;}
    catch(error){report.initialFailure=String(error?.message||error).slice(0,1600);}
    if(probeOnly)throw Error('Existing video tools failed the actual capability probe');
    assert(/^ID=(?:ubuntu|"ubuntu")$/m.test(readOs()),'Official Ubuntu fallback requires an Ubuntu host');
    report.mode='official-ubuntu-apt-fallback';
    const common=['-o','Acquire::Retries=1','-o','Acquire::http::Timeout=20','-o','Acquire::https::Timeout=20','-o','DPkg::Lock::Timeout=30'];
    const commands=[
      {seconds:20,args:['sudo','-n','python3',fileURLToPath(new URL('./prepare-inkwave-ci-apt.py',import.meta.url))]},
      {seconds:120,args:['sudo','-n','apt-get',...common,'update']},
      {seconds:180,args:['sudo','-n','env','DEBIAN_FRONTEND=noninteractive','apt-get',...common,'install','-y','--no-install-recommends','ffmpeg','fonts-dejavu-core']},
    ];
    for(const c of commands){
      report.fallback.push({seconds:c.seconds,args:c.args});
      // GNU timeout terminates the process group, including sudo/apt children;
      // a secondary host bound remains longer than its ten-second kill grace.
      checked(run,'timeout',['--signal=TERM','--kill-after=10s',c.seconds+'s',...c.args],{stdio:'inherit',timeout:(c.seconds+15)*1000});
    }
    report.capabilities=probe(); // Installation alone can never satisfy this gate.
    report.status='passed';return report;
  }catch(error){error.videoToolsReport=report;throw error;}
}

export function videoToolArguments(args){
  const at=args.indexOf('--receipt'),probeOnly=args.includes('--probe-only'),receipt=at>=0?args[at+1]:'.ci-scratch/video-tool-provision.json';
  assert(receipt&&!receipt.startsWith('--')&&args.length===(probeOnly?1:0)+(at>=0?2:0)&&args.every((a,i)=>a==='--probe-only'||a==='--receipt'||i===at+1),'Usage: prepare-inkwave-ci-video-tools.mjs [--probe-only] [--receipt file]');
  return{receipt,probeOnly};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const{receipt,probeOnly}=videoToolArguments(process.argv.slice(2));
  let report;
  try{report=ensureVideoTools({probeOnly});}
  catch(error){report=error.videoToolsReport||{schema:1,status:'failed'};report.error=String(error.message).slice(0,1600);process.exitCode=1;}
  fs.mkdirSync(path.dirname(path.resolve(receipt)),{recursive:true});fs.writeFileSync(receipt,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,mode:report.mode,ffmpeg:report.capabilities?.version,ffprobe:report.capabilities?.probeVersion,receipt}));
}
