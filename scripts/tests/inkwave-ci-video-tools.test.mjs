import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {probeVideoTools,ensureVideoTools,requireVideoProbeMetadata,videoProbePng,videoToolArguments,VIDEO_LABEL} from '../prepare-inkwave-ci-video-tools.mjs';

const metadata=()=>({streams:[{codec_name:'h264',pix_fmt:'yuv420p',width:960,height:360,nb_read_frames:'24',r_frame_rate:'30/1',avg_frame_rate:'30/1',duration:'0.800000'}],format:{duration:'0.800000'}});
const decoded=videoProbePng(800,450).raw;
function commands(change=()=>null){
  const calls=[];
  const run=(command,args,options)=>{
    calls.push({command,args,options});const changed=change(command,args,options);if(changed)return changed;
    if(args[0]==='-version')return{status:0,stdout:command+' version 6.1.1\n',stderr:''};
    if(args.includes('-encoders'))return{status:0,stdout:' V....D libx264 H.264 encoder\n',stderr:''};
    if(args.includes('-pix_fmts'))return{status:0,stdout:'IO... yuv420p 3 12\n',stderr:''};
    if(args.includes('-filters'))return{status:0,stdout:' T.C drawtext V->V Draw text\n',stderr:''};
    if(args.includes('pipe:1'))return{status:0,stdout:Buffer.from(decoded),stderr:Buffer.alloc(0)};
    if(command==='ffprobe')return{status:0,stdout:JSON.stringify(metadata()),stderr:''};
    assert.equal(command,'ffmpeg');assert(args.includes('libx264'));return{status:0,stdout:'',stderr:''};
  };
  return{calls,run};
}
test('existing actual required capabilities reuse tools without any OS read or installer invocation',()=>{
  const h=commands();let osReads=0;
  const report=ensureVideoTools({probe:()=>probeVideoTools({run:h.run,fontExists:()=>true}),run:()=>assert.fail('must never install'),readOs:()=>{osReads++;throw Error('not Ubuntu');}});
  assert.equal(report.status,'passed');assert.equal(report.mode,'reused-existing');assert.equal(osReads,0);assert.deepEqual(report.fallback,[]);
  assert.equal(report.capabilities.pngDecode.width,800);assert.equal(report.capabilities.encoded.frames,24);
  const png=h.calls.find(x=>x.args.includes('pipe:1'));assert.equal(png.options.input.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.deepEqual(png.args,['-v','error','-xerror','-i','pipe:0','-frames:v','1','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
  const encode=h.calls.find(x=>x.args.includes(VIDEO_LABEL));assert(encode);assert.equal(encode.args[encode.args.indexOf('-framerate')+1],'30');
  assert.equal(encode.args[encode.args.indexOf('-pix_fmt')+1],'yuv420p');
  const probe=h.calls.find(x=>x.command==='ffprobe'&&x.args.includes('-count_frames'));assert(probe);assert(probe.args.includes('format=duration'));
  assert(h.calls.every(x=>x.options.timeout>0&&x.options.timeout<=20000));
});
for(const [name,change]of Object.entries({
  missing:()=>({status:null,error:Object.assign(Error('missing'),{code:'ENOENT'})}),
  broken:()=>({status:127,stderr:'broken loader'}),
  encoder:(_c,a)=>a.includes('-encoders')?{status:0,stdout:' V....D other encoder\n'}:null,
  pixelFormat:(_c,a)=>a.includes('-pix_fmts')?{status:0,stdout:'IO... yuv444p 3 24\n'}:null,
  filter:(_c,a)=>a.includes('-filters')?{status:0,stdout:' ... scale V->V\n'}:null,
  decoder:(_c,a)=>a.includes('pipe:1')?{status:0,stdout:Buffer.alloc(800*450*4)}:null,
  runtimeEncode:(_c,a)=>a.includes(VIDEO_LABEL)?{status:1,stderr:'drawtext font/encoder failed'}:null,
  timeout:(_c,a)=>a.includes(VIDEO_LABEL)?{status:null,error:Object.assign(Error('timeout'),{code:'ETIMEDOUT'})}:null,
  metadata:(c,a)=>c==='ffprobe'&&a.includes('-count_frames')?{status:0,stdout:'not JSON'}:null,
}))test('missing/unsupported/broken '+name+' cannot pass or install in probe-only mode',()=>{
  const h=commands(change);
  assert.throws(()=>ensureVideoTools({probe:()=>probeVideoTools({run:h.run,fontExists:()=>true}),probeOnly:true,run:()=>assert.fail('probe-only attempted install')}),error=>error.videoToolsReport.status==='failed'&&error.videoToolsReport.fallback.length===0);
});
test('a listed filter without the required real font does not pass',()=>{
  const h=commands();assert.throws(()=>probeVideoTools({run:h.run,fontExists:()=>false}),/font required/);
});
test('CLI rejects unknown, duplicate or missing options before probing or installing',()=>{
  assert.deepEqual(videoToolArguments(['--probe-only','--receipt','evidence/tools.json']),{probeOnly:true,receipt:'evidence/tools.json'});
  for(const args of [['unknown'],['--receipt'],['--receipt','--probe-only'],['--probe-only','--probe-only'],['--receipt','a','--receipt','b']])assert.throws(()=>videoToolArguments(args),/Usage/);
});
for(const [field,value]of [['codec_name','vp9'],['pix_fmt','yuv444p'],['width',800],['height',450],['nb_read_frames','23'],['r_frame_rate','24/1'],['avg_frame_rate','15/1'],['duration','0.7']])test('runtime metadata rejects changed '+field,()=>{
  const m=metadata();m.streams[0][field]=value;assert.throws(()=>requireVideoProbeMetadata(m));
});
test('runtime metadata requires one stream and actual format duration',()=>{
  for(const m of [{streams:[],format:{duration:'.8'}},{...metadata(),format:{duration:'0.7'}}])assert.throws(()=>requireVideoProbeMetadata(m));
});
function fallbackFixture(failAt=-1){
  const calls=[];let probes=0;const caps={verified:'actual-probe-result'};
  const probe=()=>{if(++probes===1)throw Error('missing capability');return caps;};
  const run=(command,args,options)=>{calls.push({command,args,options});return calls.length-1===failAt?{status:124,stderr:'bounded provisioning failed'}:{status:0};};
  return{calls,probe,run,caps,probes:()=>probes};
}
test('unsupported tools use only bounded normal-trust Ubuntu fallback then must pass a second actual probe',()=>{
  const f=fallbackFixture(),r=ensureVideoTools({...f,readOs:()=> 'ID=ubuntu\n'});
  assert.equal(r.status,'passed');assert.equal(r.mode,'official-ubuntu-apt-fallback');assert.equal(f.probes(),2);assert.equal(r.capabilities,f.caps);
  assert.equal(f.calls.length,3);
  for(const c of f.calls){assert.equal(c.command,'sudo');assert.deepEqual(c.args.slice(0,2),['-n','timeout'],'privileged timeout directly owns the installer process group');assert(c.args.includes('--kill-after=10s'));assert(c.args.includes('--signal=TERM'));assert(c.options.timeout<=195000);}
  assert(f.calls[0].args.some(a=>a.endsWith('scripts/prepare-inkwave-ci-apt.py')));
  for(const c of f.calls.slice(1)){assert(c.args.includes('Acquire::Retries=1'));assert(c.args.includes('Acquire::http::Timeout=20'));assert(c.args.includes('Acquire::https::Timeout=20'));assert(c.args.includes('DPkg::Lock::Timeout=30'));}
  assert(f.calls[2].args.includes('ffmpeg'));assert(f.calls[2].args.includes('fonts-dejavu-core'));
  assert.doesNotMatch(JSON.stringify(f.calls),/allow-unauthenticated|trusted=yes|Verify-Peer=false|apt-key|curl|wget|setup-ffmpeg|TOKEN/);
});
for(const failure of [0,1,2])test('fallback failure '+failure+' stops later commands and never records a provisioning pass',()=>{
  const f=fallbackFixture(failure);
  assert.throws(()=>ensureVideoTools({...f,readOs:()=> 'ID=ubuntu\n'}),error=>error.videoToolsReport.status==='failed');
  assert.equal(f.calls.length,failure+1);assert.equal(f.probes(),1);
});
test('successful apt alone is insufficient and unsupported OS cannot run Ubuntu fallback',()=>{
  const f=fallbackFixture();f.probe=()=>{throw Error('still unsupported');};
  assert.throws(()=>ensureVideoTools({...f,readOs:()=> 'ID=ubuntu\n'}),error=>error.videoToolsReport.status==='failed');
  const other=fallbackFixture();assert.throws(()=>ensureVideoTools({...other,readOs:()=> 'ID=debian\n'}),/Ubuntu host/);assert.equal(other.calls.length,0);
});

const read=name=>fs.readFileSync(new URL('../../.github/workflows/'+name,import.meta.url),'utf8');
function workflowContract(ink,native){
  for(const s of [ink,native]){
    for(const p of ['scripts/prepare-inkwave-ci-video-tools.mjs','scripts/prepare-inkwave-ci-apt.py','scripts/tests/inkwave-ci-video-tools.test.mjs'])assert(s.includes("      - '"+p+"'\n"),'focused input trigger '+p);
    assert.match(s,/run: node --test [^\n]*scripts\/tests\/inkwave-ci-video-tools.test.mjs/);
    assert.doesNotMatch(s,/sudo apt-get|continue-on-error|uses: .*setup-ffmpeg/);
    assert.match(s,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
    assert.match(s,/      - uses: actions\/upload-artifact@v4\n        if: always\(\)/);
  }
  assert.match(ink,/timeout-minutes: 30/);assert.match(native,/timeout-minutes: 45/);
  assert(ink.includes('group: ink-micro-surface-${{ github.event.pull_request.number }}'));assert(native.includes('group: explosher-glitter-pr-${{ github.event.pull_request.number }}'));
  assert(ink.includes('run: node scripts/prepare-inkwave-ci-video-tools.mjs --receipt .browser-evidence/ink-micro-surface/video-tool-provision.json'));
  assert(native.includes('run: node scripts/prepare-inkwave-ci-video-tools.mjs --receipt .ci-scratch/explosher/video-tool-provision.json'));
  for(const command of ['node scripts/check-inkwave-ink-micro-surface.mjs --site _site --evidence-dir .browser-evidence/ink-micro-surface','node scripts/verify-ink-micro-surface-video.mjs .browser-evidence/ink-micro-surface --frames-only','node scripts/verify-ink-micro-surface-video.mjs .browser-evidence/ink-micro-surface\n'])assert(ink.includes(command),command);
  const encode=`ffmpeg -y -framerate 30 -i ".browser-evidence/ink-micro-surface/texlib-$view-$viewmode-$age-%03d.png" -vf "${VIDEO_LABEL}" -c:v libx264 -pix_fmt yuv420p ".browser-evidence/ink-micro-surface/$view-$viewmode-$age.mp4"`;
  assert(ink.includes(encode),'original exact encode command retained');
  assert(ink.indexOf('--frames-only')<ink.indexOf('run: node scripts/prepare-inkwave-ci-video-tools'));
  assert(ink.indexOf(encode)<ink.indexOf('node scripts/verify-ink-micro-surface-video.mjs .browser-evidence/ink-micro-surface\n'));
  assert(native.includes("readExplosherStagePair('preflight'"));assert(native.includes('ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c'));
  const nativeRequired=native.slice(native.indexOf('    steps:'),native.indexOf('      - name: Capture admitted inverse baseline stills'));
  assert.doesNotMatch(nativeRequired,/^\s+(?:if|continue-on-error):/m,'required native pair and decoder checks unconditional');
  assert.doesNotMatch(native,/if: false/,'full pair cannot be silently skipped');
  assert(native.includes("readExplosherStagePair('stills'"),'strict stills admission required');
  const inkRequired=ink.slice(ink.indexOf('      - name: Source regressions'),ink.indexOf('      - uses: actions/upload-artifact'));
  assert.doesNotMatch(inkRequired,/^\s+(?:if|continue-on-error):/m,'required native and encode checks unconditional');
}
test('both observed paths preserve native/source/encode/full-clip gates and existing budgets with capability-first provisioning',()=>{
  workflowContract(read('inkwave-ink-micro-surface.yml'),read('inkwave-explosher-flight-glitter.yml'));
});
test('negative source controls reject unconditional apt, missing coverage, skipped encodes, weakened clip checks and larger budgets',()=>{
  const ink=read('inkwave-ink-micro-surface.yml'),native=read('inkwave-explosher-flight-glitter.yml');
  for(const [before,after]of [
    ['timeout-minutes: 30','timeout-minutes: 60'],
    ["      - 'scripts/prepare-inkwave-ci-apt.py'\n",''],
    ['--frames-only','--ignored-frame-proof'],
    ['-c:v libx264 -pix_fmt yuv420p','-c:v libx264 -pix_fmt yuv444p'],
    ['      - name: Encode actual successive frames\n','      - name: Encode actual successive frames\n        if: false\n'],
    ['node scripts/verify-ink-micro-surface-video.mjs .browser-evidence/ink-micro-surface\n','true # omitted full clips\n'],
    ['run: node scripts/prepare-inkwave-ci-video-tools.mjs --receipt .browser-evidence/ink-micro-surface/video-tool-provision.json','run: sudo apt-get install -y ffmpeg'],
    ['        if: always()\n',''],
  ]){assert(ink.includes(before));assert.throws(()=>workflowContract(ink.replace(before,after),native));}
  for(const [before,after]of [['timeout-minutes: 45','timeout-minutes: 90'],["readExplosherStagePair('preflight'","readExplosherStagePair('ignored'"],['ref: 364dd0a7fad9508652b4b4c6ec3d82eb124e9c5c','ref: main'],['      - name: Install required PNG decoder\n','      - name: Install required PNG decoder\n        if: false\n']])assert.throws(()=>workflowContract(ink,native.replace(before,after)));
});
