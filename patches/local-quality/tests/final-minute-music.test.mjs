// Real MusicEngine/Player scheduling; WebAudio nodes are the existing audio fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {idleFixture,audioFixture,compose} from './idle-fixture.mjs';
import {FixedClock} from '../../splatoon3/runtime/clock.mjs';
import {adaptFinalMinuteMusic} from '../final-minute-music-adapter.mjs';
import {replaceOnce,qualityIdentity} from '../adapter.mjs';
const ROOT=new URL('../../../',import.meta.url),read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const site=process.env.INKWAVE_FINAL_MINUTE_SITE;
const minify=process.env.INKWAVE_FINAL_MINUTE_MINIFY==='1';
const transform=minify?(await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild')).transformSync:null;
function walk(n,visit){if(!n||typeof n!=='object')return;visit(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v&&typeof v==='object')walk(v,visit);}
function extract(code){
 const ast=parse(code,{ecmaVersion:'latest',sourceType:'module'});let method,callback,gName='G';
 walk(ast,n=>{if(n.type==='ImportSpecifier'&&n.imported?.name==='G')gName=n.local.name;if(n.type==='MethodDefinition'&&n.key.name==='_playMusic')method=code.slice(n.start,n.end);if(n.type==='CallExpression'&&n.arguments[0]?.value==='match:oneminute')callback=code.slice(n.arguments[1].start,n.arguments[1].end);});
 assert(method&&callback,'actual Main method and one-minute bus callback');
 return G=>new (new Function(gName,`return class {${method}\n wire(){this.minute=${callback};}}`)(G))();
}
async function fixture({baseline=false,initialized=true}={}){
 const audio=audioFixture(),api=await idleFixture({globals:audio.globals,built:site,transform:(rel,code)=>minify&&rel==='src/audio/music.js'?transform(code,{loader:'js',format:'esm',minify:true}).code:code});
 let code=baseline?compose('src/main.js',true):site?fs.readFileSync(path.join(site,'src/main.js'),'utf8'):compose('src/main.js');if(minify)code=transform(code,{loader:'js',format:'esm',minify:true}).code;
 const m=new api.MusicEngine(),calls=[];api.G.music=m;api.G.audio={play:n=>calls.push({kind:'sfx',name:n,at:audio.ctx.currentTime})};
 const game=extract(code)(api.G);Object.assign(game,{match:{mode:'turf'},hud:{banner:n=>calls.push({kind:'hud',name:n,at:audio.ctx.currentTime})}});game.wire();
 if(initialized)m._init(audio.ctx,audio.ctx.createGain());
 return {...audio,...api,m,game,calls};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} ~= ${b}`);
function advanceAudio(f,target){while(f.ctx.currentTime+1e-9<target){f.ctx.currentTime=Math.min(target,f.ctx.currentTime+.025);f.m._tick();}}

test('negative control: normal fade forces final-minute cue to a later bar',async()=>{
 const f=await fixture({baseline:true});f.game._playMusic('battle');const old=f.m.current;advanceAudio(f,old.t0+.1);const request=f.ctx.currentTime;f.game.minute();near(f.m.current.t0,old.nextBarTime(request+.12));assert(f.m.current.t0-request>1);f.m.dispose();
});
test('#742 every outgoing bar phase uses the existing 60ms schedule lead and retires old music promptly',async()=>{
 const f=await fixture();for(const phase of [0,.001,.1,.4,.8,1.2,1.48,1.599]){
  f.m.setMusicEnabled(false);f.m.setMusicEnabled(true);f.game._playMusic('battle');const old=f.m.current;advanceAudio(f,old.t0+phase);const now=f.ctx.currentTime;f.game.minute();
  assert.equal(f.m.current.id,'battle_final');near(f.m.current.t0-now,.06);near(old.fadeSeg.t0,now);near(old.fadeSeg.t1-now,.03);near(old.stopAt-now,.05);assert.equal(f.game._musicTrack,'battle_final');
  const count=f.m.players.length;f.game.minute();assert.equal(f.m.players.length,count,'native same-track guard retains one player');
 }assert.equal(f.m._platformMusic.restarts,0,'continuous phase probes never use the platform gap restart');f.m.dispose();
});
for(const hz of [30,60,90,120])test(`#742 ${hz}Hz native match milestone and follower path retain timing authority`,async()=>{
 for(const follower of [false,true]){
  const f=await fixture();f.game._playMusic('battle');advanceAudio(f,.35);const raw=read('src/game/match.js'),ast=parse(raw,{ecmaVersion:'latest',sourceType:'module'});let update;
  walk(ast,n=>{if(n.type==='MethodDefinition'&&n.key.name==='update')update=raw.slice(n.start,n.end);});let at,time,count=0;
  const emit=n=>{if(n==='match:oneminute'){count++;at=f.ctx.currentTime;time=match.time;f.game.minute();}};
  const Match=new Function('G','MATCH','emit',`return class {${update}\n setState(s){this.state=s;}}`)(f.G,{finalCountdown:10},emit);
  const match=new Match();Object.assign(match,{actors:[],paused:false,state:'playing',stateT:0,time:60.04,duration:180,attract:false,bossMode:null,lastMinuteFired:false,lastCount:99,follower});
  const clock=new FixedClock();for(let i=1;i<=Math.ceil(hz*.2);i++){advanceAudio(f,.35+i/hz);clock.advance(1/hz,dt=>match.update(dt));}
  assert.equal(count,1);assert(time<=60&&time>60-1/60);near(f.m.current.t0-at,.06);assert.deepEqual(f.calls.map(x=>x.kind),['hud','sfx']);assert(f.calls.every(x=>x.at===at));assert.equal(match.follower,follower);f.m.dispose();
 }
});
test('ordinary same-BPM requests keep bar sync and Boss milestone guard remains intact',async()=>{
 const f=await fixture();f.game._playMusic('battle');const old=f.m.current;advanceAudio(f,old.t0+.2);const now=f.ctx.currentTime;
 f.game._playMusic('battle_final');near(f.m.current.t0,old.nextBarTime(now+.12));assert(f.m.current.t0-now>.12);
 f.game.match.mode='boss';const current=f.m.current,count=f.m.players.length;f.game.minute();assert.equal(f.m.current,current);assert.equal(f.m.players.length,count);assert.deepEqual(f.calls.map(x=>x.kind),['hud','sfx']);f.m.dispose();
});
test('muted and pre-init latest requests retain the deadline option without starting extra schedulers',async()=>{
 const f=await fixture();f.game._playMusic('battle');f.m.setMusicEnabled(false);f.game.minute();assert.equal(f.m.players.length,0);assert.equal(f.workers.size,0);assert.equal(f.m._musicIdle.wanted.opts.fade,0);f.ctx.currentTime=9;f.m.setMusicEnabled(true);assert.equal(f.m.current.id,'battle_final');near(f.m.current.t0,9.06);assert.equal(f.workers.size,1);f.m.dispose();
 const late=await fixture({initialized:false});late.game._playMusic('battle');late.game.minute();assert.equal(late.m.players.length,0);assert.equal(late.m._want.opts.fade,0);late.ctx.currentTime=12;late.m._init(late.ctx,late.ctx.createGain());assert.equal(late.m.current.id,'battle_final');near(late.m.current.t0,12.06);late.m.dispose();
});
test('adapter changes only Main request glue and fails closed on drift or repetition',()=>{
 const rel='src/main.js',raw=read(rel),changed=adaptFinalMinuteMusic(rel,raw,replaceOnce);assert.throws(()=>adaptFinalMinuteMusic(rel,'',replaceOnce),/conflict/);assert.throws(()=>adaptFinalMinuteMusic(rel,raw+raw,replaceOnce),/conflict/);assert.throws(()=>adaptFinalMinuteMusic(rel,changed,replaceOnce),/conflict/);for(const p of ['src/audio/music.js','src/game/match.js','src/net/netmatch.js'])assert.equal(adaptFinalMinuteMusic(p,read(p),replaceOnce),read(p));assert(qualityIdentity()['final-minute-music-adapter.mjs']);
});
