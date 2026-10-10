import {configDependency} from './config-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { runQualityBrowserProbe } from '../quality-probe.mjs';

async function fixture({touch=false,fault=null,cleanupFails=false}={}) {
  const G={level:{},physics:{},paint:{size:4096,counts:[20,40],turfTotal:60},env:{shadowSize:4096},fx:{q:1}};
  const game=G.game={settings:{quality:'medium',gyroSens:1.7},mobile:{touch},props:{quality:'medium'},mapDef:{id:'same'}};
  const context=vm.createContext({s3ProbeG:G,URL,document:{baseURI:'https://inkwave.test/'},AggregateError});
  const config=new vm.SourceTextModule(fs.readFileSync(new URL('../../../inkwave-public/src/config.js',import.meta.url),'utf8'),{context});
  await config.link(spec=>configDependency(spec,context));await config.evaluate();
  const apply=()=>{const q=config.namespace.effectiveQuality(game.settings,game.mobile);G.paint.size=q.paintAtlas;G.env.shadowSize=q.shadowSize;game.props.quality=game.settings.quality;game._builtQuality=game.settings.quality;};apply();
  const calls=[];
  game._setSettings=s=>{calls.push(s.quality);if(cleanupFails&&s.quality==='medium')throw Error('cleanup failed');Object.assign(game.settings,s);apply();if(s.quality==='high'&&fault==='budget')G.paint.size=123;if(s.quality==='high'&&fault==='cpu')G.physics={};};
  game._buildWorld=async()=>{apply();};
  const page={async waitForFunction(fn){assert.equal(vm.runInContext('('+fn.toString()+')()',context),true);},async evaluate(fn){return vm.runInContext('('+fn.toString()+')()',context,{importModuleDynamically:async()=>config});}};
  return {page,game,G,calls};
}
test('canonical context uses native desktop budgets and restores settings after same-layout probe',async()=>{const f=await fixture();const r=await runQualityBrowserProbe(f.page);assert.equal(r.lowSwitch.paintSize,2048);assert.equal(r.highSwitch.paintSize,4096);assert.equal(r.layoutReconciliation.builtQuality,'low');assert.equal(f.game.settings.quality,'medium');assert.equal(f.game.settings.gyroSens,1.7);assert.deepEqual(f.calls,['low','high','medium']);});
test('native touch effectiveQuality caps HIGH without changing requested prop quality',async()=>{const f=await fixture({touch:true});const r=await runQualityBrowserProbe(f.page);assert.equal(r.highSwitch.paintSize,2048);assert.equal(r.highSwitch.shadowSize,2048);assert.equal(r.highSwitch.propQ,'high');assert.equal(f.game.settings.quality,'medium');});
test('incorrect budget and changed CPU identity are rejected while settings still restore',async()=>{for(const fault of ['budget','cpu']){const f=await fixture({fault});await assert.rejects(runQualityBrowserProbe(f.page),/Quality integration/);assert.equal(f.game.settings.quality,'medium');assert.equal(f.calls.at(-1),'medium');}});
test('original probe failure survives a simultaneous restoration failure',async()=>{const f=await fixture({fault:'budget',cleanupFails:true});await assert.rejects(runQualityBrowserProbe(f.page),e=>e instanceof AggregateError&&e.errors.length===2&&/budgets/.test(e.errors[0].message)&&e.errors[1].message==='cleanup failed');});
