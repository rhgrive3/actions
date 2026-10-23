// Self-contained so Playwright can install this exact function in the browser.
// Reject missing/nonfinite state: hashing NaN payload bits is not a valid
// gameplay comparison and can differ between JavaScript execution tiers.
export function installCpuStateHash(env=globalThis){
 const f64=new Float64Array(1),u32=new Uint32Array(f64.buffer);let value=2166136261;
 const mix=x=>{value=Math.imul(value^x,16777619)>>>0;};
 const api={mix,number(input){const n=+input;if(!Number.isFinite(n))throw Error('Nonfinite or missing CPU workload state');f64[0]=n;mix(u32[0]);mix(u32[1]);},get value(){return value;}};
 env.cpuBenchStateHash=api;return api;
}
