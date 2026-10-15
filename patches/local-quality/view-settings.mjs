// The existing INKWAVE settings sliders define these ranges. They are browser
// camera/mouse settings, not Nintendo camera or stick calibration values.
const ranges = {fov:[65,100], sensitivity:[.2,3]};
export function normalizeViewSettings(settings, defaults) {
  for (const [key,[min,max]] of Object.entries(ranges)) {
    if (!Object.hasOwn(settings,key)) continue;
    const value = Number.isFinite(settings[key]) ? settings[key] : defaults[key];
    settings[key] = Math.max(min,Math.min(max,value));
  }
  return settings;
}
