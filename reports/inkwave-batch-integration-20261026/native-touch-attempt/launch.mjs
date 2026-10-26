import {chromium} from 'playwright';
let browser;
try {
  browser=await chromium.launch({executablePath:'/usr/bin/chromium',chromiumSandbox:true,args:['--use-angle=swiftshader']});
  console.log(JSON.stringify({launched:true,version:browser.version(),sandbox:true}));
} catch(error) { console.error(error.stack); process.exitCode=1; }
finally { await browser?.close(); }
