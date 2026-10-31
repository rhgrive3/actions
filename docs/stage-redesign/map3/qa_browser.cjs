// Local offline artifact QA. Set PLAYWRIGHT_MODULE and CHROMIUM_PATH if needed.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=__dirname;
(async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const report={scope:'Isolated offline design viewer only; not INKWAVE runtime, no mobile hardware claim',sourceSha256:require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,'blockout.html'))).digest('hex'),tests:[],errors:[],externalRequests:[]};
 async function page(viewport){const p=await browser.newPage({viewport});p.on('pageerror',e=>report.errors.push(e.message));await p.route('**/*',async route=>{if(route.request().url().startsWith('file:'))return route.continue();report.externalRequests.push(route.request().url());return route.abort();});await p.goto('file://'+path.join(root,'blockout.html'));await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(300);return p;}
 let p=await page({width:1440,height:1000});
 report.tests.push({name:'desktop initialization',result:await p.evaluate(()=>({title:document.title,webgl:!!gl,stages:document.querySelectorAll('#stage option').length,floorLayers:document.querySelectorAll('#levels input').length,routeOptions:document.querySelectorAll('#route option').length,vertices:vertices.length/9,canvas:[canvas.width,canvas.height]}))});
 await p.screenshot({path:path.join(root,'figures','blockout-desktop.png')});
 await p.locator('#route').selectOption('A_market');await p.locator('#play').click();await p.waitForTimeout(500);
 const moving=await p.evaluate(()=>({distance:pathDistance,avatar:avatarPoint(),playing}));report.tests.push({name:'route playback advances in XYZ',result:moving});
 if(!(moving.distance>0))throw Error('Route did not advance');
 await p.locator('#stage').selectOption('1');await p.locator('#lowerLevels').click();await p.locator('#showRamps').uncheck();await p.locator('#topView').click();await p.waitForTimeout(250);
 report.tests.push({name:'Kelpline lower cut',result:await p.evaluate(()=>({stage:design.id,visible:[...visibleLevels],route:route.id,ramps:document.querySelector('#showRamps').checked,objects:objects.filter(isVisible).length}))});
 await p.screenshot({path:path.join(root,'figures','blockout-lower.png')});
 await p.locator('#allLevels').click();await p.locator('#showRamps').check();await p.locator('#objectSelect').selectOption('A_high_gantry');await p.locator('#focus').click();
 report.tests.push({name:'object coordinate inspection',result:{text:await p.locator('#inspect').innerText(),focus:await p.evaluate(()=>target)}});
 await p.close();
 p=await page({width:390,height:844});await p.locator('#stage').selectOption('1');await p.waitForTimeout(200);
 report.tests.push({name:'390px mobile layout',result:await p.evaluate(()=>({viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,canvas:canvas.getBoundingClientRect().toJSON(),panel:document.querySelector('.panel').getBoundingClientRect().toJSON()}))});
 await p.screenshot({path:path.join(root,'figures','blockout-mobile.png'),fullPage:true});
 await p.close();await browser.close();
 if(report.errors.length||report.externalRequests.length)throw Error(JSON.stringify(report));
 if(report.tests.at(-1).result.scrollWidth>390)throw Error('Mobile horizontal overflow');
 report.pass=true;fs.writeFileSync(path.join(root,'browser-qa.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,tests:report.tests.map(t=>t.name),errors:report.errors,externalRequests:report.externalRequests}));
})().catch(e=>{console.error(e);process.exit(1)});
