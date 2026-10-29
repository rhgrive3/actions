import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { adaptStringerChargeHud } from '../stringer-charge-hud-adapter.mjs';
import { adaptBuildSource } from '../../../scripts/inkwave-source-composition.mjs';
import { BUILD_ONLY_PATCH_MODULES } from '../../../scripts/lib/inkwave-build-only-modules.mjs';
import { fixture } from './source-fixture.mjs';
const runtime = process.env.INKWAVE_BUILT_SITE
  ? pathToFileURL(path.resolve(process.env.INKWAVE_BUILT_SITE, 'patches/splatoon3/runtime/') + path.sep)
  : new URL('../runtime/', import.meta.url);
const [{ updateStringerChargeHud, installStringerChargeHud }, { MAIN_WEAPON_CATALOG }, { ALTERNATE_WEAPON_KITS }] =
  await Promise.all(['stringer-charge-hud.mjs', 'main-weapon-catalog-data.mjs', 'alternate-weapon-kits-data.mjs']
    .map(name => import(new URL(name, runtime))));
const rows=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='stringer');
function hud(){
  const circle={style:{stroke:'native-arc'}},track={style:{stroke:'native-gray',opacity:'.45'}},classes=new Set(),flashes=[];
  const h={_chargeEl:circle,_chargeC:Math.PI*30,ret:{dataset:{},
    classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),toggle(k,on){on?classes.add(k):classes.delete(k);}},
    querySelector:key=>key==='.iw-ret__track'?track:null},_restart:(_ret,name)=>flashes.push(name)};
  return {h,circle,track,classes,flashes};
}
const close=(a,b,label)=>assert.ok(Math.abs(a-b)<.011,`${label}: ${a} != ${b}`);
test('every Stringer kit fills the existing native circle once per actual charge stage, with no added geometry',()=>{
  for(const row of rows)for(const id of [row.id,...ALTERNATE_WEAPON_KITS.filter(k=>k.baseId===row.id).map(k=>k.id)]){
    const weapon=Object.freeze({id,catalogRecord:row}),p=row.parameters.spl__WeaponStringerParam.ChargeParam;
    const {h,circle,track,flashes,classes}=hud(),boundary=p.ChargeFrameMidCharge/p.ChargeFrameFullCharge;
    updateStringerChargeHud(h,weapon,boundary/2);close(+circle.style.strokeDashoffset,h._chargeC*.5,id+' first lap');
    assert.equal(h.ret.dataset.chargeStage,'first');assert.equal(track.style.opacity,'.45');
    updateStringerChargeHud(h,weapon,boundary);close(+circle.style.strokeDashoffset,h._chargeC,id+' second lap begins empty');
    assert.equal(h.ret.dataset.chargeStage,'second');assert.equal(track.style.opacity,'.45');assert.equal(track.style.stroke,'native-gray');assert.equal(circle.style.stroke,'native-arc');
    assert.equal(flashes.length,1,id+' first completion flashes once');assert.equal(classes.has('is-full'),false);
    updateStringerChargeHud(h,weapon,(1+boundary)/2);close(+circle.style.strokeDashoffset,h._chargeC*.5,id+' second lap');
    updateStringerChargeHud(h,weapon,1);close(+circle.style.strokeDashoffset,0,id+' full');assert.ok(classes.has('is-full'));
    updateStringerChargeHud(h,weapon,1);assert.equal(flashes.length,1,'HUD does not add a duplicate full-charge flash');
    updateStringerChargeHud(h,weapon,0);close(+circle.style.strokeDashoffset,h._chargeC,id+' reset');assert.equal(track.style.opacity,'.45');assert.equal(classes.has('is-full'),false);
    assert.equal(h._chargeEl,circle);assert.equal(h.ret.querySelector('.iw-ret__track'),track,'same native geometry owns both laps');
  }
});

test('compact Charger/Stringer and two-stage Spinner rings keep their HUD geometry and charge paths',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
  const styles=fs.readFileSync(new URL('../../../inkwave-public/styles/hud.css',import.meta.url),'utf8');
  const tracks=[...raw.matchAll(/<circle r="([0-9]+)" class="iw-ret__track"/g)].map(m=>Number(m[1]));
  assert.deepEqual(tracks,[15,12],'Charger/Stringer radius 15px, Spinner first radius 12px');
  assert.ok(raw.includes('const C = 2 * Math.PI * 15;'),'Charger/Stringer arc circumference uses the new radius');
  assert.ok(raw.includes('pathLength="100"'),'Spinner arc length remains normalized');
  const composed=adaptBuildSource('src/ui/hud.js',raw);
  assert.ok(composed.includes('<circle r="16" class="iw-ret__track"'),'Spinner second circle is 16px in production');
  assert.ok(composed.includes('<circle r="16" class="iw-ret__charge iw-ret__charge-second"'),'Spinner second charge path stays attached');
  const builtStyles=adaptBuildSource('styles/hud.css',styles);
  assert.ok(builtStyles.includes('--iw-x: calc(33px + var(--sp, 0) * 0.7071px); --iw-y: calc(23px + var(--sp, 0) * 0.7071px);'),'Splatling production corner coordinates are compact');
  assert.ok(builtStyles.includes('left: -6px; top: -6px; width: 12px; height: 12px;'),'Splatling production corner arms are compact');
  assert.ok(styles.includes('.iw-ret--charger .iw-ret__charge { stroke: var(--self-light); stroke-width: 2.9;'),'Charger stroke width is compact');
  assert.ok(styles.includes('.iw-ret--splatling .iw-ret__charge { stroke: #fff; stroke-width: 2.9;'),'Spinner stroke width is compact');
});

test('HUD wrapper preserves native projection, calls and return values, and clears Stringer styling on switch',()=>{
  const {h,circle,track}=hud(),bow={catalogRecord:rows[0]},shooter={kind:'shooter'};
  let nativeCalls=0;
  class HUD { _updCrosshair(frame,dt){nativeCalls++;this.projected=[frame.crosshair.guide.x,dt];return 71;} }
  installStringerChargeHud(HUD,{bow,shooter});installStringerChargeHud(HUD,{bow,shooter});Object.setPrototypeOf(h,HUD.prototype);
  assert.equal(h._updCrosshair({weapon:'bow',charge:.8,crosshair:{guide:{x:37}}},1/120),71);
  assert.deepEqual(h.projected,[37,1/120]);assert.equal(nativeCalls,1);assert.equal(track.style.opacity,'.45');
  h._updCrosshair({weapon:'shooter',charge:0,crosshair:{guide:{x:-13}}},1/30);
  assert.deepEqual(h.projected,[-13,1/30]);assert.equal(nativeCalls,2);assert.equal(track.style.opacity,'.45');assert.equal(track.style.stroke,'native-gray');assert.equal(circle.style.stroke,'native-arc');
  assert.equal(h._stringerChargeHud,null);assert.equal(h.ret.dataset.chargeStage,undefined);
});

test('Stringer adapter appends only an installer after the complete HUD owner and stays build-only',()=>{
  const raw=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
  const adapted=adaptStringerChargeHud('src/ui/hud.js',raw);
  assert.ok(adapted.includes(raw),'native geometry, scope and projection body are preserved verbatim by this adapter');
  const composed=adaptBuildSource('src/ui/hud.js',raw);
  const count=needle=>composed.split(needle).length-1;
  assert.equal(count('installStringerChargeHud(HUD, WEAPONS);'),1,'one Stringer installer after the complete HUD');
  assert.equal(count("from '../../patches/splatoon3/runtime/stringer-charge-hud.mjs'"),1,'one Stringer runtime import');
  assert.equal(count('const px1 = px.toFixed(1), py1 = py.toFixed(1);'),1,'terminal Shooter formatter applied once');
  assert.equal(count('translate3d(${px1}px,${py1}px,0)'),1,'marker transform consumes those same packed strings');
  assert.ok(composed.includes('_s3PaintTank('),'native S3 tank remains authoritative');
  assert.ok(BUILD_ONLY_PATCH_MODULES.has('patches/splatoon3/stringer-charge-hud-adapter.mjs'));
  assert.equal(adaptStringerChargeHud('src/main.js','untouched'),'untouched');
});

test('actual composed or emitted HUD packs marker coordinates and heading while Stringer stages remain installed',async()=>{
  const f=await fixture({productionComposition:true,extraExports:"export { HUD } from './inkwave-public/src/ui/hud.js';"});
  const element=()=>({style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}}});
  const h=Object.create(f.HUD.prototype),dot=element(),canvas={...element(),width:600,height:300};
  Object.assign(h,{_L:{},_map:{},_mapT:0,_mapV:0,map:element(),mapDim:element(),el:element(),
    mapLegend:element(),mapSlot:{appendChild(){}},mapDots:[dot],_updBeacons(){},_myTeam:()=>0,_snd(){}});
  for(const p of [
    {x:.35,y:.72,yaw:1.23456,isSelf:true,team:0,alive:true},
    {x:.713,y:.215,yaw:-.4234,isSelf:false,team:1,alive:false},
    {x:.127,y:.913,yaw:-2.091,isSelf:true,team:1,alive:true},
  ]){
    h._updMap({canvas,players:[p],expanded:false},1/60);
    const width=parseFloat(h.map.style.width),height=parseFloat(h.map.style.height);
    const x=(p.x*width).toFixed(1),y=(p.y*height).toFixed(1),yaw=p.isSelf?p.yaw:0;
    // Palette and viewer-team changes invalidate stationary markers; the
    // dedicated queue-ui-input test covers both gates and the stale-color control.
    const enemy=p.team!==h._myTeam(),color=enemy?(h._L.cb||'#2f5bff'):(h._L.ca||'#ff8a14');
    assert.equal(h._L.md0,`${x}|${y}|${yaw.toFixed(2)}|${p.alive?1:0}|${p.isSelf?1:0}|${p.team}|${color}|${enemy?1:0}`);
    assert.equal(dot.style.transform,`translate3d(${x}px,${y}px,0) rotate(${p.isSelf?p.yaw.toFixed(3):0}rad)`);
    const key=h._L.md0,transform=dot.style.transform;
    h._updMap({canvas,players:[p],expanded:false},1/60);
    assert.equal(h._L.md0,key);assert.equal(dot.style.transform,transform);
  }
  assert.ok(Object.getOwnPropertySymbols(f.HUD.prototype).some(s=>s.description==='inkwave.stringer-charge-hud.v1'),
    'shipping HUD class retains its Stringer stage wrapper');
});
