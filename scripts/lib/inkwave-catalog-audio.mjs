import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

// The .mjs worker is a build input, not a page module. Verify the complete
// generated output, plus the actual production Worker reference, before using
// the .js receipt as its installed-graph representative.
export function validateCatalogAudioWorker(root) {
  const bank=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/audio/bank.mjs'),'utf8');
  if(!/new Worker\(new URL\('\.\/render-worker\.js',import\.meta\.url\),\{name:'inkwave-audio-render'\}\)/.test(bank))throw Error('Catalog audio production worker reference changed');
  execFileSync(process.execPath,[path.join(root,'tools/audio/build-worker.mjs'),'--check'],{stdio:'pipe'});
}

// Serialized into the browser. Import production entries, never initialize an
// audio device or synthesize voices in this motion fixture. The worker receives
// an invalid-ID protocol probe only; real-only audio remains unchanged.
export async function catalogAudioGraph(prefix) {
  const [{audio},{music},runtime,combat,blaster]=await Promise.all([
    import(prefix+'src/audio/audio.js'),import(prefix+'src/audio/music.js'),
    import(prefix+'patches/splatoon3/runtime/audio/runtime.mjs'),
    // These live helpers are owned by composed src/main.js, not audio.js.
    // The isolated catalogue deliberately does not boot main; load its exact
    // helpers here rather than exempting their immutable loaded-byte receipts.
    import(prefix+'patches/splatoon3/runtime/audio/combat-hit-classifier.mjs'),
    import(prefix+'patches/splatoon3/runtime/audio/blaster-hit.mjs'),
  ]);
  if(!audio||!music||typeof audio.playWeapon!=='function'||typeof audio.loopWeapon!=='function'||typeof music.play!=='function'||typeof runtime.installWeaponAudioRuntime!=='function')throw Error('Catalog production audio entry graph missing');
  if(typeof combat.sourceChargerHitCue!=='function'||typeof blaster.blasterHitCueKind!=='function')throw Error('Catalog production main audio helper graph missing');
  if(audio.ctx!==null)throw Error('Catalog audio graph unexpectedly initialized device');
  const workerPath=prefix+'patches/splatoon3/runtime/audio/render-worker.js';
  const worker=new Worker(workerPath,{name:'catalog-audio-graph'});
  try {
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Catalog audio worker response timeout')),10000);
      worker.onerror=event=>{clearTimeout(timer);reject(Error('Catalog audio worker failed: '+event.message));};
      worker.onmessage=({data})=>{clearTimeout(timer);if(data?.key!=='catalog-invalid-id'||data.error!=='Unknown audio ID'||data.pcm!==undefined)reject(Error('Catalog audio worker protocol mismatch'));else resolve();};
      worker.postMessage({key:'catalog-invalid-id',id:'__catalog_invalid_id__',event:'fire',variant:0,sampleRate:8000});
    });
  }finally{worker.terminate();}
  // These native module workers are lazy device-prewarm entries, so importing
  // audio.js alone does not load them. Exercise their real PCM protocols without
  // constructing an AudioContext, and compare against their canonical exports.
  const [{renderTexturePCM},{renderReverbPair}]=await Promise.all([
    import(prefix+'patches/splatoon3/runtime/audio/grain-texture.mjs'),
    import(prefix+'patches/splatoon3/runtime/audio/reverb-impulse.mjs'),
  ]);
  const prewarmWorkers=[];
  for(const name of ['grain','reverb']){
    const path=prefix+'patches/splatoon3/runtime/audio/'+name+'-worker.mjs';
    const w=new Worker(path,{type:'module',name:'catalog-'+name});
    let reply;
    try{
      reply=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Catalog '+name+' worker timeout')),10000);
        w.onerror=e=>{clearTimeout(timer);reject(Error('Catalog '+name+' worker failed: '+e.message));};
        w.onmessage=({data})=>{clearTimeout(timer);resolve(data);};
        w.postMessage({sampleRate:8000,generation:'catalog-prewarm',kinds:['bubbles']});
      });
      if(reply.sampleRate!==8000||reply.generation!=='catalog-prewarm'||name==='grain'&&reply.kind!=='bubbles')throw Error('Catalog prewarm worker protocol mismatch');
      const actual=name==='grain'?[reply.pcm]:reply.pair?.flat();
      const expected=name==='grain'?[renderTexturePCM(8000,'bubbles')]:renderReverbPair(8000).flat();
      if(!Array.isArray(actual)||actual.length!==expected.length)throw Error('Catalog prewarm PCM denominator');
      let bytes=0;
      for(let i=0;i<expected.length;i++){
        if(!(actual[i] instanceof Float32Array)||actual[i].length!==expected[i].length||!actual[i].length)throw Error('Catalog prewarm PCM length');
        const a=new Uint8Array(actual[i].buffer,actual[i].byteOffset,actual[i].byteLength),b=new Uint8Array(expected[i].buffer,expected[i].byteOffset,expected[i].byteLength);
        if(!a.every((value,j)=>value===b[j]))throw Error('Catalog prewarm PCM bytes differ');bytes+=a.length;
      }
      prewarmWorkers.push({path,protocol:'canonical-pcm-byte-exact',bytes,terminated:true});
    }finally{w.terminate();}
  }
  return {source:'production-entry-imports-and-generated-worker',deviceInitialized:false,workerPath,workerProtocol:'invalid-id-rejected',workerTerminated:true,prewarmWorkers};
}
