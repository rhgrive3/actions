import { adaptTouchLayout } from '../../touch-layout/adapter.mjs';
import { adaptReliability } from '../../reliability/adapter.mjs';
import { adaptQualitySource } from '../../local-quality/adapter.mjs';
import { selectedSubCost } from '../runtime/kit-composition.mjs';
import { projectShotGuide } from '../runtime/weapons-fidelity.mjs';
import { hudFrameSnapshot } from '../../local-quality/hud-snapshots.mjs';
import { enemyRevealedOnMap } from '../runtime/map-reveal.mjs';
import { buildHealthMarkers, healthActorVisible, mapActorVisible } from '../runtime/combat-info.mjs';
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {fixture} from './source-fixture.mjs';import {adaptSource} from '../adapter.mjs';import {subInkSpec} from '../runtime/sub-ready.mjs';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),DT=1/60,near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const extra="export {HUD} from './inkwave-public/src/ui/hud.js'; export {MobileInput} from './inkwave-public/src/core/mobile.js';";
function equip(a,gp){let found;for(let m=0;m<=3;m++){const n=(gp-m*10)/3;if(Number.isInteger(n)&&n>=0&&n<=9){found=Array.from({length:3},(_,i)=>({main:i<m?'inkSaverSub':'none',subs:Array.from({length:3},(_,j)=>i*3+j<n?'inkSaverSub':'none')}));break;}}a.isLocal=false;a.s3.loadout=found;a.setWeapon(a.weaponId);}
function gameClass(f){
 const built=process.env.INKWAVE_BUILT_SITE,raw=fs.readFileSync(path.join(built||path.join(ROOT,'inkwave-public'),'src/main.js'),'utf8'),src=built?raw:adaptQualitySource('src/main.js',adaptReliability('src/main.js',adaptTouchLayout('src/main.js',adaptSource('src/main.js',raw))));
 const start=src.search(/_updateHud\([^)]*\)\s*\{/),end=src.indexOf('_onDevice(',start);assert.ok(start>=0&&end>start);
 // Select the unmodified real method. Both the public minifier and source
 // retain method property names; comments before the next method are harmless.
 const method=src.slice(start,end),args={innerWidth:1280,innerHeight:720,selectedSubCost,projectShotGuide,hudFrameSnapshot,enemyRevealedOnMap,buildHealthMarkers,mapActorVisible};
 for(const match of src.matchAll(/\bimport\s*([^;]+?)\s*from\s*["']([^"']+)["']/g)){
  const [,bindings,url]=match;const values=url==='three'?f.THREE:url.endsWith('/ctx.js')?f:url.endsWith('/config.js')?f:url.endsWith('/i18n.js')?{t:s=>s}:url.endsWith('/sub-ready.mjs')?{subInkSpec}:null;if(!values)continue;
  const ns=bindings.match(/^\s*\*\s*as\s+(\w+)/);if(ns){args[ns[1]]=values;continue;}
  const named=bindings.match(/\{([^}]+)\}/);if(named)for(const part of named[1].split(',')){const [original,alias]=part.trim().split(/\s+as\s+/);if(original in values)args[alias||original]=values[original];}
 }
 return new Function(...Object.keys(args),`return class {${method}}`)(...Object.values(args));
}
function game(f,a){const C=gameClass(f),g=new C();f.G.camera=new f.THREE.PerspectiveCamera(60,1280/720,.1,100);a.isLocal=true;g.match={local:a,actors:[a],state:'playing',duration:180,time:120,teamSummary:()=>[]};g.settings={minimap:false};g.minimap={};g._hints={};g._hintT=g._lowInkFlash=0;let hud,mobile;g.hud={update:(_dt,frame)=>hud=frame};g.input={mobile:{setHud:frame=>mobile=frame}};return {g,read(){g._updateHud(DT);return {hud,mobile};}};}
function element(){const states=new Map(),props=new Map(),label={textContent:''};return{states,props,label,classList:{toggle:(k,v)=>states.set(k,!!v)},style:{setProperty:(k,v)=>props.set(k,v)},querySelector:()=>label};}
function ui(f,a){const h=Object.create(f.HUD.prototype);h._L={weapon:'shooter',kind:'shooter'};h._bloom=h._kick=0;h.ret=element();h.xh=element();h.shield=element();h.subChip=element();h.tank=element();h._local=()=>a;h._snd=()=>{};h._tank={t:0,prevVx:0,prevVz:0,slosh:0,sloshV:0,wobble:0,empty:0,bubbles:[],prevInk:1,level:1};let line;h._drawTank=(_dt,sub)=>line=sub;
 const m=Object.create(f.MobileInput.prototype);m.els={special:element(),fire:element(),sub:element()};m._buzz=()=>{};
 return{h,m,read(frame,mobile){h._updCrosshair(frame,DT);h._updTank(frame,DT);m.setHud({...mobile,weapon:null,specialId:null});return{short:h.subChip.states.get('is-short'),tank:h.tank.states.get('is-nosub'),mobile:m.els.sub.states.get('is-dim'),label:h.subChip.label.textContent,line};}};
}
test('#349: real Game, HUD, tank and Mobile agree with actual bomb payment below/at/above 0/35/57 AP cost',async()=>{
 for(const gp of [0,35,57])for(const delta of [-1e-6,0,1e-6]){
  const f=await fixture(extra),a=f.make();equip(a,gp);const cost=subInkSpec(a,f.SUB.bomb).inkCost;a.ink=cost+delta;for(let i=0;i<6;i++)a.weaponRunner.update(DT,{sub:true});
  const frames=game(f,a).read(),display=ui(f,a).read(frames.hud,frames.mobile),ready=delta>=0;near(frames.hud.subCost,cost/100);near(frames.mobile.subCost,cost/100);assert.equal(frames.hud.subReady,ready);assert.equal(frames.mobile.subReady,ready);
  assert.equal(display.short,!ready);assert.equal(display.tank,!ready);assert.equal(display.mobile,!ready);assert.equal(display.label,`${Math.round(cost)}%`);near(display.line,cost/100);
  let bombs=0;f.G.projectiles.throwBomb=()=>bombs++;a.weaponRunner.update(DT,{subReleased:true});assert.equal(bombs,0,'independent 1F use-startup');a.weaponRunner.update(DT,{});assert.equal(bombs,ready?1:0);near(a.ink,ready?delta:cost+delta);near(f.SUB.bomb.inkCost,70);
 }
});
test('#349: changing actor-local modifiers, equipment, respawn and local actor refreshes labels without sharing costs',async()=>{
 const f=await fixture(extra),a=f.make(),b=f.make();equip(a,57);equip(b,0);a.ink=b.ink=50;const gs=game(f,a),display=ui(f,a);
 for(const scale of [.65,1,.825,.65]){a.s3.modifiers.inkSaverSub=scale;const out=gs.read();near(out.hud.subCost,.7*scale);assert.equal(display.read({...out.hud,subAim:true},out.mobile).label,`${Math.round(70*scale)}%`);near(b.s3.modifiers.inkSaverSub,1);near(f.SUB.bomb.inkCost,70);}
 equip(a,0);near(gs.read().hud.subCost,.7);a.reset();near(gs.read().hud.subCost,.7);equip(a,57);near(gs.read().hud.subCost,subInkSpec(a,f.SUB.bomb).inkCost/100);gs.g.match.local=b;b.isLocal=true;near(gs.read().hud.subCost,.7);
});
test('#349: UI-lab frames without optional readiness use the same unrounded threshold',async()=>{
 const f=await fixture(extra),a=f.make(),u=ui(f,a);
 for(const ink of [.455-1e-8,.455,.455+1e-8]){const frame={weapon:'shooter',ink,subCost:.455,subAim:true};const out=u.read(frame,frame);assert.equal(out.short,ink<.455);assert.equal(out.tank,ink<.455);assert.equal(out.mobile,ink<.455);assert.equal(out.label,'46%');}
});

test('#1044 real health marker runtime skips LOS for ineligible actors and keeps eligible disclosures current',async()=>{
 const f=await fixture(),{G,THREE,PLAYER}=f;
 const actors=Array.from({length:8},(_,i)=>{const a=f.make();a.team=i<4?0:1;a.pos.set((i-3.5)*.6,0,0);a.hp=PLAYER.hp;return a;});
 const viewer=actors[0],ally=actors[1],enemy=actors[4],dead=actors[5],stale=actors[6],hidden=actors[7];
 const game={match:{local:viewer,actors}};G.time=10;G.camera=new THREE.PerspectiveCamera(60,800/600,.1,100);
 G.camera.position.set(0,3,12);G.camera.lookAt(0,1,0);G.camera.updateMatrixWorld();
 let losCalls=0;G.physics.los=()=>{losCalls++;return true;};
 const width=Object.hasOwn(globalThis,'innerWidth')?globalThis.innerWidth:undefined;
 const height=Object.hasOwn(globalThis,'innerHeight')?globalThis.innerHeight:undefined;
 const hadWidth=Object.hasOwn(globalThis,'innerWidth'),hadHeight=Object.hasOwn(globalThis,'innerHeight');
 globalThis.innerWidth=800;globalThis.innerHeight=600;
 try{
  let rows=buildHealthMarkers(game,G,PLAYER,THREE);assert.equal(rows.length,0);assert.equal(losCalls,0,'eight full-health actors require no LOS queries');
  dead.hp=40;dead.alive=false;dead.lastDamage=0;
  stale.hp=40;stale.lastDamage=4;
  hidden.hp=40;hidden.lastDamage=0;hidden.submerged=true;hidden.anim.form='swim';
  ally.hp=80;rows=buildHealthMarkers(game,G,PLAYER,THREE);assert.equal(rows.length,1);assert.equal(rows[0].hp,.8);assert.equal(losCalls,0,'damaged ally visibility does not need LOS');
  enemy.hp=70;enemy.lastDamage=0;rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.equal(losCalls,1,'only the recently damaged, visible enemy reaches LOS');assert.equal(rows.length,2);assert.equal(rows[1].hp,.7);assert.equal(rows[1].color,G.teamHex[enemy.team]);
  assert.equal(healthActorVisible(enemy,viewer,{hpMax:PLAYER.hp,now:G.time,visible:true}),true,'the existing health predicate owns eligibility');
  const enemyRow=rows[1];enemy.hp=42;G.time+=.1;rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.equal(losCalls,2);assert.equal(rows[1],enemyRow);assert.equal(enemyRow.hp,.42,'health gauge reflects the current value');
  enemy.submerged=true;enemy.anim.form='swim';rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.equal(rows.length,1);assert.equal(losCalls,2,'hidden enemy is rejected before LOS');
  assert.equal(healthActorVisible(enemy,viewer,{hpMax:PLAYER.hp,now:G.time,visible:true}),false);
  enemy.s3.revealedUntil={[viewer.team]:G.time+1};rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.equal(rows.length,2);assert.equal(losCalls,2,'explicit reveal preserves the hidden-target exception without LOS');
  assert.equal(healthActorVisible(enemy,viewer,{hpMax:PLAYER.hp,now:G.time,visible:false}),true);
  const beforeCameraX=rows[1].x;G.camera.position.x=5;G.camera.lookAt(0,1,0);G.camera.updateMatrixWorld();
  rows=buildHealthMarkers(game,G,PLAYER,THREE);assert.notEqual(rows[1].x,beforeCameraX,'camera movement reprojects the marker');
  const beforeViewportX=rows[1].x;globalThis.innerWidth=1200;rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.notEqual(rows[1].x,beforeViewportX,'viewport width updates marker coordinates');
  game.match.actors=actors.filter(actor=>actor!==enemy);rows=buildHealthMarkers(game,G,PLAYER,THREE);
  assert.equal(rows.length,1,'removed opponent disclosure is cleared from the pooled row list');
 }finally{
  if(hadWidth)globalThis.innerWidth=width;else delete globalThis.innerWidth;
  if(hadHeight)globalThis.innerHeight=height;else delete globalThis.innerHeight;
 }
});
