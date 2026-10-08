// Relative Euler-channel traces sampled from the user's Splatoon 1 (Wii U) Player00_anim.szs.
// 2 source frames per sample; per-clip means subtracted; signed milliradians (int16 LE).
// NOT Splatoon 3 animation data, original bind-pose angles, or a verified playback-speed law.
// Channel order: hip XYZ, root XYZ, thigh L/R X, shin L/R X, foot L/R X, upper-arm L/R Y.
export const LEGACY_GAIT_INFO = Object.freeze({
  game: 'Splatoon (Wii U)', source: 'Player00_anim.szs', walkFrames: 40,
  runFrames: 32, storedFrameStep: 2, calibratedRuntimeRate: false,
});
const CHANNELS = 14;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decode(encoded) {
  const result = [], alpha = ALPHABET;
  let buffer = 0, bits = 0, low = -1;
  for (const letter of encoded) {
    if (letter === '=') break;
    const n = alpha.indexOf(letter);
    if (n < 0) throw Error('Invalid legacy walk channel encoding');
    buffer = (buffer << 6) | n; bits += 6;
    if (bits >= 8) {
      bits -= 8; const byte = (buffer >>> bits) & 255;
      if (low < 0) low = byte;
      else { const raw = low | (byte << 8); result.push(raw >= 32768 ? raw - 65536 : raw); low = -1; }
    }
  }
  if (low !== -1 || result.length % CHANNELS !== 0 || result.length < 16 * CHANNELS)
    throw Error('Truncated Splatoon gait reference');
  return Int16Array.from(result);
}
const clips = Object.fromEntries(Object.entries({"unarmed":"Vv8AAFMA2f8BAOn/PAPX/wj8SgOC/1X/UwB2/3n/AABIAOr/JwDz/3YCK/4W/jID6P6P/r7/wP/N/wAANwABAEsA/f9xAcT8KgArAs3+Iv5S/w4AMgAAACIAFwBoAAgAwAAh/IkBygAZ/1b+Cf9bAIcAAAALACYAfAASAJkA9PtSAsL/Uf8TAOH+pQCqAAAA8/8mAIMAHADBAHH8iwLq/o//YAHV/uUAhwAAANz/GAB6ACYA9AAg/lICQ/0YALAB4v4aATMAAADI/wEAYQApADIB5f9BAib8ZAB1AQT/PQHO/wAAt//q/0AAIABFATcBnQIm/DsAlwA2/0UBef8AAK//2v8dABkA1wBnAhIDJvwTAMv/dv8nAVb/AACw/9n//f8RALD/KQNiAyb8q/9Q/7//2gB5/wAAuf/o/97/CQAG/gcD+wL0/Cj/W/8MAFIAzv8AAMn///+9/wIA1PzFAYIBeP/j/jj/WgC+/zMAAADe/xYAnv/6/2r8/gDZ//AAEv/B/6UAUv+HAAAA9f8mAIj/8/9h/KsAv/7yAb0AKwDmAAn/qgAAAAwAJwCA/+v/4/zEAP/9KwL0AYEAGgHg/ocAAAAjABgAhv/k/8H+DgEI/MsBagLwAD0B1P4yAAAANwAAAJn/3P/4/1gBCPyvAaIB+ABFAeH+zf8AAEgA6f+3/9T/TAFeAQj8MgLLAHsAJwED/3n/AABSANn/2v/f/3wC8AAI/NMC//8EANoANf8=","forward":"Vv8AAFMA2f8BAOn/PAPX/wj8SgOC/1X/5f8AAHn/AABIAOr/JwDz/3YCK/4W/jID6P6P/uf/AADN/wAANwABAEsA/f9xAcT8KgArAs3+Iv7r/wAAMgAAACIAFwBoAAgAwAAh/IkBygAZ/1b+8f8AAIcAAAALACYAfAASAJkA9PtSAsL/Uf8TAPj/AACqAAAA8/8mAIMAHADBAHH8iwLq/o//YAH//wAAhwAAANz/GAB6ACYA9AAg/lICQ/0YALABBwAAADMAAADI/wEAYQApADIB5f9BAib8ZAB1AQ4AAADO/wAAt//q/0EAIABFATcBnQIm/DsAlwATAAAAef8AAK//2v8dABkA1wBnAhIDJvwTAMv/FwAAAFb/AACw/9n//f8RALD/KQNiAyb8q/9Q/xkAAAB5/wAAuf/o/97/CQAG/gcD+wL0/Cj/W/8YAAAAzv8AAMn///+9/wIA1PzFAYIBeP/j/jj/FgAAADMAAADe/xYAnv/6/2r8/gDZ//AAEv/B/xAAAACHAAAA9f8mAIj/8/9h/KsAv/7yAb0AKwAJAAAAqgAAAAwAJwCA/+v/4/zEAP/9KwL0AYEAAQAAAIcAAAAjABgAhv/k/8H+DgEI/MsBagLwAPr/AAAyAAAANwAAAJn/3P/4/1gBCPyvAaIB+ADy/wAAzf8AAEgA6f+3/9X/TAFeAQj8MgLLAHsA7P8AAHn/AABSANn/2v/f/3wC8AAI/NMC//8EAOj/AAA=","backward":"Vv8AAAIB2f8AAOn/mAHX/nr/TALy/QsAkAAnAHn/AADjAOr/AADz/1b/HgGDAIYCjP2i/r0AegDN/wAAsQABAAAA/f+A/awCsQC9AYj+cv6+AJgAMgAAAG8AFwAAAAgAkfxbA+f/BQGCAJT+pwCkAIcAAAAmACYAAAASAFb84gIN/+0ALgJb/o4AuwCqAAAA2/8mAAAAHACk/JcBhf4OAWUCIf7z/1IAhwAAAJP/GAAAACYAEf1bAYX+VgATAsT+6f6I/zMAAABR/wEAAAApANf9lAKF/iL/GwNe/1z+Yf/O/wAAHf/q/wAAIABj/cEDKv9I/loDkv/T/hYAef8AAP/+2v8AABkAgP2uA1cASP6oAin/bf+NAFb/AAD//tn/AAARANz+5QFEAk7/QwAq/v//0wB5/wAAHf/o/wAACQAhAXj/jwJ2ALb+m/1mANgAzv8AAFP///8AAAIA0wJv/bkBywB2/nf+nQC4ADMAAACV/xYAAAD6/7QDR/zjAB8Ap/5ZAK8AmACHAAAA3f8mAAAA8/9oAxX8pgAt/63+JgKuAJcAqgAAACMAJwAAAOv/vAH3/N0ASP6H/tACNQDj/4cAAABpABgAAADk/1MBaf1FAEj+7v58AnP//P0yAAAAqwAAAAAA3P+DAjX+H/9I/mb/fgM2/wP+zf8AAOEA6f8AANT/WgMl/YX+Sf9C/yoDtv8Z/nn/AAABAdn/AADf/0gDS/2F/nYA2f5VAi0Agv8=","left":"AAAAAMX/AAAAAD4AawJ8Aan8GvytAKgBAAAAAAAAAACJ/wAAAAAfALoB8ADl/az9PgBdAAAAAAAAAAAAVf8AAAAA//9gAScAe/6C//v/zv4AAAAAAAAAAC//AAAAAOD/EQF4/wr/IQGp/wH+AAAAAAAAAAAh/wAAAADD/7wA2f69/7wCOv9C/gAAAAAAAAAALf8AAAAAqv99AHr+aQBnA9D+Tv8AAAAAAAAAAE7/AAAAAJn/TgCW/gMB3gKO/pEAAAAAAAAAAACA/wAAAACT/ycAC/9gAdABm/4yAQAAAAAAAAAAvP8AAAAAmP8aAKf/IAGqACz/OAEAAAAAAAAAAP7/AAAAAKj/OwBDAC4Alf9KAAwBAAAAAAAAAABAAAAAAADB/6IApwC6/uP+lQEYAQAAAAAAAAAAfQAAAAAA3//z/6EARP8e/0YB2gAAAAAAAAAAAK8AAAAAAAAANf9YAH7/5P8XARMAAAAAAAAAAADQAAAAAAAgAHX+HgCn/1AA9QCG/wAAAAAAAAAA3QAAAAAAPgDC/fP/SwB8AJEANv8AAAAAAAAAANAAAAAAAFcAa/3r/8gBQQDz/zP/AAAAAAAAAACuAAAAAABoAOb9AQCGAtb/4/9i/wAAAAAAAAAAfAAAAAAAbwD3/igA/gFc//7/oP8AAAAAAAAAAEEAAAAAAGgAIQBmAL4Axf7f//v/AAAAAAAAAAADAAAAAABXADsBywAZ/+L92/+GAAAAAAA=","right":"AAAAAMX/AAAAAD4AawKUAan8GvytAJYBAAAAAAAAAAADAAAAAABWADsBygAZ/+L92/+HAAAAAAAAAAAAQQAAAAAAZwAhAGUAvgDG/t//+v8AAAAAAAAAAHwAAAAAAG8A9v4nAP4BW//+/6H/AAAAAAAAAACtAAAAAABpAOj9AACGAtX/4/9h/wAAAAAAAAAAzwAAAAAAWABr/ev/yAFBAPP/Nf8AAAAAAAAAANwAAAAAAD8Awf3y/0sAfACRADb/AAAAAAAAAADQAAAAAAAhAHP+HQCm/1AA9QCG/wAAAAAAAAAArwAAAAAAAAA1/1cAfv/k/xcBFAAAAAAAAAAAAH0AAAAAAOD/8/+gAET/Hv9GAdoAAAAAAAAAAABBAAAAAADC/6IApwC6/uP+lQEZAQAAAAAAAAAA//8AAAAAqf86AEMALgCV/0oADQEAAAAAAAAAAL3/AAAAAJj/GwCm/yABqgAs/zcBAAAAAAAAAACB/wAAAACR/ycACv9gAdABm/4yAQAAAAAAAAAAT/8AAAAAmP9OAJb+AwHeAo7+kgAAAAAAAAAAAC3/AAAAAKn/fgB6/mkAZwPQ/lD/AAAAAAAAAAAh/wAAAADC/7sA1/6+/7wCOv9D/gAAAAAAAAAAL/8AAAAA4P8SAXn/Cv8hAan/Af4AAAAAAAAAAFT/AAAAAP//YAEmAH3+gv/7/8/+AAAAAAAAAACJ/wAAAAAfALoB7wDl/az9PgBeAAAAAAA=","shoot":"Vv8AAFMAAAAAAAAAFAMP/dj8SAS4/uUA6P8AAHn/AABIAAAAAAAAAD4DNPxe/cwCxv7IAAsAAADN/wAANwAAAAAAAAD4AVz8eABOAAD+ogA2AAAAMgAAACIAAAAAAAAAlQF7/bUB//xC/isBEQAAAIcAAAALAAAAAAAAALMBV/1CAv/8jP6zAev/AACqAAAA8/8AAAAAAADpAbv9WgL//N3+JgL2/wAAhwAAANz/AAAAAAAAnAG6/pYC//xt/2YBBQAAADMAAADI/wAAAAAAAAwB8f86A//8zP+LAPb/AADO/wAAt/8AAAAAAAAXACUBMwT//PH/wf/f/wAAef8AAK//AAAAAAAAf/46Au8E//xsAAX/9v8AAFb/AACw/wAAAAAAAL78CQN2BP/8AgF8/hwAAAB5/wAAuf8AAAAAAAA7/GoDbgL//PgA2v4XAAAAzv8AAMn/AAAAAAAA3/xbAnr/f//cAIv++v8AADMAAADe/wAAAAAAAJP9tgHY/GQBHwGE/goAAACHAAAA9f8AAAAAAABR/bcB2PxsAtABi/4nAAAAqgAAAAwAAAAAAAAA3P3sAdj8QQItAi7/9f8AAIcAAAAjAAAAAAAAAPL+ugHY/PgBZgENAMz/AAAyAAAANwAAAAAAAAANAC4B2PzfArAA///o/wAAzf8AAEgAAAAAAAAAOgEnANj8WATy/5n/DwAAAHn/AABSAAAAAAAAAFMCjv7Y/OoEM/83APv/AAA=","run":"AACv/z4Al/8AACAAlQIx/nX9IwIL/4IAAAAAAJH/5f8VAP//AAAvAFUCjv91/b0BkP+C/2f/mwBe/x0A6v9pAAAANgACAuj+df2aAq4Bff3h/iMBkf9RAML/mQAAADMAtwGf/nX9MwH9A3T9gv6DAQAAegCj/2kAAAAnAH8BPQDh/Uf/FQbw/V7+qAFvAJIAkf8AAAAAFgCc/tr/OQEq/y0CO/6C/oQBogCRAJD/l/8AAAMAof0k/7QCzf+VAMX94P4kAW8AegCi/2f/AADw/+T95f+gAsj/rwAa/Wb/nAAAAFAAwv+X/wAA3/9h/yEDOAJU/VcAIv8AAAAAkf8cAOr/AAAAANP/HwHHAmsBVP2n/6b/mgBk/17/5P8VAGkAAADO/zQAYAJSAlT9d/27ASAB3P6R/6//PQCZAAAA0f8z/0ACKAFU/Wj9BgR+AXz+AACF/10AaQAAANr/7v9NAk3/yP0O/hYGogFY/m8Abf9wAAAAAADo/zj/Lv8d/zwBkf4aAn4Bff6iAG3/cQCX/wAA+f9W/nP9zP/RAhf+tQAfAd3+bwCG/14AZ/8AAAwAGv/h/PD/tQIp/Q4BmQBl/w==","runHold":"AACv/z4Ayf+Z/yAAbgLa/cL9CQLv/v4ATAC9/5H/5f8VAAEA//8vADMCsf/C/aoBof/z/1EAuP9e/x0A6v83AGQANgD0AZv/wv1ZAsoByf1LAL3/kf9RAML/UAC7ADMApwHO/8L9AwETBIn9OQDN/wAAegCj/zcA+QAnAMz/QQFM/0b/lAQD/h8A5f9vAJIAkf8AABABFgCO/TAAkwGd/3cBzP0BAP//ogCRAJD/yf/0AAMAyPxg/1QBLwCMAFf94v8aAG8AegCi/7D/rQDw/7H9IQCKAeH/hwEG/cj/MgAAAFAAwv/J/1MA3/8V//ACMgKy/akAAf+1/0IAkf8cAOr/AAD9/9P/aQGmAj0Bsv0vAKz/rv9JAF7/5P8VADcAt//O/+kAVgL0AbL9+P3SAbP/RACR/6//PQBQAFv/0f9UADMC1gCy/aj9IgTG/zMAAACF/10ANwAM/9r/6QCgAD3/Ov8q/r8E4f8bAG8Abf9xAAAA6/7o/3T/M/6X/4cBBP5vAQAAAACiAG3/cQDJ/wP/+f+C/pn8OQAtAYr9lgAfAOX/bwCG/14AsP9C/wwAZv+H/P7/YgEL/cwBOQDN/w==","runShoot":"AACv/z4AAAAAAAAAhwEU/sX9TgEW/34BAACM/5H/5f8VAAAAAAAAAM4B3P/F/SABcv/8/wAAwf9e/x0A6v8AAAAAAAAmAmT/xf2PAjwB4PwAABEAkf9RAML/AAAAAAAA3gHO/8X90gCwA3P9AAAjAAAAegCj/wAAAAAAANEBKwPF/ZX9jgb5/wAAXgBvAJIAkf8AAAAAAAD1/uP+CgHH/+kB3v0AAI4AogCRAJD/AAAAAAAAKf6s/DoDLgHr/in9AABAAG8AegCi/wAAAAAAACH9lf73Ai4AXAAD/QAAv/8AAFAAwv8AAAAAAABu/xkCNAGV/XIBQv8AAG3/kf8cAOr/AAAAAAAAjAFFArUAlf1kAKL/AACX/17/5P8VAAAAAAAAAKEAgwI0ApX9Lf1qAQAA6P+R/6//PQAAAAAAAABrAGMCpwCV/ZL90QMAAA0AAACF/10AAAAAAAAAtwKoAsX9lf3W/58GAABRAG8Abf9xAAAAAAAAACz+mP/f//sA7v3iAQAAeACiAG3/cQAAAAAAAADO+zX+TQFmAz/94/4AACEAbwCG/14AAAAAAAAA1v0j/GEAHAP0/LQAAAC5/w=="}).map(([name, packed]) => [name, decode(packed)]));
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = x => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
function channel(clip, phase, i) {
  const a = clips[clip], frames = a.length / CHANNELS;
  const p = ((phase % 1 + 1) % 1) * frames, j = Math.floor(p), t = p - j;
  const v0 = a[((j + frames - 1) % frames) * CHANNELS + i];
  const v1 = a[j * CHANNELS + i];
  const v2 = a[((j + 1) % frames) * CHANNELS + i];
  const v3 = a[((j + 2) % frames) * CHANNELS + i];
  // Centered cubic interpolation of every-other-source-frame samples avoids
  // a velocity kink at each 2F key. It does not change the 40F/32F loops.
  const t2 = t * t, t3 = t2 * t;
  return (0.5 * ((2 * v1) + (v2 - v0) * t +
    (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 +
    (3 * (v1 - v2) + v3 - v0) * t3)) / 1000;
}
// out is caller-owned and reused. Phase is NEVER reset when changing direction,
// weapon pose, or walk/run; convex clips blend with the same normalized clock.
export function sampleLegacyGait(out, phase, dx, dz, aim = 0, run = 0) {
  phase = Number.isFinite(phase) ? phase : 0;
  dx = Number.isFinite(dx) ? dx : 0; dz = Number.isFinite(dz) ? dz : 1;
  const lateral = Math.abs(dx) / (Math.abs(dx) + Math.abs(dz) || 1);
  const sagittal = dz < 0 ? 'backward' : 'forward', transverse = dx < 0 ? 'right' : 'left';
  const shooting = clamp01(aim), running = clamp01(run);
  for (let i = 0; i < CHANNELS; i++) {
    const straight = mix(channel(sagittal, phase, i), channel('shoot', phase, i), dz > 0 ? shooting : 0);
    const direction = mix(straight, channel(transverse, phase, i), lateral);
    const sprint = mix(channel('runHold', phase, i), channel('runShoot', phase, i), shooting);
    out[i] = mix(direction, sprint, running);
  }
  return out;
}
export const LEGACY_GAIT_CHANNELS = Object.freeze({
  hipX: 0, hipY: 1, hipZ: 2, rootX: 3, rootY: 4, rootZ: 5,
  thighL: 6, thighR: 7, shinL: 8, shinR: 9, footL: 10, footR: 11,
  armL: 12, armR: 13,
});
