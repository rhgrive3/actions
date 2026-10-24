// QA-only: install before any game module can cache Math.random. Reset the
// state of this same closure between cases; never replace the cached function.
export function installDeterministicRollerRandom(){
 let state=123,draws=0;
 const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;draws++;return state/4294967296;};
 globalThis.__rollerQaRandom={random,reset(seed=123){state=seed>>>0;draws=0;},snapshot(){return{state,draws};}};
 Math.random=random;
}
