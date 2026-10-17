import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptBuildSource} from '../../../scripts/inkwave-source-composition.mjs';
import {
  validWeaponId, safeWeaponId, normalizeQueueProfile, settleProgression,
  reserveLiveStart, releaseLiveStart, canApplyAttractReset, validStartRoster,
  PROFILE_XP_LIMIT, PROFILE_LEVEL_LIMIT,
} from '../queue-recovery.mjs';

const weapons={shooter:{kind:'shooter'},roller:{kind:'roller'},alt_kit:{kind:'shooter'}};
const progression={xpForLevel:level=>800+350*level};
const root=fileURLToPath(new URL('../../../',import.meta.url));
const built=process.env.INKWAVE_BUILT_SITE;
function composed(rel) {
  const full=path.join(built || path.join(root,'inkwave-public'),rel);
  const native=fs.readFileSync(full,'utf8');
  return built ? native : adaptBuildSource(rel,native);
}
function member(owner,nid,team,slot,weapon='shooter',bot=false) {
  return {owner,nid,team,slot,weapon,bot,name:owner};
}
function method(js,className,name) {
  const ast=parse(js,{ecmaVersion:'latest',sourceType:'module'});
  const cls=ast.body.find(n=>n.type==='ClassDeclaration' && n.id.name===className);
  assert.ok(cls,className+' class must exist in built source');
  const m=cls.body.body.find(n=>n.key?.name===name);
  assert.ok(m,className+'.'+name+' must exist in built source');
  return js.slice(m.start,m.end);
}

test('saved profile restores a registered weapon, including inherited names and numeric legacy IDs',()=>{
  assert.equal(validWeaponId('alt_kit',weapons),true);
  assert.equal(validWeaponId('toString',weapons),false);
  assert.equal(validWeaponId('__proto__',weapons),false);
  for(const weapon of ['retired-kit',null,7,'__proto__','constructor',{}]){
    const p=normalizeQueueProfile({weapon,level:1,xp:0},weapons);
    assert.equal(p.weapon,'shooter');
    assert.ok(validWeaponId(p.weapon,weapons));
  }
  assert.equal(safeWeaponId('alt_kit',weapons),'alt_kit','registered alternate must survive');
});

test('XP progression is bounded, matches exact old curve at ordinary thresholds, and cannot hang on finite 1e308',()=>{
  const normal={level:1,xp:1200};
  settleProgression(normal,progression);
  assert.deepEqual(normal,{level:2,xp:50});
  for (const level of [1,2,7,100,999,10000]) {
    const t=progression.xpForLevel(level);
    for(const xp of [0,1,t-1,t,t+1,t+(t+350)-1,t+(t+350),t*3+1]) {
      const expect={level,xp};
      let count=0;
      while(expect.xp>=progression.xpForLevel(expect.level)) {
        expect.xp-=progression.xpForLevel(expect.level);expect.level++;
        assert.ok(++count<10,'test control must be bounded');
      }
      const actual={level,xp};
      settleProgression(actual,progression);
      assert.deepEqual(actual,expect,'exact integer level boundary L='+level+' XP='+xp);
    }
  }
  for(const raw of [1e308,1e100,Number.MAX_SAFE_INTEGER,Infinity,-1,'999',null,[],{}]){
    const p=normalizeQueueProfile({level:1,xp:raw},weapons);
    assert.equal(p.xp,0,'malformed or excessive stored XP must be repaired');
    p.xp+=1200;settleProgression(p,progression);
    assert.equal(p.level,2);assert.equal(p.xp,50);
  }
  const high={level:1,xp:PROFILE_XP_LIMIT};
  settleProgression(high,progression);
  assert.ok(high.level>50000 && high.level<=PROFILE_LEVEL_LIMIT);
  assert.ok(high.xp>=0 && high.xp<progression.xpForLevel(high.level));
  const spent=n=>n*1150+175*n*(n-1);
  assert.equal(spent(high.level-1)+high.xp,PROFILE_XP_LIMIT,'large but supported XP must be conserved');
  for(const invalid of [-1,0,2.5,'2',Number.MAX_SAFE_INTEGER,1e308,{}]){
    assert.equal(normalizeQueueProfile({level:invalid,xp:20},weapons).level,1);
  }
});

test('incoming START roster must have one legitimate own human, valid IDs, slots, weapon, mode and bot authority',()=>{
  const turf=[member('host',0,0,0),member('guest',1,1,0),member('host',2,0,1,'roller',true)];
  assert.equal(validStartRoster(turf,'guest',weapons,'turf','host'),true);
  assert.equal(validStartRoster(turf,'host',weapons,'turf','host'),true);
  const boss=[member('host',0,0,0),member('guest',1,0,1),member('host',2,0,2,'roller',true)];
  assert.equal(validStartRoster(boss,'guest',weapons,'boss','host'),true);
  const full=Array.from({length:8},(_,i)=>member(i%4===0?'guest':i%4===1?'host':'peer'+i,i,i<4?0:1,i%4));
  assert.equal(validStartRoster(full,'guest',weapons,'turf','host'),false,'duplicate local humans forbidden');
  const cases=[
    [],
    [member('host',0,0,0)],
    turf.map((r,i)=>i===1?{...r,bot:true}:r),
    [...turf,member('guest',3,1,2)],
    turf.map((r,i)=>i===1?{...r,nid:0}:r),
    turf.map((r,i)=>i===1?{...r,slot:1,team:0}:r),
    turf.map((r,i)=>i===1?{...r,team:2}:r),
    turf.map((r,i)=>i===1?{...r,slot:99}:r),
    turf.map((r,i)=>i===1?{...r,weapon:'__proto__'}:r),
    turf.map((r,i)=>i===2?{...r,owner:'nonhost'}:r),
    Array.from({length:9},(_,i)=>member(i?'host':'guest',i,i<5?0:1,i%5)),
  ];
  for(const row of cases)assert.equal(validStartRoster(row,'guest',weapons,'turf','host'),false,JSON.stringify(row));
});

test('a scheduled menu reset belongs only to its original attract match and is invalidated before an asynchronous real startup',()=>{
  const attract={attract:true},live={attract:false},game={match:attract};
  const epoch=game._queueAttractEpoch||0;
  assert.equal(canApplyAttractReset(game,attract,epoch,'menu'),true);
  const start=reserveLiveStart(game);
  assert.equal(canApplyAttractReset(game,attract,epoch,'menu'),false,'starting during fade cancels reset');
  releaseLiveStart(game,start);
  game.match=live;
  assert.equal(canApplyAttractReset(game,attract,epoch,'menu'),false,'old menu must not dispose live game');
  assert.equal(canApplyAttractReset(game,live,start,'match'),false);
  const newer=reserveLiveStart(game);
  releaseLiveStart(game,start);
  assert.equal(game._queueStartPending,true,'old startup finally must not clear newer startup');
  releaseLiveStart(game,newer);
  assert.equal(game._queueStartPending,false);
});

test('production composition exposes all queued fixes and retains both Turf and Boss result gates',()=>{
  const main=composed('src/main.js');
  const match=composed('src/game/match.js');
  const session=composed('src/net/session.js');
  for(const [name,code] of [['main',main],['match',match],['session',session]]) {
    assert.doesNotThrow(()=>parse(code,{ecmaVersion:'latest',sourceType:'module'}),name+' must parse');
  }
  assert.ok(main.includes('normalizeQueueProfile(loadJSON('),'boot profile repair not composed');
  assert.ok(main.includes('weapon: safeWeaponId(this.profile.weapon, WEAPONS)'),'offline weapon admission missing');
  assert.ok(main.includes('canApplyAttractReset(this, previousAttract, resetEpoch, G.mode)'));
  assert.ok(main.includes('reserveLiveStart(this)'));
  assert.ok(main.includes('if (!a?.weapon || !a.weaponRunner) return;'),'HUD defense missing');
  assert.ok(main.includes("if (!validStartRoster(cfg?.roster, G.net?.myId"));
  assert.equal(main.split('settleProgression(p, PROGRESSION);').length-1,2,'both results XP loops must be bounded');
  assert.ok(!main.includes('while (p.xp >= PROGRESSION.xpForLevel(p.level))'));
  assert.ok(main.includes('const privateBattle = !!G.netm;'),'online Private Battle XP gate must survive');
  assert.ok(match.includes('const index = pool.indexOf(weapon);'),'no blind pool.splice(-1)');
  assert.ok(session.includes('if (!validStartRoster(cfg?.roster, this.myId, WEAPONS'),'session must reject before READY');
});

test('composed Game attract callback skips stale live-start and keeps normal menu-only recycling',async()=>{
  const js=composed('src/main.js'),src=method(js,'Game','_updateAttract');
  const G={mode:'menu',time:10,paint:{coverage:()=>[0,0]}};
  const C=(new Function('G','canApplyAttractReset','return class Game {'+src+'}',))(G,canApplyAttractReset);
  function rig(){
    const game=Object.create(C.prototype),old={attract:true},calls=[];
    game.match=old;game.attractT=111;game.shotT=10;game.menus={current:'main'};
    game.rig={mode:'orbit'};
    game._pickPalette=()=>0;game._setPalette=()=>calls.push('palette');
    game._startAttract=()=>{calls.push('reset');game.match={attract:true};};
    let settle;
    game._fade=()=>new Promise(resolve=>{settle=resolve;calls.push('fade')});
    return {game,old,calls,settle:()=>settle()};
  }
  const a=rig();a.game._updateAttract(1/60);
  const start=reserveLiveStart(a.game),live={attract:false,dispose(){throw Error('destroyed live match');}};
  a.game.match=live;releaseLiveStart(a.game,start);
  a.settle();await Promise.resolve();
  assert.equal(a.game.match,live);
  assert.deepEqual(a.calls,['fade'],'stale reset must not alter palette or create a new attract match');

  const b=rig();b.game._updateAttract(1/60);
  b.settle();await Promise.resolve();
  assert.equal(b.calls.includes('reset'),true,'menu-only recycling still runs');
});

test('composed NetSession rejects a missing-local START before allocating match or sending READY',async()=>{
  const js=composed('src/net/session.js'),src=method(js,'NetSession','_begin');
  const sends=[],G={game:{menus:{launchLobby:async()=>{}},startNetMatch:async()=>{sends.push('start')}}};
  const NetMatch=class{};
  const C=(new Function('G','NetMatch','validStartRoster','WEAPONS','return class NetSession {'+src+'}',))(G,NetMatch,validStartRoster,weapons);
  const make=()=>{
    const s=Object.create(C.prototype);
    s.myId='guest';s.hostId='host';s.state='lobby';s.lobby={players:[{ready:true}]};
    s.isHost=false;s._emit=()=>{};s._setState=x=>{s.state=x};
    s.tr={sendTo:(_host,p)=>sends.push(p)};
    return s;
  };
  const wrong={id:'game-1',mode:'turf',roster:[member('host',0,0,0)]};
  const rejected=make();
  assert.equal(await rejected._begin(wrong),false);
  assert.equal(rejected.state,'lobby');
  assert.equal(rejected.match,undefined);
  assert.deepEqual(sends,[],'invalid START must not trigger READY or game loading');
  const accepted=make();
  const good={...wrong,roster:[...wrong.roster,member('guest',1,1,0)]};
  await accepted._begin(good);
  assert.equal(accepted.state,'starting');
  assert.equal(accepted.match instanceof NetMatch,true);
  assert.equal(sends[0],'start');
  assert.deepEqual(sends[1],{k:'ready',id:'game-1'});
});
