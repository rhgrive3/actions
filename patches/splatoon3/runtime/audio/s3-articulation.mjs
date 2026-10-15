/**
 * Splatoon 3 gameplay-STRUCTURED, original sound design.
 *
 * Gameplay facts come from Nintendo's weapon descriptions/change log; audio
 * oscillators, pulse offsets, gain, envelope, spectral color and random seeds
 * are authored approximations, NOT sound parameters decoded from Splatoon 3.
 * There are NO Nintendo waveform samples or BARS/BWAV files in this module.
 *
 * Each attack is rendered to one PCM buffer for the existing polyphony/cache
 * management. Subprojectiles within a single accepted gameplay attack remain
 * part of a SINGLE audio event (no duplicate projectile/gameplay admissions).
 */
const TAU=2*Math.PI;
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
const rng=seed=>()=>{seed+=0x6D2B79F5;let t=Math.imul(seed^seed>>>15,1|seed);t^=t+Math.imul(t^t>>>7,61|t);return((t^t>>>14)>>>0)/4294967296;};
const S3_OFFICIAL='https://en-americas-support.nintendo.com/app/answers/detail/a_id/61257/~/splatoon-3-update-history';
const S3_NEW='https://www.nintendo.com/us/whatsnew/free-update-for-sizzle-season-2024-in-splatoon-3-brings-a-new-battle-stage-new-weapons-and-more/';
const N_WEAPONS='https://splatoon.nintendo.com/en/news/beginner-basics-for-splatoon-3-choosing-the-right-weapons/';
const TRI='https://splatoonwiki.org/wiki/Tri-Stringer';
const DENTAL='https://splatoonwiki.org/wiki/Mint_Decavitator';
const MOP='https://splatoonwiki.org/wiki/Dread_Wringer';
const SB='https://splatoonwiki.org/wiki/S-BLAST_%2792';
const PENCIL='https://splatoonwiki.org/wiki/Snipewriter_5H';
const WELL='https://splatoonwiki.org/wiki/Wellstring_V';

/** Source-backed ATTACK MECHANICS, not any claims about the retail sound waves. */
export const S3_GAMEPLAY_CUES=Object.freeze({
  WeaponShooterQuickLong:{label:'スペースシューター',basis:'S3-introduced shooter; individual attack',source:S3_OFFICIAL},
  WeaponBlasterPrecision:{label:'S-BLAST92',basis:'grounded long-range vs jump short-range blast; mode-change sound documented',source:SB},
  WeaponRollerWide:{label:'ワイドローラー',basis:'horizontal flick / vertical flick / rolling',source:N_WEAPONS},
  WeaponBrushHeavy:{label:'フィンセント',basis:'heavy brush initial swing / repeated ink strokes',source:S3_OFFICIAL},
  WeaponChargerPencil:{label:'R-PEN/5H',basis:'charged reservoir releases FIVE individually triggered shots; 17-frame minimum cadence',source:PENCIL},
  WeaponSlosherDouble:{label:'モップリン',basis:'TWO groups, each eight projectiles one frame apart; second group begins eight frames later',source:MOP},
  WeaponSpinnerHyperShort:{label:'イグザミナー',basis:'fully charged rapid firing',source:S3_OFFICIAL},
  WeaponManeuverLong:{label:'ガエンFF',basis:'different post-dodge firing mode',source:S3_OFFICIAL},
  WeaponShelterFocus:{label:'24式張替傘',basis:'separate shot / canopy launch',source:S3_OFFICIAL},
  WeaponStringerNormal:{label:'トライストリンガー',basis:'THREE projectiles; charged explosion on impact',source:TRI},
  WeaponStringerShort:{label:'LACT-450',basis:'THREE projectiles; charged attack WITHOUT frozen explosive shots',source:N_WEAPONS},
  WeaponStringerExplosion:{label:'フルイドV',basis:'FIVE arrows; charging past first ring produces delayed impact explosions',source:WELL},
  WeaponSaberLite:{label:'ドライブワイパー',basis:'horizontal slash versus charged vertical slash',source:N_WEAPONS},
  WeaponSaberNormal:{label:'ジムワイパー',basis:'horizontal slash versus charged vertical slash',source:N_WEAPONS},
  WeaponSaberHeavy:{label:'デンタルワイパー',basis:'horizontal uncharged AND charged; draws separate blade on charge',source:DENTAL},
});
export const S3_STRUCTURED_ACTORS=Object.freeze(Object.keys(S3_GAMEPLAY_CUES));

/**
 * Deliberately designed, NOT measured, micro-events. Numbers are relative to
 * the already accepted shot; they are not gameplay or retail timing values.
 * Tests use this intermediate event graph instead of trying to infer attacks
 * from PCM hashes alone. Pulses from one attack share one buffer.
 */
export function s3CuePlan(actor,event,variant=0){
  if(!S3_GAMEPLAY_CUES[actor])return null;
  const charged=event==='fire_full',vertical=event==='fire_vertical',attack=event==='fire'||charged||vertical||event==='fire_alt'||event==='fire_left';
  const result=[];
  const cue=(ms,kind,gain=1,baseHz=900,decay=.05)=>result.push(Object.freeze({ms,kind,gain,baseHz,decay}));
  if(!attack){
    if(event==='charge'){cue(0,'motor',.24,actor==='WeaponChargerPencil'?1250:820,.13);cue(305,'motor',.15,1750,.10);}
    else if(event==='ready'){cue(0,'glass',.5,1730,.09);cue(65,'click',.26,2550,.055);}
    else if(event==='windup'){cue(0,'fabric',.48,550,.16);cue(94,'click',.29,1350,.085);}
    else if(event==='dodge'){cue(0,'air',.53,760,.065);cue(55,'click',.22,1350,.038);}
    else if(event==='mode_change'){cue(0,'click',.52,1680,.034);cue(23,'glass',.28,2040,.05);}
    else if(event==='open'){cue(0,'fabric',.54,850,.12);cue(55,'click',.40,1340,.06);}
    else if(event==='close'){cue(0,'fabric',.30,840,.083);cue(42,'click',.41,930,.059);}
    else if(event==='purge'){cue(0,'click',.41,620,.08);cue(38,'air',.56,720,.23);}
    else if(event==='shield_hit'){cue(0,'membrane',.72,430,.12);cue(24,'click',.25,2100,.025);}
    else if(event==='break'){cue(0,'membrane',.85,325,.17);cue(27,'air',.48,2100,.10);cue(95,'click',.44,980,.085);}
    else if(event==='impact'){cue(0,'water',.67,380,.086);cue(18,'click',.24,1430,.032);}
    else if(event==='explosion'&&actor==='WeaponStringerShort'){
      // LACT lacks delayed explosive bolts. This is an impact-only fallback
      // for a generic engine event named explosion; no explosive component.
      cue(0,'water',.58,810,.09);
    }
    else if(event==='explosion'){const arrows=actor==='WeaponStringerExplosion'?5:actor==='WeaponStringerNormal'?3:1;
      for(let i=0;i<arrows;i++)cue(i*4,'membrane',.6/arrows,310+i*73,.085);cue(23,'water',.38,580,.089);}
    else if(event==='roll'){cue(0,'water',.26,520,.42);cue(160,'fabric',.18,1900,.25);}
    else if(event==='spin'){cue(0,'motor',.42,1550,.4);cue(350,'click',.12,2100,.15);}
    else if(event==='release'){cue(0,'click',.35,1260,.06);}
    else if(event==='scope'){cue(0,'glass',.37,2300,.05);}
    else if(event==='fire_full'||event==='fire_vertical')throw new Error('S3 attack was not recognized');
    else cue(0,'air',.4,860,.05);
    return Object.freeze(result);
  }
  switch(actor){
    case 'WeaponShooterQuickLong':
      cue(0,'click',.57,1650,.018);cue(4,'air',.69,2700,.056);cue(17,'water',.23,1060,.066);break;
    case 'WeaponBlasterPrecision':
      // On S-BLAST, the mode transition changes body/air balance, not pitch alone.
      if(event==='fire_alt'){cue(0,'click',.65,1810,.026);cue(4,'membrane',.83,490,.085);cue(16,'air',.55,2100,.072);}
      else{cue(0,'click',.38,1300,.032);cue(6,'membrane',.72,330,.12);cue(21,'water',.34,740,.104);}break;
    case 'WeaponRollerWide':
      cue(0,'fabric',vertical?.66:.57,vertical?1240:1740,.092);cue(vertical?80:38,'water',vertical?.91:.71,vertical?420:620,.122);
      for(let i=0;i<(vertical?7:11);i++)cue((vertical?94:54)+i*5,'droplet',.08,1850+i*70,.035);break;
    case 'WeaponBrushHeavy':
      cue(0,'fabric',.82,620,.11);cue(65,'click',.42,1100,.048);
      cue(92,'water',.71,680,.13);for(let i=0;i<7;i++)cue(102+i*9,'droplet',.10,2100+i*110,.031);break;
    case 'WeaponChargerPencil':
      // Five CHARGED shots are admitted and sounded separately by gameplay.
      // Do not mistake a one-press cue for a pre-rendered five-shot burst.
      cue(0,'click',.66,2140,.015);cue(8,'glass',charged?.80:.43,charged?2200:1600,.080);
      cue(24,'air',.27,3150,.100);break;
    case 'WeaponSlosherDouble':
      // The two GROUPS begin 8 frames (133.3 ms) apart, according to the
      // documented projectile timings. Individual droplet sounds are an
      // authored interpretation, not measured BWAV events.
      for(let group=0;group<2;group++){
        const start=group*8*(1000/60);
        cue(start,'water',group===0?.67:.63,group===0?560:630,.075);
        for(let i=0;i<8;i++)cue(start+i*(1000/60),'droplet',.09,1740+i*57+group*47,.032);
      }break;
    case 'WeaponSpinnerHyperShort':
      cue(0,'click',.58,1960,.018);cue(3,'motor',.26,2530,.045);cue(8,'air',.38,3450,.061);break;
    case 'WeaponManeuverLong':
      if(event==='fire_alt'){cue(0,'click',.74,720,.030);cue(5,'membrane',.66,480,.105);cue(18,'air',.28,1580,.072);}
      else {cue(0,'click',.6,2010,.020);cue(5,'air',.52,3200,.060);cue(18,'water',.19,980,.048);}break;
    case 'WeaponShelterFocus':
      cue(0,'click',.6,980,.042);cue(6,'air',.83,1470,.098);cue(38,'fabric',.27,880,.10);break;
    case 'WeaponStringerNormal':
    case 'WeaponStringerShort':
    case 'WeaponStringerExplosion': {
      const count=actor==='WeaponStringerExplosion'?5:3;
      cue(0,'string',.60,actor==='WeaponStringerShort'?2500:1530,.13);
      for(let i=0;i<count;i++)cue(6+i*3,'pluck',.55/Math.sqrt(count),920+i*97+(charged?170:0),.085);
      if(charged){cue(35,'glass',.36,2260,.15);if(actor!=='WeaponStringerShort')cue(79,'click',.13,2880,.052);}
      break;
    }
    case 'WeaponSaberLite':
    case 'WeaponSaberNormal':
    case 'WeaponSaberHeavy': {
      const heavy=actor==='WeaponSaberHeavy',light=actor==='WeaponSaberLite';
      if(heavy&&charged){cue(0,'click',.43,1170,.061);cue(40,'string',.38,1260,.115);
        cue(91,'blade',.95,720,.145);cue(164,'click',.40,760,.071);}
      else{cue(0,'air',light?.41:.32,light?3800:2700,.059);
        cue(charged?35:9,'blade',charged?.90:.72,light?1880:heavy?930:1270,charged?.16:.10);
        cue(charged?65:30,'water',.27,890,.091);}
      break;
    }
  }
  // Variation changes micro-timbre deterministically, not event count/timing.
  return Object.freeze(result);
}

/** Procedural transients with physically-inspired, not reverse-engineered timbre. */
export function renderS3Articulation(recipe,event,variant=0,sampleRate=48000){
  const actor=recipe?.sourceActor;
  const cues=s3CuePlan(actor,event,variant);
  if(!cues)return null;
  if(!Number.isInteger(sampleRate)||sampleRate<8000||sampleRate>192000)throw new RangeError('sampleRate invalid');
  variant=((Math.trunc(Number.isFinite(variant)?variant:0)%3)+3)%3;
  const loop=['charge','spin','roll'].includes(event),maxMs=Math.max(0,...cues.map(c=>c.ms));
  const lengthSec=loop?.75:Math.max(.14,Math.min(.66,maxMs/1000+.22));
  const length=Math.ceil(lengthSec*sampleRate),out=new Float32Array(length);
  const random=rng(hash(`${actor}|${event}|${variant}`));
  for(const cue of cues){
    const at=Math.floor(cue.ms*sampleRate/1000),num=Math.min(length-at,Math.ceil(Math.min(.45,cue.decay*6)*sampleRate));
    if(num<=0)continue;
    let phase=random()*TAU,lp=0,hi=0,previous=0;
    const lowFilter=1-Math.exp(-TAU*clamp(cue.baseHz*.78,70,sampleRate*.3)/sampleRate);
    const hiFilter=1-Math.exp(-TAU*clamp(cue.baseHz*2.2,500,sampleRate*.46)/sampleRate);
    for(let j=0;j<num;j++){
      const t=j/sampleRate,env=(1-Math.exp(-t/(cue.kind==='fabric'?.008:.0008)))*Math.exp(-t/cue.decay),noise=random()*2-1;
      lp+=lowFilter*(noise-lp);hi+=hiFilter*(noise-hi);const band=hi-lp;
      const drift=cue.kind==='blade'?.63:cue.kind==='string'?.78:cue.kind==='droplet'?1.32:1;
      const frequency=cue.baseHz*(drift+(1-drift)*Math.exp(-t/.045));phase+=TAU*Math.min(sampleRate*.45,frequency)/sampleRate;
      const tone=Math.sin(phase)+.22*Math.sin(2.07*phase),click=noise-previous;previous=noise;
      let v;
      switch(cue.kind){
        case 'pluck': v=.72*tone+.24*band;break;
        case 'string':v=.52*tone+.39*band+.12*Math.sin(3.01*phase);break;
        case 'glass':v=.79*tone+.14*band;break;
        case 'blade':v=.25*tone+.72*band;break;
        case 'click':v=.48*click+.40*tone;break;
        case 'membrane':v=.6*tone+.24*lp+.13*band;break;
        case 'motor':v=.27*tone+.56*band*(.6+.4*Math.sin(TAU*24*t));break;
        case 'water':v=.16*tone+.73*lp+.10*band;break;
        case 'droplet':v=.75*tone+.20*band;break;
        case 'fabric':v=.10*tone+.78*band;break;
        default:v=.15*tone+.72*band;break;
      }
      out[at+j]+=cue.gain*env*v*(.94+.12*variant);
    }
  }
  // DC blocking, bounded output, and guaranteed zero-click one-shot boundaries.
  let dc=0;for(let i=0;i<length;i++)dc+=out[i];dc/=length;
  let peak=0;for(let i=0;i<length;i++){
    const fadeIn=loop?clamp(i/(sampleRate*.02),0,1):clamp(i/(sampleRate*.001),0,1);
    const fadeOut=loop?1:clamp((length-i-1)/(sampleRate*.025),0,1);
    out[i]=Math.tanh((out[i]-dc)*1.12)*fadeIn*fadeOut;
    peak=Math.max(peak,Math.abs(out[i]));
  }
  const norm=Math.min(5,.69/Math.max(1e-5,peak));for(let i=0;i<length;i++)out[i]*=norm;
  if(loop){
    // Overlap-add 25 ms across loop boundary; the same samples occur on both ends.
    const k=Math.min(Math.floor(sampleRate*.025),Math.floor(length/8));
    for(let i=0;i<k;i++){
      const q=i/(k-1),v=out[length-k+i]*(1-q)+out[i]*q;
      out[length-k+i]=v;out[i]=v;
    }
    out[length-1]=out[0];
  }else{out[0]=0;out[length-1]=0;}
  return out;
}
