/**
 * Turn a short recorded Charger HoldNoise transient into a continuous texture.
 *
 * Only reads the already-decoded authorized AudioBuffer. Never synthesizes
 * oscillators, downloads samples, or alters the source AudioBuffer in place.
 * Overlap-add grains from the low-transient interior of the recording and
 * create a single ~560 ms ring; this prevents the MP3's strong onset from
 * clicking every ~200 ms as the original file loops.
 *
 * Sound design, NOT a recovered Nintendo SLINK or a verified charge-rise curve.
 */
const derived=new WeakMap();
const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export function chargerHoldSustain(ctx,source){
  if(!source||typeof source.getChannelData!=='function'||typeof ctx?.createBuffer!=='function')return source;
  const cached=derived.get(source);if(cached)return cached;
  const sr=source.sampleRate||ctx.sampleRate,frames=source.length,ch=source.numberOfChannels;
  if(!Number.isFinite(sr)||sr<8000||!Number.isInteger(frames)||frames<sr*.12||
     !Number.isInteger(ch)||ch<1||ch>8)return source;
  const grain=Math.min(Math.round(sr*.05),Math.floor(frames/4)),hop=Math.floor(grain/2);
  if(grain<64||hop<1)return source;
  // The first ~40-110ms contains the strongest transient. Avoid that onset;
  // avoid the near-silent final fade, which would pulse at every seam.
  const earliest=Math.min(frames-grain,Math.round(sr*Math.max(.042,Math.min(frames/sr*.29,.11))));
  const latest=Math.min(frames-grain,Math.round(sr*Math.min(frames/sr*.48,.19)));
  const first=Math.max(0,Math.min(earliest,latest)),last=Math.max(first,latest);
  const length=Math.round(sr*.56);
  const out=ctx.createBuffer(ch,length,sr),inputs=[],outputs=[];
  for(let c=0;c<ch;c++){inputs.push(source.getChannelData(c));outputs.push(out.getChannelData(c));}
  const weights=new Float32Array(length),window=new Float32Array(grain);
  for(let i=0;i<grain;i++){const s=Math.sin(Math.PI*(i+.5)/grain);window[i]=s*s;}
  let seed=(Math.imul(frames,1664525)^(Math.trunc(sr)*1013904223))>>>0;
  const next=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  for(let k=-2;k<=Math.ceil(length/hop)+2;k++){
    const offset=first+(last>first?next()%(last-first+1):0);
    for(let i=0;i<grain;i++){
      const at=((k*hop+i)%length+length)%length,w=window[i];
      weights[at]+=w;
      for(let c=0;c<ch;c++)outputs[c][at]+=inputs[c][offset+i]*w;
    }
  }
  let sourceEnergy=0,outEnergy=0;
  for(let c=0;c<ch;c++){
    const inp=inputs[c],dst=outputs[c];
    for(let i=0;i<frames;i++)sourceEnergy+=inp[i]*inp[i];
    for(let i=0;i<length;i++){dst[i]/=Math.max(weights[i],1e-6);outEnergy+=dst[i]*dst[i];}
  }
  // Match the source's perceived level without amplifying its background
  // noise without bound. Overall voice gain remains controlled by the mixer.
  const sourceRms=Math.sqrt(sourceEnergy/(frames*ch)),outRms=Math.sqrt(outEnergy/(length*ch));
  const level=outRms>1e-8?clamp(sourceRms*.85/outRms,1,3.2):1;
  const seam=Math.min(Math.floor(sr*.005),Math.floor(length/16));
  for(let c=0;c<ch;c++){
    const dst=outputs[c];
    for(let i=0;i<length;i++)dst[i]*=level;
    // Force sample-continuous endpoints with a tiny symmetrical crossfade.
    const edge=(dst[0]+dst[length-1])*.5;
    for(let i=0;i<seam;i++){
      const x=i/(seam-1),w=x*x*(3-2*x);
      dst[i]=edge*(1-w)+dst[i]*w;
      dst[length-1-i]=edge*(1-w)+dst[length-1-i]*w;
    }
  }
  derived.set(source,out);
  return out;
}
