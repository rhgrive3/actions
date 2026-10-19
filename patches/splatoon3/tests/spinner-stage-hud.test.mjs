import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MAIN_WEAPON_CATALOG } from '../runtime/main-weapon-catalog-data.mjs';

// Exercise the actual HUD branch, not a copy of the two-stage arithmetic.
const hud=fs.readFileSync(new URL('../../../inkwave-public/src/ui/hud.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../../../inkwave-public/styles/hud.css',import.meta.url),'utf8');
const start=hud.indexOf('      const actor = this._local(), lr = actor?.weaponRunner;');
const end=hud.indexOf("    } else if (L.kind === 'dualies')",start);
assert.ok(start>0&&end>start,'actual Spinner HUD stage branch must exist');
const update=new Function('f','w','L','clamp',hud.slice(start,end));
const clamp=x=>Math.max(0,Math.min(1,x));
const mains=MAIN_WEAPON_CATALOG.records.filter(r=>r.family==='splatling');
const weaponId=r=>r.legacy?r.id:'s3-'+r.sourceRow.replace(/_\d+$/,'').toLowerCase().replaceAll('_','-');

function harness(record,id=weaponId(record)){
 const states=new Map(),flashes=[],stage={style:{},attrs:{},setAttribute(name,value){this.attrs[name]=value;}};
 const ret={style:{setProperty(name,value){this[name]=value;}},classList:{toggle(name,enabled){states.set(name,enabled);}}};
 const runner={streaming:false},weapon={catalogRecord:record};
 const h={ret,_stageEl:stage,_chargeEl:{style:{}},_chargeC:100,
   _local:()=>({weapon,weaponRunner:runner}),_restart(_element,name){flashes.push(name);}};
 const L={first:null,full:null,charge:null,stageRatio:null,streaming:null};
 const render=(charge,streaming=false)=>{runner.streaming=streaming;update.call(h,{charge},id,L,clamp);};
 return {render,L,ret,stage,states,flashes};
}

test('all six actual S3 Spinner first-stage marks use their own 11.3.0 first/second frame ratio',()=>{
 assert.equal(mains.length,6);
 for(const r of mains){
   const p=r.parameters.WeaponParam,q=p.ChargeFrame_First/p.ChargeFrame_Second;
   assert.ok(q>0&&q<1,r.sourceRow);
   const ui=harness(r);
   ui.render(Math.max(0,q-.03));
   assert.equal(ui.states.get('is-first'),false,r.sourceRow+' not first stage yet');
   assert.equal(ui.L.stageRatio,q,r.sourceRow+' source first-stage ratio');
   assert.equal(ui.stage.attrs.transform,`rotate(${(360*q).toFixed(3)})`,r.sourceRow+' boundary position');
   ui.render(q);
   assert.equal(ui.states.get('is-first'),true,r.sourceRow+' first stage activates');
   assert.deepEqual(ui.flashes,['is-stageflash'],r.sourceRow+' first-stage flash only once');
   ui.render(1);
   assert.equal(ui.states.get('is-full'),true,r.sourceRow+' second stage finishes');
   assert.deepEqual(ui.flashes,['is-stageflash','is-flash']);
   ui.render(.9,true);
   assert.equal(ui.states.get('is-first'),false,r.sourceRow+' releases stage while streaming');
   assert.equal(ui.states.get('is-full'),false,r.sourceRow+' releases full while streaming');
 }
});

test('catalogue variants use the underlying source actor two-stage boundary',()=>{
 const r=mains.find(r=>r.sourceRow==='Spinner_HyperShort_00');
 const ui=harness(r,'s3-spinner-hypershort-01');
 ui.render(.49);assert.equal(ui.states.get('is-first'),false);
 ui.render(.5);assert.equal(ui.states.get('is-first'),true);
 ui.render(1);assert.equal(ui.states.get('is-full'),true);
});

test('Spinner first-stage is a static source geometry mark, not a new per-frame DOM node',()=>{
 assert.match(hud,/<path class="iw-ret__stage" d="M16 0 L27 0"\/>/);
 assert.match(css,/\.iw-ret--splatling\.is-first \.iw-ret__stage/);
 assert.match(css,/\.iw-ret--splatling\.is-stageflash \.iw-ret__stage/);
 assert.ok(hud.indexOf("this._stageEl = r.querySelector('.iw-ret__stage')")>0);
 assert.ok(hud.indexOf("this._stageEl.setAttribute('transform'")>0);
});
