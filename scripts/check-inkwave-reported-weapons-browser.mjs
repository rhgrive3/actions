import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {enterRangeFromMenu} from './lib/inkwave-range-menu-entry.mjs';
const site=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.mp3':'audio/mpeg'};
const server=http.createServer((q,r)=>{const f=path.resolve(site,'.'+new URL(q.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));if(!f.startsWith(site+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){r.writeHead(404);r.end();return;}r.setHeader('content-type',mime[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(r);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const receipt={build:JSON.parse(fs.readFileSync(path.join(site,'inkwave-build.json'))).contentHash,errors:[],scenes:[]};
try{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:840}});page.on('pageerror',e=>receipt.errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('inkwave.settings',JSON.stringify({quality:'low',lang:'ja'})));
 receipt.entry=await enterRangeFromMenu(page,'http://127.0.0.1:'+server.address().port,{onProgress:s=>console.log('range entry',s.route.join('/'))});
 await page.evaluate(()=>{window.__inkwave.debug.freeze();window.__inkwave.debug.freezeBots();});
 for(const [name,id,action] of [['squid-dry','shooter','squid'],['charger-full','charger','charger'],['scope-repeat','charger_scope','repeat'],['carbon-sub','s3-roller-compact','sub'],['roller-size','roller','hold'],['barrel-audio','splatling','audio'],['trizooka','shooter','special']]){
  const result=await page.evaluate(async({id,action})=>{
   const G=window.__G,g=window.__inkwave,a=G.local,c=a.character,rows=[];
   const {Vector3}=await import('three');
   g.input.keys.clear();g.input.pressed.clear();g.debug.fire(false);g.input.mouse.right=false;
   G.match.range.setWeapon(id);G.match.range.travel('roller');await c.sourceMotion.ready;
   G.projectiles.clear();G.paint.clear();a.pos.set(-26.5,.04,4);a.vel.set(0,0,0);a.yaw=a.aimYaw=0;g.rig.yaw=0;g.rig.pitch=-.3;a.ink=100;
   g.debug.step(1000);
   if(action==='squid'){g.debug.key('ShiftLeft',true);g.debug.step(1000);}
   if(action==='charger'||action==='repeat'){
    let count=0;const original=G.projectiles.fireCharger;G.projectiles.fireCharger=function(...args){count++;return original.apply(this,args);};
    try{for(let cycle=0;cycle<(action==='repeat'?3:1);cycle++){g.debug.fire(true);g.debug.step(1500);rows.push({charge:a.weaponRunner.charge,ink:a.ink});g.debug.fire(false);g.debug.step(500);}}
    finally{G.projectiles.fireCharger=original;}
    rows.push({shots:count,cooldown:a.weaponRunner.cooldown});
   }
   if(action==='sub'){g.input.mouse.right=true;g.debug.step(500);rows.push({stowed:!c.weapon.pivot.visible,bombHeld:c.bombHeld});}
   if(action==='audio'){
    await G.audio.requireRecordedMainShot(id);
    for(const event of ['charge','spin','fire']){
     const clips=G.audio.weaponBank().authorized.byEvent.get(id+':'+event)||[];
     rows.push({event,resident:clips.length>0});
    }
    g.debug.fire(true);g.debug.step(800);
   }
   if(action==='special'){a.special=a.specialCost();g.debug.key('KeyQ',true);g.debug.step(1000/60);g.debug.key('KeyQ',false);g.debug.fire(true);g.debug.step(650);rows.push({active:a.specialActive?.id,shots:a.s3Trizooka?.shots,projectiles:G.projectiles.list.filter(p=>p.wid==='trizooka').length});g.debug.fire(false);}
   if(action==='hold'){c.weapon.def.drum.computeBoundingBox();const b=c.weapon.def.drum.boundingBox;rows.push({drumWidth:b.max.x-b.min.x});}
   c.root.updateMatrixWorld(true);
   let squidAxis=null;if(c.sourceMotion.squidRig){const r=c.sourceMotion.squidRig;r.skeleton.update();const v=n=>r.bones[r.index[n]].getWorldPosition(new Vector3());squidAxis=v('Sqd_head2').sub(v('Sqd_head0')).normalize().toArray();}
   return {id,action,rows,form:a.form,submerged:a.submerged,squidAxis,weaponVisible:c.weapon.pivot.visible,sourceReady:c.sourceMotion.status};
  },{id,action});
  receipt.scenes.push({name,...result});await page.screenshot({path:path.join(out,name+'.png')});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2));console.log(name,JSON.stringify(result));
 }
 assert.equal(receipt.errors.length,0,JSON.stringify(receipt.errors));
 const scope=receipt.scenes.find(s=>s.action==='repeat');assert.equal(scope.rows.at(-1).shots,3);assert(Number.isFinite(scope.rows.at(-1).cooldown));
 assert(receipt.scenes.find(s=>s.action==='sub').rows[0].stowed);
 assert(receipt.scenes.find(s=>s.action==='audio').rows.every(r=>r.resident));
 receipt.status='passed';
}finally{fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(receipt,null,2));await browser?.close();await new Promise(r=>server.close(r));}
