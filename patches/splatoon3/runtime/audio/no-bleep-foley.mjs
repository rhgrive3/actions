/**
 * INKWAVE v6 focused, entirely original textured-foley articulations.
 * Target: non-Splat-Charger chargers, rollers with unmeasured articulation,
 *         and the four canopy/brella mechanisms.
 * This is NOT an extracted Splatoon 3 waveform/SLINK table and is NOT evidence
 * of retail equivalence. No sinusoidal tone or tuned chirp is generated.
 * All pressure changes are noise-excited, damped and state-dependent.
 */
const TAU = 2 * Math.PI;
const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
const smooth = x => {const q=clamp(x,0,1);return q*q*(3-2*q);};
function random(seed){return ()=>{seed=(seed+0x6D2B79F5)|0;let v=Math.imul(seed^seed>>>15,1|seed);v^=v+Math.imul(v^v>>>7,61|v);return ((v^v>>>14)>>>0)/4294967296;};}
function hash(t){let h=2166136261;for(const c of t)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}

// Per-model attack, material, moisture and mechanism profiles. These numerical
// parameters are original sound-design decisions, NOT Nintendo measurements.
// The target is to eliminate artificial electronics while preserving different
// physical sources; family-wide pitch shifts are deliberately not used.
export const FOLEY_MODELS=Object.freeze({
  WeaponChargerQuick:{kind:'charger',body:310,air:6100,mechanism:3400,wet:.40,mass:.70,charge:.40,shot:.24},
  WeaponChargerLong:{kind:'charger',body:145,air:3500,mechanism:1100,wet:.45,mass:1.58,charge:.87,shot:.54},
  WeaponChargerLongScope:{kind:'charger',body:160,air:3350,mechanism:970,wet:.42,mass:1.53,charge:.88,shot:.54},
  WeaponChargerLight:{kind:'charger',body:460,air:7750,mechanism:5300,wet:.20,mass:.56,charge:.27,shot:.19},
  WeaponChargerKeeper:{kind:'charger',body:205,air:3900,mechanism:1700,wet:.75,mass:1.12,charge:.67,shot:.43},
  WeaponChargerPencil:{kind:'charger',body:355,air:5100,mechanism:2600,wet:.30,mass:.80,charge:.72,shot:.23},
  WeaponRollerCompact:{kind:'roller',body:340,air:7600,mechanism:2600,wet:.44,mass:.65,shot:.19},
  WeaponRollerHeavy:{kind:'roller',body:110,air:3600,mechanism:650,wet:.83,mass:1.78,shot:.50},
  WeaponRollerHunter:{kind:'roller',body:205,air:5500,mechanism:1600,wet:.72,mass:1.25,shot:.32},
  WeaponRollerWide:{kind:'roller',body:170,air:6800,mechanism:1000,wet:.94,mass:1.14,shot:.30},
  WeaponShelterNormal:{kind:'brella',body:240,air:5100,mechanism:1600,wet:.63,mass:1,shot:.23},
  WeaponShelterWide:{kind:'brella',body:125,air:3500,mechanism:630,wet:.77,mass:1.78,shot:.42},
  WeaponShelterCompact:{kind:'brella',body:395,air:6700,mechanism:2400,wet:.42,mass:.68,shot:.19},
  WeaponShelterFocus:{kind:'brella',body:285,air:4700,mechanism:1550,wet:.57,mass:.92,shot:.25},
});
export const FOLEY_TARGETS=Object.freeze(Object.keys(FOLEY_MODELS));
export const isFoleyTarget = recipe => !!FOLEY_MODELS[recipe?.sourceActor];

// Different events describe physically different action paths, rather than
// individual pitches of one generic effect. Each event renders ONE mono PCM.
export function renderFoleySound(recipe,event,variant=0,sampleRate=48000){
  const p=FOLEY_MODELS[recipe?.sourceActor];if(!p)return null;
  if(!recipe.events.includes(event))throw new RangeError(`Unrecognized ${recipe.id}/${event}`);
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('Invalid sample rate');
  variant=((Math.trunc(variant)%3)+3)%3;
  const sr=sampleRate,loop=['charge','roll'].includes(event),rng=random(hash(`${recipe.id}:${event}:${variant}:v6`));
  const base={
    fire:p.shot+.09,fire_full:p.shot+.15,fire_vertical:p.shot+.22,
    charge:.76,ready:.21,release:.17,scope:.11,impact:.23,
    windup:.32,roll:.78,open:.35,close:.25,purge:.59,shield_hit:.26,break:.60
  };
  const seconds=clamp(base[event]??.31,.10,.92),count=Math.ceil(sr*seconds);
  const signal=new Float32Array(count);
  // A stable, broadband source with separate dark/bright and thin/bulky noise.
  // There are NO oscillators or frequency sweeps, including for ready/scope.
  const sources={raw:new Float32Array(count),thump:new Float32Array(count),body:new Float32Array(count),mechanism:new Float32Array(count),air:new Float32Array(count)};
  let l0=0,l1=0,l2=0,l3=0;
  const k0=1-Math.exp(-TAU*clamp(p.body*.48,50,sr*.40)/sr);
  const k1=1-Math.exp(-TAU*clamp(p.body*2.5,130,sr*.42)/sr);
  const k2=1-Math.exp(-TAU*clamp(p.mechanism,250,sr*.43)/sr);
  const k3=1-Math.exp(-TAU*clamp(p.air,500,sr*.45)/sr);
  for(let i=0;i<count;i++){
    const raw=rng()*2-1;
    l0+=k0*(raw-l0);l1+=k1*(raw-l1);l2+=k2*(raw-l2);l3+=k3*(raw-l3);
    sources.raw[i]=raw;
    sources.thump[i]=l0;
    sources.body[i]=l1-l0;
    sources.mechanism[i]=l2-l1;
    sources.air[i]=l3-l2;
  }
  // Events specify non-tonal physical excitation: broadband snap, compressed
  // fluid release, damped housing, abrasion and air passage.
  function noise(at,amp,dec=.06,attack=.002,which='body',rise=0){
    const from=Math.floor(Math.max(0,at)*sr),dur=Math.min(count-from,Math.ceil(7*dec*sr));
    if(dur<=0)return;
    const data=sources[which];
    const shift=Math.floor(rng()*count);
    for(let j=0;j<dur;j++){
      const t=j/sr,env=(1-Math.exp(-t/Math.max(1/sr,attack)))*Math.exp(-t/dec);
      const brightness=rise?(.47+.53*smooth(t/(rise))):1;
      signal[from+j]+=amp*env*brightness*data[(from+j+shift)%count];
    }
  }
  function click(at,amp=.4,dec=.009,heavy=false){
    noise(at,amp,dec,.00022,heavy?'body':'mechanism');
    noise(at+.0015,amp*(heavy?.72:.36),dec*1.9,.00028,heavy?'thump':'air');
  }
  function spray(at,amount,span,amp,large=false){
    for(let j=0;j<amount;j++){
      const time=at+span*(j+rng()*.82)/amount;
      const dec=(large?.018:.007)+rng()*(large?.028:.014);
      noise(time,amp*(.55+.8*rng()),dec,.0005,j%3?'air':'body');
      if(large&&j%4===0)noise(time+.003,amp*.70,dec*1.8,.001,'thump');
    }
  }
  // Use discontinuous abrasion impulses rather than a periodic siren or buzzer.
  function scrape(at,dur,strength,steps,weight=.60){
    noise(at,strength*.45,dur*.55,.012,'air');
    for(let j=0;j<steps;j++){
      const t=at+dur*(j+rng()*.85)/steps;
      noise(t,strength*(.17+.20*rng()),.009+.018*rng(),.0008,j%3===0?'body':'mechanism');
      if(weight>.7&&j%5===0)noise(t+.006,strength*weight*.15,.039,.002,'thump');
    }
  }
  if(p.kind==='charger'){
    if(event==='charge'){
      // Hydraulic charging bed: dynamically changing broad airflow, NOT a sine.
      // Put variation in the noisy mechanical texture, not in a fixed beep note.
      for(let i=0;i<count;i++){
        const t=i/sr,progress=smooth(t/.67),breathe=.70+.30*smooth(t/.13);
        const flutter=(.83+.17*Math.sin(TAU*(5.1+p.mass*1.1)*t));
        signal[i]+=(.18+.17*progress)*p.mass*breathe*(.75*sources.body[i]+.55*sources.mechanism[i]);
        signal[i]+=(.11+.23*progress)*flutter*sources.air[i]*(.68+.32*p.charge);
      }
      scrape(.02,.12,.12*p.mass,5,.75);
    }else if(event==='ready'){
      // Mechanical release/catch, intentionally no electrical chime.
      click(.005,.55*p.mass,.014,true);
      noise(.02,.25,.08,.005,'mechanism');
      if(p.mass>1.3)noise(.042,.35,.11,.013,'thump');
    }else if(event==='release'){
      click(.002,.29,.012,true);noise(.015,.19,.064,.005,'air');
    }else if(event==='scope'){
      click(.002,.16,.007,false);noise(.006,.12,.022,.002,'mechanism');
    }else if(event==='impact'){
      noise(0,.64,.044,.0004,'body');spray(.005,7,.08,.26,true);
    }else if(event==='fire'||event==='fire_full'){
      const full=event==='fire_full',m=p.mass;
      // Direct pressure burst, broad resonant body and separate wet sputter.
      click(0,(full?.8:.49)*m,.012,true);
      noise(.003,(full?1.10:.58)*m,full?.073:.046,.00045,'body');
      noise(.008,(full?.55:.29)*m,full?.16:.078,.0012,'thump');
      noise(.004,(full?.70:.43),full?.080:.051,.00055,'air');
      noise(.015,(full?.48:.21),full?.15:.09,.006,'mechanism');
      spray(.027,full?14:8,full?.13:.085,(full?.105:.066)*p.wet,true);
      if(recipe.sourceActor==='WeaponChargerPencil'){
        // Each registered shot is a compact, individually triggered mechanical
        // attack, NOT a five-note bleep or five pre-rendered shots.
        click(.012,.40,.009,false);noise(.035,.28,.06,.002,'mechanism');
      }
      if(recipe.sourceActor==='WeaponChargerLight'){
        click(.014,.36,.007,false);noise(.022,.36,.052,.001,'air');
      }
    }
  }else if(p.kind==='roller'){
    if(event==='roll'){
      noise(0,.25+.26*p.wet,.68,.045,'body');
      noise(0,.18+.24*p.wet,.68,.03,'air');
      const steps=Math.round(14+p.mass*5);
      scrape(.02,.64,.30*p.mass,steps,.78);
      spray(.022,steps,.64,.016*p.wet,true);
    }else if(event==='windup'){
      scrape(.01,.18,.62*p.mass,9,.70);
      noise(.035,.29*p.mass,.08,.018,'body');
    }else if(event==='fire'||event==='fire_vertical'){
      const vertical=event==='fire_vertical';
      const delay=vertical?.075:.030;
      scrape(.008,vertical?.18:.105,.48*p.mass,vertical?9:6,.65);
      noise(delay,(vertical?.94:.71)*p.mass,vertical?.095:.058,.0006,'body');
      noise(delay+.009,(vertical?.67:.47)*p.mass,vertical?.13:.073,.0025,'thump');
      noise(delay+.012,(vertical?.62:.47),vertical?.14:.082,.006,'air');
      spray(delay+.022,vertical?11:17,vertical?.16:.09,(vertical?.10:.065)*p.wet,true);
      if(recipe.sourceActor==='WeaponRollerWide')noise(delay+.036,.42,.09,.002,'air');
    }else if(event==='impact'){
      noise(0,.59,.045,.0005,'body');spray(.008,11,.090,.075*p.wet,true);
    }
  }else if(p.kind==='brella'){
    if(event==='fire'){
      // One pellet cluster event: multi-point ink pops, no tonal laser chirp.
      click(0,.38*p.mass,.008,true);
      noise(.003,.91*p.mass,.047,.0006,'body');
      noise(.005,.38*p.mass,.070,.0014,'thump');
      spray(.006,12,.044,.075*p.wet,true);
      noise(.012,.31,.063,.007,'air');
    }else if(event==='open'){
      click(.002,.43*p.mass,.008,true);
      scrape(.012,.09,.65*p.mass,7,.46);
      noise(.013,.32,.075,.011,'air');
      click(.111,.31*p.mass,.012,false);
    }else if(event==='close'){
      scrape(.004,.071,.37*p.mass,6,.4);
      click(.067,.56*p.mass,.013,true);
      noise(.084,.21,.055,.006,'body');
    }else if(event==='purge'){
      click(.002,.43*p.mass,.013,true);
      noise(.012,.48*p.mass,.20,.012,'air');
      scrape(.03,.19,.47*p.mass,11,.7);
      noise(.13,.34*p.mass,.21,.009,'body');
      spray(.18,9,.17,.043*p.wet,true);
    }else if(event==='shield_hit'){
      noise(0,.85*p.mass,.068,.001,'body');
      noise(.005,.55*p.mass,.102,.004,'thump');
      scrape(.013,.055,.31,4,.3);
    }else if(event==='break'){
      noise(0,.89*p.mass,.09,.0006,'body');
      click(.013,.53*p.mass,.012,true);
      scrape(.027,.23,.70*p.mass,18,.5);
      noise(.12,.32,.25,.018,'air');
      spray(.075,12,.25,.045*p.wet,true);
    }else if(event==='impact'){
      noise(0,.58,.045,.0003,'body');spray(.006,9,.084,.057*p.wet,true);
    }
  }
  // Gentle saturation preserves transient structure while controlling peak.
  // Guard headroom and avoid per-event changes to game volume settings.
  let mean=0;for(const x of signal)mean+=x;mean/=count;
  let peak=0;
  const saturation=(p.kind==='charger'&&event.startsWith('fire'))?4.1:(p.kind==='brella'&&['open','fire','close','purge'].includes(event))?2.6:1.48;
  const edge=loop?Math.floor(sr*.015):Math.floor(sr*.019);
  for(let i=0;i<count;i++){
    const t=i/sr;
    const inFade=loop?smooth(t/.023):smooth(t/.00085);
    const outFade=loop?1:smooth((seconds-t)/.019);
    const x=Math.tanh((signal[i]-mean)*saturation)*inFade*outFade;
    signal[i]=x;peak=Math.max(peak,Math.abs(x));
  }
  const gain=Math.min(8,.70/Math.max(peak,1e-8));
  for(let i=0;i<count;i++)signal[i]*=gain;
  if(loop){
    // True overlap-add of the crossfade region. Protect both value and slope
    // at the wrap point so holding ZR/rolling does not click each cycle.
    const width=Math.max(64,Math.min(Math.floor(sr*.060),Math.floor(count/7)));
    const out=new Float32Array(count-width);
    out.set(signal.subarray(width));
    for(let i=0;i<width;i++){
      const q=smooth(i/(width-1));
      out[i]=(1-q)*signal[count-width+i]+q*signal[i];
    }
    const finalWidth=Math.min(96,Math.floor(out.length/12));
    // Make first/last derivatives approximate without forcing silence.
    for(let i=0;i<finalWidth;i++){
      const q=smooth(i/(finalWidth-1));
      const averaged=(out[i]+out[out.length-finalWidth+i])*.5;
      out[i]=averaged*(1-q)+out[i]*q;
      out[out.length-finalWidth+i]=out[out.length-finalWidth+i]*q+averaged*(1-q);
    }
    // After the broad overlap-add, make the wrap C1 continuous. Only a small
    // corrected tail is used, so there is no forced tone or long periodic ramp.
    const n=out.length;
    out[n-1]=out[0];
    const desiredPrevious=out[0]-(out[1]-out[0]);
    const delta=desiredPrevious-out[n-2],seamFix=Math.min(32,Math.floor(n/40));
    for(let i=0;i<seamFix;i++){
      const t=i/(seamFix-1),w=(1-smooth(t))**2;
      out[n-2-i]+=delta*w;
    }
    let edgePeak=0;for(const x of out)edgePeak=Math.max(edgePeak,Math.abs(x));
    if(edgePeak>.70){const q=.70/edgePeak;for(let i=0;i<n;i++)out[i]*=q;}
    out[n-1]=out[0];
    return out;
  }
  signal[0]=0;signal[count-1]=0;
  return signal;
}
