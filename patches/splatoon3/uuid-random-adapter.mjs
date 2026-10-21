// Three.js object UUIDs must not draw from Math.random.
//
// Every Object3D, Material, BufferGeometry and Texture constructor called
// generateUUID(), which took four Math.random() values. Inside fixed ticks
// Math.random is the gameplay stream (runtime/clock.mjs), and Match.setup
// builds the roster, bot timers and the first draws from it. How many render
// objects a boot creates depends on what earlier boots or async loads have
// cached (one fresh browser: 14,773 vs 15,567 draws in Match.setup), so the
// same seed gave other bot loadouts and later bot/weapon randomness. UUIDs
// are only identity keys: take them from crypto.getRandomValues, keeping the
// same format, and fall back to Math.random only where crypto is missing.
const ORIGINAL = `	const d0 = Math.random() * 0xffffffff | 0;
	const d1 = Math.random() * 0xffffffff | 0;
	const d2 = Math.random() * 0xffffffff | 0;
	const d3 = Math.random() * 0xffffffff | 0;`;
const REPLACEMENT = `	// INKWAVE: identity keys never consume the gameplay Math.random stream.
	const _w = _uuidWords;
	if ( globalThis.crypto && globalThis.crypto.getRandomValues ) globalThis.crypto.getRandomValues( _w );
	else for ( let i = 0; i < 4; i ++ ) _w[ i ] = Math.random() * 0xffffffff;
	const d0 = _w[ 0 ] | 0;
	const d1 = _w[ 1 ] | 0;
	const d2 = _w[ 2 ] | 0;
	const d3 = _w[ 3 ] | 0;`;
export function adaptUuidRandom(rel, code, replaceOnce) {
  if (rel !== 'vendor/three/build/three.core.js') return code;
  if (code.includes('identity keys never consume the gameplay Math.random stream')) return code;
  code = replaceOnce(code, ORIGINAL, REPLACEMENT, 'three generateUUID random source');
  return replaceOnce(code, 'function generateUUID() {', 'const _uuidWords = new Uint32Array( 4 );\nfunction generateUUID() {', 'three generateUUID scratch');
}
