import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('origin receipt requires actual emission and owner/life guards without weakening before control',async()=>{
 const context=vm.createContext({}),m=new vm.SourceTextModule(fs.readFileSync(new URL('./browser.mjs',import.meta.url),'utf8'),{context});
 await m.link(s=>{assert.equal(s,'./shared/production-scene.mjs');return new vm.SyntheticModule(['productionScene'],function(){this.setExport('productionScene',()=>{throw Error('not a browser run');});},{context});});await m.evaluate();
 const verify=m.namespace.verifyOriginReceipt,good={sourceReady:true,shots:1,muzzleError:1e-12,oldOriginGap:1,owner:'qa-owner',life:7,ownerRejected:true,lifeRejected:true,bonesUnchanged:true};assert.equal(verify(good),true);
 for(const bad of [{sourceReady:false},{shots:0},{shots:2},{muzzleError:.01},{owner:'other'},{life:8},{ownerRejected:false},{lifeRejected:false},{bonesUnchanged:false}])assert.throws(()=>verify({...good,...bad}));
 assert.equal(verify({...good,muzzleError:1,oldOriginError:0},{corrected:false}),true);assert.throws(()=>verify({...good,muzzleError:1,oldOriginError:.1},{corrected:false}));assert.throws(()=>verify({...good,oldOriginGap:0,oldOriginError:0},{corrected:false}));
});
