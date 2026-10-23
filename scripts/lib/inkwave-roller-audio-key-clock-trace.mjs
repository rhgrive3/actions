// Read-only host-clock observations around the original AudioEngine.play call.
// No clock, volume, SFX limit, RNG, last-play map or scheduler state is reset.
export function installRollerAudioKeyClockTrace(){
 globalThis.__rollerInstallAudioClockTrace=G=>{
  const audio=G.audio,original=audio.play;globalThis.__rollerAudioClockEvents=[];
  audio.play=function(name,options){
   const position=options?.pos,key=name+':'+(options?.emitterId!=null?String(options.emitterId):options?.actor?'<actor-key-observe-map>':position&&[position.x,position.y,position.z].every(Number.isFinite)?`cell:${Math.floor(position.x/2)}:${Math.floor(position.y/2)}:${Math.floor(position.z/2)}`:'local');
   const before={key,position:position?[position.x,position.y,position.z]:null,lastEntries:[...this.last],tick:(globalThis.swingTick??0)-1,name,ctxTime:this.ctx?.currentTime??null,last:this.last?.get(key)??null,counts:{...this.counts},rng:globalThis.__rollerQaRandom.snapshot(),at:options?.at??null,delay:options?.delay??0,volume:options?.volume??null,fxPhase:G.fx._iwCosmeticPhase??null,simulationTime:G.time};
   const token=globalThis.__rollerQaRandom.enter('Audio.play',[name]);let result;
   try{result=original.apply(this,arguments);return result;}
   finally{
    const after={lastEntries:[...this.last],ctxTime:this.ctx?.currentTime??null,last:this.last?.get(key)??null,counts:{...this.counts},rng:globalThis.__rollerQaRandom.snapshot(),returnedVoice:result!=null};
    globalThis.__rollerAudioClockEvents.push({before,after});globalThis.__rollerQaRandom.leave(token,{returnedVoice:result!=null});
   }
  };
 };
}
