// Read-only host-clock observations around the original AudioEngine.play call.
// No clock, volume, SFX limit, RNG, last-play map or scheduler state is reset.
export function installRollerAudioClockTrace(){
 globalThis.__rollerInstallAudioClockTrace=G=>{
  const audio=G.audio,original=audio.play;globalThis.__rollerAudioClockEvents=[];
  audio.play=function(name,options){
   const before={tick:(globalThis.swingTick??0)-1,name,ctxTime:this.ctx?.currentTime??null,last:this.last?.get(name)??null,counts:{...this.counts},rng:globalThis.__rollerQaRandom.snapshot(),at:options?.at??null,delay:options?.delay??0,volume:options?.volume??null,fxPhase:G.fx._iwCosmeticPhase??null,simulationTime:G.time};
   const token=globalThis.__rollerQaRandom.enter('Audio.play',[name]);let result;
   try{result=original.apply(this,arguments);return result;}
   finally{
    const after={ctxTime:this.ctx?.currentTime??null,last:this.last?.get(name)??null,counts:{...this.counts},rng:globalThis.__rollerQaRandom.snapshot(),returnedVoice:result!=null};
    globalThis.__rollerAudioClockEvents.push({before,after});globalThis.__rollerQaRandom.leave(token,{returnedVoice:result!=null});
   }
  };
 };
}
