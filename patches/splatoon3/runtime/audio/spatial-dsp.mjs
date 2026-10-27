// Distance filtering is application DSP; PannerNode updates alone cannot move
// its cutoff or reverb send when only the listener moves.
const INSTALL=Symbol.for('inkwave.audio.spatial-distance-dsp.v1');
const STATE=Symbol('spatial voice state');
const registries=new WeakMap();
const finite3=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);

export function installAudioSpatialDsp(AudioEngine,distCut){
  const P=AudioEngine.prototype;
  if(Object.hasOwn(P,INSTALL))return;
  Object.defineProperty(P,INSTALL,{value:true});
  const create=P._voice,setPos=P._setPos,setListener=P.setListener,dispose=P.dispose;
  function update(engine,voice,s,time,force=false){
    const L=engine.L;
    if(!finite3(L)||voice.v.dead||voice.stolen||engine.ctx!==s.context)return;
    if(!force&&s.lx===L.x&&s.ly===L.y&&s.lz===L.z&&s.dx===s.x&&s.dy===s.y&&s.dz===s.z)return;
    s.lx=L.x;s.ly=L.y;s.lz=L.z;s.dx=s.x;s.dy=s.y;s.dz=s.z;
    const d=engine._dist(s)*(voice.dk||1);
    const obstruction=voice.occlusion||0;
    const cutoff=Math.min(distCut(d),obstruction?22000*Math.pow(.055,obstruction):Infinity);
    if(force||s.cutoff!==cutoff){voice.lp.frequency.setTargetAtTime(cutoff,time,.05);s.cutoff=cutoff;}
    // The distance boost belongs to the current source/listener separation,
    // never to the place where a moving voice happened to start.
    voice.rev=s.baseReverb+Math.min(.25,Math.max(0,(d-6)/60));
    const send=voice.rev*engine._sendScale(d);
    if(!voice.send&&voice.rev>.001){
      voice.send=engine.ctx.createGain();voice.send.gain.value=send;
      (voice.fade||voice.out).connect(voice.send);voice.send.connect(engine.revSend);
      voice.v.nodes.push(voice.send);s.send=send;
    }else if(voice.send&&(force||s.send!==send)){
      voice.send.gain.setTargetAtTime(send,time,.05);s.send=send;
    }
  }
  P._voice=function(def,time,pos,volume,withFade){
    const voice=create.call(this,def,time,pos,volume,withFade);
    if(!voice?.panner||!voice.lp||!finite3(pos))return voice;
    let registry=registries.get(this);
    if(!registry){registry={voices:new Set(),context:this.ctx,state:this.ctx?.state};registries.set(this,registry);}
    const L=this.L,d=this._dist(pos)*(voice.dk||1);
    const s=voice[STATE]={context:this.ctx,panner:voice.panner,positionReady:false,
      x:pos.x,y:pos.y,z:pos.z,dx:pos.x,dy:pos.y,dz:pos.z,
      lx:L.x,ly:L.y,lz:L.z,baseReverb:def.reverb??.08,
      cutoff:distCut(d),send:voice.rev*this._sendScale(d)};
    registry.voices.add(voice);
    const retire=voice.v.dispose;
    voice.v.dispose=function(...args){
      registry.voices.delete(voice);delete voice[STATE];
      return retire.apply(this,args);
    };
    return voice;
  };
  P._setPos=function(voice,pos,time){
    const s=voice?.[STATE];
    if(!s)return setPos.call(this,voice,pos,time);
    if(!voice.panner||!finite3(pos)||voice.v.dead||this.ctx!==s.context)return;
    const p=voice.panner,changed=s.x!==pos.x||s.y!==pos.y||s.z!==pos.z;
    if(!s.positionReady||s.panner!==p||changed){
      if(p.positionX){p.positionX.setTargetAtTime(pos.x,time,.02);p.positionY.setTargetAtTime(pos.y,time,.02);p.positionZ.setTargetAtTime(pos.z,time,.02);}
      else p.setPosition(pos.x,pos.y,pos.z);
      s.panner=p;s.positionReady=true;
    }
    s.x=pos.x;s.y=pos.y;s.z=pos.z;
    update(this,voice,s,time);
  };
  P.setListener=function(pos,forward,up){
    const registry=registries.get(this),L=this.L;
    const changed=finite3(pos)&&(!L||L.x!==pos.x||L.y!==pos.y||L.z!==pos.z);
    const result=setListener.call(this,pos,forward,up);
    if(!registry||!this.ctx||!finite3(pos))return result;
    const force=registry.context!==this.ctx||registry.state!==this.ctx.state;
    registry.context=this.ctx;registry.state=this.ctx.state;
    if(changed||force)for(const voice of registry.voices){
      const s=voice[STATE];
      if(!s||voice.v.dead||s.context!==this.ctx){registry.voices.delete(voice);continue;}
      update(this,voice,s,this.ctx.currentTime,force);
    }
    return result;
  };
  if(typeof dispose==='function')P.dispose=function(...args){
    try{return dispose.apply(this,args);}finally{registries.get(this)?.voices.clear();registries.delete(this);}
  };
}
