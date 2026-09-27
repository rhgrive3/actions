"""Local-shape change of a field on HEAD_face: python3 shape_metrics.py field.json [...]
disp = vertex displacement (mm); dlap = change of the grid Laplacian of the positions (mm): new bumps / dents;
dnormal = change of the area-weighted vertex normal (deg). Percentiles over the movable front face."""
import json, sys
import numpy as np
import mvcore as M, fit

g0 = M.load('geom_before.npz'); v0 = g0['HEAD_face']['v']; f = g0['HEAD_face']['f']
R0, C0 = M.GRID; idx = np.arange(R0 * C0).reshape(R0, C0)


def lap(v):
    V = v.reshape(R0, C0, 3)
    return (np.roll(V, 1, 1) + np.roll(V, -1, 1) - 2 * V)[1:-1] + (V[:-2] + V[2:] - 2 * V[1:-1])


def vn(v):
    n = np.zeros_like(v); fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for k in range(3):
        np.add.at(n, f[:, k], fn)
    return n / np.linalg.norm(n, axis=1, keepdims=True)


for path in sys.argv[1:]:
    F = json.load(open(path))
    field = fit.Field(g0, F['params']); field.c = np.array(F['centres_head_m']); field.mirror = field.c[:, 0] > 1e-6
    v1 = fit.apply(g0, field, np.array(F['D_head_m']))['HEAD_face']['v']
    sel = (M.to_local(v0)[:, 2] > 0) & (field.mask(M.to_local(v0)) > 0.02)
    d = np.linalg.norm(v1 - v0, axis=1)[sel] * 1000
    dl = np.linalg.norm(lap(v1) - lap(v0), axis=2).ravel() * 1000
    dl = dl[sel.reshape(R0, C0)[1:-1].ravel()]
    dn = np.degrees(np.arccos(np.clip((vn(v0) * vn(v1)).sum(1), -1, 1)))[sel]
    print(f'{path:28s} disp max {d.max():.2f} p95 {np.percentile(d, 95):.2f} | dlap p95 {np.percentile(dl, 95):.3f} max {dl.max():.3f} | dnormal p95 {np.percentile(dn, 95):.1f} max {dn.max():.1f}')
