// Synchronous capture of the latest diagnostic render; no rendering or scene mutation.
// Kept closure-free so the exact tested factory can be injected into the browser.
export function createVfxFrameCapture({readPixels,encodePng,binding,width,height}) {
 const fail=message=>{throw Error('VFX frame evidence: '+message);};
 if(!/^[a-f0-9]{40}$/.test(binding?.head||'')||!/^[a-f0-9]{64}$/.test(binding?.contentHash||'')||!/^[a-f0-9]{64}$/.test(binding?.revision||''))fail('missing build identity');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)fail('invalid dimensions');
 let serial=0,last=null;const names=new Set(),frames=[];
 return {
  rendered(pixels){if(pixels?.length!==width*height*4)fail('invalid pixel buffer');last={serial:++serial,pixels};return pixels;},
  latest(){if(!last)fail('no rendered frame');return last.pixels;},
  capture(meta,pixels){
   if(!last||pixels!==last.pixels)fail('stale or unrelated render');
   if(!['pool','fist'].includes(meta?.kind)||![.35,1].includes(meta.quality)||!['baseline','target'].includes(meta.phase))fail('invalid target metadata');
   if(meta.kind==='pool'?!['sparks','puffs'].includes(meta.key):(!['clear','dispose','normal'].includes(meta.mode)||![0,1].includes(meta.cycle)))fail('invalid case');
   const name=['vfx',meta.kind,'q'+meta.quality,meta.key||meta.mode,...(meta.kind==='fist'?[meta.cycle]:[]),meta.phase].join('-');
   if(names.has(name))fail('duplicate capture');
   const current=readPixels();if(current?.length!==pixels.length)fail('framebuffer dimensions');
   for(let i=0;i<pixels.length;i++)if(current[i]!==pixels[i])fail('framebuffer changed since render');
   const data=encodePng();if(typeof data!=='string'||!data.startsWith('data:image/png;base64,'))fail('missing PNG');
   const frame={...binding,...meta,name,renderSerial:last.serial,width,height,data};names.add(name);frames.push(frame);return name;
  },
  frames
 };
}
