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
  return {source:'production-entry-imports-and-generated-worker',deviceInitialized:false,workerPath,workerProtocol:'invalid-id-rejected',workerTerminated:true};
}
