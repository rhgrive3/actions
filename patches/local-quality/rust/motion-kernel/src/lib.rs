#![no_std]
#![allow(clippy::too_many_arguments, clippy::missing_safety_doc)]

use core::arch::wasm32;
use core::panic::PanicInfo;
use core::ptr::{addr_of, addr_of_mut};

#[panic_handler]
fn panic(_info: &PanicInfo) -> ! {
    wasm32::unreachable()
}

// ============================================================================
// Overflow-safe 16-byte aligned bump allocator over Wasm linear memory
// ============================================================================
static mut HEAP_PTR: usize = 0;

#[no_mangle]
pub unsafe extern "C" fn wasm_alloc(bytes: usize) -> usize {
    let raw_size = if bytes == 0 { 16 } else { bytes };
    let size = match raw_size.checked_add(15) {
        Some(v) => v & !15,
        None => return 0,
    };
    if *addr_of!(HEAP_PTR) == 0 {
        let start = (wasm32::memory_size(0) as u64) << 16;
        if start > usize::MAX as u64 {
            return 0;
        }
        *addr_of_mut!(HEAP_PTR) = start as usize;
    }
    let ptr = match (*addr_of!(HEAP_PTR)).checked_add(15) {
        Some(v) => v & !15,
        None => return 0,
    };
    let end = match ptr.checked_add(size) {
        Some(v) => v,
        None => return 0,
    };
    let cur_bytes = (wasm32::memory_size(0) as u64) << 16;
    if (end as u64) > cur_bytes {
        let delta = (end as u64) - cur_bytes;
        let needed_pages = ((delta + 65535) >> 16) as usize;
        let prev = wasm32::memory_grow(0, needed_pages);
        if prev == usize::MAX {
            return 0;
        }
    }
    *addr_of_mut!(HEAP_PTR) = end;
    ptr
}

// ============================================================================
// Compact Pose, Clip & Coverage Replay descriptor tables
// ============================================================================
const MAX_POSES: usize = 512;
const MAX_CLIPS: usize = 2048;
const MAX_COVERAGE: usize = 32;

#[derive(Clone, Copy)]
struct PoseDesc {
    parents: usize,
    raw: usize,
    p: usize,
    q: usize,
    s: usize,
    flags: usize,
    world: usize,
    wp: usize,
    wq: usize,
    bone_count: usize,
}

#[derive(Clone, Copy)]
struct ClipDesc {
    data: usize,
    base_offset: usize,
    curves_offset: usize,
    curve_count: usize,
    bone_count: usize,
    covers_clip: u32,
    rot_mode: u32,
    dst: usize,
    sorted: usize,
    fixed_mask: usize,
    fixed_q: usize,
}

#[derive(Clone, Copy)]
struct CoverageDesc {
    groups: usize,
    starts: usize,
    weights: usize,
    words: usize,
    ownership: usize,
    prefix0: usize,
    prefix1: usize,
    group_count: usize,
    word_count: usize,
    valid: u8,
    t0: f64,
    t1: f64,
}

const EMPTY_POSE: PoseDesc = PoseDesc {
    parents: 0, raw: 0, p: 0, q: 0, s: 0, flags: 0, world: 0, wp: 0, wq: 0, bone_count: 0,
};
const EMPTY_CLIP: ClipDesc = ClipDesc {
    data: 0, base_offset: 0, curves_offset: 0, curve_count: 0, bone_count: 0,
    covers_clip: 0, rot_mode: 0, dst: 0, sorted: 0, fixed_mask: 0, fixed_q: 0,
};
const EMPTY_COV: CoverageDesc = CoverageDesc {
    groups: 0, starts: 0, weights: 0, words: 0, ownership: 0, prefix0: 0, prefix1: 0,
    group_count: 0, word_count: 0, valid: 0, t0: 0.0, t1: 0.0,
};

static mut POSES: [PoseDesc; MAX_POSES] = [EMPTY_POSE; MAX_POSES];
static mut POSE_ALIVE: [u8; MAX_POSES] = [0; MAX_POSES];
static mut POSE_FREE: [u16; MAX_POSES] = [0; MAX_POSES];
static mut POSE_FREE_LEN: usize = 0;
static mut POSE_COUNT: usize = 0;

static mut CLIPS: [ClipDesc; MAX_CLIPS] = [EMPTY_CLIP; MAX_CLIPS];
static mut CLIP_COUNT: usize = 0;

static mut COVERAGES: [CoverageDesc; MAX_COVERAGE] = [EMPTY_COV; MAX_COVERAGE];
static mut COV_ALIVE: [u8; MAX_COVERAGE] = [0; MAX_COVERAGE];
static mut COV_FREE: [u16; MAX_COVERAGE] = [0; MAX_COVERAGE];
static mut COV_FREE_LEN: usize = 0;
static mut COV_COUNT: usize = 0;

#[inline(always)]
unsafe fn get_pose(id: usize) -> Option<PoseDesc> {
    if id >= *addr_of!(POSE_COUNT) {
        return None;
    }
    if *(*addr_of!(POSE_ALIVE)).as_ptr().add(id) == 0 {
        return None;
    }
    Some(*(*addr_of!(POSES)).as_ptr().add(id))
}

#[inline(always)]
unsafe fn get_clip(id: usize) -> Option<ClipDesc> {
    if id >= *addr_of!(CLIP_COUNT) {
        return None;
    }
    Some(*(*addr_of!(CLIPS)).as_ptr().add(id))
}

#[no_mangle]
pub unsafe extern "C" fn can_register_pose() -> u32 {
    if *addr_of!(POSE_FREE_LEN) > 0 || *addr_of!(POSE_COUNT) < MAX_POSES { 1 } else { 0 }
}

#[no_mangle]
pub unsafe extern "C" fn can_register_clip() -> u32 {
    if *addr_of!(CLIP_COUNT) < MAX_CLIPS { 1 } else { 0 }
}

#[no_mangle]
pub unsafe extern "C" fn register_pose(
    parents: usize, raw: usize, p: usize, q: usize, s: usize,
    flags: usize, world: usize, wp: usize, wq: usize, bone_count: usize,
) -> i32 {
    let free_len = *addr_of!(POSE_FREE_LEN);
    let id = if free_len > 0 {
        let next_len = free_len - 1;
        *addr_of_mut!(POSE_FREE_LEN) = next_len;
        *(*addr_of!(POSE_FREE)).as_ptr().add(next_len) as usize
    } else {
        let count = *addr_of!(POSE_COUNT);
        if count >= MAX_POSES {
            return -1;
        }
        *addr_of_mut!(POSE_COUNT) = count + 1;
        count
    };
    *(*addr_of_mut!(POSES)).as_mut_ptr().add(id) = PoseDesc {
        parents, raw, p, q, s, flags, world, wp, wq, bone_count,
    };
    *(*addr_of_mut!(POSE_ALIVE)).as_mut_ptr().add(id) = 1;
    id as i32
}

#[no_mangle]
pub unsafe extern "C" fn unregister_pose(id: usize) {
    if id >= *addr_of!(POSE_COUNT) {
        return;
    }
    let alive_ptr = (*addr_of_mut!(POSE_ALIVE)).as_mut_ptr().add(id);
    if *alive_ptr == 0 {
        return;
    }
    *alive_ptr = 0;
    *(*addr_of_mut!(POSES)).as_mut_ptr().add(id) = EMPTY_POSE;
    let free_len = *addr_of!(POSE_FREE_LEN);
    if free_len < MAX_POSES {
        *(*addr_of_mut!(POSE_FREE)).as_mut_ptr().add(free_len) = id as u16;
        *addr_of_mut!(POSE_FREE_LEN) = free_len + 1;
    }
}

#[no_mangle]
pub unsafe extern "C" fn register_clip(
    data: usize, base_offset: usize, curves_offset: usize, curve_count: usize,
    bone_count: usize, covers_clip: u32, rot_mode: u32,
    dst: usize, sorted: usize, fixed_mask: usize, fixed_q: usize,
) -> i32 {
    let count = *addr_of!(CLIP_COUNT);
    if count >= MAX_CLIPS {
        return -1;
    }
    *(*addr_of_mut!(CLIPS)).as_mut_ptr().add(count) = ClipDesc {
        data, base_offset, curves_offset, curve_count, bone_count,
        covers_clip, rot_mode, dst, sorted, fixed_mask, fixed_q,
    };
    *addr_of_mut!(CLIP_COUNT) = count + 1;
    count as i32
}

#[no_mangle]
pub unsafe extern "C" fn can_register_coverage() -> u32 {
    if *addr_of!(COV_FREE_LEN) > 0 || *addr_of!(COV_COUNT) < MAX_COVERAGE { 1 } else { 0 }
}

#[no_mangle]
pub unsafe extern "C" fn register_coverage_replay(
    groups: usize, starts: usize, weights: usize, words: usize,
    ownership: usize, prefix0: usize, prefix1: usize,
    group_count: usize, word_count: usize,
) -> i32 {
    let free_len = *addr_of!(COV_FREE_LEN);
    let id = if free_len > 0 {
        let next_len = free_len - 1;
        *addr_of_mut!(COV_FREE_LEN) = next_len;
        *(*addr_of!(COV_FREE)).as_ptr().add(next_len) as usize
    } else {
        let count = *addr_of!(COV_COUNT);
        if count >= MAX_COVERAGE {
            return -1;
        }
        *addr_of_mut!(COV_COUNT) = count + 1;
        count
    };
    *(*addr_of_mut!(COVERAGES)).as_mut_ptr().add(id) = CoverageDesc {
        groups, starts, weights, words, ownership, prefix0, prefix1,
        group_count, word_count, valid: 0, t0: 0.0, t1: 0.0,
    };
    *(*addr_of_mut!(COV_ALIVE)).as_mut_ptr().add(id) = 1;
    id as i32
}

#[no_mangle]
pub unsafe extern "C" fn unregister_coverage_replay(id: usize) {
    if id >= *addr_of!(COV_COUNT) {
        return;
    }
    let alive_ptr = (*addr_of_mut!(COV_ALIVE)).as_mut_ptr().add(id);
    if *alive_ptr == 0 {
        return;
    }
    *alive_ptr = 0;
    *(*addr_of_mut!(COVERAGES)).as_mut_ptr().add(id) = EMPTY_COV;
    let free_len = *addr_of!(COV_FREE_LEN);
    if free_len < MAX_COVERAGE {
        *(*addr_of_mut!(COV_FREE)).as_mut_ptr().add(free_len) = id as u16;
        *addr_of_mut!(COV_FREE_LEN) = free_len + 1;
    }
}

// ============================================================================
// JS-exact IEEE-754 f64 math helpers (signed-zero & NaN preserving, no FMA)
// ============================================================================
#[inline(always)]
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { return f64::NAN; }
    if a < b { a } else if b < a { b } else {
        if a.to_bits() == 0x8000_0000_0000_0000u64 { a } else { b }
    }
}

#[inline(always)]
fn js_max(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() { return f64::NAN; }
    if a > b { a } else if b > a { b } else {
        if a.to_bits() == 0x8000_0000_0000_0000u64 { b } else { a }
    }
}

#[inline(always)]
fn js_clamp(x: f64, a: f64, b: f64) -> f64 {
    js_max(a, js_min(b, x))
}

#[inline(always)]
fn js_abs(x: f64) -> f64 {
    f64::from_bits(x.to_bits() & 0x7FFF_FFFF_FFFF_FFFFu64)
}

#[inline(always)]
fn js_sqrt(x: f64) -> f64 {
    wasm32::f64x2_extract_lane::<0>(wasm32::f64x2_sqrt(wasm32::f64x2_splat(x)))
}

// ============================================================================
// High-precision fdlibm-derived sin/cos/acos for f64 (pure no_std, <= 1 ULP)
// ============================================================================
const PIO2_HI: f64 = 1.57079632679489655800e+00;
const PIO2_LO: f64 = 6.12323399573676603587e-17;
const INV_PIO2: f64 = 6.36619772367581382433e-01;

#[inline(always)]
fn kernel_sin(x: f64, y: f64) -> f64 {
    const S1: f64 = -1.66666666666666324348e-01;
    const S2: f64 =  8.33333333332248946124e-03;
    const S3: f64 = -1.98412698298579493134e-04;
    const S4: f64 =  2.75573137070700676789e-06;
    const S5: f64 = -2.50507602534068634195e-08;
    const S6: f64 =  1.58969099521155010221e-10;
    let z = x * x;
    let w = z * z;
    let r = S2 + z * (S3 + z * S4) + z * w * (S5 + z * S6);
    let v = z * x;
    x - ((z * (0.5 * y - v * r) - y) - v * S1)
}

#[inline(always)]
fn kernel_cos(x: f64, y: f64) -> f64 {
    const C1: f64 =  4.16666666666666019037e-02;
    const C2: f64 = -1.38888888888741095749e-03;
    const C3: f64 =  2.48015872894767294178e-05;
    const C4: f64 = -2.75573143513906633035e-07;
    const C5: f64 =  2.08757232129817482790e-09;
    const C6: f64 = -1.13596475577881948265e-11;
    let z = x * x;
    let w = z * z;
    let r = z * (C1 + z * (C2 + z * C3)) + w * w * (C4 + z * (C5 + z * C6));
    let hz = 0.5 * z;
    let w2 = 1.0 - hz;
    w2 + (((1.0 - w2) - hz) + (z * r - x * y))
}

#[inline(always)]
fn rem_pio2_small(x: f64) -> (i32, f64, f64) {
    let fn_val = wasm32::f64x2_extract_lane::<0>(wasm32::f64x2_nearest(wasm32::f64x2_splat(x * INV_PIO2)));
    let n = fn_val as i32;
    let r = x - fn_val * PIO2_HI;
    let w = fn_val * PIO2_LO;
    let y0 = r - w;
    let y1 = (r - y0) - w;
    (n, y0, y1)
}

#[inline(always)]
fn fast_sincos(x: f64) -> (f64, f64) {
    if x == 0.0 { return (x, 1.0); }
    let ax = js_abs(x);
    if !ax.is_finite() { return (f64::NAN, f64::NAN); }
    if ax <= 0.7853981633974483 {
        return (kernel_sin(x, 0.0), kernel_cos(x, 0.0));
    }
    let (n, y0, y1) = rem_pio2_small(x);
    let s = kernel_sin(y0, y1);
    let c = kernel_cos(y0, y1);
    match n & 3 {
        0 => (s, c),
        1 => (c, -s),
        2 => (-s, -c),
        _ => (-c, s),
    }
}

// ============================================================================
// Tier 1: Core Motion Kernels (Sample + FK + Mix + Fused Sample+Accumulate)
// ============================================================================
const STRIDE: usize = 10;
const CURVE_STRIDE: usize = 10;

#[inline(always)]
unsafe fn segment_value(data: *const f32, o: usize, frame: f64, i: usize) -> f64 {
    let kind = ((*data.add(o + 1) as i32) >> 4) & 7;
    let fo = *data.add(o + 7) as usize;
    let n = *data.add(o + 8) as usize;
    let ko = *data.add(o + 9) as usize;
    let u = if i + 1 < n {
        let f0 = *data.add(fo + i) as f64;
        let f1 = *data.add(fo + i + 1) as f64;
        (frame - f0) / (f1 - f0)
    } else {
        0.0
    };
    let v = match kind {
        0 => {
            let j = ko + i * 4;
            let c0 = *data.add(j) as f64;
            let c1 = *data.add(j + 1) as f64;
            let c2 = *data.add(j + 2) as f64;
            let c3 = *data.add(j + 3) as f64;
            ((c3 * u + c2) * u + c1) * u + c0
        }
        1 => {
            let j = ko + i * 2;
            *data.add(j) as f64 + (*data.add(j + 1) as f64) * u
        }
        2 => {
            let k0 = *data.add(ko + i) as f64;
            if i + 1 < n { k0 + (*data.add(ko + i + 1) as f64 - k0) * u } else { k0 }
        }
        4..=7 => *data.add(ko + i) as f64,
        _ => f64::NAN,
    };
    v * (*data.add(o + 4) as f64) + (*data.add(o + 5) as f64)
}

#[inline(always)]
unsafe fn curve_value_unsorted(data: *const f32, o: usize, frame: f64) -> f64 {
    let fo = *data.add(o + 7) as usize;
    let n = *data.add(o + 8) as usize;
    let f = js_clamp(frame, *data.add(fo) as f64, *data.add(fo + n - 1) as f64);
    let mut lo: usize = 0;
    let mut hi: usize = n;
    while lo < hi {
        let mid = (lo + hi) >> 1;
        if (*data.add(fo + mid) as f64) <= f { lo = mid + 1; } else { hi = mid; }
    }
    segment_value(data, o, f, if lo > 0 { lo - 1 } else { 0 })
}

#[inline(always)]
unsafe fn run_pose_fk(pd: PoseDesc, count: usize) {
    let n = if count < pd.bone_count { count } else { pd.bone_count };
    let parents = pd.parents as *const i32;
    let p = pd.p as *const f64;
    let q = pd.q as *const f64;
    let s = pd.s as *const f64;
    let flags = pd.flags as *const u32;
    let world = pd.world as *mut f64;
    let wp = pd.wp as *mut f64;
    let wq = pd.wq as *mut f64;

    let mut te = [0.0f64; 16];
    for i in 0..n {
        let parent = *parents.add(i);
        let p3 = i * 3;
        let q4 = i * 4;
        let x = *q.add(q4);
        let y = *q.add(q4 + 1);
        let z = *q.add(q4 + 2);
        let w = *q.add(q4 + 3);
        let x2 = x + x;
        let y2 = y + y;
        let z2 = z + z;
        let xx = x * x2;
        let xy = x * y2;
        let xz = x * z2;
        let yy = y * y2;
        let yz = y * z2;
        let zz = z * z2;
        let wx = w * x2;
        let wy = w * y2;
        let wz = w * z2;
        let sx = *s.add(p3);
        let sy = *s.add(p3 + 1);
        let sz = *s.add(p3 + 2);

        te[0] = (1.0 - (yy + zz)) * sx;
        te[1] = (xy + wz) * sx;
        te[2] = (xz - wy) * sx;
        te[3] = 0.0;
        te[4] = (xy - wz) * sy;
        te[5] = (1.0 - (xx + zz)) * sy;
        te[6] = (yz + wx) * sy;
        te[7] = 0.0;
        te[8] = (xz + wy) * sz;
        te[9] = (yz - wx) * sz;
        te[10] = (1.0 - (xx + yy)) * sz;
        te[11] = 0.0;
        te[12] = *p.add(p3);
        te[13] = *p.add(p3 + 1);
        te[14] = *p.add(p3 + 2);
        te[15] = 1.0;

        let out = world.add(i * 16);
        let wq_out = wq.add(q4);
        if parent >= 0 && (parent as usize) < pd.bone_count {
            let par = parent as usize;
            if (*flags.add(i) & (1u32 << 23)) != 0 {
                let ps3 = par * 3;
                let psx = *s.add(ps3);
                let psy = *s.add(ps3 + 1);
                let psz = *s.add(ps3 + 2);
                if psx != 1.0 || psy != 1.0 || psz != 1.0 {
                    let ix = if js_abs(psx) > 1e-12 { 1.0 / psx } else { 0.0 };
                    let iy = if js_abs(psy) > 1e-12 { 1.0 / psy } else { 0.0 };
                    let iz = if js_abs(psz) > 1e-12 { 1.0 / psz } else { 0.0 };
                    te[0] *= ix; te[4] *= ix; te[8] *= ix;
                    te[1] *= iy; te[5] *= iy; te[9] *= iy;
                    te[2] *= iz; te[6] *= iz; te[10] *= iz;
                }
            }

            let ae = world.add(par * 16);
            let c0_lo = wasm32::v128_load(ae as *const wasm32::v128);
            let c0_hi = wasm32::v128_load(ae.add(2) as *const wasm32::v128);
            let c1_lo = wasm32::v128_load(ae.add(4) as *const wasm32::v128);
            let c1_hi = wasm32::v128_load(ae.add(6) as *const wasm32::v128);
            let c2_lo = wasm32::v128_load(ae.add(8) as *const wasm32::v128);
            let c2_hi = wasm32::v128_load(ae.add(10) as *const wasm32::v128);
            let c3_lo = wasm32::v128_load(ae.add(12) as *const wasm32::v128);
            let c3_hi = wasm32::v128_load(ae.add(14) as *const wasm32::v128);

            for col in 0..4 {
                let b0 = wasm32::f64x2_splat(te[col * 4]);
                let b1 = wasm32::f64x2_splat(te[col * 4 + 1]);
                let b2 = wasm32::f64x2_splat(te[col * 4 + 2]);
                let b3 = wasm32::f64x2_splat(te[col * 4 + 3]);

                let r_lo = wasm32::f64x2_add(
                    wasm32::f64x2_add(
                        wasm32::f64x2_add(wasm32::f64x2_mul(c0_lo, b0), wasm32::f64x2_mul(c1_lo, b1)),
                        wasm32::f64x2_mul(c2_lo, b2),
                    ),
                    wasm32::f64x2_mul(c3_lo, b3),
                );
                let r_hi = wasm32::f64x2_add(
                    wasm32::f64x2_add(
                        wasm32::f64x2_add(wasm32::f64x2_mul(c0_hi, b0), wasm32::f64x2_mul(c1_hi, b1)),
                        wasm32::f64x2_mul(c2_hi, b2),
                    ),
                    wasm32::f64x2_mul(c3_hi, b3),
                );
                wasm32::v128_store(out.add(col * 4) as *mut wasm32::v128, r_lo);
                wasm32::v128_store(out.add(col * 4 + 2) as *mut wasm32::v128, r_hi);
            }

            let pq = wq.add(par * 4);
            let qax = *pq;
            let qay = *pq.add(1);
            let qaz = *pq.add(2);
            let qaw = *pq.add(3);
            let mut rx = qax * w + qaw * x + qay * z - qaz * y;
            let mut ry = qay * w + qaw * y + qaz * x - qax * z;
            let mut rz = qaz * w + qaw * z + qax * y - qay * x;
            let mut rw = qaw * w - qax * x - qay * y - qaz * z;
            let l = js_sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
            if l == 0.0 { rx = 0.0; ry = 0.0; rz = 0.0; rw = 1.0; }
            else { let inv = 1.0 / l; rx *= inv; ry *= inv; rz *= inv; rw *= inv; }
            *wq_out = rx; *wq_out.add(1) = ry; *wq_out.add(2) = rz; *wq_out.add(3) = rw;
        } else {
            core::ptr::copy_nonoverlapping(te.as_ptr(), out, 16);
            *wq_out = x; *wq_out.add(1) = y; *wq_out.add(2) = z; *wq_out.add(3) = w;
        }
        *wp.add(p3) = *out.add(12);
        *wp.add(p3 + 1) = *out.add(13);
        *wp.add(p3 + 2) = *out.add(14);
    }
}

#[inline(always)]
unsafe fn run_sample_inner(cd: ClipDesc, pd: PoseDesc, seg_ptr: *mut i32, frame: f64, fk_count: usize) -> u32 {
    let data = cd.data as *const f32;
    let raw_out = pd.raw as *mut f64;
    let p_out = pd.p as *mut f64;
    let q_out = pd.q as *mut f64;
    let s_out = pd.s as *mut f64;
    let bone_count = cd.bone_count;

    let raw_len = bone_count * STRIDE;
    let base_ptr = data.add(cd.base_offset);
    for i in 0..raw_len {
        *raw_out.add(i) = *base_ptr.add(i) as f64;
    }

    let dst_ptr = cd.dst as *const i32;
    let sorted_ptr = cd.sorted as *const u8;
    let covers = cd.covers_clip != 0;
    for i in 0..cd.curve_count {
        let d = *dst_ptr.add(i);
        if d < 0 { continue; }
        let d_idx = d as usize;
        if d_idx >= raw_len { continue; }
        let o = cd.curves_offset + i * CURVE_STRIDE;
        let kind = ((*data.add(o + 1) as i32) >> 4) & 7;
        if kind == 3 { return 1; }
        if *sorted_ptr.add(i) == 0 {
            *raw_out.add(d_idx) = curve_value_unsorted(data, o, frame);
            continue;
        }
        let fo = *data.add(o + 7) as usize;
        let n = *data.add(o + 8) as usize;
        let f = if covers { frame } else { js_clamp(frame, *data.add(fo) as f64, *data.add(fo + n - 1) as f64) };
        let mut k = *seg_ptr.add(i);
        let hit_cur = k >= 0
            && (k as usize) < n
            && (*data.add(fo + k as usize) as f64) <= f
            && ((k as usize) + 1 >= n || (*data.add(fo + k as usize + 1) as f64) > f);
        if !hit_cur {
            k += 1;
            let hit_next = k >= 1
                && (k as usize) < n
                && (*data.add(fo + k as usize) as f64) <= f
                && ((k as usize) + 1 >= n || (*data.add(fo + k as usize + 1) as f64) > f);
            if !hit_next {
                let mut lo: usize = 0;
                let mut hi: usize = n;
                while lo < hi {
                    let mid = (lo + hi) >> 1;
                    if (*data.add(fo + mid) as f64) <= f { lo = mid + 1; } else { hi = mid; }
                }
                k = if lo > 0 { (lo - 1) as i32 } else { 0 };
            }
            *seg_ptr.add(i) = k;
        }
        *raw_out.add(d_idx) = segment_value(data, o, f, k as usize);
    }

    let fixed_mask = cd.fixed_mask as *const u8;
    let fixed_q = cd.fixed_q as *const f64;
    for i in 0..bone_count {
        let j = i * STRIDE;
        let p3 = i * 3;
        let q4 = i * 4;
        *s_out.add(p3) = *raw_out.add(j);
        *s_out.add(p3 + 1) = *raw_out.add(j + 1);
        *s_out.add(p3 + 2) = *raw_out.add(j + 2);
        *p_out.add(p3) = *raw_out.add(j + 3);
        *p_out.add(p3 + 1) = *raw_out.add(j + 4);
        *p_out.add(p3 + 2) = *raw_out.add(j + 5);

        if *fixed_mask.add(i) != 0 {
            *q_out.add(q4) = *fixed_q.add(q4);
            *q_out.add(q4 + 1) = *fixed_q.add(q4 + 1);
            *q_out.add(q4 + 2) = *fixed_q.add(q4 + 2);
            *q_out.add(q4 + 3) = *fixed_q.add(q4 + 3);
        } else if cd.rot_mode == 0 {
            let (s1, c1) = fast_sincos(*raw_out.add(j + 6) * 0.5);
            let (s2, c2) = fast_sincos(*raw_out.add(j + 7) * 0.5);
            let (s3, c3) = fast_sincos(*raw_out.add(j + 8) * 0.5);
            *q_out.add(q4) = s1 * c2 * c3 - c1 * s2 * s3;
            *q_out.add(q4 + 1) = c1 * s2 * c3 + s1 * c2 * s3;
            *q_out.add(q4 + 2) = c1 * c2 * s3 - s1 * s2 * c3;
            *q_out.add(q4 + 3) = c1 * c2 * c3 + s1 * s2 * s3;
        } else {
            let mut qx = *raw_out.add(j + 6);
            let mut qy = *raw_out.add(j + 7);
            let mut qz = *raw_out.add(j + 8);
            let mut qw = *raw_out.add(j + 9);
            let l = js_sqrt(qx * qx + qy * qy + qz * qz + qw * qw);
            if l == 0.0 { qx = 0.0; qy = 0.0; qz = 0.0; qw = 1.0; }
            else { let inv = 1.0 / l; qx *= inv; qy *= inv; qz *= inv; qw *= inv; }
            *q_out.add(q4) = qx; *q_out.add(q4 + 1) = qy; *q_out.add(q4 + 2) = qz; *q_out.add(q4 + 3) = qw;
        }
    }

    if fk_count > 0 {
        run_pose_fk(pd, fk_count);
    }
    0
}

/// 5-arg entry point: sample BFRES clip + optional SIMD FK
#[no_mangle]
pub unsafe extern "C" fn sample_and_fk_id(
    clip_id: usize,
    pose_id: usize,
    seg_ptr: *mut i32,
    frame: f64,
    fk_count: usize,
) -> u32 {
    let cd = match get_clip(clip_id) { Some(v) => v, None => return 2 };
    let pd = match get_pose(pose_id) { Some(v) => v, None => return 2 };
    if cd.bone_count > pd.bone_count || fk_count > pd.bone_count || seg_ptr.is_null() {
        return 2;
    }
    run_sample_inner(cd, pd, seg_ptr, frame, fk_count)
}

// ============================================================================
// Tier 2: Bit-Exact IEEE-754 Floor Coverage Replay Kernel (scoring.mjs)
// ============================================================================
const ELIGIBLE_WORD_MASKS_LE: [u32; 16] = [
    0x0000_0000, 0x0000_00ff, 0x0000_ff00, 0x0000_ffff,
    0x00ff_0000, 0x00ff_00ff, 0x00ff_ff00, 0x00ff_ffff,
    0xff00_0000, 0xff00_00ff, 0xff00_ff00, 0xff00_ffff,
    0xffff_0000, 0xffff_00ff, 0xffff_ff00, 0xffff_ffff,
];
const COV_PREFIX_SHIFT: usize = 8;
const COV_PREFIX_GROUPS: usize = 1 << COV_PREFIX_SHIFT;

/// Bit-exact replay of floor coverage with 256-group prefix checkpoints.
/// Writes [t0, t1] into `out_ptr` (2 x f64) and returns 1 on success, 0 on invalid ID.
#[no_mangle]
pub unsafe extern "C" fn replay_floor_coverage_id(cov_id: usize, full: u32, out_ptr: *mut f64) -> u32 {
    if cov_id >= *addr_of!(COV_COUNT) || out_ptr.is_null() {
        return 0;
    }
    if *(*addr_of!(COV_ALIVE)).as_ptr().add(cov_id) == 0 {
        return 0;
    }
    let cd_ptr = (*addr_of_mut!(COVERAGES)).as_mut_ptr().add(cov_id);
    let cd = *cd_ptr;
    let total_groups = cd.group_count;
    let groups = cd.groups as *const u32;
    let starts = cd.starts as *const i32;
    let weights = cd.weights as *const f64;
    let words = cd.words as *const u32;
    let ownership = cd.ownership as *mut u32;
    let prefix0 = cd.prefix0 as *mut f64;
    let prefix1 = cd.prefix1 as *mut f64;

    let mut first: usize = 0;
    if full == 0 && cd.valid != 0 {
        while first < total_groups {
            let group = *groups.add(first);
            let w_idx = (group >> 4) as usize;
            let mask = (group & 15) as usize;
            let value = if w_idx < cd.word_count {
                *words.add(w_idx) & ELIGIBLE_WORD_MASKS_LE[mask]
            } else {
                0
            };
            if value != *ownership.add(first) {
                break;
            }
            first += 1;
        }
        if first == total_groups {
            *out_ptr = cd.t0;
            *out_ptr.add(1) = cd.t1;
            return 1;
        }
    }

    let checkpoint = first >> COV_PREFIX_SHIFT;
    let start = checkpoint << COV_PREFIX_SHIFT;
    let mut t0 = if start != 0 { *prefix0.add(checkpoint) } else { 0.0 };
    let mut t1 = if start != 0 { *prefix1.add(checkpoint) } else { 0.0 };

    let mut blk = start;
    while blk < total_groups {
        let cp = blk >> COV_PREFIX_SHIFT;
        *prefix0.add(cp) = t0;
        *prefix1.add(cp) = t1;
        let end = if blk + COV_PREFIX_GROUPS < total_groups {
            blk + COV_PREFIX_GROUPS
        } else {
            total_groups
        };
        let mut g = blk;
        while g < end {
            let group = *groups.add(g);
            let mask = (group & 15) as usize;
            let w_idx = (group >> 4) as usize;
            let value = if w_idx < cd.word_count {
                *words.add(w_idx) & ELIGIBLE_WORD_MASKS_LE[mask]
            } else {
                0
            };
            *ownership.add(g) = value;
            if value != 0 {
                let mut i = *starts.add(g) as usize;
                if mask == 15 {
                    let b0 = value & 255;
                    if b0 == 1 { t0 += *weights.add(i); } else if b0 == 2 { t1 += *weights.add(i); }
                    let b1 = (value >> 8) & 255;
                    if b1 == 1 { t0 += *weights.add(i + 1); } else if b1 == 2 { t1 += *weights.add(i + 1); }
                    let b2 = (value >> 16) & 255;
                    if b2 == 1 { t0 += *weights.add(i + 2); } else if b2 == 2 { t1 += *weights.add(i + 2); }
                    let b3 = value >> 24;
                    if b3 == 1 { t0 += *weights.add(i + 3); } else if b3 == 2 { t1 += *weights.add(i + 3); }
                } else {
                    for byte in 0..4usize {
                        if (mask & (1 << byte)) == 0 {
                            continue;
                        }
                        let team = (value >> (byte * 8)) & 255;
                        if team == 1 {
                            t0 += *weights.add(i);
                        } else if team == 2 {
                            t1 += *weights.add(i);
                        }
                        i += 1;
                    }
                }
            }
            g += 1;
        }
        blk += COV_PREFIX_GROUPS;
    }

    (*cd_ptr).valid = 1;
    (*cd_ptr).t0 = t0;
    (*cd_ptr).t1 = t1;
    *out_ptr = t0;
    *out_ptr.add(1) = t1;
    1
}
