// Reference-derived *resynthesis*. No original reference waveform samples are shipped.
// Original sample phase is deliberately discarded: reference envelopes and coarse band power
// steer seeded random-phase STFT. This is not a waveform reconstruction or an S3 match.
import { sourceMeasurementFor } from './reference-profiles.mjs';
const TAU=2*Math.PI;
const BANDS=[0,180,450,1000,2200,4500,10000,22050];
const SAMPLE_TIMES=[0,.045,.11,.20];
function rng(seed){let n=seed|0;return ()=>{n=n+0x6D2B79F5|0;let z=Math.imul(n^n>>>15,1|n);z^=z+Math.imul(z^z>>>7,61|z);return ((z^z>>>14)>>>0)/4294967296;};}
function mix(a,b,q){return a+(b-a)*q;}
function fft(re,im,inverse){
  const n=re.length;let j=0;
  for(let i=1;i<n;i++){
    let bit=n>>1;while(j&bit){j^=bit;bit>>=1;}j^=bit;
    if(i<j){let v=re[i];re[i]=re[j];re[j]=v;v=im[i];im[i]=im[j];im[j]=v;}
  }
  for(let size=2;size<=n;size<<=1){const angle=(inverse?TAU:-TAU)/size;
    for(let a=0;a<n;a+=size)for(let k=0;k<size/2;k++){
      const c=Math.cos(k*angle),s=Math.sin(k*angle),lo=a+k,hi=lo+size/2;
      const x=re[hi]*c-im[hi]*s,y=re[hi]*s+im[hi]*c;
      re[hi]=re[lo]-x;im[hi]=im[lo]-y;re[lo]+=x;im[lo]+=y;
    }
  }
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
function bandsAt(data,t){
  // Short WAVs (e.g. a 133 ms charge-complete chime) do not have 200 ms spectra.
  // Clamp to the last *measured* frame rather than interpolating through null.
  let last=0;for(let i=0;i<data.seq.length;i++)if(data.seq[i])last=i;
  if(!last||t>=SAMPLE_TIMES[last])return data.seq[last]||data.seq[0];
  let i=0;while(i<last-1&&t>SAMPLE_TIMES[i+1])i++;
  if(!data.seq[i]||!data.seq[i+1])return data.seq[i]||data.seq[i+1]||data.seq[last];
  const q=Math.max(0,Math.min(1,(t-SAMPLE_TIMES[i])/(SAMPLE_TIMES[i+1]-SAMPLE_TIMES[i])));
  return data.seq[i].map((v,k)=>mix(v,data.seq[i+1][k],q));
}
function dbEnvelope(data,t,loop){
  // null is an explicit "not measured" marker, never an amplitude of 0 dB.
  let measured=data.env.findIndex(v=>!Number.isFinite(v));
  if(measured<0)measured=data.env.length;
  const last=Math.max(0,measured-1);
  if(loop)t=t%(.015*Math.max(1,measured));
  const q=t/.015,idx=Math.floor(q);
  if(idx>=last){
    // Beyond sampled time: smooth synthetic taper, NOT an extrapolated source measurement.
    return data.env[last]-Math.max(0,t-.015*last)*65;
  }
  return mix(data.env[idx],data.env[idx+1],q-idx);
}
function taper(x){return .5-.5*Math.cos(Math.PI*Math.max(0,Math.min(1,x)));}
export function renderGuidedSample(recipe,event,variant=0,sampleRate=48000){
  const source=sourceMeasurementFor(recipe,event,variant);
  if(!source)return null;
  if(sampleRate<8000||sampleRate>192000)throw new RangeError('Invalid sample rate');
  const looping=['roll','charge','spin'].includes(event);
  const seconds=looping?.72:Math.max(.12,Math.min(1.06,source.ms/1000));
  const length=Math.ceil(seconds*sampleRate),out=new Float32Array(length);
  const N=1024,H=N/4,r=rng(randomSeed(recipe.id+event+String(variant)));
  const win=new Float64Array(N);for(let i=0;i<N;i++)win[i]=Math.sqrt(.5-.5*Math.cos(TAU*i/(N-1)));
  const centers=BANDS.slice(0,-1).map((lo,j)=>[lo,BANDS[j+1]]);
  const counts=centers.map(([low,high])=>{
    let n=0;for(let k=1;k<N/2;k++)if(k*sampleRate/N>=low&&k*sampleRate/N<high)n++;return Math.max(1,n);
  });
  const ampScale=0.25;
  for(let start=-N+H;start<length;start+=H){
    const t=Math.max(0,(start+N/2)/sampleRate);
    const amps=bandsAt(source,t);
    const real=new Float64Array(N),imag=new Float64Array(N);
    for(let k=1;k<N/2;k++){
      const f=k*sampleRate/N;
      const which=centers.findIndex(([lo,hi])=>f>=lo&&f<hi);
      if(which<0)continue;
      const power=Math.pow(10,amps[which]/10)/counts[which];
      const a=Math.sqrt(power)*ampScale;
      const theta=r()*TAU;real[k]=a*Math.cos(theta);imag[k]=a*Math.sin(theta);
      real[N-k]=real[k];imag[N-k]=-imag[k];
    }
    fft(real,imag,true);
    for(let k=0;k<N;k++){const i=start+k;if(i>=0&&i<length)out[i]+=real[k]*win[k];}
  }
  // Apply sampled temporal envelope (first 300ms). Normalize once, never boost silence.
  let max=0;for(const x of out)max=Math.max(max,Math.abs(x));
  const gain=.68/Math.max(max,1e-12);
  for(let i=0;i<length;i++){
    const t=i/sampleRate;
    const envelope=Math.pow(10,Math.max(-90,dbEnvelope(source,t,looping))/20);
    const fadeIn=t<.001?t/.001:1;
    const fadeOut=!looping?Math.min(1,(length-i)/(sampleRate*.025)):1;
    out[i]*=gain*envelope*fadeIn*fadeOut;
  }
  // Overall gain normalizes the measured-time texture to avoid too-quiet material.
  let peak=0,dc=0;for(const x of out){peak=Math.max(peak,Math.abs(x));dc+=x;}dc/=length;
  const desiredPeak=0.68,scale=peak>0?desiredPeak/peak:1;
  for(let i=0;i<length;i++)out[i]=(out[i]-dc)*scale;
  // Smooth loop boundary after FFT generation, no sudden clicks when the source wraps.
  if(looping){const blend=Math.min(Math.floor(.03*sampleRate),length>>3);
    const first=out.slice(0,blend),last=out.slice(length-blend);
    for(let i=0;i<blend;i++){const q=taper(i/(blend-1));const v=last[i]*(1-q)+first[i]*q;out[i]=v;out[length-blend+i]=v;}
    out[length-1]=out[0];
  }else{out[0]=0;out[length-1]=0;}
  return out;
}
function randomSeed(s){let x=2166136261;for(const c of s)x=Math.imul(x^c.charCodeAt(0),16777619);return x>>>0;}
