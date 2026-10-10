// catalogue-loadout
// Prototype loadout selection. Choices belong to the actor; shared tuning and
// other players' equipment remain immutable. Native main IDs stay on the wire.
export const CATALOGUE_STORAGE = 'inkwave.catalogue-kit.v1';
export const SUB_NAMES = Object.freeze({ bomb:'スプラッシュボム', suction:'キューバンボム', burst:'クイックボム', curling:'カーリングボム', autobomb:'ロボットボム', fizzy:'タンサンボム', torpedo:'トーピード', inkMine:'トラップ', toxicMist:'ポイズンミスト', pointSensor:'ポイントセンサー', splashWall:'スプラッシュシールド', sprinkler:'スプリンクラー', beakon:'ジャンプビーコン', angleShooter:'ラインマーカー' });
export const SPECIAL_NAMES = Object.freeze({ trizooka:'ウルトラショット', bubbler:'グレートバリア', zipcaster:'ショクワンダー', tentaMissiles:'マルチミサイル', inkjet:'ジェットパック', storm:'アメフラシ', booyahBomb:'ナイスダマ', ultraStamp:'ウルトラハンコ', killerWail:'メガホンレーザー5.1ch', inkVac:'キューインキ', crabTank:'カニタンク', reefslider:'サメライド', tripleInkstrike:'トリプルトルネード', tacticooler:'エナジースタンド', superChump:'デコイチラシ', krakenRoyale:'テイオウイカ', splattercolorScreen:'スミナガシート', waveBreaker:'ホップソナー', tripleSplashdown:'ウルトラチャクチ' });

const CATALOGUE_HELP={tentaMissiles:'照準を合わせて射撃でロックした相手へ発射。',inkjet:'射撃でインク弾、ジャンプで上昇、イカで降下。終了後に発動地点へ戻る。',booyahBomb:'ナイスで充電し、サブで投げる。N・パッド下・画面のナイスでも応援できる。',ultraStamp:'射撃を押し続けて連打、ジャンプで空中振り、サブでハンコを投げる。',zipcaster:'サブで伸びて移動、射撃でメインウェポン。終了後に発動地点へ戻る。',killerWail:'照準で敵を追うレーザーをロック。発動中もメインを使用できる。',crabTank:'射撃で連射、サブで砲撃、イカで球体移動。',reefslider:'走行後に爆発。射撃で早めに停止・爆発。',tripleInkstrike:'6秒以内に射撃で3個のマーカーを投げる。',superChump:'照準で着地点を指定し、射撃でデコイを発射。',krakenRoyale:'イカのまま移動し、ジャンプで攻撃、射撃を溜めて突進。',splattercolorScreen:'射撃で前進するシートを投げる。敵が横切るとダメージと視界効果。',waveBreaker:'射撃で設置。3回の波が敵をマーキングし、ジャンプで避けられる。',tripleSplashdown:'本体と2つの拳が落下して爆発。拳は別々に壊せる。スーパージャンプ中は本体のみ。'};

function readChoices() {
  try { const v=JSON.parse(globalThis.localStorage?.getItem(CATALOGUE_STORAGE)||'{}'); return v && typeof v==='object'&&!Array.isArray(v)?v:{}; }
  catch { return {}; }
}
export function validateCatalogueChoice(choice, SUB, SPECIALS) {
  return !!choice && typeof choice.sub==='string' && typeof choice.special==='string'
    && Object.hasOwn(SUB,choice.sub) && Object.hasOwn(SPECIALS,choice.special)
    && Object.hasOwn(SUB_NAMES,choice.sub) && Object.hasOwn(SPECIAL_NAMES,choice.special);
}
export function applyCatalogueChoice(actor, choice, api) {
  if (!validateCatalogueChoice(choice,api.SUB,api.SPECIALS) || !actor?.weapon) return false;
  const base=api.WEAPONS[actor.weaponId];
  if (!base) return false;
  const changedSub=actor.weapon.sub!==choice.sub;
  actor.s3CatalogueChoice={sub:choice.sub,special:choice.special};
  actor.weapon={...actor.weapon,sub:choice.sub,special:choice.special,
    specialCost:base.specialCost/(actor.s3?.modifiers?.specialCharge||1),
    kitStatus:'prototype-custom-kit',kitReference:null};
  // Native throw resolution caches the selected sub on runner.reset. Keep
  // its release spec coherent, but never reset a held action every frame.
  if(changedSub)actor.weaponRunner?.reset?.();
  return true;
}
export function installCatalogueLoadout(api) {
  const {Actor,Menus,G,SUB,SPECIALS}=api;
  function restore(a) {
    const choice=a.isLocal?readChoices()[a.weaponId]:a.s3CatalogueChoice;
    if(choice)applyCatalogueChoice(a,choice,api);
  }
  for(const method of ['reset','setWeapon','s3RefreshGear']) {
    const native=Actor.prototype[method];
    if(!native)continue;
    Actor.prototype[method]=function(...args){const result=native.apply(this,args);restore(this);return result;};
  }
  // Conditional gear refresh may rebuild specialCost while a custom kit is
  // equipped. Preserve the native multiplier on every owner's fixed update.
  const update=Actor.prototype.update;
  Actor.prototype.update=function(...args){restore(this);const result=update.apply(this,args);restore(this);return result;};
  const render=Menus.prototype._scr_loadout;
  Menus.prototype._scr_loadout=function(...args){
    const screen=render.apply(this,args), body=screen.el.querySelector('.iw-loadout__body')||screen.el;
    const panel=document.createElement('fieldset');panel.className='s3-gear s3-catalogue';
    panel.style.cssText='margin:12px 0;padding:14px;border:1px solid currentColor;border-radius:12px;display:grid;gap:10px';
    const legend=document.createElement('legend');legend.textContent='サブ・スペシャルを選ぶ';panel.append(legend);
    const note=document.createElement('p');note.textContent='試作版の自由な組み合わせ。名称は本家の仮名です。';panel.append(note);
    const selectors={};
    for(const [field,names,registry,title] of [['sub',SUB_NAMES,SUB,'サブウェポン'],['special',SPECIAL_NAMES,SPECIALS,'スペシャル']]){
      const label=document.createElement('label');label.textContent=title+' ';
      const select=document.createElement('select');select.setAttribute('aria-label',title);
      select.style.cssText='max-width:100%;min-height:40px;color:#15121c;background:#fff;font:inherit;border-radius:8px;padding:6px';
      for(const [id,name] of Object.entries(names)){if(!registry[id])throw new Error('Missing playable catalogue entry: '+id);const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);}
      select.addEventListener('keydown',e=>e.stopPropagation());
      select.addEventListener('change',()=>save());selectors[field]=select;label.append(select);panel.append(label);
    }
    const help=document.createElement('p');help.setAttribute('aria-live','polite');panel.append(help);
    const reset=document.createElement('button');reset.type='button';reset.textContent='標準セットに戻す';reset.style.minHeight='40px';
    reset.addEventListener('click',()=>save(true));panel.append(reset);body.append(panel);
    const current=()=>this.api.getLoadout?.().weapon||this._loadout().weapon;
    function sync(){const id=current(),base=api.WEAPONS[id],choice=readChoices()[id];if(!base)return;
      selectors.sub.value=choice?.sub||base.sub;selectors.special.value=choice?.special||base.special;
      const sub=SUB[selectors.sub.value],sp=SPECIALS[selectors.special.value];
      const chips=body.querySelectorAll('.iw-kit');
      if(chips[0]?.querySelector('b'))chips[0].querySelector('b').textContent=sub?.name||'';
      if(chips[1]?.querySelector('b'))chips[1].querySelector('b').textContent=sp?.name||'';
      help.textContent=(sub?.blurb||'サブボタンを押して構え、離すと使用。')+' '+(CATALOGUE_HELP[selectors.special.value]||sp?.blurb||'ゲージが満タンでスペシャルボタン。');
    }
    function save(standard=false){const id=current(),choices=readChoices();if(standard)delete choices[id];else choices[id]={sub:selectors.sub.value,special:selectors.special.value};
      try{globalThis.localStorage?.setItem(CATALOGUE_STORAGE,JSON.stringify(choices));}catch{}
      const actor=G.match?.local||G.local;if(actor?.isLocal&&(!G.match||G.match.attract)){actor.s3CatalogueChoice=null;actor.setWeapon(actor.weaponId);}
      sync();
    }
    // Screen listeners are removed together with their screen DOM.
    body.addEventListener('click',()=>queueMicrotask(sync));
    sync();
    return screen;
  };
}

// catalogue-network
const packetLife=a=>Math.max(a?.net?.lastLife||0,a?.netLife||0);
const packetSafe=n=>Number.isSafeInteger(n)&&n>=0&&n<1e9;
const categories=['sub','special'];
// Catalogue packets use the same sequenced owner timeline as native attacks.
// Array vectors stay arrays, instead of silently disappearing in packEvent.
export function cataloguePayload(event) {
  if(!event||typeof event!=='object')return null;
  const payload={};
  for(const [key,value] of Object.entries(event)){
    if(['actor','owner','victim'].includes(key))continue;
    if(key==='__proto__'||key==='constructor'||key==='prototype')return null;
    if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>4294967295)return null;payload[key]=value;}
    else if(typeof value==='string'){if(value.length>96)return null;payload[key]=value;}
    else if(typeof value==='boolean')payload[key]=value;
    else if(Array.isArray(value)){if(value.length>64||value.some(v=>!Number.isFinite(v)||Math.abs(v)>1e6))return null;payload[key]=value.slice();}
  }
  return JSON.stringify(payload).length<=4096?payload:null;
}
export function installCatalogueNetwork(api,{replaySub,replaySpecial,replaySplashdown}) {
  const {G,NetMatch,on}=api;
  for(const category of categories)on('all:'+category,event=>{
    const nm=G.netm,actor=event.actor||nm?.byNid?.get(event.actorId),payload=cataloguePayload(event);
    if(!nm||nm.match!==G.match||nm.mute||!actor||actor.remote||actor.owner!==nm.myId
      ||nm.byNid?.get(actor.nid)!==actor||!payload)return;
    nm._rec(['ac',category,actor.nid,packetLife(actor),payload]);
  });
  const play=NetMatch.prototype._play;
  NetMatch.prototype._play=function(from,event){
    if(event?.[1]!=='ac')return play.call(this,from,event);
    if(![6,8].includes(event.length)||!Number.isFinite(event[0])||!categories.includes(event[2])||!packetSafe(event[3])||!packetSafe(event[4]))return;
    const actor=this.byNid?.get(event[3]),payload=cataloguePayload(event[5]);
    if(!actor?.remote||actor.owner!==from||packetLife(actor)!==event[4]||!payload)return;
    const seq=event._netSeq??(event.length===8?event[7]:null),tick=event._netTick??(event.length===8?event[6]:null);
    if(seq!==null&&(!packetSafe(seq)||seq<1||!packetSafe(tick)||seq<=(this.peers?.get(from)?._lastEventSeq||0)))return;
    // Production always supplies the ordered envelope. Legacy direct fixtures
    // are duplicate-guarded by their sender/time/serial instead.
    const key=from+':'+(seq??JSON.stringify(event));
    const seen=this._catalogueSeen||(this._catalogueSeen=new Set());if(seen.has(key))return;
    seen.add(key);while(seen.size>512)seen.delete(seen.values().next().value);
    play.call(this,from,event);
    payload.actor=actor;
    const id=payload.subId||payload.id;
    const objectHit=payload.phase==='objectHit'||payload.action==='objectHit';
    if(event[2]==='sub'&&['spawn','deploy'].includes(payload.phase)&&(!Object.hasOwn(api.SUB,id)||actor.weapon?.sub!==id))return;
    if(!objectHit&&event[2]==='special'&&!Object.hasOwn(api.SPECIALS,id))return;
    if(id==='booyahBomb'&&payload.action==='activate')actor.s3CatalogueBooyah={activation:payload.activation};
    if(id==='booyahBomb'&&payload.action==='end')actor.s3CatalogueBooyah=null;
    if(event[2]==='sub')return replaySub(api,payload);
    if(id==='tripleSplashdown')return replaySplashdown(api,payload);
    return replaySpecial(api,payload);
  };
  // Tick sidecars give a newly joined peer the selected pair before its queued
  // events play, without inventing alternate main IDs or changing packActor.
  const send=NetMatch.prototype._sendTick;
  NetMatch.prototype._sendTick=function(...args){
    const transport=this.s?.tr;if(!transport?.broadcast)return send.apply(this,args);
    const broadcast=transport.broadcast;
    transport.broadcast=message=>{
      if(message?.k==='t'){
        message.ck={};for(const a of this.byNid.values())if(!a.remote&&a.owner===this.myId)
          message.ck[a.nid]=[packetLife(a),a.weapon.sub,a.weapon.special];
      }
      return broadcast.call(transport,message);
    };
    try{return send.apply(this,args);}finally{transport.broadcast=broadcast;}
  };
  const tick=NetMatch.prototype._tick;
  NetMatch.prototype._tick=function(from,message){
    const last=this.peers?.get(from)?.lastTs??-Infinity;
    const result=tick.call(this,from,message);
    if(!Number.isFinite(message?.ts)||message.ts<=last||!message.ck||typeof message.ck!=='object'||Array.isArray(message.ck))return result;
    for(const [nid,pair]of Object.entries(message.ck)){
      const actor=this.byNid?.get(Number(nid));
      if(!actor?.remote||actor.owner!==from||!Array.isArray(pair)||pair.length!==3||pair[0]!==packetLife(actor))continue;
      const choice={sub:pair[1],special:pair[2]};
      if(validateCatalogueChoice(choice,api.SUB,api.SPECIALS))applyCatalogueChoice(actor,choice,api);
    }
    return result;
  };
}

// catalogue-base-kits
// Original/base variants in WeaponInfoMain 11.3.0. The separate registry lets
// the existing three-kit acceptance receipts retain their original denominator.
export const ADDITIONAL_BASE_KITS=Object.freeze({
  dualies:{main:'Maneuver_Normal_00',sub:'suction',special:'crabTank',specialCost:200},
  blaster:{main:'Blaster_Middle_00',sub:'autobomb',special:'bubbler',specialCost:190},
  splatling:{main:'Spinner_Standard_00',sub:'sprinkler',special:'waveBreaker',specialCost:210},
  slosher:{main:'Slosher_Strong_00',sub:'bomb',special:'tripleInkstrike',specialCost:220},
});
export function completeBaseKits({WEAPONS,SUB,SPECIALS}){
  for(const [main,k]of Object.entries(ADDITIONAL_BASE_KITS))if(!WEAPONS[main]||!SUB[k.sub]||!SPECIALS[k.special])throw new Error('Incomplete base kit '+main);
  for(const [main,k]of Object.entries(ADDITIONAL_BASE_KITS)){
    const w=WEAPONS[main];Object.assign(w,{sub:k.sub,special:k.special,specialCost:k.specialCost,kitReference:k.main,kitStatus:'verified-base-kit'});
    w.blurb=w.blurb?.replace('Original INKWAVE kit (not a verified Splatoon 3 kit).','').trim();
  }
}

// catalogue-splashdown
import {gearCurve} from './gear.mjs';
import {tripleSlamFistCenters,tripleSlamFistDamage,tripleSlamFistStamps} from './triple-slam-fists.mjs';
// SpPogo, separate from the original INKWAVE Tidal Slam. Sources are the
// 11.3.0 WeaponSpPogo table and Nintendo 7.2/9.3/11.3 changes. Vertical
// rise height and intermediate path are a collision-aware calibration.
export const SPLASHDOWN=Object.freeze({id:'tripleSplashdown',name:'Triple Splashdown',
  riseFrames:60,playerProtectedFrame:50,fistProtectedFrame:55,travelFrames:15,
  fistHp:100,fistDistance:6.54,nearRadius:6.4,farRadius:9.6,paintRadius:10,
  blurb:'Jump and strike with two independently breakable ink fists. During a Super Jump, only the player strikes.',
  status:'11.3.0 endpoints/timing; collision/vertical trajectory/paint clustering calibrated'});
const valid=n=>Number.isFinite(n),safe=n=>Number.isSafeInteger(n)&&n>=0;
const life=a=>Math.max(a?.netLife||0,a?.net?.lastLife||0);
const array=v=>[v.x,v.y,v.z].map(n=>Math.round(n*100)/100);
const INSTALL=Symbol.for('inkwave.catalogue.splashdown');
function serial(a){a._splashdownSerial=(a._splashdownSerial||0)%999999999+1;return a._splashdownSerial;}
function remove(f,G){if(!f.mesh)return;G.scene?.remove(f.mesh);f.mesh.geometry?.dispose();f.mesh.material?.dispose();f.mesh=null;}
function net(api,a,action,activation,pos,extra={}){
  if(!a.remote)api.emit('all:special',{actor:a,id:SPLASHDOWN.id,activation,action,pos:array(pos),seed:activation,...extra});
}
function visual(api,pos,owner){if(!api.G.scene)return null;const m=new api.THREE.Mesh(new api.THREE.BoxGeometry(1.5,1.4,1.5),new api.THREE.MeshStandardMaterial({color:owner.color||api.G.teamColors?.[owner.team]}));m.position.copy(pos);api.G.scene.add(m);return m;}
function spawnFists(api,owner,origin,yaw,activation,ghost=false){
  const p=api.G.projectiles;if(!p)return;
  const targets=tripleSlamFistCenters(origin,yaw);
  for(let index=0;index<2;index++){
    const target=new api.THREE.Vector3(targets[index].x,targets[index].y,targets[index].z),start=origin.clone();start.y+=1;
    // At 2m clearance fists pass low cover, but stop at tall walls. Every
    // endpoint is projected onto the surface under that particular fist.
    const topStart=start.clone().add(new api.THREE.Vector3(0,1,0)),topEnd=target.clone();topEnd.y=topStart.y;
    if(api.G.physics?.segment){const h=api.G.physics.segment(topStart,topEnd,new api.Hit());if(h.hit)target.copy(h.point).addScaledVector(h.normal,.2);}
    const probe=target.clone();probe.y+=8;
    const floor=api.G.physics?.raycast?.(probe,new api.THREE.Vector3(0,-1,0),20,new api.Hit());if(floor?.hit)target.y=floor.point.y;
    const f={owner,activation,index,sourceLife:life(owner),origin:origin.clone(),start,target,pos:start.clone(),age:0,hp:100,ghost,dead:false};
    f.mesh=visual(api,f.pos,owner);(p._catalogueFists||=[]).push(f);
  }
}
function burst(api,owner,pos,activation,index=-1){
  const {G,THREE}=api;G.fx?.explosion?.(pos,owner.color,9.6);
  if(owner.remote)return;
  const ap=owner.s3?.abilityPoints?.specialPower||0,scale=gearCurve(ap,1,1.05,1.1),paintRadius=gearCurve(ap,10,11,12);
  let area=0;for(const s of tripleSlamFistStamps(paintRadius)){
    const at=new THREE.Vector3(Math.round((pos.x+s.dx)*100)/100,Math.round((pos.y+.12)*100)/100,Math.round((pos.z+s.dz)*100)/100);
    if(G.physics?.los&&!G.physics.los(pos,at))continue;
    const seed=((activation*31+(index+2)*101+Math.round(s.dx*100)+Math.round(s.dz*100))>>>0)%1000/1000;
    area+=G.paint?.splat?.(at,3.74,owner.team,{seed,claimOwner:owner,claimMode:'no-special'})||0;
  }
  owner.addTurfNoSpecial?.(area);
  const spent=new Set();
  for(const v of G.actors||[]){if(!v.alive||v.team===owner.team)continue;const to=v.pos.clone();to.y+=.7;
    const damage=tripleSlamFistDamage(to.distanceTo(pos),scale);if(!damage||G.physics?.los&&!G.physics.los(pos,to))continue;
    const p={owner,team:owner.team,prev:pos,pos:to,vel:to.clone().sub(pos),damage,type:'blast',ghost:false};
    const barrier=G.projectiles.kitDefenseCandidate?.(p);if(barrier){const key=barrier.domeId||barrier;if(!spent.has(key)){barrier.onHit();spent.add(key);}continue;}
    G.projectiles.applyHit(owner,v,damage,'tripleSplashdown');
  }
  G.boss?.splash?.(owner,pos,9.6*scale,220,60,'tripleSplashdown');
  net(api,owner,'impact',activation,pos,{index});
}
function fistsStep(api,dt){const list=api.G.projectiles?._catalogueFists||[];
  for(let i=list.length-1;i>=0;i--){const f=list[i];f.age+=dt;
    if(f.dead||f.hp<=0||f.age>2.5){remove(f,api.G);list.splice(i,1);continue;}
    const travel=.25,elapsed=f.age-travel;
    if(elapsed<0)f.pos.copy(f.start).lerp(f.target,Math.min(1,f.age/travel));
    else{const y=elapsed<1?6.5*Math.sin(Math.min(1,elapsed)*Math.PI/2):Math.max(0,6.5-39*(elapsed-1));f.pos.copy(f.target);f.pos.y+=y+1;}
    f.mesh?.position.copy(f.pos);
    if(elapsed>=1+10/60){if(!f.ghost)burst(api,f.owner,f.target,f.activation,f.index);remove(f,api.G);list.splice(i,1);}
  }
}
function hitFist(api,f,shooter,damage){if(f.dead||f.age-.25>=55/60||shooter.team===f.owner.team||!valid(damage)||damage<=0)return false;
  const amount=damage*(shooter.s3?.modifiers?.objectShredder?1.1:1);
  if(f.ghost){net(api,shooter,'objectHit',f.activation,f.pos,{ownerNid:f.owner.nid,ownerLife:f.sourceLife,index:f.index,damage:amount});return true;}
  f.hp-=amount;if(f.hp<=0){f.dead=true;net(api,f.owner,'fistGone',f.activation,f.pos,{index:f.index});}return true;
}
export function replaySplashdown(api,event){
  if(!event?.actor||event.id!=='tripleSplashdown'||!safe(event.activation)||!Array.isArray(event.pos)||event.pos.length!==3||!event.pos.every(valid))return false;
  const pos=new api.THREE.Vector3(...event.pos),actor=event.actor,list=api.G.projectiles?._catalogueFists||[];
  if(event.action==='objectHit'){
    const target=api.G.netm?.byNid?.get(event.ownerNid);if(!target||target.remote||event.ownerLife!==life(target)||!valid(event.damage)||event.damage<=0||event.damage>2200)return false;
    const f=list.find(f=>f.owner===target&&f.activation===event.activation&&f.index===event.index);return !!f&&hitFist(api,f,actor,event.damage/(actor.s3?.modifiers?.objectShredder?1.1:1));
  }
  if(event.action==='activate'&&!event.superJump){if(!valid(event.yaw))return false;
    if(list.some(f=>f.owner===actor&&f.activation===event.activation))return false;
    spawnFists(api,actor,pos,event.yaw,event.activation,true);return true;}
  if(event.action==='fistGone'){const f=list.find(f=>f.owner===actor&&f.activation===event.activation&&f.index===event.index);if(f)f.dead=true;return !!f;}
  if(event.action==='impact'){api.G.fx?.explosion?.(pos,actor.color,9.6);return true;}return false;
}
export function installCatalogueSplashdown(api){
  const {Actor,Projectiles,SPECIALS,G,THREE,PLAYER}=api;if(Actor.prototype[INSTALL])return;
  Object.defineProperty(Actor.prototype,INSTALL,{value:true});SPECIALS.tripleSplashdown={...SPLASHDOWN};
  const nativeStart=Actor.prototype._startSpecial,nativeUpdate=Actor.prototype._updateSpecial;
  function start(actor,superJump=false){if(actor.remote||!actor.alive||!actor.specialReady?.())return false;
    const activation=serial(actor),origin=actor.pos.clone(),yaw=actor.aimYaw;
    nativeStart.call(actor);actor.specialActive={id:'tripleSplashdown',age:0,phase:superJump?'drop':'rise',activation,origin,superJump,armor:false};
    actor.special=actor.specialCost();
    actor.weaponRunner?.reset?.();actor._setClimb?.(false);actor.form='kid';actor.grounded=false;actor.superJumpState=null;
    actor.character?.trigger?.('special_leap');actor.vel.set(0,superJump?-39:0,0);
    if(!superJump)spawnFists(api,actor,origin,yaw,activation);
    net(api,actor,'activate',activation,origin,{yaw,superJump});return true;
  }
  Actor.prototype._startSpecial=function(...args){if(this.weapon?.special!=='tripleSplashdown')return nativeStart.apply(this,args);return start(this);};
  Actor.prototype._updateSpecial=function(dt,...args){const s=this.specialActive;if(s?.id!=='tripleSplashdown')return nativeUpdate.call(this,dt,...args);
    s.age+=dt;const oldY=this.pos.y;
    // Retain a gauge remainder while vulnerable, so native Special Saver can
    // operate on a cancelled activation. No turf from these blasts refills it.
    this.special=this.specialCost()*Math.max(0,1-s.age/(70/60));
    if(!s.superJump&&s.age<1){this.pos.y=s.origin.y+6.5*Math.sin(s.age*Math.PI/2);this.vel.y=0;}
    else{this.vel.y=-39;this.pos.addScaledVector(this.vel,dt);s.phase='drop';}
    this._resolve?.(false,oldY,false);
    if(s.phase==='drop'&&(this.grounded||s.age>2.25)){burst(api,this,this.pos,s.activation);this.specialActive=null;this.special=0;this.invuln=Math.max(this.invuln||0,.1);}
  };
  const damage=Actor.prototype.damage;
  Actor.prototype.damage=function(...args){const s=this.specialActive;if(s?.id==='tripleSplashdown'&&(s.superJump||s.age>=50/60))return false;return damage.apply(this,args);};
  const jump=Actor.prototype._updateSuperJump;
  if(jump)Actor.prototype._updateSuperJump=function(dt,...args){if(this.weapon?.special==='tripleSplashdown'&&this.superJumpState?.phase==='flight'&&this.intent.special&&this.specialReady?.())return start(this,true);return jump.call(this,dt,...args);};
  const update=Projectiles.prototype.update,clear=Projectiles.prototype.clear,candidate=Projectiles.prototype.kitDefenseCandidate;
  Projectiles.prototype.update=function(dt,...args){const r=update.call(this,dt,...args);if(valid(dt)&&dt>0)fistsStep(api,dt);return r;};
  Projectiles.prototype.clear=function(...args){for(const f of this._catalogueFists||[])remove(f,G);this._catalogueFists=[];return clear.apply(this,args);};
  Projectiles.prototype.kitDefenseCandidate=function(p){let best=candidate?.call(this,p);if(!p?.owner||p.ghost||!p.prev||!p.pos)return best;
    const delta=p.pos.clone().sub(p.prev),length=delta.length();if(!length)return best;delta.divideScalar(length);
    for(const f of this._catalogueFists||[]){if(f.dead||f.owner.team===p.team||f.age-.25>=55/60)continue;
      const to=f.pos.clone().sub(p.prev),at=Math.max(0,Math.min(length,to.dot(delta))),point=p.prev.clone().addScaledVector(delta,at);
      if(point.distanceTo(f.pos)>1+(p.size||0)||best&&best.distance<=at)continue;
      best={distance:at,point,onHit:()=>hitFist(api,f,p.owner,p.damage||0)};
    }return best;};
}

// catalogue-vision
// Screen affects the recipient's world view; HUD and input retain their own
// colours. CSS is a prototype presentation of the sourced 360F colour status.
export function catalogueVisionFilter(actor,time) {
  return actor?.alive && Number.isFinite(actor.s3?.splattercolorUntil)
    && actor.s3.splattercolorUntil>time ? 'grayscale(1) brightness(1.4) contrast(.8)' : '';
}
export function installCatalogueVision({G,Actor,CameraRig}) {
  const update=CameraRig.prototype.update;
  CameraRig.prototype.update=function(...args){const result=update.apply(this,args);
    const canvas=G.renderer?.domElement;if(canvas)canvas.style.filter=catalogueVisionFilter(G.match?.local,G.time);
    return result;
  };
  const reset=Actor.prototype.reset;
  Actor.prototype.reset=function(...args){const result=reset.apply(this,args);if(this.s3)this.s3.splattercolorUntil=0;return result;};
}

// Reuse both map surfaces and the native keyboard/touch/gamepad destination
// lane. The prefixed identity distinguishes a Beakon from a Great Barrier.
export function installCatalogueBeakonJumps(api) {
 const {G,Actor}=api,bubblerTargets=G.bigBubblerJumpTargets,bubblerJump=Actor.prototype.superJumpToBubbler;
 const identity=o=>'beakon:'+String(o.owner?.nid??o.owner?.id??'local')+':'+String(o.sourceLife);
 const resolve=(target,team)=>(api.getSubBeakons?.(team)||[]).find(o=>identity(o)===target?.id&&o.seq===target.serial);
 Object.defineProperty(G,'bigBubblerJumpTargets',{configurable:true,value:team=>[
  ...(bubblerTargets?.(team)||[]),...(api.getSubBeakons?.(team)||[]).map(o=>({kind:'bubbler',id:identity(o),serial:o.seq,team:o.team,pos:o.pos,beakon:true}))
 ]});
 Object.defineProperty(Actor.prototype,'superJumpToBubbler',{configurable:true,value:function(target){
  if(!target?.id?.startsWith('beakon:'))return bubblerJump?.call(this,target)||false;
  const o=resolve(target,this.team);if(!o||this.remote||!this.isLocal||!this.canSuperJump?.())return false;
  if(!this.superJump(o.pos.clone()))return false;
  if(api.useSubBeakon?.(this,o,'reserve')===false){this.superJumpState=null;return false;}
  this.superJumpState.beakonTarget={kind:'bubbler',id:target.id,serial:target.serial,team:this.team};
  this.superJumpState.beakonObject=o;
  return true;
 }});
 const update=Actor.prototype._updateSuperJump;
 Actor.prototype._updateSuperJump=function(...args){
  const state=this.superJumpState,target=state?.beakonTarget;
  if(target&&state.phase==='charge'&&!resolve(target,this.team)){api.useSubBeakon?.(this,state.beakonObject,'cancel');this.superJumpState=null;return;}
  const result=update.apply(this,args);
  if(target&&!this.superJumpState&&this.alive&&this.grounded){const o=resolve(target,this.team);if(o)api.useSubBeakon?.(this,o,'land');}
  return result;
 };
 for(const method of ['reset','splat']){const original=Actor.prototype[method];if(original)Actor.prototype[method]=function(...args){const state=this.superJumpState;if(state?.beakonObject)api.useSubBeakon?.(this,state.beakonObject,'cancel');return original.apply(this,args);};}
}

export function installCatalogueControls({G,PlayerController,HUD,emit}) {
 const update=PlayerController.prototype.update;
 PlayerController.prototype.update=function(...args){
  const result=update.apply(this,args),a=this.a,input=this.input;
  const held=!!(input?.down?.('KeyN')||input?.lastDevice==='pad'&&input?.padButton?.(13));
  const edge=held&&!this._catalogueCheerHeld;this._catalogueCheerHeld=held;
  a.intent.booyah=!!(this.enabled&&a.alive&&!this.mapHeld&&!G.match?.paused&&(edge||a._catalogueCheerPending));a._catalogueCheerPending=false;
  if(a.intent.booyah){
   const serial=a._catalogueCheerSeq=(a._catalogueCheerSeq||0)%999999999+1;
   for(const caster of G.actors||[])if(caster.remote&&caster.team===a.team&&caster.specialActive?.id==='booyahBomb'&&caster.s3CatalogueBooyah){
    emit('all:special',{actor:a,id:'booyahBomb',activation:caster.s3CatalogueBooyah.activation,action:'cheer',ownerNid:caster.nid,ownerLife:packetLife(caster),pos:[a.pos.x,a.pos.y,a.pos.z],seed:serial});
   }
  }
  return result;
 };
 const hudUpdate=HUD.prototype.update;
 HUD.prototype.update=function(...args){const result=hudUpdate.apply(this,args);
  if(!this._catalogueCheer&&globalThis.document){const button=document.createElement('button');button.type='button';button.textContent='ナイス (N / ↓)';button.setAttribute('aria-label','ナイスで応援する');
   button.style.cssText='position:absolute;left:50%;top:100px;transform:translateX(-50%);min-height:44px;padding:8px 16px;border-radius:20px;border:2px solid #fff;background:#161224;color:#fff;font:inherit;pointer-events:auto;z-index:8';
   button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();const a=G.match?.local;if(a)a._catalogueCheerPending=true;});
   this.el.append(button);this._catalogueCheer=button;
  }
  if(this._catalogueCheer){const me=G.match?.local;this._catalogueCheer.hidden=!this._visible||!me?.alive||!!G.match?.paused||!(G.actors||[]).some(a=>a.alive&&a.team===me.team&&a.specialActive?.id==='booyahBomb');}
  return result;
 };
}
