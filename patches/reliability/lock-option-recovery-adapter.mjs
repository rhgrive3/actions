// Draft: retain a successful raw-failure -> plain-lock pair only for its own
// live Input, match/flow and document. A later user activation may prefer plain.
function once(s,a,b,label){const i=s.indexOf(a);if(i<0||s.indexOf(a,i+a.length)>=0)throw Error('Lock option recovery anchor '+label);return s.slice(0,i)+b+s.slice(i+a.length);}
export function adaptLockOptionRecovery(rel,code){
 if(rel!=='src/core/input.js')return code;
 code=once(code,"    if (v === 'touch') this._releaseMouseForTouch();", "    if (v === 'touch') { this._pointerLockPlainPreference = null; this._releaseMouseForTouch(); }",'touch retires preference');
 code=once(code,"  exitLock() {\n    this._pointerLockCancelled = true;", "  exitLock() {\n    if (this._pointerLockPending) this._pointerLockPlainPreference = null;\n    this._pointerLockCancelled = true;",'pending cancellation retires preference');
 code=once(code,'  requestLock() {',`  _preferPlainPointerLock() {
    const p = this._pointerLockPlainPreference;
    if (!p) return false;
    let same = false;
    try { same = this.enabled && p.document === document && this.canvas.ownerDocument === document && p.game === G.game && p.match === G.match && (p.flow ? p.flow === G.game?._matchFlow && !!p.flow.current?.() : !G.game?._matchFlow); } catch { /* unknown owner is stale */ }
    if (!same) { this._pointerLockPlainPreference = null; return false; }
    return navigator.userActivation?.isActive === true && this.lastDevice !== 'touch' && !this._touchUnlockPending && !this._touchLockAdmissionBlocked && !this.mobile?.editing && !this.mobile?.mapOpen && G.mode === 'match' && G.match?.state === 'playing' && !G.match.paused && !G.match.attract && !G.game?.menus?.current;
  }

  requestLock() {`,'preference admission');
 code=once(code,"    const ticket = this._pointerLockPending = { mode: G.mode, match: G.match, playing: G.mode === 'match' && G.match?.state === 'playing', cancelled: false, errorObserved: false };", "    const ticket = this._pointerLockPending = { mode: G.mode, match: G.match, playing: G.mode === 'match' && G.match?.state === 'playing', cancelled: false, errorObserved: false, attract: !!G.match?.attract, raw: !this._preferPlainPointerLock(), game: G.game, flow: G.game?._matchFlow, document: this.canvas.ownerDocument, generation: this._pointerLockGeneration = (this._pointerLockGeneration || 0) + 1 };",'ticket owner');
 code=once(code,"      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });", "      const p = ticket.raw ? this.canvas.requestPointerLock({ unadjustedMovement: true }) : this.canvas.requestPointerLock();",'same-gesture preference');
 const before="      if (p && p.catch) p.catch(error => { if (!ticket.errorObserved || error?.name !== 'NotSupportedError' || !this._pointerLockRequestCurrent(ticket) || !this.enabled || this.lastDevice === 'touch' || this._touchUnlockPending || this._touchLockAdmissionBlocked || this.mobile?.editing || this.mobile?.mapOpen || G.mode !== 'match' || G.match?.state !== 'playing' || G.match.paused || G.game?.menus?.current) { this._finishPointerLockRequest(ticket); return; } try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => { this._finishPointerLockRequest(ticket); }); } catch { this._finishPointerLockRequest(ticket); } });";
 const after=`      if (p && p.catch) p.catch(error => {
        const current = this._pointerLockRequestCurrent(ticket);
        let unsupported = false;
        try { unsupported = ticket.raw && ticket.errorObserved === true && error?.name === 'NotSupportedError'; } catch { /* unknown denial: no retry */ }
        const sameDocument = () => ticket.document === document && this.canvas.ownerDocument === ticket.document;
        const sameOwner = () => { try { return ticket.game === G.game && ticket.match === G.match && (ticket.flow ? (ticket.flow === G.game?._matchFlow && !!ticket.flow.current?.()) : (ticket.playing && !G.game?._matchFlow)); } catch { return false; } };
        const mayAffectOwner = () => ticket.generation === this._pointerLockGeneration && (!this._pointerLockPending || this._pointerLockPending === ticket) && sameDocument() && sameOwner();
        if (!unsupported && current && mayAffectOwner()) this._pointerLockPlainPreference = null;
        const ownerAllowed = current && sameDocument() && this.enabled && this.lastDevice !== 'touch' && !this._touchUnlockPending && !this._touchLockAdmissionBlocked && !this.mobile?.editing && !this.mobile?.mapOpen;
        if (!unsupported || !ownerAllowed || !sameOwner() || !ticket.playing || ticket.attract || G.mode !== 'match' || G.match?.state !== 'playing' || G.match.paused || G.game?.menus?.current) { this._finishPointerLockRequest(ticket); return; }
        try {
          const q = this.canvas.requestPointerLock();
          if (q && q.catch) {
            const failed = () => { if (mayAffectOwner()) this._pointerLockPlainPreference = null; this._finishPointerLockRequest(ticket); };
            const succeeded = () => { try {
              const stableFlow = ticket.flow ? (ticket.flow === G.game?._matchFlow && !!ticket.flow.current?.()) : !G.game?._matchFlow;
              if (ticket.playing && !ticket.attract && !ticket.cancelled && !this._pointerLockCancelled && ticket.generation === this._pointerLockGeneration && (!this._pointerLockPending || this._pointerLockPending === ticket) && this.enabled && this.lastDevice !== 'touch' && !this._touchUnlockPending && !this._touchLockAdmissionBlocked && !this.mobile?.editing && !this.mobile?.mapOpen && ticket.document === document && this.canvas.ownerDocument === ticket.document && ticket.game === G.game && ticket.match === G.match && stableFlow && G.mode === 'match' && G.match?.state === 'playing' && !G.match.paused && !G.match.attract && !G.game?.menus?.current && document.pointerLockElement === this.canvas)
                this._pointerLockPlainPreference = { document, game: ticket.game, match: ticket.match, flow: ticket.flow };
            } catch { /* unknown state never establishes preference */ } };
            if (typeof q.then === 'function') q.then(succeeded, failed); else q.catch(failed);
          }
        } catch { if (mayAffectOwner()) this._pointerLockPlainPreference = null; this._finishPointerLockRequest(ticket); }
      });`;
 return once(code,before,after,'only unsupported raw movement can fallback');
}
