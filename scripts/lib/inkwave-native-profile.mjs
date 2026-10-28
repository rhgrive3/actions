// Distinct diagnostic populations; no game-state, clock or security changes.
export function nativeDiagnosticProfile(name='standard'){
 const profiles={standard:{width:960,height:720},compact:{width:640,height:480},'compact-low':{width:640,height:480}};
 if(!Object.hasOwn(profiles,name))throw Error('Unsupported native diagnostic profile');
 const label=name==='standard'?'standard-960x720-dpr1':name==='compact'?'compact-640x480-dpr1-diagnostic':'compact-low-640x480-dpr1-diagnostic';
 return {name,viewport:{...profiles[name]},deviceScaleFactor:1,label};
}
