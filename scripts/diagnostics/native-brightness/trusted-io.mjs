import assert from 'node:assert/strict';
import crypto from 'node:crypto';
export function initializePair(){
 localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',shadows:false,bloom:false,minimap:false,musicVolume:0}));
 globalThis.__resetPairRandom=()=>{let s=0x12345678;Math.random=()=>{s|=0;s=s+0x6d2b79f5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};};globalThis.__resetPairRandom();
}
export async function connectPair(){globalThis.NG=(await import(new URL('src/core/ctx.js',document.baseURI))).G;globalThis.T=await import(new URL('vendor/three/build/three.module.js',document.baseURI));}
export function pairBooted(){return !!(NG.game?.menus&&NG.mode!=='boot');}
export async function verifyAndDeliverArtifact(route,baseURL,manifest,row){
 const requestURL=new URL(route.request().url()),base=new URL(baseURL);
 if(requestURL.origin!==base.origin||!requestURL.pathname.startsWith(base.pathname))return route.continue();
 const relative=requestURL.pathname.slice(base.pathname.length)||'index.html',expected=manifest.artifacts[relative];
 if(!expected){if(/\.(?:m?js|css)$/.test(relative)){row.errors.push('Unmanifested module '+relative);await route.abort('failed');return;}return route.continue();}
 try{
  const response=await route.fetch({timeout:90000});assert.ok(response.ok(),'Loaded artifact HTTP failure '+relative);
  const headers={...response.headers()},declared=Number(headers['content-length']);assert.ok(!Number.isFinite(declared)||declared<=32*1024*1024,'Artifact size exceeds bound '+relative);
  const bytes=await response.body();assert.ok(bytes.length<=32*1024*1024,'Decoded artifact size exceeds bound '+relative);
  const actual=crypto.createHash('sha256').update(bytes).digest('hex');row.loadedArtifacts.push({path:relative,bytes:bytes.length,sha256:actual,expected,match:actual===expected,method:'intercept-fetch-hash-fulfill'});
  assert.equal(actual,expected,'Loaded artifact hash mismatch '+relative);
  // APIResponse.body is decoded; do not deliver stale compression/length headers.
  delete headers['content-encoding'];delete headers['transfer-encoding'];headers['content-length']=String(bytes.length);
  await route.fulfill({status:response.status(),headers,body:bytes});
 }catch(error){row.errors.push(relative+': '+String(error));await route.abort('failed').catch(()=>{});}
}
export async function verifyPairRequest(route,url,manifest,row){
 const u=new URL(route.request().url());
 if(u.pathname.endsWith('/Vss_Upland03.obj')){
  const pin='0611f51b35c9736ee986fb2218461e2585b7875e';
  assert.equal(u.hostname,'media.githubusercontent.com');assert.equal(u.pathname,`/media/kirakira-dev/KiTrix/${pin}/stages/Vss_Upland03/Vss_Upland03.obj`);
  const response=await route.fetch({timeout:180000});assert.ok(response.ok());const bytes=await response.body();assert.ok(bytes.length<64*1024*1024);
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');assert.equal(sha256,'bef74ead213cfc4c041820319dbac7ab702d5f0f2df86db8369b162879f8b4f3');row.sourceDownloads.push({url:u.href,bytes:bytes.length,sha256});
  const headers={...response.headers()};delete headers['content-encoding'];delete headers['transfer-encoding'];headers['content-length']=String(bytes.length);return route.fulfill({status:response.status(),headers,body:bytes});
 }
 return verifyAndDeliverArtifact(route,url,manifest,row);
}
