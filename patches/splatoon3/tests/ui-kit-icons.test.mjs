import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
// Optional roots support a separate uncommitted icon-only overlay, without
// booting the game or replacing any production fixture/adapter.
const root=process.env.INKWAVE_ICON_SOURCE_ROOT || fileURLToPath(new URL('../../../',import.meta.url));
const candidate=process.env.INKWAVE_ICON_CANDIDATE_ROOT || root;
const runtime=path.join(candidate,'patches/splatoon3/runtime');
const {parse}=await import(pathToFileURL(path.join(root,'patches/loading-cache/vendor/acorn.mjs')));
const catalogue=fs.readFileSync(path.join(root,'patches/splatoon3/runtime/catalogue.mjs'),'utf8');
const ast=parse(catalogue,{ecmaVersion:'latest',sourceType:'module'});
function canonical(name){
 const d=ast.body.flatMap(n=>n.declaration?.declarations||[]).find(n=>n.id.name===name);
 assert.equal(d?.init?.callee?.object?.name,'Object');assert.equal(d.init.callee.property.name,'freeze');
 return d.init.arguments[0].properties.map(p=>p.key.name||p.key.value).sort();
}
const {CATALOGUE_SUB_ICONS:subs}=await import(pathToFileURL(path.join(runtime,'ui-sub-icons.mjs')));
const {CATALOGUE_SPECIAL_ICONS:specials}=await import(pathToFileURL(path.join(runtime,'ui-special-icons.mjs')));
const {installCatalogueKitIcons,syncCatalogueKitIcons,bindCatalogueKitIconFocus}=await import(pathToFileURL(path.join(runtime,'ui-kit-icons.mjs')));
const tags=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon']);
function safeSvg(svg){
 assert.equal(typeof svg,'string');assert.match(svg,/^<svg\s/);assert.match(svg,/<\/svg>$/);
 assert.match(svg,/viewBox=["']0 0 64 64["']/);assert.match(svg,/aria-hidden=["']true["']/);
 assert.match(svg,/class=["'][^"']*\biw-ico\b[^"']*["']/);assert.match(svg,/currentColor/);
 // The standard namespace URI is a declaration, not an external resource.
 assert.doesNotMatch(svg.replace(/ xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/g,''),/<!|<\?|\b(?:id|href|xlink:href|style|filter)\s*=|\bon\w+\s*=|url\s*\(|https?:|data:|javascript:/i);
 const stack=[];let count=0,last=0;
 for(const m of svg.matchAll(/<\/?([A-Za-z][\w:-]*)\b[^>]*>/g)){
  assert.equal(svg.slice(last,m.index).trim(),'','only geometric markup, no embedded text');last=m.index+m[0].length;
  assert.ok(tags.has(m[1]),'allowed geometric element '+m[1]);
  if(m[0].startsWith('</'))assert.equal(stack.pop(),m[1]);
  else {count++;if(!m[0].endsWith('/>'))stack.push(m[1]);}
 }
 assert.equal(svg.slice(last).trim(),'');assert.equal(stack.length,0);assert.ok(count>1);return count;
}
test('all catalogue IDs have distinct canonical artwork, without fallback or implicit aliases',()=>{
 assert.deepEqual(Object.keys(subs).sort(),canonical('SUB_NAMES'));
 assert.deepEqual(Object.keys(specials).sort(),canonical('SPECIAL_NAMES'));
 assert.equal(Object.keys(subs).length,14);assert.equal(Object.keys(specials).length,19);
 // Canonical artwork stays distinct. The installed legacy slam lookup may
 // explicitly share tripleSplashdown art; this does not equate mechanics.
 const rows=[...Object.entries(subs),...Object.entries(specials)];
 assert.equal(new Set(rows.map(([,v])=>v)).size,rows.length);
});
test('all icons are reusable self-contained geometric SVG; report size without quality-cutting budgets',t=>{
 const measures=[];for(const [family,map] of [['sub',subs],['special',specials]])for(const [id,svg] of Object.entries(map))measures.push({family,id,bytes:Buffer.byteLength(svg),elements:safeSvg(svg)});
 const payload=Object.values(subs).join('')+Object.values(specials).join('');
 t.diagnostic(JSON.stringify({icons:measures.length,rawBytes:Buffer.byteLength(payload),gzipBytes:gzipSync(payload).length,totalElements:measures.reduce((n,r)=>n+r.elements,0),perIcon:measures}));
});
test('SVG safety oracle rejects fixed IDs, external images, scripts and filters',()=>{
 const valid=Object.values(subs)[0];
 for(const inserted of ['<image href="https://example.invalid/a.png"/>','<script/>','<filter/>','<g id="same"/>','<path onclick="x()"/>','<path fill="url(#same)"/>'])assert.throws(()=>safeSvg(valid.replace('</svg>',inserted+'</svg>')));
});
test('final registration replaces previous artwork in-place and preserves fallback and unrelated registries',()=>{
 const SUB_ICONS={bomb:'old bomb',customLegacy:'custom'},SPECIAL_ICONS={slam:'legacy slam',storm:'old storm',customLegacy:'custom'};
 const SUB={bomb:{inkCost:70}},SPECIALS={slam:{duration:1}},before=JSON.stringify({SUB,SPECIALS});
 const api={SUB_ICONS,SPECIAL_ICONS,SUB,SPECIALS};installCatalogueKitIcons(api);
 assert.equal(api.SUB_ICONS,SUB_ICONS);assert.equal(api.SPECIAL_ICONS,SPECIAL_ICONS);
 for(const [id,svg] of Object.entries(subs))assert.equal(SUB_ICONS[id],svg);
 for(const [id,svg] of Object.entries(specials))assert.equal(SPECIAL_ICONS[id],svg);
 assert.equal(SPECIAL_ICONS.slam,specials.tripleSplashdown,'explicit legacy artwork alias only');assert.equal(SUB_ICONS.customLegacy,'custom');assert.equal(SPECIAL_ICONS.customLegacy,'custom');assert.equal(JSON.stringify({SUB,SPECIALS}),before);
 const first=JSON.stringify({SUB_ICONS,SPECIAL_ICONS});installCatalogueKitIcons(api);assert.equal(JSON.stringify({SUB_ICONS,SPECIAL_ICONS}),first);
});
test('installer runs final icon registration once after fallback and before catalogue consumers',()=>{
 const js=fs.readFileSync(path.join(runtime,'install.mjs'),'utf8');
 assert.equal(js.split('installCatalogueKitIcons(api);').length-1,1);
 const at=js.indexOf('installCatalogueKitIcons(api);');
 assert.ok(at>js.indexOf('SPECIAL_ICONS[id] ||= SPECIAL_ICONS.slam;'));
 assert.ok(at<js.indexOf('installCatalogueLoadout(api);'));
 const registration=fs.readFileSync(path.join(runtime,'ui-kit-icons.mjs'),'utf8');
 assert.doesNotMatch(registration,/requestAnimationFrame|setInterval|setTimeout|document\.|createElement|fetch\(/);
});

test('detail sync writes only changed slots, restores replaced children and leaves compare/labels alone',()=>{
 function slot(){return {firstChild:null,writes:0,markup:'',get innerHTML(){return this.markup;},set innerHTML(v){this.writes++;this.markup=v;this.firstChild=v?{}:null;}};}
 const a=slot(),b=slot(),labels=[{textContent:'sub label'},{textContent:'special label'}];
 const chips=[a,b].map((node,i)=>({querySelector:q=>q==='.iw-kit__icon'?node:q==='b'?labels[i]:null}));
 const api={SUB_ICONS:subs,SPECIAL_ICONS:specials};
 syncCatalogueKitIcons(chips,'bomb','storm',api);assert.deepEqual([a.writes,b.writes],[1,1]);
 assert.equal(a.markup,subs.bomb);assert.equal(b.markup,specials.storm);
 for(let i=0;i<1200;i++)syncCatalogueKitIcons(chips,'bomb','storm',api);
 assert.deepEqual([a.writes,b.writes],[1,1],'no repeated SVG parse/DOM recreation for stable selection');
 syncCatalogueKitIcons(chips,'suction','storm',api);assert.deepEqual([a.writes,b.writes],[2,1]);
 syncCatalogueKitIcons(chips,'suction','trizooka',api);assert.deepEqual([a.writes,b.writes],[2,2]);
 a.firstChild={externalRender:true};syncCatalogueKitIcons(chips,'suction','trizooka',api);
 assert.deepEqual([a.writes,b.writes],[3,2]);assert.equal(a.markup,subs.suction);
 syncCatalogueKitIcons([],'bomb','storm',api);assert.deepEqual([a.writes,b.writes],[3,2],'compare empty slot list untouched');
 assert.deepEqual(labels,[{textContent:'sub label'},{textContent:'special label'}]);
 syncCatalogueKitIcons(chips,'unknown','unknown',api);assert.equal(a.markup,'');assert.equal(b.markup,'');
 syncCatalogueKitIcons(chips,'unknown','unknown',api);assert.deepEqual([a.writes,b.writes],[4,3]);
});
test('catalogue integration preserves original comparison/label/select/gameplay bytes',()=>{
 const js=fs.readFileSync(path.join(runtime,'catalogue.mjs'),'utf8');
 const addedImport="import { syncCatalogueKitIcons, bindCatalogueKitIconFocus } from './ui-kit-icons.mjs';\n";
 const addedCall='      syncCatalogueKitIcons(chips, selectors.sub.value, selectors.special.value, api);\n';
 assert.equal(js.split(addedImport).length-1,1);assert.equal(js.split(addedCall).length-1,1);
 const addedBind='    bindCatalogueKitIconFocus(screen, sync);\n';
 assert.equal(js.split(addedBind).length-1,1);
 assert.equal(js.replace(addedImport,'').replace(addedCall,'').replace(addedBind,''),catalogue.replace(addedImport,'').replace(addedCall,'').replace(addedBind,''));
 assert.ok(js.includes("const chips=body.querySelector('.iw-wd.is-compare')?[]:body.querySelectorAll('.iw-kit');"));
});

test('focus binding preserves receiver arguments return and errors, with one post-focus sync',()=>{
 const calls=[],receiver={tag:'receiver'},arg={},returned=Promise.resolve('marker');
 const screen={onFocus(...args){calls.push({self:this,args});return returned;}};
 let count=0;bindCatalogueKitIconFocus(screen,()=>count++);const wrapper=screen.onFocus;
 assert.equal(screen.onFocus.call(receiver,arg,2),returned);assert.equal(count,1);
 assert.equal(calls[0].self,receiver);assert.deepEqual(calls[0].args,[arg,2]);
 bindCatalogueKitIconFocus(screen,()=>count+=10);assert.equal(screen.onFocus,wrapper);
 screen.onFocus();assert.equal(count,11);
 const error=Error('original focus error'),bad={onFocus(){throw error;}};let badSync=0;
 bindCatalogueKitIconFocus(bad,()=>badSync++);assert.throws(()=>bad.onFocus(),e=>e===error);assert.equal(badSync,0);
 const empty={};let emptySync=0;bindCatalogueKitIconFocus(empty,()=>emptySync++);assert.equal(empty.onFocus(),undefined);assert.equal(emptySync,1);
});
test('nested original focus and sync-driven reentry are bounded without swallowing original calls',()=>{
 let originals=0,syncs=0;const screen={onFocus(depth=0){originals++;if(depth===0)screen.onFocus(1);return depth;}};
 bindCatalogueKitIconFocus(screen,()=>{syncs++;screen.onFocus(2);});
 assert.equal(screen.onFocus(0),0);assert.equal(originals,3);assert.equal(syncs,1);
 assert.equal(screen.onFocus(1),1);assert.equal(originals,5);assert.equal(syncs,2);
});
