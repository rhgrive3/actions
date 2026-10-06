import {mapActorVisible} from '../../splatoon3/runtime/combat-info.mjs';
import {enemyRevealedOnMap} from '../../splatoon3/runtime/map-reveal.mjs';
import {selectedSubCost} from '../../splatoon3/runtime/kit-composition.mjs';
import {pathToFileURL} from 'node:url';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';
import {teamHudSnapshot,hudFrameSnapshot} from '../hud-snapshots.mjs';import {adaptQualitySource} from '../adapter.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';import {adaptReliability} from '../../reliability/adapter.mjs';import {fixture} from '../../splatoon3/tests/source-fixture.mjs';
const buildHealthMarkers=vm.runInNewContext(fs.readFileSync(new URL('../../splatoon3/runtime/combat-info.mjs',import.meta.url),'utf8').replace(/^export /gm,'')+';buildHealthMarkers',{innerWidth:800,innerHeight:600,Math});
const raw=rel=>fs.readFileSync(path.join('inkwave-public',rel),'utf8'),compose=(rel,s=raw(rel))=>adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,s))));
function method(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
async function setup(patched=true){const f=await fixture("export {projectShotGuide,installShotGuide} from './patches/splatoon3/runtime/weapons-fidelity.mjs';"),G=f.G;f.installShotGuide(f,JSON.parse(fs.readFileSync(new URL('../../splatoon3/profile.json',import.meta.url),'utf8')));G.teamHex=['orange','blue'];G.camera=new f.THREE.PerspectiveCamera(70,1,0.1,200);G.camera.position.set(0,8,20);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();
 const actors=Array.from({length:8},(_,i)=>{const a=f.make(i%2?'dualies':'shooter');a.team=i<4?0:1;a.name='P'+i;a.isLocal=i===0;a.pos.set(i,0,0);a.anim={form:'idle'};a.yaw=0;a.hp=f.PLAYER.hp-18;return a;});
 const teamCode=patched?compose('src/game/match.js'):raw('src/game/match.js'),teamMethod=method(teamCode,patched?'  teamSummary(viewerTeam = 0)':'  teamSummary()', '\n}');
 const Match=vm.runInNewContext(`class Match {${teamMethod}};Match`,{G,Math,teamHudSnapshot});const m=Object.assign(new Match(),{actors,local:actors[0],time:100,duration:180,state:'playing',controller:{onTarget:false,inRange:true}});
 const gameCode=patched?compose('src/main.js'):raw('src/main.js'),gameMethod=method(gameCode,'  _updateHud(dt) {','\n  // ---------------------------------------------------------------------------------------- touch / gyro');
 const Game=vm.runInNewContext(`class Game {${gameMethod}};Game`,{G,THREE:f.THREE,PLAYER:f.PLAYER,SUB:f.SUB,innerWidth:800,innerHeight:600,Math,t:x=>x,hudFrameSnapshot,mapActorVisible,buildHealthMarkers,enemyRevealedOnMap,selectedSubCost,projectShotGuide:f.projectShotGuide});let latest,mobile;
 const game=Object.assign(new Game(),{match:m,settings:{minimap:true,showFps:false},fps:60,_hintT:0,_hints:{shot:true},_lowInkFlash:0,minimap:{canvas:{id:'map'},w:100,h:100,flip:false,update(){},tickHidden(){},toCanvas(x,z,out){out.x=x+50;out.y=z+50;}},hud:{update(_dt,frame){latest=frame;}},input:{mobile:{setHud(frame){mobile=frame;}}}});
 return {...f,m,actors,game,step(){game._updateHud(1/60);return {frame:latest,mobile};}};
}
// Compare unchanged native scalars; the deliberate #117/#349/#886 and guide/health
// presentation changes are asserted separately instead of restoring old meanings.
function comparable(r){const value=JSON.parse(JSON.stringify({frame:r.frame,mobile:r.mobile}));
 for(const f of [value.frame,value.mobile])for(const k of ['inkLow','subCost','subReady'])delete f[k];
 delete value.frame.crosshair.guide;delete value.frame.healthMarkers;
 for(const t of value.frame.teams){delete t.leading;delete t.danger;for(const p of t.players)delete p.respawn;}
 return value;
}
function currentFields(f,r){const a=f.m.local,base=f.SUB[a.weapon.sub||'bomb'],cost=(base.inkCost??base.inkCostFallback)*(a.s3?.modifiers?.inkSaverSub??1);
 for(const x of [r.frame,r.mobile]){assert.equal(x.inkLow,f.game._lowInkFlash>0);assert.equal(x.subCost,cost/f.PLAYER.inkMax);assert.equal(x.subReady,a.ink>=cost);}
 for(const t of r.frame.teams){assert.equal(t.leading,false);assert.equal(t.danger,false);for(const p of t.players)assert.equal(p.respawn,p.alive?0:null);}
 assert.equal(r.frame.crosshair.guide,null,'disabled controller has no projected guide');assert(r.frame.healthMarkers.length>0,'injured ally positive health marker');
 assert.equal(r.frame.teams[0].color,f.G.teamHex[a.team]);assert(r.frame.healthMarkers.every(marker=>marker.color===f.G.teamHex[a.team] && marker.hp>0 && marker.hp<1));
}
test('#510 pooled transport retains failure-only ink feedback, selected cost, qualitative deaths and map concealment',async()=>{
 const f=await setup(),old=await setup(false),a=f.m.local;
 for(const r of [f,old]){r.m.local.ink=10;for(const o of r.actors)o.hp=r.PLAYER.hp;}
 let value=f.step();assert.equal(value.frame.inkLow,false);assert.equal(value.mobile.inkLow,false);assert.equal(old.step().frame.inkLow,true,'old raw threshold is a negative control');
 assert.equal(value.frame.map.players.filter(p=>p.team!==a.team).length,0,'unmarked full-health enemies stay hidden');
 const enemy=f.actors.find(o=>o.team!==a.team);enemy.hp=f.PLAYER.hp-18;
 value=f.step();assert.equal(value.frame.map.players.filter(p=>p.team!==a.team).length,1,'damage reveal is preserved');
 const dead=f.actors[1];dead.alive=false;Object.defineProperty(dead,'respawnTimer',{get(){throw Error('top transport read private countdown');}});
 f.actors[2].hp=f.PLAYER.hp-18;a.s3.modifiers.inkSaverSub=.8;f.game._lowInkFlash=.5;value=f.step();currentFields(f,value);assert(value.frame.inkLow&&value.mobile.inkLow);
 const expected=(f.SUB[a.weapon.sub].inkCost??f.SUB[a.weapon.sub].inkCostFallback)*.8/f.PLAYER.inkMax;
 assert.equal(value.frame.subCost,expected);const frame=value.frame,mobile=value.mobile;
 f.game._lowInkFlash=0;value=f.step();assert.equal(value.frame,frame);assert.equal(value.mobile,mobile);assert.equal(value.frame.inkLow,false);assert.equal(value.mobile.inkLow,false);
 f.m.mode='turf';f.G.paint.coverage=()=>[.6,.3];value=f.step();assert.equal(value.frame.teams[0].leading,true);assert.equal(value.frame.teams[0].danger,false);assert.equal(value.frame.teams[1].leading,false);assert.equal(value.frame.teams[1].danger,true);
 f.m.controller.enabled=true;f.m.controller.a=a;f.m.controller.shotGuide={x:0,y:1,z:0,frames:7};value=f.step();const projected=new f.THREE.Vector3(0,1,0).project(f.G.camera);assert(Math.abs(value.frame.crosshair.guide.x-(projected.x*.5+.5)*800)<1e-9);assert(Math.abs(value.frame.crosshair.guide.y-(-projected.y*.5+.5)*600)<1e-9);assert.equal(value.frame.crosshair.guide.frames,7);
 f.m.controller.enabled=false;assert.equal(f.step().frame.crosshair.guide,null,'old projected guide does not remain after disable');
});
function collect(r,set){const f=r.frame;for(const x of [f,f.crosshair,f.map,r.mobile,f.teams,...f.teams,...f.teams.map(t=>t.players),...f.teams.flatMap(t=>t.players)])if(x)set.add(x);}
test('#510 3600 synchronous 4v4 HUD updates keep transport identities stable',async()=>{
 const a=await setup(),b=await setup(false),stable=new Set(),fresh=new Set();for(let i=0;i<3600;i++){collect(a.step(),stable);collect(b.step(),fresh);}assert.equal(stable.size,17);assert.equal(fresh.size,17*3600);
});
test('#510 unchanged native values match baseline while current feedback/cost/qualitative status retain their owners',async()=>{
 const a=await setup(),b=await setup(false);
 for(let n=0;n<20;n++){for(const f of [a,b]){f.m.time=100-n;f.actors[2].alive=n%2===0;f.actors[2].respawnTimer=3-n/10;f.actors[3].special=n*12;f.actors[1].name='Rename'+n;f.actors[1].weaponId=n%2?'charger':'shooter';f.m.local=n%2?f.actors[4]:f.actors[0];f.game.settings.minimap=n%3!==0;f.game.settings.showFps=n%4===0;f.m.controller.inRange=n%5!==0;f.m.controller.onTarget=n%3===0;f.m.local.ink=100-n*4;}
  const actual=a.step();currentFields(a,actual);assert.deepEqual(comparable(actual),comparable(b.step()));}
});
test('#510 stable weak actor slots handle roster reorder, team changes, leave and replacement without stale rows',async()=>{
 const f=await setup();const before=f.m.teamSummary(),old=before[0].players[0],reverse=f.m.teamSummary(1);assert.equal(reverse[1],before[0]);assert.equal(f.m.teamSummary()[0],before[0]);
 f.m.actors.reverse();assert.equal(f.m.teamSummary()[0].players.at(-1),old);const moved=f.m.actors.find(a=>a.team===0);moved.team=1;assert.equal(f.m.teamSummary()[0].players.length,3);
 const removed=f.m.actors.splice(0,3);const now=f.m.teamSummary();assert.equal(now[0].players.length+now[1].players.length,5);const names=new Set(now.flatMap(t=>t.players.map(p=>p.name)));for(const a of removed)assert.equal(names.has(a.name),false);
 const replacement=f.make('roller');replacement.team=1;replacement.name='New';f.m.actors.push(replacement);assert.equal(f.m.teamSummary()[1].players.at(-1).name,'New');
});
test('#510 no strong actor references in snapshots; hidden map clears canvas and missing controller clears fields',async()=>{
 const f=await setup();const first=f.step(),frame=first.frame,map=frame.map;assert.equal(Object.values(frame.teams[0].players[0]).some(x=>typeof x==='object'),false);f.game.settings.minimap=false;f.m.controller=null;const next=f.step();assert.equal(next.frame,frame);assert.equal(next.frame.map,null);assert.equal(map.canvas,null);assert.equal(next.frame.crosshair.onTarget,null);assert.equal(next.frame.crosshair.inRange,true);
});
test('#510 new Match owns a distinct cache and both normal and boss HUD transport retain source values',async()=>{
 const a=await setup(),b=await setup(false);assert.notEqual(a.m.teamSummary(),b.m.teamSummary());for(const f of [a,b])f.m.mode='boss';assert.deepEqual(comparable(a.step()),comparable(b.step()));
});
test('#510 adapters reject missing/duplicate source connections and preserve unrelated paths',()=>{
 const rel='src/game/match.js',s=raw(rel);assert.throws(()=>compose(rel,s.replace('  teamSummary() {','  lost() {')));assert.throws(()=>compose(rel,s+s));assert.equal(adaptQualitySource('unrelated.txt','same'),'same');
});
test('#510 emitted full Game/Match modules preserve reusable transport and live scalar updates',{skip:!process.env.INKWAVE_HUD_SNAPSHOT_SITE},async()=>{
 const site=path.resolve(process.env.INKWAVE_HUD_SNAPSHOT_SITE),mods=new Map(),context=vm.createContext({console,performance,URL,URLSearchParams,location:{search:""},innerWidth:800,innerHeight:600});
 function load(file){if(mods.has(file))return mods.get(file);let code=fs.readFileSync(file,'utf8');if(file===path.join(site,'src/main.js')){
  const boot=/const ([\w$]+)=new ([\w$]+);\1\.boot\(\)\.catch\([\s\S]*$/;const hit=code.match(boot);assert.ok(hit,'unique production auto-boot tail');code=code.replace(boot,`export { ${hit[2]} as Game };`);
 }const m=new vm.SourceTextModule(code,{context,identifier:file,initializeImportMeta(meta){meta.url=pathToFileURL(file).href;}});mods.set(file,m);return m;}
 const main=load(path.join(site,'src/main.js'));await main.link((s,m)=>load(s==='three'?path.join(site,'vendor/three/build/three.module.js'):s.startsWith('three/addons/')?path.join(site,'vendor/three/jsm',s.slice('three/addons/'.length)):path.resolve(path.dirname(m.identifier),s)));await main.evaluate();
 const f=await setup(),G=mods.get(path.join(site,'src/core/ctx.js')).namespace.G;G.camera=f.G.camera;G.teamHex=f.G.teamHex;
 const Match=mods.get(path.join(site,'src/game/match.js')).namespace.Match;f.m.teamSummary=Match.prototype.teamSummary;f.game._updateHud=main.namespace.Game.prototype._updateHud;
 const first=f.step();for(let i=0;i<3600;i++){f.m.time=i;const next=f.step();assert.equal(next.frame,first.frame);assert.equal(next.mobile,first.mobile);assert.equal(next.frame.time,i);}f.actors[1].special=999;assert.equal(f.step().frame.teams[0].players[1].specialReady,true);
});
