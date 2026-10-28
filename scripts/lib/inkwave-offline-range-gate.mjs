// A per-context diagnostic barrier, not an OS firewall. Install before creating
// pages; never supply credentials, rewrite gameplay responses, or retry blocked
// network actions. The exact pinned 701 service worker is separately audited.
export async function installOfflineRangeGate(context,origin) {
  let base;
  try { base=new URL(origin); } catch { throw Error('Invalid offline Range origin'); }
  if (typeof origin!=='string' || base.origin!==origin || base.protocol!=='http:' ||
      base.hostname!=='127.0.0.1' || !base.port || base.username || base.password ||
      base.pathname!=='/' || base.search || base.hash) throw Error('Invalid offline Range origin');
  if (!context || typeof context.route!=='function' || typeof context.routeWebSocket!=='function')
    throw Error('Offline Range route enforcement unavailable');
  let count=0,first=null;const kinds=[];let resolveViolation;
  const whenViolated=new Promise(resolve=>{resolveViolation=resolve;});
  const mark=kind=>{count++;if(kinds.length<16)kinds.push(kind);if(first===null){first=kind;resolveViolation(Object.freeze({kind}));}};
  await context.route('**/*',async route=>{
    let allowed=false;
    try { const req=route.request(),u=new URL(req.url());allowed=u.origin===origin &&
      u.protocol==='http:' && !u.username && !u.password && ['GET','HEAD'].includes(req.method()); }
    catch { /* malformed/unknown requests fail closed */ }
    if(!allowed){mark('blocked-http');try{await route.abort('blockedbyclient');}catch{mark('route-error');}return;}
    try{await route.continue();}catch{mark('route-error');}
  });
  await context.routeWebSocket('**/*',async socket=>{
    mark('blocked-websocket');try{await socket.close();}catch{mark('websocket-close-error');}
  });
  return Object.freeze({
    assert(){if(first!==null)throw Error('Offline Range network barrier tripped; stop input');},
    whenViolated,
    snapshot(){return {violated:first!==null,count,kinds:[...kinds],omittedKinds:Math.max(0,count-kinds.length)};},
  });
}
