import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fixture } from './match-hud-fixture.mjs';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
const ROOT=new URL('../../../',import.meta.url);
const composed=rel=>adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8')))));
function section(s,start,end){const a=s.indexOf(start),b=s.indexOf(end,a);assert.ok(a>=0&&b>a,start);return s.slice(a,b);}
const plain=x=>JSON.parse(JSON.stringify(x));
const STEP=1/60;

function hudFrame(f,a) {
 f.G.camera=new f.THREE.PerspectiveCamera(60,800/600,.1,100);f.G.camera.position.set(0,2,10);f.G.camera.lookAt(0,1,0);f.G.camera.updateMatrixWorld();f.G.actors=[a];
 const code=section(composed('src/main.js'),'  _updateHud(dt) {','\n  // ---------------------------------------------------------------------------------------- touch / gyro');
 const Game=vm.runInNewContext(`class Game {${code}};Game`,{G:f.G,PLAYER:f.PLAYER,SUB:f.SUB,THREE:f.THREE,innerWidth:800,innerHeight:600,t:x=>x});
 const game=new Game();let frame;
 Object.assign(game,{match:{local:a,actors:[a],time:150,duration:180,state:'playing',teamSummary:()=>[{},{}]},settings:{minimap:true},
  minimap:{update(){},toCanvas(x,z,out){out.x=x;out.y=z;},w:100,h:100,canvas:{}},_hintT:0,_hints:{},_lowInkFlash:0,input:{},hud:{update:(_dt,value)=>{frame=value;}}});
 const event=section(composed('src/main.js'),"    on('lowink',",'\n');
 vm.runInNewContext(`(function(){${event}}).call(game)`,{on:f.on,game});
 return {game,read(){game._updateHud(STEP);return frame;}};
}

for(const team of [0,1]) test(`#112 actual team summary and actual HUD hide only opposing timers (local team ${team})`,async()=>{
 const f=await fixture(),local=f.make(),ally=f.make(),enemy=f.make();local.team=ally.team=team;enemy.team=1-team;
 ally.alive=enemy.alive=false;ally.respawnTimer=2.3;enemy.respawnTimer=7.2;
 const m=Object.create(f.Match.prototype);Object.assign(m,{local,actors:[local,ally,enemy]});
 let summary=m.teamSummary();assert.equal(summary[1-team].players[0].respawn,null);assert.equal(summary[team].players[1].respawn,2.3);
 const node=()=>({style:{},classList:{values:new Map(),add(){},remove(){},toggle(k,v){this.values.set(k,v);}},animate(){},querySelector(k){return this.parts[k]||(this.parts[k]=node());},parts:{}});
 const squads=[{children:Array.from({length:4},node)},{children:Array.from({length:4},node)}];
 const hud=Object.create(f.HUD.prototype);Object.assign(hud,{_L:{},squads,_restart(){},_actorFor:()=>null});
 if(team)summary=summary.reverse();hud._updSquads(summary);
 assert.equal(squads[0].children[1].querySelector('.iw-sq__n').textContent,'3');
 const opposite=squads[1].children[0];assert.equal(opposite.querySelector('.iw-sq__n').textContent,'');assert.equal(opposite.querySelector('.iw-sq__ring circle').style.display,'none');
 assert.equal(opposite.querySelector('.iw-sq__ring circle').style.animationDuration,undefined);
 // Defense in depth: an old/raw summary still cannot disclose its numeric timer.
 summary[1].players[0].respawn=.9;hud._L={};hud._updSquads(summary);assert.equal(opposite.querySelector('.iw-sq__n').textContent,'');
 enemy.alive=true;enemy.special=enemy.specialCost();summary=m.teamSummary();if(team)summary=summary.reverse();hud._updSquads(summary);
 assert.equal(opposite.classList.values.get('is-dead'),false);assert.equal(opposite.classList.values.get('is-ready'),true);
});

test('#112 pause snapshot and roster refresh cannot reveal opponents remaining seconds',async()=>{
 const f=await fixture(),local=f.make(),enemy=f.make();local.team=1;local.isLocal=true;enemy.team=0;enemy.alive=false;enemy.respawnTimer=7.4;
 f.G.match={local,actors:[local,enemy],time:100,duration:90};
 const source=composed('src/ui/menus.js'),body=section(source,'  _matchSnapshot() {','  _scr_pause() {');
 const Menus=vm.runInNewContext(`class Menus{${body}};Menus`,{G:f.G,toHex:x=>x,console});
 const menu=new Menus();menu._accent=()=>['a','b'];menu._accentNames=()=>['A','B'];assert.equal(menu._matchSnapshot().players[1].respawn,null);
 const refresh=section(source,'      for (const r of rosterRows) {','    };\n    refresh(snap);');
 const row=()=>({classList:{toggle(){}}});const rosterRows=[{name:'enemy',team:0,sig:'',row:row(),st:{}},{name:'me',team:1,sig:'',row:row(),st:{}}];
 vm.runInNewContext(refresh,{rosterRows,me:{team:1},DEATH_ICON:'x',SQUID:'s',s:{players:[{name:'enemy',team:0,alive:false,respawn:7.4},{name:'me',team:1,alive:false,respawn:3.2}]}});
 assert.equal(rosterRows[0].st.innerHTML,'<span class="iw-st iw-st--dead"><i>x</i></span>');assert.match(rosterRows[1].st.innerHTML,/>4s</);
});

test('#117 idle 17.99/18/18.01 ink is not a shortage; actual failed main/sub use supplies the native warning',async()=>{
 const f=await fixture(),a=f.make();a.isLocal=true;const h=hudFrame(f,a);
 for(const ink of [0,17.99,18,18.01]){a.ink=ink;assert.equal(h.read().inkLow,false);}
 a.ink=a.weapon.inkPerShot-.001;a.lastFire=0;a.intent.fire=true;f.tick(a,3);assert.ok(h.game._lowInkFlash>0);assert.equal(h.read().inkLow,true);
 h.game._lowInkFlash=0;a.weaponRunner.reset();a.ink=a.weapon.inkPerShot+.001;a.lastFire=0;f.tick(a,3);assert.equal(h.read().inkLow,false,'a successful affordable shot below18 is not shortage');
 a.intent.fire=false;a.weaponRunner.reset();a.ink=f.SUB.bomb.inkCost-.001;a.intent.sub=true;f.tick(a);assert.equal(h.read().inkLow,true);
 h.game._lowInkFlash=0;const remote=f.make();remote.isLocal=false;f.emit('lowink',{actor:remote});assert.equal(h.read().inkLow,false,'another player cannot flash local shortage');
});

test('#300 real activation counts survive owner snapshots and authoritative results without duplicate counting',async()=>{
 const f=await fixture(),a=f.make();a.nid=7;a.owner='owner';a.isLocal=true;
 a.special=a.specialCost();a.intent.special=false;f.tick(a);assert.equal(a.stats.specials,0,'filled gauge is not use');
 for(let i=0;i<3;i++){a.intent.special=false;f.tick(a);a.special=a.specialCost();a.specialActive=null;a.intent.special=true;f.tick(a);a.specialActive=null;}
 assert.equal(a.stats.specials,3);a.special=0;a.intent.special=false;f.tick(a);a.intent.special=true;f.tick(a);assert.equal(a.stats.specials,3,'blocked input is not use');
 let packet;const sender=new f.NetMatch({myId:'owner',isHost:false,tr:{broadcast:d=>{packet=plain(d);}}},{});sender.byNid.set(7,a);sender._sendTick();assert.equal(packet.a[0][21],3);
 const remote=f.make();Object.assign(remote,{nid:7,owner:'owner',remote:true,net:{buf:[]}});const host=new f.NetMatch({myId:'host',hostId:'host',isHost:true},{});host.byNid.set(7,remote);
 packet.ts=1;host._tick('intruder',packet);assert.equal(remote.stats.specials,0);host._tick('owner',packet);assert.equal(remote.stats.specials,3);
 host._tick('owner',packet);assert.equal(remote.stats.specials,3);packet.ts=.9;packet.a[0][21]=2;host._tick('owner',packet);assert.equal(remote.stats.specials,3);
 let result;host.match={actors:[remote]};host._sendNow=d=>{result=plain(d);};host.sendResult({coverage:[.6,.4],winner:0});assert.deepEqual(result.specialCounts,[[7,3]]);assert.equal(result.st[0].length,6,'legacy stat tuple left for assist owner');
 const guest=new f.NetMatch({myId:'guest',isHost:false},{}),actor=f.make();guest.byNid.set(7,actor);guest.match={time:1,setState(s){this.state=s;}};guest._result(result);assert.equal(actor.stats.specials,3);
 guest._result({...result,specialCounts:[[7,1]]});assert.equal(actor.stats.specials,3,'stale result cannot erase known own count');
 for(const bad of [-1,1.5,null,'9']){guest._result({...result,specialCounts:[[7,bad]]});assert.equal(actor.stats.specials,3);}
 delete result.specialCounts;guest._result(result);assert.equal(actor.stats.specials,3,'older peer result does not erase known count');
});

test('#300 actual judge result payload carries all players specials without changing XP, ordering or other stats',async()=>{
 const f=await fixture(),a=f.make(),b=f.make(),enemy=f.make();a.isLocal=true;enemy.team=1;
 [a,b,enemy].forEach((x,i)=>{x.stats={turf:100+i,splats:2+i,deaths:i,specials:i*2};});
 const code=section(composed('src/main.js'),'  async _judge() {','\n  _fade(to, ms)');let output;
 const G={teamHex:['a','b'],teamColors:['a','b'],netm:null,net:null};
 const Game=vm.runInNewContext(`class Game{${code}};Game`,{G,TEAM_NAMES:['A','B'],PROGRESSION:f.PROGRESSION,saveJSON(){},setTimeout:()=>0});
 const game=new Game(),m={local:a,actors:[a,b,enemy],state:'judge',result:{coverage:[.6,.4],winner:0},setState(s){this.state=s;}};
 Object.assign(game,{match:m,profile:{level:1,xp:0,matches:0,wins:0,totalTurf:0},palette:{},mapDef:{name:'test'},rig:{overview(){}},hud:{judge:()=>Promise.resolve(),setVisible(){}},showcase:{showResults(){}},menus:{showResults:d=>{output=d;},show(){}}});
 await game._judge();assert.deepEqual(plain(output.players.map(p=>p.specials)),[0,2,4]);assert.deepEqual(plain(output.players.map(p=>p.turf)),[100,101,102]);assert.deepEqual(plain(output.players.map(p=>p.splats)),[2,3,4]);assert.equal(output.xp.gained,Math.round(f.PROGRESSION.xpWin+100*f.PROGRESSION.xpPerTurfPoint+2*f.PROGRESSION.xpPerSplat));
});

test('#300 actual Turf table source renders a fourth statistic, including zero, and keeps Boss table untouched',()=>{
 const source=composed('src/ui/menus.js'),raw=fs.readFileSync(new URL('inkwave-public/src/ui/menus.js',ROOT),'utf8');
 const code=section(source,'    // ---- team tables with count-ups','    // ---- boss: the squad ranked');
 const h=(tag,props,...children)=>({tag,props,children:children.flat(Infinity)}),players=[{team:0,turf:5,splats:1,deaths:2,specials:0,name:'a',weapon:'shooter',_aw:[]},{team:0,turf:4,splats:2,deaths:1,specials:3,name:'b',weapon:'shooter',_aw:[]}];
 const render=vm.runInNewContext(`(function(){${code};return {node:table(0),rowFx};})`,{h,players,names:['A','B'],TEAM_NAMES:['A','B'],winTeam:0,GLYPHS:{crown:'',drop:''},SPLAT_ICON:'',DEATH_ICON:'',weaponIcon:()=>''});
 const result=render.call({_weapons:()=>({shooter:{kind:'shooter'}})});
 assert.deepEqual(plain(result.rowFx.map(r=>r.waits[2].children[0])),['0','3']);assert.ok(result.rowFx.every(r=>r.waits.length===3));
 const start='    // ---- boss: the squad ranked',end='    // ---- ';const a=source.indexOf(start),b=raw.indexOf(start);
 assert.equal(source.slice(a,source.indexOf(end,a+start.length)),raw.slice(b,raw.indexOf(end,b+start.length)),'Boss table bytes unchanged');
});

test('30/60/120Hz schedules preserve special counters and true shortage event ticks',async()=>{
 let expected;
 for(const hz of [30,60,120]) {
  const f=await fixture(),a=f.make();a.isLocal=true;const clock=new f.FixedClock(),rows=[];let ticks=0,warnings=0;
  f.on('lowink',({actor})=>{if(actor===a)warnings++;});
  for(let frame=0;frame<hz*3;frame++)clock.advance(1/hz,dt=>{
    a.specialActive=null;a.intent.special=ticks%60===0;if(a.intent.special)a.special=a.specialCost();
    a.ink=ticks%30<15?0:5;a.lastFire=0;a.intent.fire=true;a.update(dt);
    rows.push([a.stats.specials,warnings]);ticks++;
  });
  assert.equal(a.stats.specials,3);assert.ok(warnings>0);if(expected)assert.deepEqual(rows,expected);else expected=rows;
 }
});

test('90-second user-selected Turf and existing 180-second Turf durations remain valid',async()=>{
 const f=await fixture();for(const duration of [90,180]){const m=new f.Match({duration});assert.equal(m.duration,duration);assert.equal(m.time,duration);}
 assert.deepEqual(plain(f.MATCH.durations),[90,180]);
});
