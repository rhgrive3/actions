import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from '../../loading-cache/vendor/acorn.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { adaptBlasterReticle } from '../blaster-reticle-adapter.mjs';
import { replaceOnce } from '../../local-quality/adapter.mjs';
import { applyShotGuide } from '../runtime/weapons-fidelity.mjs';
import * as art from '../runtime/blaster-reticle-presentation.mjs';

const read = path => fs.readFileSync(new URL('../../../' + path, import.meta.url), 'utf8');
const source = adaptBuildSource('src/ui/hud.js', read('inkwave-public/src/ui/hud.js'));
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const cls = ast.body.map(n => n.declaration || n).find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key?.name === '_updCrosshair'));
const methods = ['_buildReticle', '_updCrosshair', 'hitMarker'].map(name => {
  const method = cls.body.body.find(m => m.key.name === name);
  assert(method, name); return source.slice(method.start, method.end);
}).join('\n');

function element() {
  const attributes = {}, properties = {}, childrenBySelector = new Map(), classes = new Set();
  const el = { attributes, properties, children: [], className: '',
    style: { setProperty(k,v) { properties[k] = String(v); }, getPropertyValue(k) { return properties[k] || ''; } },
    classList: { toggle(k,v) { if (v) classes.add(k); else classes.delete(k); }, add(...ks) {ks.forEach(k=>classes.add(k));}, remove(...ks) {ks.forEach(k=>classes.delete(k));} },
    setAttribute(k,v) { attributes[k] = String(v); }, removeAttribute(k) { delete attributes[k]; },
    querySelector(selector) {
      if (selector === '.iw-ret__bias') return null;
      if (selector.startsWith('[data-blaster=')) return childrenBySelector.get(selector) || null;
      if (!childrenBySelector.has(selector)) childrenBySelector.set(selector, element());
      return childrenBySelector.get(selector);
    },
    contains(node) { return [...childrenBySelector.values()].includes(node); },
  };
  Object.defineProperty(el, 'innerHTML', { get() {return el.html || '';}, set(html) {
    el.html = html; childrenBySelector.clear();
    for (const match of html.matchAll(/data-blaster="([a-z-]+)"/g)) childrenBySelector.set(`[data-blaster="${match[1]}"]`, element());
  }});
  return el;
}

function fixture(width = 1280, height = 720) {
  const WEAPONS = { blaster: {kind:'blaster',sourceMainActor:'WeaponBlasterMiddle',special:'slam'}, shooter:{kind:'shooter',special:'slam'},
    'catalog-long':{kind:'catalog',modelKind:'blaster',catalogRecord:{sourceActor:'WeaponBlasterLong'},special:'slam'} };
  const actor = {alive:true,form:'kid',grounded:true,weaponId:'blaster',weapon:WEAPONS.blaster,weaponRunner:{spread:0}};
  const G = { camera:{}, projectiles:{
    s3WeaponGuide(a,w,cam,W,H) {G.calls.push({a,w,cam,W,H,kind:'legacy'});return G.point;},
    s3BlasterReticleGuides(a,w,cam,W,H) {G.calls.push({a,w,cam,W,H,kind:'pair'});return {aim:G.aim,impact:G.point};},
  },calls:[],point:{x:.2,y:-.1,z:0},aim:{x:0,y:0,z:0} };
  const bindings = { ...art, applyShotGuide, G, WEAPONS, innerWidth:width, innerHeight:height,
    clamp:(n,a=0,b=1)=>Math.min(b,Math.max(a,n)), specialIcon:()=>'',chargerScopeFactor:()=>0,
    SUB:{bomb:{id:'bomb'}},SUB_ICONS:{bomb:''},selectedSub:()=>({id:'bomb',name:'Bomb'}),selectedSubCost:()=>70 };
  const HUD = Function(...Object.keys(bindings), `return class {${methods}}`)(...Object.values(bindings));
  const h = Object.assign(new HUD(), {_L:{},_bloom:0,_kick:0,_visible:true,_local:()=>actor,_snd(){},_restart(){},
    ret:element(),xh:element(),hitEl:element(),killEl:element(),spIcon:element(),scopeMask:element(),shield:element(),subChip:element(),
    _project(_cam,x,y,z,out={}) {return Object.assign(out,{x,y,z});} });
  return {h,G,actor,WEAPONS,frame(crosshair={}){h._updCrosshair({weapon:actor.weaponId,crosshair},1/60);},node(key){return h.ret.querySelector(`[data-blaster="${key}"]`);}};
}

test('final composed HUD has measured art and removes the legacy bias/arc owner', () => {
  assert.match(source, /r\.innerHTML = blasterReticleMarkup\(\)/);
  const start=source.indexOf("} else if (kind === 'blaster')"),end=source.indexOf("} else if (kind === 'roller')",start);
  assert.doesNotMatch(source.slice(start,end),/stroke-dasharray|r="23"|iw-ret__bias/);
  assert.doesNotMatch(source,/BIAS \$\{percent\}%/);
  const install=read('patches/splatoon3/runtime/install.mjs');
  assert.match(install,/installShotGuide\(api, profile\);\s+installSelfOcclusion\(api\);/);
  assert.throws(()=>adaptBlasterReticle('src/ui/hud.js','invalid source',replaceOnce));
  assert.equal(adaptBlasterReticle('src/game/player.js','untouched',replaceOnce),'untouched');
});

test('real blaster pair projects independently while the DOM root stays centred', () => {
  const f=fixture();f.frame({inRange:true});
  assert.equal(f.G.calls.length,1);assert.equal(f.G.calls[0].w,f.actor.weapon);
  assert.equal(f.node('camera').attributes.transform,'translate(0 0)');
  assert.equal(f.node('impact').attributes.transform,'translate(128 36)');
  assert.equal(f.h.ret.style.translate,'');
  assert.equal(f.h._L.blasterImpactTranslate,'128.0px 36.0px');
  f.h.hitMarker('hit',{damage:36});f.h.hitMarker('kill',{damage:0});
  assert.equal(f.h.hitEl.style.translate,'128.0px 36.0px');
  assert.equal(f.h.killEl.style.translate,'128.0px 36.0px');
});

test('explicit lab guide stays in CSS pixels at 1080p without a second scale', () => {
  const f=fixture(1920,1080);f.frame({guide:{x:1000,y:650},inRange:true});
  assert.equal(f.h._L.reticleScale,1.5);
  assert.equal(f.h.ret.properties['--iw-blaster-scale'],'1.5');
  assert.equal(f.node('camera').attributes.transform,'translate(0 0)');
  assert.equal(f.node('impact').attributes.transform,'translate(26.667 73.333)');
  assert.equal(f.h._L.blasterImpactTranslate,'40.0px 110.0px');
});

test('live angular recovery changes horizontal mark positions without recoil inflation', () => {
  const f=fixture();f.actor.weaponRunner.spread=10;f.h._bloom=1;f.h._kick=1;f.frame({spread:80,inRange:false});
  assert.equal(f.node('nw').attributes.transform,'translate(-44.8 -24.2)');
  f.actor.weaponRunner.spread=0;f.frame({spread:80,inRange:false});
  assert.equal(f.node('nw').attributes.transform,'translate(-24.2 -24.2)');
  assert.equal(f.node('impact').attributes.display,'none');
});

test('live family changes and catalogue variants rebuild the actual HUD without stale nodes', () => {
  const f=fixture();f.frame();const first=f.node('camera');
  f.actor.weaponId='catalog-long';f.actor.weapon=f.WEAPONS['catalog-long'];f.frame();
  assert.notEqual(f.node('camera'),first);assert.equal(f.h._L.kind,'blaster');
  assert.equal(f.node('nw').attributes.transform,'translate(-20 -20)');
  f.actor.weapon={kind:'shooter',special:'slam'};f.frame({guide:{x:677,y:341}});
  assert.equal(f.h._L.kind,'shooter');assert.equal(f.node('camera'),null);
  assert.equal(f.h.ret.style.translate,'37.0px -19.0px');
  f.actor.weapon=f.WEAPONS['catalog-long'];f.frame({onTarget:'enemy',inRange:true});
  assert.equal(f.node('direct').attributes.display,'inline');assert.equal(f.node('ticks').attributes.display,'none');
});

test('out of range, behind-camera guide and squid retain their distinct visibility rules', () => {
  const f=fixture();f.G.point.z=2;f.frame({onTarget:'enemy',inRange:false});
  assert.equal(f.node('direct').attributes.display,'none');assert.equal(f.node('idle').attributes.display,'inline');
  assert.equal(f.node('impact').attributes.transform,'translate(0 0)');
  f.actor.form='squid';f.frame();assert.equal(f.h.ret.style.visibility,'hidden');
  f.actor.form='kid';f.frame();assert.equal(f.h.ret.style.visibility,'');
});


test('a HUD lab frame never adopts an unrelated or unidentified live weapon family', () => {
  const f=fixture();f.frame();f.actor.weaponId=undefined;f.actor.weapon={kind:'roller'};
  f.h._updCrosshair({weapon:'blaster',crosshair:{}},1/60);
  assert.equal(f.h._L.kind,'blaster');assert.equal(f.node('nw').attributes.transform,'translate(-24.2 -24.2)');
  f.actor.weaponId='shooter';f.actor.weapon=f.WEAPONS.shooter;f.actor.weaponRunner.spread=10;f.actor.grounded=false;
  f.h._updCrosshair({weapon:'catalog-long',crosshair:{}},1/60);
  assert.equal(f.h._L.kind,'blaster');assert.equal(f.node('nw').attributes.transform,'translate(-20 -20)');
});


test('unclipped aim and wall contact move both marks without a second guide query', () => {
  const f=fixture();f.G.aim={x:.15,y:.25,z:0};f.G.point={x:-.2,y:-.3,z:0};f.frame({inRange:true});
  assert.equal(f.G.calls.length,1);assert.equal(f.G.calls[0].kind,'pair');
  assert.equal(f.node('camera').attributes.transform,'translate(96 -90)');
  assert.equal(f.node('impact').attributes.transform,'translate(-128 108)');
  assert.equal(f.h._L.blasterImpactTranslate,'-128.0px 108.0px');
  assert.equal(f.h.ret.style.translate,'');
  f.frame({blasterAim:{x:690,y:320},guide:{x:660,y:340},inRange:true});
  assert.equal(f.node('camera').attributes.transform,'translate(50 -40)');
  assert.equal(f.node('impact').attributes.transform,'translate(20 -20)');
});
