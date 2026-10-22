/**
 * Local-only Charger intro: plays a user-selected, already trimmed audio file
 * through the normal INKWAVE SFX bus. No reference recording is bundled,
 * uploaded or retrieved from third-party domains by this module.
 *
 * Designed for the first ~1.2 seconds of the published Splatune 2 Charger
 * demonstration. This is a user-controlled reference override, NOT evidence
 * that S3 retail uses an identical mixed sequence or pitch curve.
 */
const DB_NAME='inkwave-local-charger-audio-v1';
const STORE='samples', KEY='charger-intro';
const MAX_BYTES=4*1024*1024;
const MIN_SECONDS=.25,MAX_SECONDS=3;

function openDatabase(){
  if(typeof indexedDB==='undefined')return Promise.resolve(null);
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB unavailable'));
    req.onblocked=()=>reject(new Error('IndexedDB blocked'));
  });
}
async function readSaved(){
  const db=await openDatabase();
  if(!db)return null;
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).get(KEY);
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Local audio read failed'));
  });}finally{db.close();}
}
async function saveEntry(entry){
  const db=await openDatabase();
  if(!db)return false;
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Local audio save failed'));
    tx.onabort=()=>reject(tx.error||new Error('Local audio save aborted'));
    tx.objectStore(STORE).put(entry,KEY);
  });return true;}finally{db.close();}
}
async function deleteSaved(){
  const db=await openDatabase();
  if(!db)return false;
  try{await new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Local audio erase failed'));
    tx.onabort=()=>reject(tx.error||new Error('Local audio erase aborted'));
    tx.objectStore(STORE).delete(KEY);
  });return true;}finally{db.close();}
}

export function validateChargerIntro(buffer){
  const seconds=buffer?.duration;
  if(!Number.isFinite(seconds)||seconds<MIN_SECONDS||seconds>MAX_SECONDS||
     !Number.isFinite(buffer?.sampleRate)||buffer.sampleRate<8000||
     !Number.isInteger(buffer?.numberOfChannels)||buffer.numberOfChannels<1||buffer.numberOfChannels>2)
    throw new RangeError('チャージ音は0.25〜3秒のMP3/WAV音声を指定してください');
  return seconds;
}

export class LocalChargerIntro {
  constructor(engine){
    this.engine=engine;this.buffer=null;this.filename='';this.persisted=false;
    this.restoring=null;this.generation=0;this.active=new Set();
  }
  status(){return {ready:!!this.buffer,filename:this.filename,duration:this.buffer?.duration??0,persisted:this.persisted};}
  async decode(bytes){
    const ctx=this.engine.ctx;
    if(!ctx||typeof ctx.decodeAudioData!=='function')throw new Error('AudioContextを先に初期化してください');
    const data=bytes instanceof ArrayBuffer?bytes:bytes?.buffer;
    if(!(data instanceof ArrayBuffer)||data.byteLength<100||data.byteLength>MAX_BYTES)
      throw new RangeError('音声ファイルの上限は4MBです');
    const decoded=await ctx.decodeAudioData(data.slice(0));
    validateChargerIntro(decoded);
    return decoded;
  }
  async importFile(file){
    if(!file||typeof file.arrayBuffer!=='function'||!file.size||file.size>MAX_BYTES)
      throw new RangeError('4MB以下の音声ファイルを選んでください');
    // No URL, user token, identifier or reference content is uploaded anywhere.
    const version=++this.generation;
    const bytes=await file.arrayBuffer();
    const buffer=await this.decode(bytes);
    if(version!==this.generation)return this.status();
    this.stopAll(.02);
    this.buffer=buffer;this.filename=String(file.name||'charger-intro.mp3').slice(0,128);this.persisted=false;
    try{this.persisted=await saveEntry({bytes,filename:this.filename});}
    catch{this.persisted=false;} // privacy-mode IndexedDB failure: works for this session.
    return this.status();
  }
  async restore(){
    if(this.buffer)return this.status();
    if(this.restoring)return this.restoring;
    const version=this.generation;
    this.restoring=(async()=>{
      try{
        const saved=await readSaved();
        if(!saved||version!==this.generation)return this.status();
        const decoded=await this.decode(saved.bytes);
        if(version!==this.generation)return this.status();
        this.buffer=decoded;this.filename=String(saved.filename||'charger-intro.mp3').slice(0,128);
        this.persisted=true;
      }catch{ /* no storage or stale/corrupt local audio: retain recorded one-shot fallback */ }
      return this.status();
    })();
    try{return await this.restoring;}finally{this.restoring=null;}
  }
  async clear(){
    ++this.generation;
    this.stopAll(.02);
    this.buffer=null;this.filename='';this.persisted=false;
    try{await deleteSaved();}catch{ /* already cleared in memory */ }
    return this.status();
  }
  stopAll(fade=.03){for(const h of [...this.active])h.stop(fade);}
  play({volume=.55}={}){
    const ctx=this.engine.ctx,buffer=this.buffer,target=this.engine.sfxIn;
    if(!buffer||!ctx||!target||typeof ctx.createBufferSource!=='function')return null;
    const now=ctx.currentTime,source=ctx.createBufferSource(),gain=ctx.createGain();
    source.buffer=buffer;source.loop=false;source.playbackRate.value=1;
    const amp=Math.min(1,Math.max(0,Number(volume)||0));
    if(amp<=0)return null;
    gain.gain.setValueAtTime(0,now);
    gain.gain.linearRampToValueAtTime(amp,now+.006);
    source.connect(gain);gain.connect(target);
    let stopped=false,ended=false;
    const self=this;
    const handle={
      get playing(){return !stopped&&!ended;},
      stop(fade=.04){
        if(stopped||ended)return;
        stopped=true;
        const t=ctx.currentTime,until=t+Math.max(.005,Math.min(.15,Number(fade)||.04));
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value,t);
        gain.gain.linearRampToValueAtTime(0,until);
        try{source.stop(until);}catch{}
      }
    };
    source.onended=()=>{
      ended=true;self.active.delete(handle);
      try{source.disconnect();gain.disconnect();}catch{}
    };
    source.start(now);this.active.add(handle);
    return handle;
  }
}
