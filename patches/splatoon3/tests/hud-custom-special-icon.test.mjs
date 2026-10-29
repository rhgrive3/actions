import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const root=process.env.INKWAVE_ICON_SOURCE_ROOT||fileURLToPath(new URL('../../../',import.meta.url));
const candidate=process.env.INKWAVE_HUD_ICON_CANDIDATE_ROOT||root;
const {parse}=await import(pathToFileURL(path.join(root,'patches/loading-cache/vendor/acorn.mjs')));
const {selectedSub,selectedSubCost}=await import(pathToFileURL(path.join(root,'patches/splatoon3/runtime/kit-composition.mjs')));
const {adaptKitRescue}=await import(pathToFileURL(path.join(candidate,'patches/splatoon3/kit-rescue-adapter.mjs')));
const raw=fs.readFileSync(path.join(root,'inkwave-public/src/ui/hud.js'),'utf8');
const js=adaptKitRescue('src/ui/hud.js',raw,(s,b,a,label)=>{assert.equal(s.split(b).length-1,1,label);return s.replace(b,a);});
const ast=parse(js,{sourceType:'module',ecmaVersion:'latest'});
const cls=ast.body.map(n=>n.declaration||n).find(n=>n.type==='ClassDeclaration'&&n.id.name==='HUD');
const methods=['_specialId','_updCrosshair'].map(name=>{const m=cls.body.body.find(n=>n.key.name===name);assert.ok(m);return js.slice(m.start,m.end);}).join('\n');
const WEAPONS={shooter:{kind:'shooter',special:'trizooka'},roller:{kind:'roller',special:'bubbler'}};
const SUB={bomb:{id:'bomb',name:'Bomb',inkCost:70}};
const HUD=new Function('WEAPONS','SUB','SUB_ICONS','selectedSub','selectedSubCost','specialIcon','chargerScopeFactor','clamp',`return class HUD {${methods}}`)(WEAPONS,SUB,{bomb:'bomb icon'},selectedSub,selectedSubCost,id=>'icon:'+id,()=>0,(x,min=0,max=1)=>Math.min(max,Math.max(min,x)));
function node(){return {classList:{toggle(){}},style:{setProperty(){}},textContent:'',querySelector(){return node();}};}
function rig(actor={weaponId:'shooter',weapon:{special:'trizooka',sub:'bomb'},alive:true}){
 const h=Object.create(HUD.prototype),writes=[];Object.assign(h,{_L:{},_bloom:0,_kick:0,_local:()=>actor,_buildReticle(){},xh:node(),ret:node(),scopeMask:node(),shield:node(),subChip:node(),_snd(){}});
 h.spIcon={set innerHTML(v){writes.push(v);}};return {h,writes,setActor:a=>{actor=a;},frame:weapon=>h._updCrosshair({weapon},1/60)};
}
test('same weapon custom special updates once and stable frames do not rewrite SVG',()=>{
 const actor={weaponId:'shooter',weapon:{special:'trizooka',sub:'bomb'},alive:true},r=rig(actor);
 r.frame('shooter');assert.deepEqual(r.writes,['icon:trizooka']);
 actor.weapon={...actor.weapon,special:'storm'};assert.equal(r.h._specialId(),'storm');r.frame('shooter');
 assert.deepEqual(r.writes,['icon:trizooka','icon:storm']);
 for(let i=0;i<1200;i++)r.frame('shooter');assert.equal(r.writes.length,2);
 assert.equal(WEAPONS.shooter.special,'trizooka','shared gameplay registry unchanged');
});
test('normal weapon switch and absent actor keep canonical special and fallback',()=>{
 const r=rig(null);r.frame('shooter');r.frame('roller');r.frame('missing');r.frame('missing');
 assert.deepEqual(r.writes,['icon:trizooka','icon:bubbler','icon:slam']);assert.equal(r.h._specialId(),'slam');
 r.setActor({weaponId:'roller'});assert.equal(r.h._specialId(),'bubbler');
});
test('custom-to-default reset under same weapon restores default once',()=>{
 const r=rig({weaponId:'shooter',weapon:{special:'storm',sub:'bomb'},alive:true});r.frame('shooter');
 r.setActor({weaponId:'shooter',weapon:WEAPONS.shooter,alive:true});r.frame('shooter');r.frame('shooter');
 assert.deepEqual(r.writes,['icon:storm','icon:trizooka']);assert.equal(r.h._specialId(),'trizooka');
});
