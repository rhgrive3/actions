// A START may reuse the same gesture-primed media as a newer START. Ownership
// must be checked separately from the HTMLMediaElement's identity.
const OWNER=Symbol('battle preload owner');
export function claimPreloadedMusic(engine,owner){
  const pending=engine?._preloadedFile;
  if(!pending)return null;
  pending[OWNER]=owner;
  return {engine,pending,owner};
}
export function cancelPreloadedMusic(claim){
  if(!claim||claim.engine?._preloadedFile!==claim.pending||claim.pending[OWNER]!==claim.owner)return false;
  claim.engine._dropPreload();
  return true;
}
