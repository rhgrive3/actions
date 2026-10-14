/**
 * Focused, original, event-layered synthesis for audible weapon/SUB mismatches.
 * No Nintendo sample, resampled waveform, or hidden retail SLINK constant is included.
 * Reference metadata may guide the noise bed but never becomes a copied waveform.
 * All envelopes, layer ordering and coefficients below are authored sound design.
 */
const TAU=2*Math.PI;
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function rand(seed){return ()=>{seed|=0;seed=seed+0x6d2b79f5|0;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};}
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
// Per-model sound-design distinctions (not reverse-engineered retail constants).
// Scaling actual source-characteristic envelopes where available is handled by
// source-guided-render; here we keep otherwise unrelated models recognizable.
const modelColor=Object.freeze({
 WeaponBrushMini:[1.29,.86,1.24],WeaponBrushNormal:[.93,1.00,.94],WeaponBrushHeavy:[.72,1.20,.82],
 WeaponRollerCompact:[1.28,.83,1.22],WeaponRollerNormal:[1,1,1],
 WeaponRollerHeavy:[.72,1.28,.70],WeaponRollerHunter:[1.08,1.06,1.13],WeaponRollerWide:[.86,1.15,.78],
 WeaponChargerQuick:[1.43,.88,1.38],WeaponChargerNormal:[1,1,1],WeaponChargerNormalScope:[1,1,1],
 WeaponChargerLong:[.74,1.22,.82],WeaponChargerLongScope:[.74,1.22,.82],
 WeaponChargerLight:[1.58,.78,1.45],WeaponChargerKeeper:[.89,1.07,.92],WeaponChargerPencil:[1.72,.83,1.60],
 WeaponShelterNormal:[1,1,1],WeaponShelterWide:[.74,1.31,.72],
 WeaponShelterCompact:[1.26,.82,1.33],WeaponShelterFocus:[1.12,.98,1.13],
 WeaponShooterExpert:[.94,1.04,1.06],WeaponBlasterLight:[1.2,.90,1.13],WeaponBlasterLightLong:[.91,1.09,.84],
});
const isTarget=(r)=>r.family==='brush'||r.family==='roller'||r.family==='charger'||r.family==='brella'||r.family==='sub'||r.sourceActor==='WeaponShooterExpert'||['WeaponBlasterLight','WeaponBlasterLightLong'].includes(r.sourceActor);
export const PRIORITY_FAMILIES=Object.freeze(['brush','roller','charger','brella','sub']);
export const PRIORITY_ACTORS=Object.freeze(['WeaponShooterExpert','WeaponBlasterLight','WeaponBlasterLightLong']);
export const isPrioritySound=isTarget;

/**
 * Generate a single multi-part articulation. One AudioBufferSource represents the
 * entire composite, so a rapid-fire shot doesn't create many WebAudio nodes.
 */
export function renderPrioritySound(recipe,event,variant=0,sr=48000,guided=null){
  if(!isTarget(recipe))return null;
  variant=(((Math.trunc(variant)||0)%3)+3)%3;
  const family=recipe.family,actor=recipe.sourceActor||'',sub=String(recipe.id||'').replace(/^sub:/,'');
  const r=rand((recipe.seed^hash(event)^Math.imul(variant+1,0x9e3779b1))>>>0);
  const loop=['roll','charge','spin'].includes(event);
  const brush=family==='brush',roller=family==='roller',charger=family==='charger',brella=family==='brella',kit=family==='sub';
  const pro=actor==='WeaponShooterExpert',rapid=['WeaponBlasterLight','WeaponBlasterLightLong'].includes(actor);
  const weight=actor==='WeaponRollerHeavy'||actor==='WeaponShelterWide'?1.75:actor==='WeaponRollerCompact'||actor==='WeaponShelterCompact'?.68:actor==='WeaponBrushHeavy'?1.45:1;
  const coarse=Number(recipe.coefficients?.[0])||240;
  const [pitchColor,tailColor,brightColor]=modelColor[actor]||[1,1,1];
  let seconds=loop?.66:brush?.255:roller?(event==='fire_vertical'?.43:.32):charger?(event==='fire_full'?.52:.34):brella?.27:kit?.28:rapid?.35:.28;
  if(event==='explosion'||event==='break')seconds=kit?.54:rapid?.55:brella?.57:.48;
  if(event==='open'||event==='purge')seconds=brella?(event==='purge'?.52:.30):.35;
  if(event==='close')seconds=brella?.22:.18;
  if(event==='shield_hit')seconds=.21;
  if(event==='windup')seconds=brush?.16:roller?.28:.13;
  if(event==='charge')seconds=.72;
  if(event==='ready')seconds=charger?.25:.23;
  if(event==='release')seconds=.18;
  if(event==='impact')seconds=.23;
  if(event==='scope')seconds=.12;
  if(event==='fire'&&pro)seconds=.39;
  // Preserve measured *envelopes* for documented S1-era samples. Source clips
  // are feature-guided synthesis, never redistributed / resampled audio bytes.
  const hasGuide=!!(guided?.length&&['fire','fire_full','fire_vertical','roll','windup','ready'].includes(event));
  seconds=clamp(hasGuide?guided.length/sr:seconds*tailColor,.09,.84);
  const len=Math.ceil(seconds*sr),x=new Float32Array(len),noise=new Float32Array(len),lo=new Float32Array(len),mid=new Float32Array(len),hi=new Float32Array(len);
  let a=0,b=0,c=0;
  const lowHz=clamp(coarse*.92,80,680),highHz=clamp((brush?6400:kit?4600:pro?4400:brella?5300:rapid?3600:roller?4500:2600)/weight,1200,sr*.43);
  const kLo=1-Math.exp(-TAU*lowHz/sr),kMid=1-Math.exp(-TAU*Math.min(sr*.46,highHz*.37*brightColor)/sr),kHi=1-Math.exp(-TAU*Math.min(sr*.46,highHz*brightColor)/sr);
  for(let i=0;i<len;i++){
    const n=r()*2-1;a+=kLo*(n-a);b+=kMid*(n-b);c+=kHi*(n-c);
    noise[i]=n;lo[i]=a;mid[i]=(b-a);hi[i]=(c-b);
  }
  // All component pulses have their own attack/ring rather than changing one
  // shared waveform's pitch. Layer offsets are in seconds from the admitted event.
  function burst(at,amp,dec=.05,attack=.001,type='mid',shift=0){
    const from=Math.max(0,Math.floor(at*sr)),dur=Math.min(len-from,Math.ceil(sr*dec*7));
    const src=type==='low'?lo:type==='hi'?hi:type==='raw'?noise:mid;
    for(let j=0;j<dur;j++){
      const t=j/sr,env=(1-Math.exp(-t/attack))*Math.exp(-t/dec),idx=from+j;
      // Reuse one coherent noise stream but start each pulse at a distinct phase.
      x[idx]+=src[(idx+shift+len)%len]*amp*env;
    }
  }
  function chirp(at,amp,f0,f1,dec=.06,attack=.001,harm=.13){
    const from=Math.max(0,Math.floor(at*sr)),dur=Math.min(len-from,Math.ceil(dec*8*sr));let phase=0;
    for(let j=0;j<dur;j++){
      const t=j/sr,idx=from+j,q=clamp(t/(dec*2),0,1),f=clamp(f0*Math.pow(f1/Math.max(1,f0),smooth(q)),30,sr*.43);
      phase+=TAU*Math.min(f*pitchColor,sr*.43)/sr;x[idx]+=amp*(Math.sin(phase)+harm*Math.sin(2*phase))*(1-Math.exp(-t/attack))*Math.exp(-t/dec);
    }
  }
  function drops(n,at,span,amp,high=false){
    for(let k=0;k<n;k++){
      const t=at+span*r(),freq=(high?1400:450)+(high?4700:1200)*r(),d=.009+.02*r();
      chirp(t,amp*(.5+.5*r()),freq*1.4,freq*.47,d,.0007,.23);
    }
  }
  function brushLayers(){
    if(event==='roll'){
      for(let k=0;k<18;k++){const t=k*seconds/18;burst(t,.13,.016,.0012,'hi');chirp(t,.038,2500,900,.014,.001,.12);}
      burst(0,.13,.22,.018,'mid');return;
    }
    if(event==='windup'){burst(.008,.66,.046,.008,'hi');chirp(.015,.12,680,2300,.047,.003);return;}
    if(event==='fire'){
      burst(.004,1.6,.048,.002,'hi');burst(.013,.71,.087,.003,'mid');
      chirp(.011,.19,3400,900,.042,.0008);drops(10,.025,.116,.057,true);
      if(actor==='WeaponBrushHeavy'){burst(.017,.74,.095,.003,'low');}
      return;
    }
    burst(.001,1,.027,.0008,'hi');drops(5,.005,.065,.06,true);
  }
  function rollerLayers(){
    if(event==='roll'){
      burst(0,.58,.34,.03,'mid');burst(0,.18,.30,.018,'hi');
      const steps=weight>1?12:21;
      for(let k=0;k<steps;k++){const t=k*seconds/steps;burst(t,.085*weight,.026,.001,'hi');chirp(t,.019*weight,330,190,.026,.002);}
      return;
    }
    if(event==='windup'){
      burst(.02,.47,.072,.026,'hi');chirp(.01,.14*weight,240,890,.092,.009);
      drops(3,.045,.12,.023);return;
    }
    if(event==='fire'||event==='fire_vertical'){
      const vertical=event==='fire_vertical',at=vertical?.09:.047;
      burst(.008,.46,.095,.024,'hi');
      burst(at,.95*weight,vertical?.088:.056,.002,'mid');
      burst(at+.009,.55*weight,.095,.003,'low');
      chirp(at,.24*weight,vertical?440:700,vertical?120:270,vertical?.11:.07,.001);
      drops(vertical?11:17,at+.004,vertical?.14:.085,.065*weight,vertical);
      return;
    }
    burst(0,.53,.025,.0008,'mid');drops(4,.001,.045,.075);
  }
  function chargerLayers(){
    if(event==='charge'){
      // Smooth continuous energized bed, with an accelerating high-frequency air texture.
      let p=0;for(let i=0;i<len;i++){
        const t=i/sr,mod=.82+.08*Math.sin(TAU*7*t)+.10*Math.sin(TAU*13*t);
        p+=TAU*(200*pitchColor+28*Math.sin(TAU*1.3*t))/sr;
        x[i]+=.14*mod*Math.sin(p)+.07*hi[i]+.035*mid[i];
      }return;
    }
    if(event==='ready'){
      chirp(.008,.40,1050,2250,.061,.002,.28);chirp(.057,.23,1980,2650,.057,.0009);
      burst(.003,.13,.03,.002,'hi');return;
    }
    if(event==='scope'){chirp(.004,.19,1700,2180,.026,.0008);burst(0,.05,.02,.001,'hi');return;}
    if(event==='release'){burst(.005,.13,.026,.002,'mid');chirp(0,.11,800,290,.041,.003);return;}
    if(event==='fire'||event==='fire_full'){
      const full=event==='fire_full',body=full?1.23:.67,delay=full?.003:.004;
      burst(delay,.78,.022,.0005,'hi');burst(delay+.003,body,.07,.001,'mid');
      burst(delay+.009,.50*body,.16,.003,'low');
      chirp(delay+.005,.61*body,full?2400:1600,full?710:470,full?.16:.091,.0006,.23);
      chirp(delay+.02,.24*body,440,210,.17,.002);
      drops(full?10:6,delay+.017,.085,.035*body,true);return;
    }
    burst(.002,.41,.045,.0006,'hi');drops(4,.01,.057,.035);
  }
  function brellaLayers(){
    if(event==='open'){
      burst(.006,.7*weight,.018,.001,'low');chirp(.006,.20*weight,320,780,.042,.001);
      burst(.018,.85*weight,.09,.012,'hi');
      for(let k=0;k<5;k++)burst(.021+k*.013,.17*weight,.012,.0009,'mid');
      chirp(.078,.14,1200,400,.054,.002);return;
    }
    if(event==='close'){
      burst(.009,.38,.06,.017,'hi');chirp(.055,.25*weight,720,250,.029,.0007);
      burst(.084,.34*weight,.012,.0005,'low');return;
    }
    if(event==='purge'){
      chirp(.008,.45*weight,350,195,.13,.003);burst(.016,.85*weight,.12,.008,'mid');
      burst(.09,.47*weight,.16,.02,'hi');drops(5,.08,.22,.040);return;
    }
    if(event==='shield_hit'||event==='break'){
      const many=event==='break';burst(0,.66*weight,.022,.0005,'mid');
      chirp(.002,.32*weight,840,140,.07,.0004);burst(.015,.35,.068,.002,'hi');
      if(many){for(let k=0;k<7;k++)burst(.06+k*.052,.15*weight,.026,.0008,'hi');}
      return;
    }
    if(event==='fire'){
      burst(.001,1.30*weight,.026,.0005,'mid');burst(.002,.55*weight,.045,.0005,'low');
      chirp(.003,.38*weight,450,170,.067,.0004);
      for(let k=0;k<9;k++){const t=.003+.025*r();burst(t,.16*weight,.023,.001,'hi',Math.floor(r()*len));}
      drops(8,.012,.046,.024*weight,true);return;
    }
    burst(.002,.37*weight,.032,.001,'mid');drops(6,.008,.043,.045);
  }
  function proLayers(){
    if(event==='fire'||event==='fire_alt'){
      burst(0,1.00,.027,.0005,'mid');burst(.004,.55,.027,.001,'hi');
      chirp(.001,.56,1120,520,.052,.0006,.28);
      chirp(.018,.38,420,170,.086,.0007,.18);drops(4,.018,.055,.021,true);
      return;
    }
    burst(.004,.51,.05,.001,'hi');
  }
  function rapidLayers(){
    if(event==='fire'||event==='fire_alt'){
      burst(0,.58,.011,.0003,'hi');burst(.003,.88,.034,.0007,'mid');
      chirp(.004,.71,830,260,.052,.0006,.19);
      chirp(.024,.26,210,105,.086,.004);drops(5,.014,.045,.025);return;
    }
    if(event==='explosion'){
      burst(.004,1.31,.055,.0008,'low');burst(.001,.76,.11,.001,'mid');
      burst(.021,.34,.09,.006,'hi');drops(13,.015,.105,.042);return;
    }
    burst(.002,.35,.034,.001,'mid');drops(3,.008,.04,.018);
  }
  const kitDetails={
    bomb:[.80,350,9],suction:[.70,245,9],curling:[.54,760,13],burst:[1.20,870,6],
    autobomb:[.60,540,6],fizzy:[1.15,1800,18],torpedo:[.65,1350,12],inkMine:[.50,235,4],
    toxicMist:[1.0,2800,18],angleShooter:[.48,3100,3],splashWall:[.90,410,25],
    sprinkler:[.57,1600,12],beakon:[.25,1570,4],pointSensor:[.37,2100,5]};
  function kitLayers(){
    const [weight,freq,count]=kitDetails[sub]||[.6,900,9];
    const utility=['beakon','pointSensor','angleShooter','sprinkler','splashWall','toxicMist'].includes(sub);
    if(event==='explosion'||event==='break'){
      if(utility){chirp(.011,.37*weight,freq*.73,freq*.25,.11,.003);burst(.01,.63*weight,.125,.008,'hi');drops(count,.025,.12,.043,true);return;}
      burst(.002,1.32*weight,.062,.001,'low');burst(.008,.92*weight,.078,.002,'mid');
      chirp(.009,.38*weight,freq*.52,100,.10,.0009);
      drops(count,.016,.13,.047*weight,true);
      if(sub==='fizzy'){for(let k=0;k<3;k++)burst(.08+k*.073,.31*weight,.02,.001,'hi');}
      return;
    }
    if(event==='fire'||event==='open'){
      if(sub==='angleShooter'||sub==='pointSensor'||sub==='beakon'){
        chirp(.003,.46*weight,freq,freq*(sub==='beakon'?1.52:.69),.06,.002,.27);
        chirp(.055,.18*weight,freq*.8,freq*.48,.055,.002);burst(0,.22,.018,.001,'hi');
      }else if(sub==='sprinkler'||sub==='splashWall'){
        burst(.004,.56*weight,.07,.005,'hi');chirp(.01,.19*weight,freq*.7,freq*1.12,.066,.002);
        drops(count,.012,.1,.032*weight,true);
      }else if(sub==='toxicMist'){
        burst(.004,.83*weight,.18,.026,'hi');drops(count,.012,.12,.023*weight,true);
      }else{
        // Object throw: rubber flick + hollow cap + brief surface water contact.
        burst(.003,.56*weight,.027,.001,'mid');chirp(.004,.32*weight,freq*1.4,freq*.5,.048,.001);
        burst(.015,.27*weight,.049,.004,'hi');drops(2,.018,.04,.022,true);
      }
      return;
    }
    if(event==='ready'){chirp(.002,.32*weight,freq*.9,freq*1.16,.06,.003,.22);burst(.015,.10*weight,.038,.004,'hi');return;}
    if(event==='spin'){
      for(let k=0;k<12;k++){const t=k*seconds/12;burst(t,.13*weight,.021,.003,'hi');chirp(t,.05*weight,freq*.85,freq*1.10,.021,.002);}
      return;
    }
    if(event==='impact'||event==='shield_hit'){
      chirp(.002,.37*weight,freq*.72,freq*.24,.045,.0008);burst(.002,.41*weight,.04,.001,'mid');
      drops(4,.006,.055,.038*weight);return;
    }
    burst(0,.25*weight,.04,.001,'mid');drops(3,.014,.035,.023);
  }
  if(brush)brushLayers();else if(roller)rollerLayers();else if(charger)chargerLayers();else if(brella)brellaLayers();else if(pro)proLayers();else if(rapid)rapidLayers();else if(kit)kitLayers();

  if(hasGuide){
    // Local loudness-constrained mixing: retain the measured recording's 15 ms
    // envelope even after injecting authored transient/texture layers. Merely
    // adding unbounded shaped noise destroyed the match and loudness dynamics.
    const frame=Math.max(16,Math.round(sr*.015));
    for(let first=0;first<len;first+=frame){
      const last=Math.min(len,first+frame);let wetEnergy=0,dryEnergy=0;
      for(let i=first;i<last;i++){
        const g=guided[Math.min(guided.length-1,i)]||0;
        wetEnergy+=g*g;dryEnergy+=x[i]*x[i];
      }
      const wetRms=Math.sqrt(wetEnergy/(last-first));
      const dryRms=Math.sqrt(dryEnergy/(last-first));
      const relative=wetRms<1e-9?0:Math.min(4,wetRms/Math.max(dryRms,1e-7));
      for(let i=first;i<last;i++){
        const g=guided[Math.min(guided.length-1,i)]||0;
        x[i]=.88*g+.22*x[i]*relative;
      }
    }
  }
  // A gentle dynamics curve, stable RMS, and sub-millisecond DC/edge control.
  let dc=0;for(let i=0;i<len;i++)dc+=x[i];dc/=len;
  let peak=0;
  for(let i=0;i<len;i++){const t=i/sr,fadeIn=smooth(t/(loop?.011:.002)),fadeOut=loop?1:smooth((seconds-t)/.03);
    x[i]=Math.tanh((x[i]-dc)*1.43)*fadeIn*fadeOut;peak=Math.max(peak,Math.abs(x[i]));}
  const gain=Math.min(12,.72/Math.max(peak,1e-8));for(let i=0;i<len;i++)x[i]*=gain;
  if(loop){const k=Math.min(Math.floor(.029*sr),Math.floor(len/10));
    for(let j=0;j<k;j++){const q=smooth(j/(k-1)),tail=x[len-k+j],head=x[j],blend=(1-q)*tail+q*head;
      x[j]=blend;x[len-k+j]=blend;}
    x[len-1]=x[0];
  }else{x[0]=0;x[len-1]=0;}
  return x;
}
