// Launch only the requested diagnostic engine; no hidden cross-engine fallback.
export function diagnosticBrowserConfig(engine='chromium',executablePath){
 if(!['chromium','webkit'].includes(engine))throw Error('Unsupported diagnostic browser: '+engine);
 return {engine,launch:engine==='webkit'?{headless:true}:{headless:true,...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-angle=swiftshader','--enable-unsafe-swiftshader']},qualification:engine==='webkit'?'Playwright WebKit on Linux; tablet emulation, not physical iPad Safari':'Chromium SwiftShader; tablet emulation, not physical iPad Safari'};
}
