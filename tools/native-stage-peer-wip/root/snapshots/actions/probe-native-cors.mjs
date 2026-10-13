import {chromium} from 'playwright';
const p=process.env.HTTPS_PROXY?new URL(process.env.HTTPS_PROXY):null;
const proxy=p?{server:p.origin,username:decodeURIComponent(p.username),password:decodeURIComponent(p.password),bypass:'127.0.0.1,localhost'}:undefined;
const b=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,proxy,args:['--no-sandbox']});
try{const page=await b.newPage();await page.goto('https://rhgrive3.github.io/actions/',{waitUntil:'domcontentloaded'});console.log(await page.evaluate(async()=>{const r=await fetch('https://api.github.com/repos/kirakira-dev/KiTrix/git/trees/c5e8f6e5aa14b97a87210ad5df1c91c05b1ab451?recursive=1');const d=await r.json();return {status:r.status,sha:d.sha,files:d.tree?.length,error:d.message};}));}catch(e){console.log(e.name, e.message.replace(/https?:\/\/[^\s]+/g,'[URL]'));process.exitCode=1;}finally{await b.close();}
