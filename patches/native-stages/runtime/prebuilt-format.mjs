// Prebuilt native stage records (native-prebuilt/<id>/stage.json). Shared by
// the build tool, the site builder and the runtime loader.
export const PREBUILT_SCHEMA = 1;
// Cloudflare static assets accept at most 25 MiB per file.
export const PREBUILT_CHUNK_BYTES = 16 * 1024 * 1024;
// Paint-chart face columns (source-convert.mjs paintCharts push order).
export const FACE_KEYS = 'origin,u,v,n,su,sv,nu,nv,cu,cv,grid,object,triangles,bounds,area';
export const FACE_F64 = 23; // origin3 u3 v3 n3 su sv cu cv min3 max3 area
export const FACE_I32 = 4;  // nu nv grid object
export function unpackFaces(f64, i32, offsets, ids) {
  const n = offsets.length - 1, faces = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = i * FACE_F64, b = i * FACE_I32, d = f64;
    faces[i] = {origin: [d[a], d[a + 1], d[a + 2]], u: [d[a + 3], d[a + 4], d[a + 5]], v: [d[a + 6], d[a + 7], d[a + 8]], n: [d[a + 9], d[a + 10], d[a + 11]],
      su: d[a + 12], sv: d[a + 13], nu: i32[b], nv: i32[b + 1], cu: d[a + 14], cv: d[a + 15], grid: i32[b + 2], object: i32[b + 3],
      triangles: Array.from(ids.subarray(offsets[i], offsets[i + 1])),
      bounds: [[d[a + 16], d[a + 17], d[a + 18]], [d[a + 19], d[a + 20], d[a + 21]]], area: d[a + 22]};
  }
  return faces;
}
