import { renderGuidedSample } from './source-guided-render.mjs';
import { renderPrioritySound } from './priority-signatures.mjs';
import { renderS3Articulation } from './s3-articulation.mjs';
import { renderFoleySound } from './no-bleep-foley.mjs';
// Deterministic PCM renderer. Original synthesis, no Nintendo waveform/SLINK constants.
import { LOOP_EVENTS } from './weapon-recipes.mjs';
const TAU=2*Math.PI;
export function random(seed) { return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}; }
export function hash(text){let h=2166136261;for(const c of text)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
const finite=(n,d)=>Number.isFinite(n)?n:d;
export function renderSound(recipe,event='fire',variant=0,sampleRate=48000) {
  if(!recipe?.events.includes(event))throw new RangeError('Unknown articulation '+recipe?.id+':'+event);
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Unsupported sample rate');
  variant=((Math.trunc(finite(variant,0))%3)+3)%3;
  // The user-reported tonal artifacts are corrected at the earliest audio path.
  // Do not layer old sine/chirp synthesis on top of the non-tonal foley.
  const corrected=renderFoleySound(recipe,event,variant,sampleRate);
  if(corrected)return corrected;
  const guided=renderGuidedSample(recipe,event,variant,sampleRate);
  // S3-only weapons use a dedicated, gameplay-structure-aware articulation.
  // This is original synthesis, NOT a claimed retail-audio measurement.
  const s3=renderS3Articulation(recipe,event,variant,sampleRate);
  if(s3)return s3;
  const priority=renderPrioritySound(recipe,event,variant,sampleRate,guided);
  if(priority)return priority;
  if(guided)return guided;
  const rnd=random(recipe.seed^hash(event)^Math.imul(variant+1,0x9e3779b1));
  let [f,dec,cut,mix,wet,grains,mech,lag,clack,ratio,ring,drive]=recipe.coefficients;
  let attack=.0009,body=.58,liquid=.16,length=dec*3.4+.04, sweep=3.8;
  const loop=LOOP_EVENTS.has(event), heavy=event==='fire_full';
  if(heavy){body*=1.3;length*=1.22;dec*=1.18;ring*=1.35;sweep=1.2;mix*=.85;}
  if(event==='fire_alt'){dec*=.74;cut*=1.28;mix*=.83;clack*=1.3;ratio*=1.13;}
  if(event==='fire_left'){lag+=2.2;ratio*=1.043;clack*=.83;wet*=.96;}
  if(event==='fire_vertical'){attack=.003;length*=1.3;dec*=1.25;cut*=.73;grains+=5;lag+=17;}
  if(event==='impact'||event==='shield_hit'){body=.29;f*=.65;dec*=.7;mix*=1.2;liquid=.27;clack*=.3;ring*=.5;length=.25;}
  if(event==='explosion'||event==='break'){f=50+f*.11;dec=.14+dec*.45;body=.85;mix=.88;cut*=.64;liquid=.22;grains+=8;length=.85;ring=.12;}
  if(event==='windup'||event==='dodge'||event==='purge'){body=.10;attack=.013;mix=.85;dec*=1.2;cut*=1.3;liquid=.09;length=Math.min(.55,dec*3);clack*=.5;}
  if(['open','close','scope','release'].includes(event)){body=.18;f=mech*.31;mix=.3;dec=.03;ring=.30;liquid=.015;grains=1;length=.18;lag=8;clack=.5;}
  if(event==='ready'){f=mech*.65;dec=.09;ring=.45;body=.25;mix=.035;liquid=0;grains=0;length=.38;lag=24;clack=.15;sweep=.02;}
  if(loop){length=.72;attack=.015;body=.12;mix=event==='roll'?.70:.18;liquid=event==='roll'?.09:.008;grains=event==='roll'?24:3;dec=.09;ring=.1;}
  length=Math.min(1,Math.max(.09,length));
  const n=Math.ceil(length*sampleRate), out=new Float32Array(n);cut=Math.min(sampleRate*.42,cut);
  const lpA=1-Math.exp(-TAU*cut/sampleRate), bpA=1-Math.exp(-TAU*Math.min(wet,sampleRate*.35)/sampleRate);
  const fLoop=Math.max(1,Math.round((event==='roll'?f*.19:mech*.08)*length))/length;
  let lp=0,bp=0,phase=0,mPhase=0;
  for(let i=0;i<n;i++){
    const t=i/sampleRate, env=loop?1:(1-Math.exp(-t/attack))*Math.exp(-t/dec);
    const freq=loop?fLoop:f*(1+sweep*Math.exp(-t/.007));
    phase+=TAU*Math.min(sampleRate*.40,freq)/sampleRate;
    const white=rnd()*2-1;lp+=lpA*(white-lp);bp+=bpA*(white-bp);
    const flutter=loop?(1+.12*Math.sin(TAU*Math.round(length*23)*t/length)):(1+.17*Math.sin(TAU*wet*.14*t));
    const tones=Math.sin(phase)+ring*Math.sin(phase*ratio)*Math.exp(loop?0:-t/(dec*.64));
    let x=(body*tones+mix*(lp-bp*.55)*flutter)*env;
    if(!loop&&event.startsWith('fire')){
      switch(recipe.family){
        case 'roller': x=(mix*(lp-bp*.4)*Math.sin(Math.PI*Math.min(1,t/(dec*2.5)))+body*.28*tones)*env;break;
        case 'brush': x=(mix*(lp-bp)*(.45+.55*Math.abs(Math.sin(TAU*(45+mech*.006)*t)))+body*.14*tones)*env;break;
        case 'charger': x=(body*Math.sin(phase+2.6*Math.sin(phase*ratio)*Math.exp(-t/.018))+.35*mix*lp)*env;break;
        case 'splatling': x=(body*.65*tones+.22*Math.sin(mPhase*1.31)*Math.exp(-t/.012)+mix*(lp-bp*.3))*env;break;
        case 'slosher': x=(body*.32*tones+mix*.45*(lp-bp))*env;break;
        case 'brella': x=(mix*lp*(.55+.45*Math.cos(TAU*71*t))+body*.6*tones)*env;break;
        case 'stringer': x=(body*(Math.sin(phase)+.42*Math.sin(phase*2)+.23*Math.sin(phase*3))*Math.exp(-t/(dec*.6))+mix*.3*lp)*env;break;
        case 'splatana': x=(mix*(lp-bp)*Math.sin(Math.PI*Math.min(1,t/(dec*1.8)))+ring*Math.sin(phase*ratio)*Math.exp(-t/(dec*.6)))*env;break;
        case 'blaster': x+=(.22*Math.sin(TAU*f*.45*t)+.35*mix*lp)*(1-Math.exp(-t/.006))*Math.exp(-t/(dec*1.5));break;
      }
    }
    const mt=t-lag/1000;
    if(mt>=0){mPhase+=TAU*Math.min(sampleRate*.42,mech)/sampleRate;const ce=loop?.045:Math.exp(-mt/.012)*(1-Math.exp(-mt/.0006));
      x+=clack*ce*(Math.sin(mPhase)+.35*Math.sin(mPhase*(ratio+1.1))+.22*white);}
    out[i]=x;
  }
  // Stochastic liquid resonators with per-variant timing/excitation, not transposed copies.
  for(let k=0;k<grains;k++){
    const st=loop?Math.floor(rnd()*n):Math.floor((.003+rnd()*Math.min(.14,length*.5))*sampleRate);
    const dur=.014+rnd()*.040, f0=wet*(.58+rnd()*.85), amp=liquid*(.45+rnd()*.55);let phase=0;
    const len=Math.min(n,Math.ceil(dur*4*sampleRate));
    for(let j=0;j<len;j++){const t=j/sampleRate,idx=st+j;if(!loop&&idx>=n)break;
      phase+=TAU*Math.min(sampleRate*.42,f0*(1+1.8*Math.exp(-t/.01)))/sampleRate;
      out[idx%n]+=amp*Math.sin(phase)*(1-Math.exp(-t/.0008))*Math.exp(-t/dur);}
  }
  let mean=0;for(const x of out)mean+=x;mean/=n;
  let peak=0;for(let i=0;i<n;i++){out[i]=Math.tanh((out[i]-mean)*drive)/Math.tanh(drive);peak=Math.max(peak,Math.abs(out[i]));}
  const gain=.76/Math.max(.76,peak);for(let i=0;i<n;i++)out[i]*=gain;
  if(loop){
    // Overlap tail into head, then remove overlap. Boundary uses adjacent source samples.
    const k=Math.min(512,Math.floor(n/8)), result=out.slice(0,n-k);
    for(let i=0;i<k;i++){const u=i/(k-1),a=.5-.5*Math.cos(Math.PI*u);result[i]=out[n-k+i]*(1-a)+out[i]*a;}
    return result;
  }
  const fade=Math.min(Math.floor(sampleRate*.015),Math.floor(n/4));
  for(let i=0;i<fade;i++)out[n-1-i]*=.5-.5*Math.cos(Math.PI*i/fade);
  out[0]=0;out[n-1]=0;return out;
}
export function pcmMetrics(pcm,sampleRate){let peak=0,ss=0,sum=0,onset=-1;for(let i=0;i<pcm.length;i++){const x=pcm[i];if(!Number.isFinite(x))throw new Error('Non-finite PCM');peak=Math.max(peak,Math.abs(x));ss+=x*x;sum+=x;if(onset<0&&Math.abs(x)>.001)onset=i;}
  return {duration:pcm.length/sampleRate,peak,peakDbFS:20*Math.log10(peak||1e-12),rmsDbFS:10*Math.log10(ss/pcm.length||1e-24),dc:sum/pcm.length,onsetSeconds:onset<0?null:onset/sampleRate};}
