import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { adaptSource } from '../adapter.mjs';
import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { fixture as hudFixture } from '../../reliability/tests/hud-fixture.mjs';
const root=new URL('../../../',import.meta.url);
const read=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,root),'utf8');
const compose=(rel,code=read(rel))=>adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,code))));
function method(code,start,end){const a=code.indexOf(start),b=code.indexOf(end,a);assert(a>=0&&b>a);return code.slice(a,b);}
function matchRig({raw=false,random=()=>{throw Error('Tie judge used RNG');}}={}){
  const G={},math=Object.create(Math);math.random=random;
  const source=raw?read('src/game/match.js'):compose('src/game/match.js');
  const Match=vm.runInNewContext(`class Match {${method(source,'  _judge() {','\n  teamSummary(')}};Match`,{G,Math:math});
  const m=new Match();m.bossMode=null;m.setState=state=>{m.state=state;};
  return {G,m,judge(cov,localTeam=0){G.paint={coverage:()=>cov};m.local={team:localTeam};m._judge();return m.result;}};
}

test('#158 negative: native old exact tie redraws both possible winners',()=>{
  for(const cov of [[0,0],[.4,.4]])for(const [random,winner]of [[.1,0],[.9,1]]){
    const r=matchRig({raw:true,random:()=>random});assert.equal(r.judge(cov).winner,winner);
  }
});

test('#158: actual native judge assigns all exact ties to Alpha without RNG or coverage mutation',()=>{
  for(const localTeam of [0,1])for(const cov of [[0,0],[.00001,.00001],[.4,.4],[.5,.5]]){
    const r=matchRig(),frozen=Object.freeze(cov),result=r.judge(frozen,localTeam);
    assert.equal(result.winner,0);assert.equal(result.coverage,frozen);assert.equal(r.m.state,'judge');
    assert.equal(r.judge(frozen,localTeam).winner,0);
  }
});

test('#158: non-ties, including sub-display-unit differences, retain original outcome',()=>{
  for(const cov of [[0,.1],[.1,0],[.4,.3996],[.3996,.4],[.4,.4+1e-14],[.4+1e-14,.4]]){
    const raw=matchRig({raw:true}),fixed=matchRig();assert.equal(fixed.judge(cov).winner,raw.judge(cov).winner);
  }
});

test('#158: Boss result and its existing send/state path bypass Turf policy',()=>{
  const r=matchRig(),result={mode:'boss',winner:1,boss:{win:false}},sent=[];
  r.G.paint={coverage(){throw Error('Boss read Turf coverage');}};r.G.netm={sendResult:x=>sent.push(x)};
  r.m.bossMode={result:()=>result};r.m._judge();assert.equal(r.m.result,result);assert.equal(sent[0],result);assert.equal(r.m.state,'judge');
});

test('#158: actual host result packet and receiver preserve Alpha for either local side',()=>{
  const code=compose('src/net/netmatch.js');
  const Net=vm.runInNewContext(`class Net {${method(code,'  sendResult(result) {','\n  sendEnd() {')}};Net`,{});
  for(const localTeam of [0,1]){
    const r=matchRig(),host=new Net(),guest=new Net();let packet;
    Object.assign(host,{isHost:true,match:{actors:[]},_sendNow:x=>{packet=JSON.parse(JSON.stringify(x));}});
    Object.assign(guest,{isHost:false,byNid:new Map(),match:{local:{team:localTeam},setState(s){this.state=s;}}});
    r.G.netm=host;r.judge(Object.freeze([0,0]),localTeam);assert.equal(packet.win,0);
    guest._result(packet);assert.equal(guest.match.result.winner,0);assert.deepEqual([...guest.match.result.coverage],[0,0]);assert.equal(guest.match.state,'judge');
  }
});

test('#158 + #381: native Game/Judd results show Alpha for both local teams on exact equality',async()=>{
  for(const team of [0,1])for(const cov of [[0,0],[.4,.4]]){
    const r=matchRig(),h=await hudFixture({hudSource:compose('src/ui/hud.js'),gameSource:compose('src/main.js')});
    h.match.local.team=team;h.match.result=r.judge(cov,team);
    const p=h.game._judge();await h.advance(3900);assert(h.judges()[0].classList.contains('is-win-a'));
    assert(!h.judges()[0].classList.contains('is-tie'));await h.advance(2300);await p;
    assert.equal(h.game.profile.wins,team===0?1:0);assert.equal(h.game.profile.matches,1);
  }
});

test('#158: native lobby protocol maps requested Alpha/Bravo to team0/team1, not local display order',()=>{
  const menu=read('src/ui/menus.js'),mock=read('src/net/mock.js'),match=read('src/game/match.js');
  assert.match(menu,/const TEAM_LABEL = \['ALPHA', 'BRAVO'\]/);
  assert.match(menu,/\[\[0, h\('span'.*TEAM_LABEL\[0\]/);
  assert.match(menu,/\[1, h\('span'.*TEAM_LABEL\[1\]/);
  assert.match(mock,/want \? 'Bravo' : 'Alpha'/);
  assert.match(match,/team: r\.team/);
});

test('#158: missing or duplicate native judge hook fails closed',()=>{
  const raw=read('src/game/match.js');
  for(const source of ['',raw+raw,compose('src/game/match.js')])assert.throws(()=>adaptSource('src/game/match.js',source),/deterministic Alpha turf tie/);
  new vm.SourceTextModule(compose('src/game/match.js'));
});

test('#158: native roster keeps Alpha identity when the host/local player is on Bravo',()=>{
  const r=matchRig();
  class Actor { constructor(o){Object.assign(this,o);this.character={root:{}};}spawnAt(p,yaw){this.spawn={x:p.x,y:p.y,z:p.z,yaw};} }
  const G=r.G;G.scene={add(){}};G.level={spawnPads:[{x:0,y:0,z:10},{x:0,y:0,z:-10}]};
  const setup=method(read('src/game/match.js'),'  _setupRoster(o, CharacterClass) {','\n  start() {');
  r.m._setupRoster=vm.runInNewContext(`({${setup}})._setupRoster`,{G,Actor,PlayerController:class{},BotBrain:class{},on:()=>()=>{},_v:{set(x,y,z){Object.assign(this,{x,y,z});return this;}}});
  Object.assign(r.m,{mode:'turf',actors:[]});
  r.m._setupRoster({host:true,myId:'host-bravo',roster:[{nid:1,owner:'guest-alpha',team:0,slot:0,weapon:'shooter'},{nid:2,owner:'host-bravo',team:1,slot:0,weapon:'shooter'}]},class{});
  assert.equal(r.m.local.team,1);assert.equal(r.m.actors[0].team,0);assert.equal(r.m.follower,false);
  G.paint={coverage:()=>[.3,.3]};r.m._judge();assert.equal(r.m.result.winner,0);assert.notEqual(r.m.result.winner,r.m.local.team);
});

test('#158: emitted full Match module judges deterministic Alpha and preserves close non-ties', {skip:!process.env.INKWAVE_TIE_BUILT_SITE},async()=>{
  const path=await import('node:path'),site=process.env.INKWAVE_TIE_BUILT_SITE,modules=new Map();
  const context=vm.createContext({console,performance});
  function load(file){if(modules.has(file))return modules.get(file);const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context,identifier:file});modules.set(file,m);return m;}
  const match=load(path.join(site,'src/game/match.js'));
  await match.link((spec,from)=>load(spec==='three'?path.join(site,'vendor/three/build/three.module.js'):path.resolve(path.dirname(from.identifier),spec)));await match.evaluate();
  const G=modules.get(path.join(site,'src/core/ctx.js')).namespace.G;
  for(const [coverage,winner]of [[[0,0],0],[[.4,.4],0],[[.4,.3996],0],[[.3996,.4],1]]){
    const m=Object.create(match.namespace.Match.prototype);Object.assign(m,{bossMode:null,setState(s){this.state=s;}});G.paint={coverage:()=>coverage};m._judge();assert.equal(m.result.winner,winner);assert.equal(m.result.coverage,coverage);
  }
});
