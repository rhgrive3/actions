import {configDependency} from './config-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
import {parse} from '../../loading-cache/vendor/acorn.mjs';
import {adaptSource} from '../../splatoon3/adapter.mjs';
import {adaptTouchLayout} from '../../touch-layout/adapter.mjs';
import {adaptReliability} from '../../reliability/adapter.mjs';
import {adaptQualitySource, replaceOnce, qualityIdentity} from '../adapter.mjs';
import {adaptUiActorLifetime} from '../ui-actor-lifetime-adapter.mjs';
import * as THREE from '../../../inkwave-public/vendor/three/build/three.module.js';

const ROOT=new URL('../../../',import.meta.url);
const raw=rel=>fs.readFileSync(new URL('inkwave-public/'+rel,ROOT),'utf8');
const mode=process.env.INKWAVE_UI_LIFETIME_MINIFY==='1';
const transformSync=mode?(await import(process.env.ESBUILD_MODULE?pathToFileURL(process.env.ESBUILD_MODULE).href:'esbuild')).transformSync:null;
const site=process.env.INKWAVE_UI_LIFETIME_SITE;
class El {
  constructor(){this.children=[];this.listeners=new Map();this.style={setProperty(k,v){this[k]=v;}};this.names=new Set();this.classList={add:(...n)=>n.forEach(x=>this.names.add(x)),remove:(...n)=>n.forEach(x=>this.names.delete(x)),toggle:(n,v)=>v?this.names.add(n):this.names.delete(n)};}
  appendChild(c){if(c)this.children.push(c);return c;} append(...cs){cs.forEach(c=>this.appendChild(c));} prepend(...cs){this.children.unshift(...cs.filter(Boolean));}
  setAttribute(){} addEventListener(name, fn){const rows=this.listeners.get(name)||[];rows.push(fn);this.listeners.set(name,rows);}
  dispatch(name, event){for(const fn of this.listeners.get(name)||[])fn({preventDefault(){},stopPropagation(){},...event});} querySelector(){return new El();} querySelectorAll(){return [];} remove(){} get offsetWidth(){return 1;}
}
async function fixture({baseline=false}={}) {
  const bus=new Map(),G={settings:{minimap:false},teamHex:['#f80','#08f'],actors:[],audio:{play(){}}};
  const on=(n,fn)=>{let v=bus.get(n);if(!v)bus.set(n,v=new Set());v.add(fn);return()=>v.delete(fn);};
  const emit=(n,e)=>{for(const fn of bus.get(n)||[])fn(e);};
  const context=vm.createContext({console,performance,Math,Map,WeakMap,Uint8ClampedArray,innerWidth:1000,innerHeight:700,setTimeout:()=>0,requestIdleCallback:()=>0,document:{body:new El(),createElement(){const c=new El();c.getContext=()=>({createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)})});return c;}}});
  const config=new vm.SourceTextModule(site&&!baseline?fs.readFileSync(path.join(site,'src/config.js'),'utf8'):raw('src/config.js'),{context});await config.link(spec=>configDependency(spec,context));await config.evaluate();
  const util={G,on,emit,...config.namespace,...THREE,clamp:(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),t:x=>x,esc:x=>x,keycap:x=>x,weaponIcon:x=>x,richText:x=>x,
    h(_tag,_attrs,...children){const el=new El();el.append(...children.flat().filter(x=>x&&typeof x==='object'));return el;}};
  async function load(rel){
    let code=baseline?raw(rel):site?fs.readFileSync(path.join(site,rel),'utf8'):adaptQualitySource(rel,adaptReliability(rel,adaptTouchLayout(rel,adaptSource(rel,raw(rel)))));
    // Test-only visibility into the actual module's FX list; no production debug API.
    if(rel==='src/game/minimap.js'){
      const lists=parse(code,{ecmaVersion:'latest',sourceType:'module'}).body.filter(n=>n.type==='VariableDeclaration').flatMap(n=>n.declarations).filter(n=>n.init?.type==='ArrayExpression'&&!n.init.elements.length);
      assert.equal(lists.length,1,'unique native module-level transient list');code+='\nexport {'+lists[0].id.name+' as testFx};\n';
    }
    if(mode)code=transformSync(code,{loader:'js',format:'esm',minify:true}).code;
    const imports=new Map();for(const n of parse(code,{ecmaVersion:'latest',sourceType:'module'}).body)if(n.type==='ImportDeclaration'){
      let names=imports.get(n.source.value);if(!names)imports.set(n.source.value,names=new Set());
      for(const s of n.specifiers)if(s.type==='ImportNamespaceSpecifier')Object.keys(THREE).forEach(k=>names.add(k));else names.add(s.imported?.name||'default');
    }
    const mod=new vm.SourceTextModule(code,{context});await mod.link(spec=>new vm.SyntheticModule([...imports.get(spec)],function(){for(const k of imports.get(spec))this.setExport(k,k in util?util[k]:()=>{});},{context}));await mod.evaluate();return mod.namespace;
  }
  const {HUD}=await load('src/ui/hud.js'),{DioramaOverlay}=await load('src/ui/diorama.js'),{Match}=await load('src/game/match.js'),{Minimap,testFx}=await load('src/game/minimap.js');
  const actor=name=>({name,team:0,alive:true,pos:new THREE.Vector3(),weaponId:'shooter',character:{root:{},dispose(){}},weaponRunner:{reset(){}},specialReady:()=>false,canSuperJump:()=>true});
  function hud(){return Object.assign(Object.create(HUD.prototype),{_L:{},markers:[],_kills:{dealt:new Map(),perActor:new Map(),lastKiller:null,times:[],streak:0},_actors:()=>G.actors});}
  function match(actors){return Object.assign(Object.create(Match.prototype),{actors,bossMode:null,events:[],unsubs:[]});}
  G.scene={remove(){}};G.game={};G.rig={dioLook:{x:0,y:0}};G.level={bounds:{minX:-1,maxX:1,minZ:-1,maxZ:1},spawnPads:[new THREE.Vector3(),new THREE.Vector3()]};
  G.camera=new THREE.PerspectiveCamera(60,1,.1,100);G.camera.position.set(0,8,15);G.camera.lookAt(0,0,0);G.camera.updateMatrixWorld();
  return {G,emit,HUD,DioramaOverlay,Match,Minimap,fx:testFx,actor,hud,match};
}

test('#616 native Match disposal releases HUD name and combat caches before character teardown',async()=>{
  const f=await fixture(),actors=Array.from({length:8},(_,i)=>f.actor('P'+i)),h=f.G.hud=f.hud();f.G.actors=actors;
  h._updMarkers([]);assert.equal(h._byName.size,8);h._kills.dealt.set(actors[1],1);h._kills.perActor.set(actors[2],2);h._kills.lastKiller=actors[3];
  actors[0].character.dispose=()=>{assert.equal(h._byName,null);assert.equal(h._byNameA,null);assert.equal(h._kills.dealt.size,0);assert.equal(h._kills.perActor.size,0);assert.equal(h._kills.lastKiller,null);};
  f.match(actors).dispose();assert.equal(h._byNameN,0);
});
test('#616 stale disposal does not clear a newer HUD roster or combat history; repeated menu cycles release old actors',async()=>{
  const f=await fixture(),h=f.G.hud=f.hud();
  for(let i=0;i<25;i++){
    const old=f.actor('old'+i),next=f.actor('new'+i);f.G.actors=[next];h._updMarkers([]);h._kills.dealt.set(next,10);h._kills.lastKiller=next;
    f.match([old]).dispose();assert.equal(h._byName.get(next.name),next);assert.equal(h._kills.dealt.get(next),10);assert.equal(h._kills.lastKiller,next);
    f.match([next]).dispose();assert.equal(h._byName,null);assert.equal(h._kills.dealt.size,0);
  }
});
test('#616 live native marker cache and kill/assist bookkeeping keep their current owner',async()=>{
  const f=await fixture(),me=f.actor('me'),enemy=f.actor('enemy'),h=f.hud();enemy.team=1;f.G.actors=[me,enemy];
  let cards=0;Object.assign(h,{_live:()=>true,_local:()=>me,_now:()=>10,_killCard(){cards++;},_callout(){},_clearDamageDirs(){}});
  h._updMarkers([]);h._onSplatted({victim:enemy,attacker:me});assert.equal(cards,1);assert.equal(h._kills.perActor.get(me),1);assert.equal(h._byName.get('enemy'),enemy);
  h.releaseMatchActors([f.actor('unrelated')]);assert.equal(h._kills.perActor.get(me),1);
});
test('matching Match identity releases departed actors even after its roster becomes empty',async()=>{
  const f=await fixture(),old=f.actor('departed'),m=f.match([old]),h=f.G.hud=f.hud(),dio=f.G.game.diorama=new f.DioramaOverlay(new El());
  f.G.match=m;f.G.actors=m.actors;h._updMarkers([]);h._kills.dealt.set(old,1);h._kills.lastKiller=old;dio._targetMatch=m;dio.pins[0].target=old;
  m.actors.length=0;m.dispose();assert.equal(h._byName,null);assert.equal(h._kills.dealt.size,0);assert.equal(h._kills.lastKiller,null);assert.equal(h._actorRefsMatch,null);assert.equal(dio.pins[0].target,null);assert.equal(dio._targetMatch,null);
});
test('an old disposal cannot clear a newer explicit UI Match owner',async()=>{
  const f=await fixture(),shared=f.actor('shared'),old=f.match([shared]),next=f.match([shared]),h=f.G.hud=f.hud(),dio=f.G.game.diorama=new f.DioramaOverlay(new El());
  f.G.match=next;f.G.actors=next.actors;h._updMarkers([]);h._kills.dealt.set(shared,2);dio._targetMatch=next;dio.pins[0].target=shared;
  old.dispose();assert.equal(h._byName.get('shared'),shared);assert.equal(h._kills.dealt.get(shared),2);assert.equal(h._actorRefsMatch,next);assert.equal(dio.pins[0].target,shared);assert.equal(dio._targetMatch,next);
});
test('#685 close/reopen repopulates current teammates and native jump rejects old/removed targets',async()=>{
  const f=await fixture(),me=f.actor('me'),ally=f.actor('ally'),dio=new f.DioramaOverlay(new El());let jumps=0;me.superJump=()=>{jumps++;return true;};
  f.G.match={local:me,attract:false};f.G.actors=[me,ally];dio.update(1/60,1);assert.equal(dio.pins[0].target,ally);dio._jump(0,me);assert.equal(jumps,1);
  dio.update(1/60,0);assert(dio.pins.every(p=>p.target===null));dio._jump(0,me);assert.equal(jumps,1);
  const replacement=f.actor('replacement');f.G.actors=[me,replacement];dio.update(1/60,1);assert.equal(dio.pins[0].target,replacement);dio._jump(0,me);assert.equal(jumps,2);
  f.G.actors=[me];dio._jump(0,me);assert.equal(jumps,2,'removed actor cannot be jumped to between UI updates');
});
test('#685 disposing a match clears its pins without a render tick and preserves a newer pin owner',async()=>{
  const f=await fixture(),old=f.actor('old'),next=f.actor('next'),dio=f.G.game.diorama=new f.DioramaOverlay(new El());
  dio.pins[0].target=old;dio.pins[0].ok=true;dio.pins[1].target=next;dio.pins[1].ok=true;
  f.match([old]).dispose();assert.equal(dio.pins[0].target,null);assert.equal(dio.pins[0].ok,false);assert.equal(dio.pins[1].target,next);
  f.match([next]).dispose();assert(dio.pins.every(p=>p.target===null));
});
test('#672 jump markers retain only scalar identity and native landing shortens only matching effects',async()=>{
  const f=await fixture(),a=f.actor('a'),b=f.actor('b');f.G.match={attract:false};new f.Minimap(f.G.level,{});
  for(const actor of [a,b])f.emit('superjump',{actor,phase:'flight',to:new THREE.Vector3(1,0,2)});
  assert.equal(f.fx.length,2);assert.notEqual(f.fx[0].actorId,f.fx[1].actorId);assert(f.fx.every(x=>!('actor'in x)&&typeof x.actorId==='number'));
  f.emit('superjump:land',{actor:a});assert.equal(f.fx[0].life,.35);assert.equal(f.fx[1].life,3);
  f.G.match={attract:true};assert.equal(f.fx.length,2,'menu does not need to tick effects to remove Actor ownership');
});
test('#672 a live minimap module cannot retain a retired jump Actor during unticked menus',{skip:!global.gc},async()=>{
  const f=await fixture();f.G.match={attract:false};new f.Minimap(f.G.level,{});
  const ref=(()=>{const a=f.actor('collectable');f.emit('superjump',{actor:a,phase:'flight',to:new THREE.Vector3()});return new WeakRef(a);})();f.G.match={attract:true};
  let collected=false;for(let i=0;i<30;i++){await new Promise(r=>setImmediate(r));global.gc();await new Promise(r=>setImmediate(r));if(!ref.deref()){collected=true;break;}}
  assert(collected,'weak correlation must not keep the Actor alive while fxList stays populated');assert.equal(f.fx.length,1);
});
test('baseline native modules reproduce all three retained-Actor paths',async()=>{
  const f=await fixture({baseline:true}),old=f.actor('old'),h=f.G.hud=f.hud(),dio=f.G.game.diorama=new f.DioramaOverlay(new El());f.G.actors=[old];h._updMarkers([]);dio.pins[0].target=old;dio.update(1/60,0);
  f.G.match={attract:false};new f.Minimap(f.G.level,{});f.emit('superjump',{actor:old,phase:'flight',to:new THREE.Vector3()});f.match([old]).dispose();
  assert.equal(h._byName.get('old'),old);assert.equal(dio.pins[0].target,old);assert.equal(f.fx[0].actor,old);
});
test('new connections fail closed on missing/duplicate anchors and register in build identity',()=>{
  for(const rel of ['src/game/match.js','src/ui/hud.js','src/ui/diorama.js','src/game/minimap.js']){
    assert.throws(()=>adaptUiActorLifetime(rel,'',replaceOnce));assert.throws(()=>adaptUiActorLifetime(rel,raw(rel)+raw(rel),replaceOnce));
  }
  assert.equal(adaptUiActorLifetime('unrelated.txt','unchanged',replaceOnce),'unchanged');assert(qualityIdentity()['ui-actor-lifetime-adapter.mjs']);
});

function tapMap(f, dio, name) {
  const me=f.actor(name+'-me'), ally=f.actor(name+'-ally'), m=f.match([me,ally]);
  m.local=me; m.attract=false; m.controller={a:me,mapHeld:true,canRequestMapJump:()=>true};
  f.G.match=m; f.G.actors=m.actors; dio.update(1/60,1);
  return {me,ally,m,down(pointerId=1,pointerType='touch') {
    dio.pins[0].el.dispatch('pointerdown',{pointerId,pointerType,clientX:20,clientY:40});
    return dio._pinTaps.get(pointerId);
  }};
}

test('#685 composed touch/pen pending pins release the whole retiring match before character disposal without another map frame',async()=>{
  for(const pointerType of ['touch','pen']) {
    const f=await fixture(), dio=f.G.game.diorama=new f.DioramaOverlay(new El()), h=tapMap(f,dio,pointerType);
    const tap=h.down(1,pointerType); assert.equal(tap.target,h.ally); assert.equal(tap.match,h.m);
    assert.equal(tap.actor,h.me); assert.equal(tap.controller,h.m.controller);
    h.me.character.dispose=()=>assert.equal(dio._pinTaps.size,0,'release precedes Actor teardown');
    h.m.dispose(); assert.equal(dio._pinTaps.size,0); assert.equal(dio.pins[0].target,null);
  }
});

test('#685 empty retiring roster still releases taps by match identity',async()=>{
  const f=await fixture(), dio=f.G.game.diorama=new f.DioramaOverlay(new El()), h=tapMap(f,dio,'empty');
  h.down(); h.m.actors.length=0; h.m.dispose();
  assert.equal(dio._pinTaps.size,0); assert.equal(dio._targetMatch,null);
});

test('#685 stale match release removes only its pending contacts and preserves the newer map owner',async()=>{
  const f=await fixture(), dio=new f.DioramaOverlay(new El());
  const old=tapMap(f,dio,'old'); old.down(1);
  const next=tapMap(f,dio,'next'); const current=next.down(2,'pen');
  assert.equal(dio._pinTaps.size,2);
  dio.releaseMatchActors(old.m.actors,old.m);
  assert.equal(dio._pinTaps.has(1),false); assert.equal(dio._pinTaps.get(2),current);
  assert.equal(dio.pins[0].target,next.ally); assert.equal(dio._targetMatch,next.m);
  dio.releaseMatchActors(old.m.actors,old.m); assert.equal(dio._pinTaps.size,1);
  dio.releaseMatchActors(next.m.actors,next.m); assert.equal(dio._pinTaps.size,0);
});

test('#685 targeted actor and absent-viewer cleanup retire pending contacts while preserving unrelated contacts',async()=>{
  const f=await fixture(), dio=new f.DioramaOverlay(new El()), h=tapMap(f,dio,'target');
  h.down(1); const other=f.actor('other'); dio.pins[1].target=other;
  dio.pins[1].el.dispatch('pointerdown',{pointerId:2,pointerType:'pen',clientX:20,clientY:40});
  const second=dio._pinTaps.get(2);
  dio.releaseMatchActors([h.ally]); assert.equal(dio._pinTaps.has(1),false); assert.equal(dio._pinTaps.get(2),second);
  f.G.match.local=null; dio.update(1/60,1); assert.equal(dio._pinTaps.size,0);
});

test('#685 repeated map-match disposal cannot accumulate pending Actor owners between pointer notifications',async()=>{
  const f=await fixture(), dio=f.G.game.diorama=new f.DioramaOverlay(new El());
  for(let cycle=0;cycle<25;cycle++) {
    const h=tapMap(f,dio,'cycle'+cycle); h.down(cycle+1,cycle%2?'pen':'touch');
    assert.equal(dio._pinTaps.size,1); h.m.dispose(); assert.equal(dio._pinTaps.size,0);
  }
});
