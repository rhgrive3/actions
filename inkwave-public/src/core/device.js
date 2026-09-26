// Device / input-profile detection. One place decides whether this is a phone, a tablet or a desktop, so menus,
// HUD and controls never disagree (e.g. an iPad must never be shown keyboard prompts like [Enter] / [Esc]).
//
//   touchPrimary  — the device is operated by fingers (phones, tablets incl. iPadOS that reports a Mac UA).
//                   Touchscreen laptops keep a fine primary pointer and stay on keyboard + mouse.
//   touchCapable  — any touch input exists (hybrids can switch to touch controls on the first real touch).
const mq = (q) => { try { return typeof matchMedia === 'function' && matchMedia(q).matches; } catch { return false; } };

const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const tp = (typeof navigator !== 'undefined' && navigator.maxTouchPoints) || 0;

export const isIPadOS = /iPad/.test(ua) || (/Macintosh/.test(ua) && tp > 1);
export const isIOS = /iPhone|iPod/.test(ua) || isIPadOS;
export const isAndroid = /Android/i.test(ua);
const mobileUA = isIOS || isAndroid || /Mobi|Tablet|Silk|Kindle|PlayBook|BB10|Opera Mini|IEMobile/i.test(ua);

export const touchCapable = tp > 0 || (typeof window !== 'undefined' && 'ontouchstart' in window);
export const touchPrimary = touchCapable && (mobileUA || mq('(pointer: coarse)') || (mq('(hover: none)') && !mq('(pointer: fine)')));

/** Short side of the screen in CSS px (orientation independent). */
export const shortSide = () => Math.min(screen.width || innerWidth, screen.height || innerHeight);
/** Phones have a short side under ~600 CSS px; everything touch-primary above that is a tablet. */
export const isPhone = () => touchPrimary && shortSide() < 600;
export const isTablet = () => touchPrimary && !isPhone();

export const deviceProfile = () => ({
  ios: isIOS, ipad: isIPadOS, android: isAndroid,
  touch: touchPrimary, touchCapable, phone: isPhone(), tablet: isTablet(),
});

/** Current screen rotation in degrees (0 / 90 / 180 / 270, counter-clockwise device rotation). */
export function screenAngle() {
  // iOS keeps the legacy window.orientation (−90 / 0 / 90 / 180) and it is the most reliable there
  const wo = typeof window !== 'undefined' ? window.orientation : undefined;
  let a = typeof wo === 'number' ? wo : (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : 0);
  a = ((Math.round(a / 90) * 90) % 360 + 360) % 360;
  return a;
}

// Tag the document early so CSS can adapt before any UI is built.
if (typeof document !== 'undefined') {
  const de = document.documentElement;
  de.classList.toggle('iw-touch', touchPrimary);
  de.classList.toggle('iw-phone', isPhone());
  de.classList.toggle('iw-tablet', isTablet());
  de.classList.toggle('iw-ios', isIOS);
}
