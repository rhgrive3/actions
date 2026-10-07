// Screen rotation in the motion sensor's own frame (0 / 90 / 180 / 270, counter-clockwise device rotation).
//
// DeviceOrientation / DeviceMotion axes follow the sensor frame. Android reports that frame relative to the display's
// natural orientation, which is also what screen.orientation.angle measures, so the angle can be used directly there
// (including landscape-natural tablets, where landscape-primary is angle 0 and the sensor frame is landscape too).
//
// Apple devices differ: CoreMotion's frame is always the portrait frame (home button / short edge at the bottom), on
// iPhone and iPad alike. WebKit, however, declares iPad's natural orientation to be landscape-primary
// (WebCore naturalScreenOrientationType: deviceHasIPadCapability → LandscapePrimary), so on iPad
// screen.orientation.angle reads 0 in landscape-primary, 90 in portrait-primary, 180 in landscape-secondary and 270 in
// portrait-secondary — a different origin AND a different direction than the sensor frame. iPadOS Safari's desktop-
// class mode does not expose the legacy window.orientation that the gyro relied on, so the iPad fell through to that
// angle and every orientation crossed yaw and pitch (landscape most visibly).
//
// The orientation *type* is unambiguous across both natural-orientation conventions (WebPageProxy::
// toScreenOrientationType: window.orientation 90 → landscape-primary, -90 → landscape-secondary), so on Apple devices
// the type is mapped onto the portrait sensor frame instead of trusting the angle.
const APPLE_TYPE_ANGLE = Object.freeze({
  'portrait-primary': 0,
  'landscape-primary': 90,
  'portrait-secondary': 180,
  'landscape-secondary': 270,
});
const norm = (a) => ((Math.round(a / 90) * 90) % 360 + 360) % 360;

/** iPhone / iPod / iPad, including iPadOS reporting a Macintosh UA (same test as src/core/device.js). */
export function appleMotionFrame(env = globalThis) {
  const n = env.navigator || {};
  const ua = typeof n.userAgent === 'string' ? n.userAgent : '';
  return /iPhone|iPod|iPad/.test(ua) || (/Macintosh/.test(ua) && (n.maxTouchPoints || 0) > 1);
}

/** Rotation of the screen relative to the motion sensor frame, in degrees. `legacy` is the upstream screenAngle(). */
export function sensorScreenAngle(env = globalThis, legacy = null) {
  // window.orientation is already expressed in the sensor frame wherever a browser still provides it
  const wo = env.orientation;
  if (typeof wo === 'number' && Number.isFinite(wo)) return norm(wo);
  const so = env.screen?.orientation;
  if (appleMotionFrame(env)) {
    const a = so && APPLE_TYPE_ANGLE[so.type];
    if (a !== undefined) return a;
  }
  if (typeof legacy === 'function') {
    const a = Number(legacy());
    return Number.isFinite(a) ? norm(a) : 0;
  }
  return so && typeof so.angle === 'number' && Number.isFinite(so.angle) ? norm(so.angle) : 0;
}
