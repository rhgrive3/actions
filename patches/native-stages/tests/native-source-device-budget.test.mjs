import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

if (!vm.SourceTextModule) {
  test('native source device policy subprocess',()=>{
    const env={...process.env};delete env.NODE_TEST_CONTEXT;
    execFileSync(process.execPath,['--experimental-vm-modules','--test',fileURLToPath(import.meta.url)],{env,stdio:'pipe'});
  });
} else {
  const moduleFrom=(context,values)=>new vm.SyntheticModule(Object.keys(values),function(){
    for(const [key,value] of Object.entries(values))this.setExport(key,value);
  },{context});

  async function workerCase({constrainedClient,ua='Macintosh',maxTouchPoints,memory=undefined}){
    let derivedReads=0,derivedWrites=0,conversions=0;
    const messages=[];
    const context=vm.createContext({
      console,TextDecoder,performance:{now:()=>100},
      self:{
        navigator:{userAgent:ua,maxTouchPoints,deviceMemory:memory},
        postMessage(value,transfers){messages.push({value,transfers});}
      }
    });
    const arrays=['vertices','indices','triangles','normals','flags','objectIds','nodes','order','triangleFace','mask'];
    const data=()=>Object.assign(Object.fromEntries(arrays.map(name=>[name,new Float32Array(2)])),{manifest:{id:'stage'}});
    const links={
      './source-catalog.mjs':moduleFrom(context,{
        sourceObjectBytes:()=>undefined,SOURCE_RECIPE:'v4',SOURCE_STAGES:[{id:'stage',internal:'Vss_Test',sourceSha256:'fixture'}],
        sourceURL(_stage,file){return file;}
      }),
      './source-convert.mjs':moduleFrom(context,{
        convertSource(){conversions++;return data();}
      }),
      './source-cache.mjs':moduleFrom(context,{
        async sourceBytes(){return new Uint8Array([118,32,48,10]);},
        async sourceTree(){return {tree:[{type:'blob',path:'Vss_Test.mtl',size:4,sha:'a'.repeat(40)}]};},
        async readDerived(){derivedReads++;return null;},
        async writeDerived(){derivedWrites++;}
      })
    };
    const source=fs.readFileSync(new URL('../runtime/source-worker.mjs',import.meta.url),'utf8');
    const worker=new vm.SourceTextModule(source,{context});
    await worker.link(spec=>{assert(links[spec],spec);return links[spec];});
    await worker.evaluate();
    await context.self.onmessage({data:{id:'stage',runtimeSha256:'checksum',constrainedClient}});
    assert.equal(messages.at(-1)?.value?.result?.manifest?.id,'stage');
    assert.equal(messages.at(-1)?.transfers?.length,arrays.length);
    return {derivedReads,derivedWrites,conversions};
  }

  test('iPadOS Macintosh Worker skips large IndexedDB clones when main thread identifies touch',async()=>{
    const seen=await workerCase({constrainedClient:true,ua:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15'});
    assert.deepEqual(seen,{derivedReads:0,derivedWrites:0,conversions:1});
  });
  test('WorkerNavigator without touch signal still recognizes iPadOS maxTouchPoints when exposed',async()=>{
    const seen=await workerCase({constrainedClient:false,ua:'Macintosh',maxTouchPoints:5});
    assert.deepEqual(seen,{derivedReads:0,derivedWrites:0,conversions:1});
  });
  test('desktop with enough RAM retains derived cache read/write',async()=>{
    const seen=await workerCase({constrainedClient:false,ua:'Macintosh',maxTouchPoints:0,memory:16});
    assert.deepEqual(seen,{derivedReads:1,derivedWrites:1,conversions:1});
  });
  test('low-memory desktop and Android continue skipping derived clones',async()=>{
    for(const options of [{constrainedClient:false,ua:'Macintosh',memory:2},{constrainedClient:false,ua:'Android',memory:8}])
      assert.deepEqual(await workerCase(options),{derivedReads:0,derivedWrites:0,conversions:1});
  });
  test('loader forwards touch constraint through the Worker message',async()=>{
    let posted,terminated=0;
    class MockWorker {
      constructor(_url,options){assert.equal(options.type,'module');}
      postMessage(msg){posted=msg;queueMicrotask(()=>this.onmessage({data:{result:{ok:true}}}));}
      terminate(){terminated++;}
    }
    const context=vm.createContext({console,Worker:MockWorker,URL,DOMException,queueMicrotask});
    const build=moduleFrom(context,{nativeStageBuild:{runtimeSha256:'checksum',mode:'browser-direct'}});
    const browser=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/source-data.mjs',import.meta.url),'utf8'),{context,initializeImportMeta(meta){meta.url='file:///inkwave/patches/native-stages/runtime/source-data.mjs';}});
    await browser.link(spec=>{if(spec==='./source-catalog.mjs')return moduleFrom(context,{SOURCE_RECIPE:'recipe',SOURCE_STAGES:[{id:'stage',tree:'tree'}]});assert.equal(spec,'./build-config.mjs');return build;});
    await browser.evaluate();
    assert.equal((await browser.namespace.loadBrowserSource('stage',undefined,{constrained:true})).ok,true);
    assert.equal(posted.constrainedClient,true);
    assert.equal(posted.runtimeSha256,'checksum');
    assert.equal(terminated,1);
    assert.equal((await browser.namespace.loadBrowserSource('stage',undefined,{constrained:false})).ok,true);
    assert.equal(posted.constrainedClient,false);
  });
  test('native data loader forwards memory options only for browser-direct mode',async()=>{
    let args;
    const context=vm.createContext({});
    const link={
      'three':moduleFrom(context,{}),
      './registry.mjs':moduleFrom(context,{nativeStageURL(){throw Error('local assets not selected');}}),
      './build-config.mjs':moduleFrom(context,{nativeStageBuild:{mode:'browser-direct'}}),
      './source-data.mjs':moduleFrom(context,{loadBrowserSource(...a){args=a;return {ok:true};}}),
      './source-cache.mjs':moduleFrom(context,{sourceBytes(){throw Error('not used');}})
    };
    const loaded=new vm.SourceTextModule(fs.readFileSync(new URL('../runtime/native-load.mjs',import.meta.url),'utf8'),{context});
    await loaded.link(spec=>{assert(link[spec],spec);return link[spec];});await loaded.evaluate();
    const policy={constrained:true};
    assert.equal((await loaded.namespace.loadNativeData('stage',undefined,policy)).ok,true);
    assert.equal(args[2],policy);
  });
}
