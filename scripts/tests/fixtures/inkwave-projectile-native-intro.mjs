import assert from 'node:assert/strict';
import fs from 'node:fs';
import { adaptBuildSource } from '../../inkwave-source-composition.mjs';
import {beginIntroPresentation,advanceIntroPresentation} from '../../../patches/splatoon3/runtime/intro-presentation.mjs';

// Composed production methods; 3D rendering, actors, audio and side systems are fixtures.
const composed = rel => adaptBuildSource(rel, fs.readFileSync(new URL('../../../inkwave-public/' + rel, import.meta.url), 'utf8'));
const main = composed('src/main.js'), hud = composed('src/ui/hud.js'), match = composed('src/game/match.js');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a && source.indexOf(start, a + 1) < 0, 'unique actual method: ' + start);
  return source.slice(a, b);
}
export const nativeIntroMethods = {
  beginIntroPresentation:beginIntroPresentation.toString(),
  advanceIntroPresentation:advanceIntroPresentation.toString(),
  intro: section(main, '  _intro() {', '\n  pause() {'),
  loop: section(main, '  _loop() {', '\n  // keep weaker GPUs'),
  update: section(match, '  update(dt) {', '\n  updateController(dt) {'),
  setState: section(match, '  setState(s) {', '\n  dispose() {'),
  visible: section(hud, '  setVisible(v) {', '\n  /** ScreenFX'),
  lineup: section(hud, '  _lineup(match) {', '\n  // ---------------------------------------------------------------- damage direction arcs'),
  banner: section(hud, "  banner(kind = 'custom', text) {", '\n  countdown(n) {'),
};
export function installNativeIntroFixture(methods) {
    const beginIntroPresentation=eval('('+methods.beginIntroPresentation+')');
    const advanceIntroPresentation=eval('('+methods.advanceIntroPresentation+')');
    const G = window.__G = { mode:'match', level:{spawnPads:[{x:0,y:0,z:0}]}, projectiles:{}, teamHex:['#ff8a14','#2f5bff'] };
    const THREE = { Vector3:class {constructor(x,y,z){Object.assign(this,{x,y,z});} set(x,y,z){Object.assign(this,{x,y,z});}} };
    const nativeArenaBasis = () => null, nativeSpawnYaw = (_l,_t,yaw) => yaw;
    const TEAM_NAMES=['Alpha','Bravo'], WEAPONS={}, GLYPHS={}, tr=x=>x, tu=x=>x;
    const toHex=(x,f)=>x||f, colorVars=()=>{}, tagTitle=()=>'', tagNum=()=>'', tagArt=()=>'', fnv=()=>0, weaponIcon=()=>'', kindOf=x=>x, splatSVG=()=>'';
    const h = (tag, props, ...kids) => {
      const e=document.createElement(tag);
      for(const [k,v] of Object.entries(props||{})){if(k==='class')e.className=v;else if(k==='html')e.innerHTML=v;else if(k==='style')for(const [a,b] of Object.entries(v))e.style.setProperty(a,b);else e.setAttribute(k,v);}
      for(const child of kids.flat(Infinity))if(child!=null)e.append(child);
      return e;
    };
    const restartAnim=(el,cls)=>{el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);};
    const captureTurfFinish=()=>{},advanceTenacity=()=>{},sampleTeamWipes=()=>{};
    const MATCH={finalCountdown:5};
    const calls = window.calls={frames:0,liveFrames:0,renderedIntroFrames:0,skippedLiveFrames:0,freeze:0,unfreeze:0};
    const hud={el:document.querySelector('.iw-hud'),overLayer:document.querySelector('.iw-hud-over'),_visible:false,boss:{on:false},setWorldPaused(){},_snd(){}};
    hud.bannerLayer=h('div');hud.overLayer.append(hud.bannerLayer);
    hud.setVisible=eval('({'+methods.visible+'})').setVisible;
    hud._lineup=eval('({'+methods.lineup+'})')._lineup;
    hud.banner=eval('({'+methods.banner+'})').banner;
    const m={state:'intro',stateT:0,time:180,duration:180,mode:'turf',attract:false,paused:false,actors:[],controller:{},local:{isLocal:true,team:0}};
    const emit=(kind,data)=>{if(kind==='match:state'&&data.state==='playing')hud.banner('go');};
    m.update=eval('({'+methods.update+'})').update;m.setState=eval('({'+methods.setState+'})').setState;
    const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2');
    if(!gl)throw Error('real WebGL2 context unavailable');
    const renderer={domElement:canvas,getContext:()=>gl};
    const game=window.__inkwave={match:m,frozen:false,_skipRender:false,hud,R:{renderer},rig:{cinematic(){}},_playMusic(){},
      settings:{frameRate:'display'},_rangeFrameProbe:null,timer:{update(){},getDelta:()=>1/60},fpsAcc:0,fpsN:0,_dynRes(){},
      menus:{current:null,_scr:null,layer:h('div'),wipeEl:h('div'),wipe:{busy:false,running:false}}};
    game.debug={freeze(){calls.freeze++;game.frozen=true;},unfreeze(){calls.unfreeze++;game.frozen=false;game.timer.update();}};
    game._frame=dt=>{
      calls.frames++;
      if(m.state==='intro'){if(!game._skipRender)calls.renderedIntroFrames++;}
      else {calls.liveFrames++;if(game._skipRender)calls.skippedLiveFrames++;}
      m.update(dt);
      advanceIntroPresentation(game);
    };
    game._intro=eval('({'+methods.intro+'})')._intro;
    game._loop=eval('({'+methods.loop+'})')._loop;
    G.match=m;G.game=game;G.renderer=renderer;
    window.nativeIntroStartedAtMs=Date.now();
    game._intro();
    // Actual composed native lineup with a minimal non-playing presentation roster.
    hud._lineup({actors:[{name:'Player',team:0,isLocal:true,weaponId:'shooter'}]});
    window.startNativeLoop=()=>game._loop();
}
