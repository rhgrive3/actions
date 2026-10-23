// A short, privacy-friendly label for a session's device ("Chrome · Windows"). Only for the device list.

const BROWSERS = [
  [/EdgA?\/|Edg\//, 'Edge'], [/OPR\/|Opera/, 'Opera'], [/SamsungBrowser\//, 'Samsung Internet'], [/Firefox\/|FxiOS\//, 'Firefox'],
  [/CriOS\/|Chrome\//, 'Chrome'], [/Version\/[\d.]+.*Safari\//, 'Safari'],
];
const SYSTEMS = [
  [/iPad|Macintosh.*Mobile/, 'iPad'], [/iPhone/, 'iPhone'], [/Android/, 'Android'], [/Nintendo/, 'Nintendo'],
  [/PlayStation/, 'PlayStation'], [/Xbox/, 'Xbox'], [/Windows/, 'Windows'], [/CrOS/, 'ChromeOS'], [/Mac OS X|Macintosh/, 'macOS'], [/Linux/, 'Linux'],
];

export function deviceLabel(ua) {
  const s = String(ua || '');
  if (!s) return '';
  const browser = BROWSERS.find(([re]) => re.test(s))?.[1] || '';
  const system = SYSTEMS.find(([re]) => re.test(s))?.[1] || '';
  return [browser, system].filter(Boolean).join(' · ');
}
