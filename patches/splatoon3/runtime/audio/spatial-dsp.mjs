// Distance filtering is application DSP; PannerNode updates alone cannot move
// its cutoff or reverb send when only the listener moves.
const INSTALL=Symbol.for('inkwave.audio.spatial-distance-dsp.v1');
const STATE=Symbol('spatial voice state');
const registries=new WeakMap();
const finite3=p=>!!p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);

function addVoice(registry,voice,s){
  if(s.index>=0)return;
  s.index=registry.voices.length;
  registry.voices.push(voice);
}

function removeVoice(registry,voice){
  const s=voice[STATE],voices=registry.voices;
  let idx=s?s.index:voices.indexOf(voice);
  if(idx<0||voices[idx]!==voice){
    idx=voices.indexOf(voice);
    if(idx<0)return;
  }
  const last=voices.pop();
  if(idx<voices.length){
    voices[idx]=last;
    const ls=last[STATE];
    if(ls)ls.index=idx;
  }
  if(s)s.index=-1;
}

export function installAudioSpatialDsp(AudioEngine,distCut){
  const P=AudioEngine.prototype;
  if(Object.hasOwn(P,INSTALL))return;
  Object.defineProperty(P,INSTALL,{value:true});
  const create=P._voice,setPos=P._setPos,setListener=P.setListener,dispose=P.dispose;
  function update(engine,voice,s,time,force=false){
    const L=engine.L;
    if(!finite3(L)||voice.v.dead||voice.stolen||engine.ctx!==s.context)return;
    const obstruction=voice.occlusion||0;
    if(!force&&s.lx===L.x&&s.ly===L.y&&s.lz===L.z&&s.dx===s.x&&s.dy===s.y&&s.dz===s.z&&s.occlusion===obstruction&&s.baseReverb===s.lastBaseReverb)return;
    s.lx=L.x;s.ly=L.y;s.lz=L.z;s.dx=s.x;s.dy=s.y;s.dz=s.z;
    const d=engine._dist(s)*(voice.dk||1);
    if(!force&&d<3&&s.d<3&&obstruction===s.occlusion&&s.baseReverb===s.lastBaseReverb){
      s.d=d;return;
    }
    s.d=d;s.occlusion=obstruction;s.lastBaseReverb=s.baseReverb;
    const t=time??engine.ctx.currentTime;
    const cutoff=Math.min(distCut(d),obstruction?22000*Math.pow(.055,obstruction):Infinity);
    if(force||(s.cutoff!==cutoff&&(cutoff===22000||cutoff===900||!(Math.abs(cutoff-s.cutoff)<s.cutoff*.015)))){
      voice.lp.frequency.setTargetAtTime(cutoff,t,.05);s.cutoff=cutoff;
    }
    // The distance boost belongs to the current source/listener separation,
    // never to the place where a moving voice happened to start.
    voice.rev=s.baseReverb+Math.min(.25,Math.max(0,(d-6)/60));
    const send=voice.rev*engine._sendScale(d);
    if(!voice.send&&voice.rev>.001){
      voice.send=engine.ctx.createGain();voice.send.gain.value=send;
      (voice.fade||voice.out).connect(voice.send);voice.send.connect(engine.revSend);
      voice.v.nodes.push(voice.send);s.send=send;
    }else if(voice.send&&(force||(s.send!==send&&(send===0||send===s.baseReverb||!(Math.abs(send-s.send)<.003))))){
      voice.send.gain.setTargetAtTime(send,t,.05);s.send=send;
    }
  }
  P._voice=function(def,time,pos,volume,withFade){
    const voice=create.call(this,def,time,pos,volume,withFade);
    if(!voice?.panner||!voice.lp||!finite3(pos))return voice;
    let registry=registries.get(this);
    if(!registry){registry={voices:[],context:this.ctx,state:this.ctx?.state,synced:false,syncX:0,syncY:0,syncZ:0};registries.set(this,registry);}
    const L=this.L,d=this._dist(pos)*(voice.dk||1),baseReverb=def.reverb??.08;
    const s=voice[STATE]={context:this.ctx,panner:voice.panner,positionReady:false,index:-1,
      x:pos.x,y:pos.y,z:pos.z,dx:pos.x,dy:pos.y,dz:pos.z,
      lx:L.x,ly:L.y,lz:L.z,d,occlusion:voice.occlusion||0,
      baseReverb,lastBaseReverb:baseReverb,
      cutoff:distCut(d),send:voice.rev*this._sendScale(d)};
    addVoice(registry,voice,s);
    const retire=voice.v.dispose;
    voice.v.dispose=function(...args){
      removeVoice(registry,voice);delete voice[STATE];
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
    const registry=registries.get(this);
    const result=setListener.call(this,pos,forward,up);
    if(!registry||!this.ctx||!finite3(pos))return result;
    const force=registry.context!==this.ctx||registry.state!==this.ctx.state;
    registry.context=this.ctx;registry.state=this.ctx.state;
    const lp=finite3(this.L)?this.L:pos;
    if(!force&&registry.synced){
      const dx=lp.x-registry.syncX,dy=lp.y-registry.syncY,dz=lp.z-registry.syncZ;
      if(dx*dx+dy*dy+dz*dz<.01)return result;
    }
    registry.synced=true;registry.syncX=lp.x;registry.syncY=lp.y;registry.syncZ=lp.z;
    const voices=registry.voices;
    if(!voices.length)return result;
    const now=this.ctx.currentTime;
    for(let i=voices.length-1;i>=0;i--){
      const voice=voices[i],s=voice[STATE];
      if(!s||voice.v.dead||s.context!==this.ctx){removeVoice(registry,voice);continue;}
      update(this,voice,s,now,force);
    }
    return result;
  };
  if(typeof dispose==='function')P.dispose=function(...args){
    try{return dispose.apply(this,args);}finally{
      const reg=registries.get(this);
      if(reg){
        for(let i=reg.voices.length-1;i>=0;i--){const s=reg.voices[i][STATE];if(s)s.index=-1;}
        reg.voices.length=0;
      }
      registries.delete(this);
    }
  };
}
