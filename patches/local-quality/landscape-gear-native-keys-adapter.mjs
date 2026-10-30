// Native gear summary/reset controls are not Menus bindings. Let their normal
// activation and Tab focus default run instead of equipping a background card.
const MARK='// Landscape native gear controls keep activation/focus keys.';
export function adaptLandscapeGearNativeKeys(rel,code){
 if(rel!=='src/ui/menus.js')return code;
 if(code.includes(MARK))throw Error('landscape gear keys: repeated transform');
 const anchor="    const countEl = el.querySelector('.iw-seclabel__count');";
 if(code.split(anchor).length!==2)throw Error('landscape gear keys: expected one primary loadout owner');
 return code.replace(anchor,`    ${MARK}
    el.addEventListener('keydown', (event) => {
      if (!['Enter', ' ', 'Tab'].includes(event.key)) return;
      const touch = document.documentElement.classList.contains('iw-touch') || this.el.classList.contains('is-touch');
      if (!touch || !globalThis.matchMedia?.('(orientation: landscape) and (max-width: 1200px)').matches) return;
      const control = event.target?.closest?.('summary, button');
      if (control && el.contains(control) && control.closest('details.s3-gear')) event.stopPropagation();
    });
${anchor}`);
}
