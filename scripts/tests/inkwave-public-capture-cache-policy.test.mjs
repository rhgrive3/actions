import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {serveProjectileCaptureFile} from '../lib/inkwave-projectile-http-file.mjs';

const root=new URL('../../',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const descriptorBytes=fs.readFileSync(new URL('../fixtures/inkwave-public-capture-cache-revalidation-1915.json',import.meta.url));
assert.equal(hash(descriptorBytes),'b775bd5c45fff5211cabd366d649f1522f6e79ad63b8f58181fe64fd2d91b9a7','independently sealed public-capture header epoch');
const epoch=JSON.parse(descriptorBytes);
// Preserve the independent #1915 header seal. The new cinematic changes only
// advanceFrozenNativeIntro; invert that separately sealed, reviewed method
// before the historical whole-file/header checks below. No producer is edited.
const introBytes=fs.readFileSync(new URL('../fixtures/inkwave-turf-intro-capture-alignment-20261030.json',import.meta.url));
assert.equal(hash(introBytes),'359a8d943eec93b2d522c2d7964a561efde3899f34cead4dab025ffec0ebbf40');
const intro=JSON.parse(introBytes);
function alignIntro(source) {
  assert.equal(hash(source),intro.currentSha256,'complete new intro producer');
  assert.equal(source.split(intro.current).length,2,'one reviewed intro method');
  const prior=source.replace(intro.current,intro.prior);
  assert.equal(hash(prior),intro.priorSha256,'all non-intro bytes retain the independent header epoch');
  return prior;
}
assert.equal(epoch.schema,1);
assert.equal(epoch.priorCommit,'515f9ebe5a34e5e74a6bfcd0b0beded60ead591b');
assert.deepEqual(epoch.files.map(row=>row.path),['scripts/check-inkwave-browser.mjs','scripts/lib/inkwave-projectile-http-file.mjs']);
function restore(source,row) {
  assert.equal(hash(source),row.currentSha256,'complete reviewed current source');
  assert.equal(source.split(row.current).length,2,'one exact reviewed header hunk');
  const prior=source.replace(row.current,row.prior);
  assert.equal(hash(prior),row.priorSha256,'complete original source including all strict admission/workload code');
  return prior;
}
const sources=epoch.files.map(row=>{
  const raw=fs.readFileSync(new URL(row.path,root),'utf8');
  const current=row.path===intro.path?alignIntro(raw):raw;
  return {row,current,prior:restore(current,row)};
});

test('intro alignment rejects unrelated, incomplete, duplicate and no-op source changes',()=>{
  const raw=fs.readFileSync(new URL(intro.path,root),'utf8');
  assert.equal(hash(alignIntro(raw)),epoch.files[0].currentSha256);
  for(const source of ['',raw+'\n',raw.replace(intro.current,intro.prior),raw.replace(intro.current,intro.current+intro.current),raw.replace('no-cache, max-age=0, must-revalidate','no-store')])
    assert.throws(()=>alignIntro(source));
});

test('only the two exact reviewed header hunks invert to complete historical sources',()=>{
  for(const {row,current,prior} of sources) {
    assert.notEqual(current,prior);
    for(const changed of ['',prior,current+'\n',current.replace(row.current,row.current+row.current),current.replace('no-cache, max-age=0, must-revalidate','no-store')]) {
      assert.throws(()=>restore(changed,row),'blank, old/no-op, unrelated edits, duplicate and reverted policy fail closed');
    }
    assert.equal(restore(current,row),prior);
  }
});

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mp3':'audio/mp3'};
function activeHandler(source,site) {
  const start=source.indexOf('const server=http.createServer(');
  const end=source.indexOf("await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));",start);
  assert.ok(start>=0&&end>start,'actual active-server boundaries');
  return vm.runInNewContext(source.slice(start,end)+'\nserver.listeners("request")[0];',{http,fs,path,site,mime,URL});
}
function priorProjectileHandler(source) {
  const body=source.replace("import fs from 'node:fs';\n",'').replace("import path from 'node:path';\n",'').replace('export function serveProjectileCaptureFile','function serveProjectileCaptureFile');
  return vm.runInNewContext(body+'\nserveProjectileCaptureFile;',{fs,path});
}
function projectileHandler(serve,site) {
  return (request,response)=>{
    try {
      const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
      const file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(site+path.sep)||!fs.statSync(file).isFile())throw Error('Missing');
      serve(request,response,file,mime);
    }catch {response.writeHead(404);response.end('Not found');}
  };
}
async function listen(handler,t) {
  let requests=0;
  const server=http.createServer((req,res)=>{requests++;handler(req,res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return {requests:()=>requests,request:({url='/assets/music.mp3',method='GET',range,headers={}}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers:{connection:'close',...headers,...(range===undefined?{}:{range})}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);res.on('end',()=>{
        const normalized={...res.headers};delete normalized.date;
        resolve({status:res.statusCode,headers:normalized,body:Buffer.concat(chunks).toString()});
      });
    });req.on('error',reject);req.end();
  })};
}

for(const kind of ['active','projectile'])test(kind+' actual HTTP preserves prior responses except public GET200 non-HTML revalidation',async t=>{
  const site=fs.mkdtempSync(path.join(os.tmpdir(),'public-capture-cache-'));
  t.after(()=>fs.rmSync(site,{recursive:true,force:true}));
  fs.mkdirSync(path.join(site,'assets'));
  fs.mkdirSync(path.join(site,'_versions/reviewed/assets'),{recursive:true});
  for(const [relative,body] of [['index.html','<html>fixture</html>'],['assets/music.mp3','0123456789'],['_versions/reviewed/assets/music.mp3','0123456789'],['module.js','export {};'],['empty.mp3','']])fs.writeFileSync(path.join(site,relative),body);
  const pair=kind==='active'
    ? [activeHandler(sources[0].prior,site),activeHandler(sources[0].current,site)]
    : [projectileHandler(priorProjectileHandler(sources[1].prior),site),projectileHandler(serveProjectileCaptureFile,site)];
  const [prior,current]=await Promise.all(pair.map(handler=>listen(handler,t)));
  for(const spec of [
    {},{url:'/_versions/reviewed/assets/music.mp3'},{url:'/module.js'},{url:'/empty.mp3'},
    {url:'/'},{url:'/index.html'},{method:'HEAD'},{method:'HEAD',range:'bytes=2-4'},
    {method:'POST'},...['bytes=0-','bytes=2-4','bytes=-3','bytes=99-','bytes=0-1,3-4'].map(range=>({range})),
    {url:'/missing.mp3'},{url:'/%'},{url:'/%2e%2e/outside.mp3'},
  ]) {
    const [oldResponse,newResponse]=await Promise.all([prior.request(spec),current.request(spec)]);
    const change=(spec.method??'GET')==='GET'&&oldResponse.status===200&&!['/','/index.html'].includes(spec.url);
    if(change) {
      assert.equal(oldResponse.headers['cache-control'],'no-store');
      assert.equal(newResponse.headers['cache-control'],'no-cache, max-age=0, must-revalidate');
      oldResponse.headers['cache-control']=newResponse.headers['cache-control'];
    }
    assert.deepEqual(newResponse,oldResponse,JSON.stringify(spec)+' preserves status, MIME, lengths, ranges and exact body');
  }
  const before=current.requests();
  for(let i=0;i<2;i++) {
    const response=await current.request({headers:{'if-none-match':'"stale"','if-modified-since':'Wed, 01 Jan 2020 00:00:00 GMT'}});
    assert.equal(response.status,200);assert.equal(response.body,'0123456789');
    assert.equal(response.headers['cache-control'],'no-cache, max-age=0, must-revalidate');
  }
  assert.equal(current.requests()-before,2,'each revalidation reaches the server and returns verified full bytes');
});
