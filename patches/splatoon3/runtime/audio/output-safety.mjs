// Linear below -1.94 dBFS; smooth knee above it, bounded sample output.
// This is a safety net after the existing dynamics, not a claim of transparent true-peak limiting.
let curve;
export function connectOutputSafety(ctx,from){
  if(!curve){curve=new Float32Array(8193);for(let i=0;i<curve.length;i++){const x=2*i/(curve.length-1)-1,a=Math.abs(x);curve[i]=Math.sign(x)*(a<=.8?a:.8+.16*Math.tanh((a-.8)/.16));}}
  const guard=ctx.createWaveShaper();guard.curve=curve;guard.oversample='none';from.connect(guard);guard.connect(ctx.destination);return guard;
}

// A WaveShaper only limits finite samples; it cannot repair invalid upstream
// controls. Reject malformed starts at the public mixer boundary and keep
// updates/cleanup on their existing paths. Ordinary controls are passed through.
const INPUTS=Symbol.for('inkwave.audio.finite-inputs.v1');
const INVALID=Symbol('invalid audio input');
const SILENT=Object.freeze({playing:false,set(){},stop(){}});
const VOICE_CONTROLS=Object.freeze(['volume','pitch']);
function finiteNumber(value){
  try{const number=Number(value);return Number.isFinite(number)?number:INVALID;}catch{return INVALID;}
}
function voiceOptions(options){
  if(options==null)return options;
  let result=options;
  for(const key of VOICE_CONTROLS){
    const value=options[key];if(value==null)continue;
    const number=finiteNumber(value);
    if(number===INVALID||!Number.isFinite(Math.fround(number)))return INVALID;
    if(typeof value!=='number'){
      if(result===options)result={...options};
      result[key]=number;
    }
  }
  return result;
}
function updateOptions(options){
  if(options==null)return options;
  let result=options;
  for(const key of VOICE_CONTROLS){
    const value=options[key];if(value==null)continue;
    const number=finiteNumber(value),valid=number!==INVALID&&Number.isFinite(Math.fround(number));
    if(!valid||typeof value!=='number'){
      if(result===options)result={...options};
      if(valid)result[key]=number;else delete result[key];
    }
  }
  return result;
}
export function installFiniteAudioInputs(Engine){
  const p=Engine.prototype;if(Object.hasOwn(p,INPUTS))return;
  Object.defineProperty(p,INPUTS,{value:true});
  const play=p.play,loop=p.loop,duck=p.duck,stopAll=p.stopAll;
  if(typeof play==='function')p.play=function(name,options){
    const checked=voiceOptions(options);if(checked===INVALID)return null;
    // The source scheduler already ignores individual invalid at/delay values;
    // two valid numbers must not overflow when it combines them either.
    const now=this.ctx?.currentTime;
    if(Number.isFinite(now)){
      const at=Number.isFinite(checked?.at)?checked.at:now;
      const delay=Number.isFinite(checked?.delay)?Math.max(0,checked.delay):0;
      if(!Number.isFinite(Math.max(now,at)+delay))return null;
    }
    return play.call(this,name,checked);
  };
  if(typeof loop==='function')p.loop=function(name,options){
    const checked=voiceOptions(options);if(checked===INVALID)return SILENT;
    const handle=loop.call(this,name,checked);
    if(handle&&handle!==SILENT&&!Object.isFrozen(handle)&&typeof handle.stop==='function'){
      const stop=handle.stop,set=handle.set;
      if(typeof set==='function')handle.set=function(update){return set.call(this,updateOptions(update));};
      handle.stop=function(fade=.15){
        // Invalid cleanup input still retires the voice using its normal fade;
        // it must not mark a request stopped while leaving live nodes orphaned.
        const number=finiteNumber(fade);
        return stop.call(this,number===INVALID ? .15 : number);
      };
    }
    return handle;
  };
  if(typeof duck==='function')p.duck=function(amount=.5,seconds=1.2){
    const level=finiteNumber(amount),length=finiteNumber(seconds);
    if(level===INVALID||length===INVALID)return;
    return duck.call(this,level,length);
  };
  if(typeof stopAll==='function')p.stopAll=function(fade=.1){
    const number=finiteNumber(fade);
    return stopAll.call(this,number===INVALID ? .1 : number);
  };
}
