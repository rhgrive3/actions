"""Reversible eye-detail pass for the Blender master.

Run from tools/inkwave-modeler with Blender in background mode. Each invocation
restores the saved baseline eye meshes before applying a variant, so repeated
passes cannot accumulate deformation. The rest of the character is untouched.
"""
import argparse
import json
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'analysis' / 'multiview'))
import mvcore as M  # noqa: E402

LASH_NAMES = [f'HEAD_eyes_{i:02d}' for i in list(range(5, 12)) + list(range(22, 29))]
BASE_NAMES = ['HEAD_eyes_04', 'HEAD_eyes_21']
LINER_NAMES = ['HEAD_eyes_03', 'HEAD_eyes_20']
LOWER_NAMES = ['HEAD_eyes_13', 'HEAD_eyes_30']
# Lower strands and lower lid line; cleared together with every other lash piece by the decal rebuild.
EXTRA_LASH_NAMES = [f'HEAD_eyes_{i:02d}' for i in (14, 15, 16, 17, 31, 32, 33, 34)]
FACE_NAMES = ['HEAD_face']
# skin layers and paint lying on the face; they follow the lower-lid smoothing with the face
FACE_LAYER_NAMES = ['HEAD_skin', 'HEAD_skin_04']
EYE_SURFACE_NAMES = ['HEAD_face', 'HEAD_eyes', 'HEAD_eyes_18', 'HEAD_eyes_02', 'HEAD_eyes_19']
BROW_NAMES = ['HEAD_brows', 'HEAD_brows_02']
IRIS_IMAGES = {'Image_0': (184.5, 134.0), 'Image_1': (198.5, 134.0)}
BACKUP_SUFFIX = '__pre_eye_refine'
FACE_PAINT_MATERIAL = 'INKWAVE_face_skin_lash'
FACE_PAINT_IMAGE = 'INKWAVE_face_lash_paint'
WING_VARIANTS = {
    'depth1': {'forward_mm': 3.0},
    'depth2': {'forward_mm': 6.0},
    'depth3': {'forward_mm': 9.0},
}
LOWER_VARIANTS = {
    'low1': {'N': 0},
    'low2': {'N': 2, 'X0': 69.0, 'X1': 72.5, 'LEN0': 2.5, 'LEN1': 3.2,
             'R0': 0.60, 'ANG0': 25.0, 'ANG1': 50.0},
    'low3': {'N': 3, 'X0': 67.0, 'X1': 72.5, 'LEN0': 2.8, 'LEN1': 3.8,
             'R0': 0.70, 'ANG0': 25.0, 'ANG1': 55.0},
    'low4': {'mode': 'ribbon', 'roots': [68.5, 70.5, 72.5],
             'lengths': [1.4, 1.8, 2.1], 'width_mm': 0.8, 'out_mm': 0.5, 'surface_mm': 0.30},
    'low5': {'mode': 'ribbon', 'roots': [68.5, 70.5, 72.5],
             'lengths': [1.8, 2.3, 2.7], 'width_mm': 1.2, 'out_mm': 0.8, 'surface_mm': 0.40},
    'low6': {'mode': 'ribbon', 'roots': [67.5, 69.2, 71.0, 72.8],
             'lengths': [2.1, 2.5, 3.0, 3.4], 'width_mm': 1.5, 'out_mm': 1.0, 'surface_mm': 0.50},
    # iteration-33: lower too thin (ratio ~0). Thicken vs low5, avoid low6 jagged edge.
    'low7': {'mode': 'ribbon', 'roots': [68.5, 70.5, 72.5],
             'lengths': [2.2, 2.8, 3.2], 'width_mm': 1.6, 'out_mm': 0.9, 'surface_mm': 0.40},
    'low8': {'mode': 'ribbon', 'roots': [68.0, 69.8, 71.2, 72.8],
             'lengths': [2.0, 2.5, 3.0, 3.4], 'width_mm': 1.4, 'out_mm': 0.9, 'surface_mm': 0.40},
    'low9': {'mode': 'ribbon', 'roots': [68.5, 70.5, 72.5],
             'lengths': [2.0, 2.5, 3.0], 'width_mm': 2.0, 'out_mm': 0.8, 'surface_mm': 0.35},
}
LASH_VARIANTS = {
    'a': {'width': 1.35, 'length': 1.10, 'lift_mm': 0.4, 'out_mm': 0.3,
          'inner_width': 1.0, 'inner_length': 1.0},
    'b': {'width': 1.60, 'length': 1.23, 'lift_mm': 0.9, 'out_mm': 0.8,
          'inner_width': 0.65, 'inner_length': 0.65},
    'c': {'width': 1.90, 'length': 1.30, 'lift_mm': 1.5, 'out_mm': 1.3,
          'inner_width': 0.35, 'inner_length': 0.45},
    'd': {'mode': 'blade', 'width_mm': 1.8, 'height_mm': 3.8, 'out_mm': 1.8},
    # iteration-34: four claw lashes whose roots sit on the model's upper liner edge and
    # whose 3D direction reproduces the reference tip offsets in the front, q34R and sideR views.
    'f1': {'mode': 'fit', 'radius_mm': 0.45, 'bulge': 0.15, 'length': 1.0},
    'f2': {'mode': 'fit', 'radius_mm': 0.60, 'bulge': 0.22, 'length': 1.0},
    'f3': {'mode': 'fit', 'radius_mm': 0.75, 'bulge': 0.30, 'length': 1.12},
    # Reference lashes are straight sawtooth wedges: wide along the liner, thin in depth.
    'g1': {'mode': 'fit', 'radius_mm': 0.90, 'depth_ratio': 0.5, 'bulge': 0.0, 'length': 1.5},
    'g2': {'mode': 'fit', 'radius_mm': 1.10, 'depth_ratio': 0.5, 'bulge': 0.0, 'length': 1.7},
    'g3': {'mode': 'fit', 'radius_mm': 1.30, 'depth_ratio': 0.45, 'bulge': 0.0, 'length': 1.9},
    # iteration-34 rebuild: every lash piece is removed and the whole liner, wing, lash teeth
    # and lower lash line become one textured decal fitted to the front, q34R and sideR views.
    'k1': {'mode': 'decal', 'combine': 'median', 'surface_mm': 0.15},
    'k2': {'mode': 'decal', 'combine': 'front', 'surface_mm': 0.15},
    'k3': {'mode': 'decal', 'combine': 'min', 'surface_mm': 0.15},
    # Same decal, but each reference view is first warped (thin-plate spline) so its eye
    # opening lands on the model's eye opening in that camera.
    'e1': {'mode': 'decal', 'combine': 'median', 'surface_mm': 0.15, 'warp': True},
    'e2': {'mode': 'decal', 'combine': 'front', 'surface_mm': 0.15, 'warp': True},
    'e3': {'mode': 'decal', 'combine': 'frontonly', 'surface_mm': 0.15, 'warp': True},
    'k4': {'mode': 'decal', 'combine': 'frontonly', 'surface_mm': 0.15},
    # front-only decal lifted over the temple hair shell; upper edge ramp sets tooth strength,
    # lower lashes keep the reference's partial (brown) coverage scaled by lower_gain.
    'h1': {'mode': 'decal', 'combine': 'frontonly', 'surface_mm': 0.15, 'upper_ramp': (0.20, 0.60), 'lower_gain': 0.9},
    'h2': {'mode': 'decal', 'combine': 'frontonly', 'surface_mm': 0.15, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'h3': {'mode': 'decal', 'combine': 'frontonly', 'surface_mm': 0.15, 'upper_ramp': (0.08, 0.40), 'lower_gain': 0.7},
    # The reference lashes float in front of the lid. Keep the front silhouette exactly and
    # choose each point's depth along the front camera ray (plane sweep) so the q34R and
    # sideR reference silhouettes also match; 'blur_px' aggregates the evidence.
    's1': {'mode': 'sweep', 'blur_px': 2.0, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    's2': {'mode': 'sweep', 'blur_px': 3.5, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    's3': {'mode': 'sweep', 'blur_px': 6.0, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    # Smooth offset curves (upper and lower lash) along the eye, fitted to the soft
    # silhouette IoU of the q34R and sideR reference views; 'tilt' lets the part above the
    # liner's lower edge lean forward (mm of extra offset per reference pixel of height).
    'p1': {'mode': 'sweep', 'fit': 'spline', 'knots': 9, 'tilt': False, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'p2': {'mode': 'sweep', 'fit': 'spline', 'knots': 13, 'tilt': False, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'p3': {'mode': 'sweep', 'fit': 'spline', 'knots': 9, 'tilt': True, 'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    # Standard character-lash construction: the liner + wing is a separate thick strip swept
    # between two 3D edge curves fitted to the front, q34R and sideR reference silhouettes
    # (analysis/multiview/lash_strip_fit.json); each lash tooth is its own tapered piece
    # standing on the strip's top edge. Nothing is painted on the skin.
    't1': {'mode': 'strip', 'thickness_mm': 0.35, 'tooth_mm': 0.55},
    't2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 0.70},
    't3': {'mode': 'strip', 'thickness_mm': 0.70, 'tooth_mm': 0.85},
    'x1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 0.90, 'tooth_len': 1.0, 'lower_decal': 0.9},
    'x2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.10, 'tooth_len': 1.2, 'lower_decal': 0.9},
    'x3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.30, 'tooth_len': 1.35, 'lower_decal': 0.9},
    # user request 2026-09-28: bottom edge fixed, top edge leaned 10 degrees forward
    'y1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.0, 'tooth_len': 1.0, 'lower_decal': 0.9, 'tilt_deg': 10},
    'y2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.3, 'tooth_len': 1.0, 'lower_decal': 0.9, 'tilt_deg': 10},
    'y3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.3, 'tooth_len': 1.2, 'lower_decal': 0.9, 'tilt_deg': 10},
    'z1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.2, 'tooth_len': 1.0, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.10, 'wing_trim': 0.03},
    'z2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.03},
    # chosen base z2 + user request: shorter outer wing tip, thin inner end, no ink smears
    'c1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.06, 'inner_len': 0.25, 'inner_min': 0.40,
           'lower_max_u': 128, 'lower_floor': 0.2, 'lower_min_nz': 0.45},
    'c2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.08, 'inner_len': 0.30, 'inner_min': 0.28,
           'lower_max_u': 124, 'lower_floor': 0.25, 'lower_min_nz': 0.5},
    'c3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.35, 'inner_min': 0.18,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55},
    # sharp inner corner: the strip narrows to a needle point and follows the lid a little further
    'd1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.35, 'inner_min': 0.0, 'inner_ext': 0.0,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55},
    'd2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.35, 'inner_min': 0.0, 'inner_ext': 0.04,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55},
    'd3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55},
    # d3 + small forward inner-corner lashes (sharp inner end seen from q34R / sideR)
    'e4': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55,
           'inner_teeth': [(0.10, 1.6, 0.45, 25), (0.18, 1.9, 0.5, 20), (0.27, 2.2, 0.55, 15)]},
    'e5': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55,
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # e5 with the lower lashes restored: only the inner-corner part (the ink) stays removed
    'f5': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12,
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # f5 with only the steepest (stretched) lower-lash marks faded
    'f6': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # f6 with 3D lower lashes (lid line + short lashes) instead of the faint skin marks
    'l1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.30, 'line_end': 0.85,
                       'count': 7, 'start': 0.04, 'end': 0.55, 'angle_deg': 35, 'forward': 0.25,
                       'len_outer': 2.4, 'len_inner': 1.4, 'lash_mm': 0.35},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'l2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.40, 'line_end': 0.85,
                       'count': 7, 'start': 0.04, 'end': 0.55, 'angle_deg': 35, 'forward': 0.25,
                       'len_outer': 2.8, 'len_inner': 1.6, 'lash_mm': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'l3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.50, 'line_end': 0.85,
                       'count': 8, 'start': 0.04, 'end': 0.55, 'angle_deg': 35, 'forward': 0.25,
                       'len_outer': 3.2, 'len_inner': 1.8, 'lash_mm': 0.55},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # lower lashes as short brush strokes on the outer part, a little below the lid line
    'o1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 6, 'start': 0.03, 'end': 0.36, 'angle_deg': 40, 'forward': 0.1,
                       'len_outer': 3.0, 'len_inner': 2.0, 'lash_mm': 0.75, 'gap_mm': 2.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'o2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 7, 'start': 0.03, 'end': 0.4, 'angle_deg': 45, 'forward': 0.1,
                       'len_outer': 3.4, 'len_inner': 2.2, 'lash_mm': 0.85, 'gap_mm': 2.5, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'o3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 7, 'start': 0.03, 'end': 0.44, 'angle_deg': 50, 'forward': 0.1,
                       'len_outer': 3.8, 'len_inner': 2.4, 'lash_mm': 0.95, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # longer brush-stroke lower lashes lying along the skin
    'q4': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 7, 'start': 0.03, 'end': 0.44, 'angle_deg': 50, 'forward': 0.0,
                       'len_outer': 4.5, 'len_inner': 3.0, 'lash_mm': 0.9, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'q5': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 7, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.0, 'len_inner': 3.2, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'q6': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 8, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # lower lashes as one solid painted band (user: no dotted strokes)
    'b1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'band_mm': 1.2, 'band_end': 0.6, 'band_taper': 1.2, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'b2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'band_mm': 1.8, 'band_end': 0.72, 'band_taper': 1.1, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'b3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'band_mm': 2.4, 'band_end': 0.85, 'band_taper': 1.0, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # solid painted lower band on a strongly smoothed lid line
    's4': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'smooth_pts': 11, 'smooth_passes': 3, 'resample': 80, 'band_mm': 3.0, 'band_end': 0.65, 'band_taper': 1.2, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    's5': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'smooth_pts': 11, 'smooth_passes': 3, 'resample': 80, 'band_mm': 4.0, 'band_end': 0.75, 'band_taper': 1.2, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    's6': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'smooth_pts': 11, 'smooth_passes': 3, 'resample': 80, 'band_mm': 5.0, 'band_end': 0.85, 'band_taper': 1.2, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 0, 'start': 0.03, 'end': 0.44, 'angle_deg': 55, 'forward': 0.0,
                       'len_outer': 5.5, 'len_inner': 3.5, 'lash_mm': 1.0, 'gap_mm': 3.0, 'profile': 0.45},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # lower lashes painted as one solid band on the skin (front shape, tapered)
    'p4': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 132, 'width_px': 3.0, 'taper': 1.2, 'overlap_px': 0.4, 'rise': 0.18, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 0.6},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'p5': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 138, 'width_px': 4.0, 'taper': 1.1, 'overlap_px': 0.4, 'rise': 0.18, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 0.9},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'p6': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 144, 'width_px': 5.0, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.18, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # thicker solid lower band
    'v7': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 140, 'width_px': 6.0, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.15, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'v8': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 146, 'width_px': 7.5, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.15, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'v9': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'width_px': 9.0, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.15, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # v8 with the lower band joined to the upper wing at the outer corner
    'j1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 146, 'width_px': 7.5, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.03, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2, 'join_px': 4.0, 'corner_width': 0.5},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'j2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 146, 'width_px': 7.5, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.03, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2, 'join_px': 6.0, 'corner_width': 0.6},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'j3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
                      'lower_band': {'u_outer': 100, 'u_inner': 164, 'u_end': 146, 'width_px': 7.5, 'taper': 1.0, 'overlap_px': 0.4, 'rise': 0.03, 'line_px': 0.6, 'line_end_u': 156, 'lift_mm': 1.2, 'join_px': 8.0, 'corner_width': 0.7},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    # stronger lower lashes: thicker, longer, rooted a little below the lid line
    'm1': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.35, 'line_end': 0.85,
                       'count': 7, 'start': 0.04, 'end': 0.55, 'angle_deg': 40, 'forward': 0.1,
                       'len_outer': 2.8, 'len_inner': 1.8, 'lash_mm': 0.55, 'gap_mm': 0.9},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'm2': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.4, 'line_end': 0.85,
                       'count': 7, 'start': 0.04, 'end': 0.55, 'angle_deg': 45, 'forward': 0.1,
                       'len_outer': 3.2, 'len_inner': 2.0, 'lash_mm': 0.7, 'gap_mm': 1.2},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'm3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1,  'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 123, 'lower_floor': 0.12, 'lower_min_nz': 0.35,
           'lower3d': {'u_outer': 103, 'u_inner': 162, 'lift_mm': 0.25, 'line_mm': 0.45, 'line_end': 0.85,
                       'count': 8, 'start': 0.04, 'end': 0.55, 'angle_deg': 50, 'forward': 0.1,
                       'len_outer': 3.6, 'len_inner': 2.2, 'lash_mm': 0.85, 'gap_mm': 1.5},
           'inner_teeth': [(0.10, 2.0, 0.55, 35), (0.19, 2.4, 0.6, 30), (0.29, 2.8, 0.65, 25)]},
    'e6': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.5, 'tooth_len': 1.1, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.18, 'wing_trim': 0.10, 'inner_len': 0.40, 'inner_min': 0.0, 'inner_ext': 0.08,
           'lower_max_u': 120, 'lower_floor': 0.3, 'lower_min_nz': 0.55,
           'inner_teeth': [(0.08, 2.4, 0.6, 45), (0.17, 2.8, 0.7, 40), (0.27, 3.2, 0.75, 35)]},
    'z3': {'mode': 'strip', 'thickness_mm': 0.50, 'tooth_mm': 1.8, 'tooth_len': 1.2, 'lower_decal': 0.9, 'tilt_deg': 10,
           'height_scale': 1.25, 'wing_trim': 0.05},
    'q1': {'mode': 'sweep', 'fit': 'spline', 'knots': 5, 'tilt': False, 'shift': True, 'max_mm': 16, 'lower_max_mm': 2,
           'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'q2': {'mode': 'sweep', 'fit': 'spline', 'knots': 5, 'tilt': True, 'shift': True, 'max_mm': 16, 'lower_max_mm': 2,
           'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'q3': {'mode': 'sweep', 'fit': 'spline', 'knots': 7, 'tilt': True, 'shift': True, 'max_mm': 24, 'lower_max_mm': 4,
           'upper_ramp': (0.12, 0.50), 'lower_gain': 0.8},
    'e': {'mode': 'blade', 'width_mm': 2.4, 'height_mm': 5.0, 'out_mm': 2.4},
    'f': {'mode': 'blade', 'width_mm': 2.9, 'height_mm': 6.2, 'out_mm': 3.1},
    'fan1': {'mode': 'blade', 'width_mm': 1.8, 'height_mm': 3.8, 'out_mm': 1.8,
             'fan_mm': 1.0, 'curve_mm': 0.4, 'width_scale_cap': 1.0,
             'scale_pattern': [0.25, 0.35, 0.70, 0.95, 1.10, 1.25, 1.35]},
    'fan2': {'mode': 'blade', 'width_mm': 1.8, 'height_mm': 4.1, 'out_mm': 1.8,
             'fan_mm': 1.8, 'curve_mm': 0.8, 'width_scale_cap': 1.0,
             'scale_pattern': [0.25, 0.35, 0.70, 0.95, 1.10, 1.25, 1.35]},
    'fan3': {'mode': 'blade', 'width_mm': 1.8, 'height_mm': 4.4, 'out_mm': 1.8,
             'fan_mm': 2.6, 'curve_mm': 1.2, 'width_scale_cap': 1.0,
             'scale_pattern': [0.25, 0.35, 0.70, 0.95, 1.10, 1.25, 1.35]},
    # iteration-32 side overlay: upper excess 76px outer-left, IoU 0.324.
    # Pull outer wing in: shorter out/height + tapered outer scale (i=6 outer).
    'u1': {'mode': 'blade', 'width_mm': 1.6, 'height_mm': 3.0, 'out_mm': 0.8,
           'scale_pattern': [0.30, 0.45, 0.85, 1.00, 0.85, 0.60, 0.40]},
    'u2': {'mode': 'blade', 'width_mm': 2.2, 'height_mm': 3.4, 'out_mm': 1.2,
           'scale_pattern': [0.30, 0.45, 0.85, 1.00, 0.95, 0.75, 0.55]},
    'u3': {'mode': 'blade', 'width_mm': 2.8, 'height_mm': 3.0, 'out_mm': 1.0,
           'scale_pattern': [0.25, 0.40, 0.80, 1.00, 0.90, 0.65, 0.45]},
}
# Lower lashes as a thin smooth lid line plus short, sparse, tapered hairs (the reference's
# fine "tick" lashes). Upper lashes are exactly j1. Each hair: (s along the lid from the
# outer corner 0 -> inner 1, length mm, root width mm, angle deg from straight down toward the
# outer corner, bend (fraction of length, + = toward the outer corner), gap mm below the line,
# rise deg out of the skin). Painted ticks: (s, length mm, width mm, angle deg, gap mm below the line).
J1_UPPER = {k: v for k, v in LASH_VARIANTS['j1'].items() if k != 'lower_band'}
STRAND_HAIRS = {
    'h1': [(0.05, 2.6, 0.95, 58, 0.10, 0.00, 0), (0.12, 1.9, 0.75, 50, 0.06, 0.25, 0),
           (0.19, 3.0, 0.90, 44, 0.08, 0.05, 0), (0.27, 1.7, 0.70, 40, 0.04, 0.35, 0),
           (0.34, 2.3, 0.80, 34, 0.06, 0.15, 0), (0.42, 1.5, 0.60, 28, 0.03, 0.30, 0),
           (0.50, 1.6, 0.55, 24, 0.04, 0.20, 0)],
    # irregular spacing, mixed short/long, near-perpendicular to the lid, leaning a little outward
    'h2': [(0.07, 3.0, 1.15, 30, 0.10, 0.10, 32), (0.13, 2.2, 0.90, 24, 0.06, 0.45, 38),
           (0.20, 3.3, 1.10, 22, 0.08, 0.20, 30), (0.26, 2.0, 0.85, 18, 0.05, 0.55, 40),
           (0.33, 2.7, 1.00, 16, 0.07, 0.30, 34), (0.40, 1.8, 0.80, 12, 0.04, 0.50, 38),
           (0.47, 2.2, 0.80, 10, 0.05, 0.35, 32), (0.54, 1.5, 0.65, 6, 0.03, 0.45, 36)],
    # short dashes lying on the skin just below the line (the reference's front/q34R ticks)
    'h3': [(0.10, 2.4, 1.25, 22, 0.03, 0.30, 8), (0.165, 1.8, 1.05, 16, -0.02, 0.70, 5),
           (0.225, 2.7, 1.30, 18, 0.02, 0.45, 10), (0.29, 1.7, 1.00, 12, 0.03, 0.95, 6),
           (0.345, 2.2, 1.15, 14, -0.02, 0.55, 9), (0.41, 1.6, 0.95, 8, 0.02, 0.85, 5),
           (0.47, 1.9, 0.95, 10, 0.02, 0.60, 7), (0.53, 1.3, 0.80, 4, 0.01, 0.90, 4)],
    # h3 with the first hairs moved off the corner fold, almost straight (no hooks)
    # shorter, fuller ticks (the reference's short dashes)
    't5': [(0.13, 2.0, 1.40, 18, 1.20), (0.225, 1.6, 1.20, 12, 1.60),
           (0.32, 2.1, 1.35, 14, 1.35), (0.43, 1.5, 1.10, 8, 1.75)],
    't4': [(0.13, 2.8, 1.35, 18, 1.35), (0.225, 2.2, 1.15, 14, 1.75),
           (0.32, 2.9, 1.30, 12, 1.50), (0.43, 1.9, 1.05, 8, 1.90)],
    'h4': [(0.12, 2.3, 1.20, 18, 0.01, 0.35, 5), (0.18, 1.7, 1.00, 14, -0.01, 0.75, 4),
           (0.24, 2.6, 1.25, 16, 0.01, 0.45, 6), (0.30, 1.6, 0.95, 11, 0.01, 0.95, 4),
           (0.355, 2.1, 1.10, 12, -0.01, 0.55, 6), (0.415, 1.5, 0.90, 8, 0.01, 0.85, 4),
           (0.47, 1.8, 0.90, 9, 0.01, 0.60, 5), (0.53, 1.2, 0.75, 4, 0.00, 0.90, 3)],
}
LASH_VARIANTS.update({
    'ls1': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.1, 'line_min_mm': 0.12, 'line_power': 1.3,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h1'}),
    # round tapered hairs standing a little out of the skin; three hair scales
    'ls2': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h2', 'hair_shape': 'tube',
                                         'hair_scale': 0.85, 'rise_scale': 1.0}),
    'ls3': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h2', 'hair_shape': 'tube',
                                         'hair_scale': 1.0, 'rise_scale': 1.0}),
    'ls4': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h2', 'hair_shape': 'tube',
                                         'hair_scale': 1.15, 'rise_scale': 1.4}),
    # dashes lying on the skin (h3), three sizes
    'ls5': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 0.9, 'rise_scale': 1.0, 'hair_clear': 0.3}),
    'ls6': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.1, 'rise_scale': 1.0, 'hair_clear': 0.3}),
    'ls7': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.3, 'rise_scale': 1.0, 'hair_clear': 0.3}),
    # h3 dashes moved further below the line (the reference ticks sit apart from the lid line)
    'ls8': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.3, 'gap_add': 0.6}),
    'ls9': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.3, 'gap_add': 1.0}),
    'ls10': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.3, 'gap_add': 1.4}),
    # ls9 lying closer to the skin, slimmer root; shorter join into the wing at the outer corner
    'ls11': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.15, 'hair_clear_mm': 0.25,
                                         'hair_lift_mm': 0.35, 'root_prof': 0.8, 'gap_add': 1.0}),
    'ls12': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 2.5,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.15, 'hair_clear_mm': 0.25,
                                         'hair_lift_mm': 0.35, 'root_prof': 0.8, 'gap_add': 1.0}),
    'ls13': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 2.5,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 1.0, 'hair_clear': 0.15, 'hair_clear_mm': 0.25,
                                         'hair_lift_mm': 0.35, 'root_prof': 0.9, 'gap_add': 1.0}),
    # ls13 dashes flatter and closer to the skin (no floating shadow), full join; three sizes
    'ls14': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.1, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0}),
    'ls15': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0}),
    'ls16': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.3, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0}),
    # ls15 with every lower-lash vertex kept outside the skin (signed nearest distance)
    'ls17': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.1, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0,
                                         'margin_mm': 0.05}),
    'ls18': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0,
                                         'margin_mm': 0.05}),
    'ls19': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'hairs': 'h3', 'hair_shape': 'tube',
                                         'hair_scale': 1.3, 'rise_scale': 0.5, 'hair_clear': 0.1, 'hair_clear_mm': 0.15,
                                         'hair_lift_mm': 0.2, 'root_prof': 0.9, 'hair_depth': 0.3, 'gap_add': 1.0,
                                         'margin_mm': 0.05}),
    # nearest-surface placement (steep outer corner), rounded roots; hair lift / line smoothing
    'ls20': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.3, 'clear_mm': 0.4, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line_sigma': 14, 'hair_lift_mm': 0.08, 'rows': 14}}),
    'ls21': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.3, 'clear_mm': 0.4, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line_sigma': 14, 'hair_lift_mm': 0.15, 'rows': 14}}),
    'ls22': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.3, 'clear_mm': 0.4, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line_sigma': 20, 'hair_lift_mm': 0.08, 'rows': 14}}),
    # ls18 line (height field) with a smoother fit; straight dashes whose height follows the skin
    'ls23': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'smooth': 10.0, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line': False, 'height_only': True, 'hair_lift_mm': 0.08, 'rows': 14}}),
    'ls24': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'smooth': 16.0, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line': False, 'height_only': True, 'hair_lift_mm': 0.08, 'rows': 14}}),
    'ls25': dict(J1_UPPER, lower_strands={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'line_mm': 1.4, 'line_min_mm': 0.12, 'line_power': 1.6,
                                         'lift_mm': 0.6, 'clear_mm': 0.4, 'smooth': 16.0, 'hairs': 'h4', 'hair_shape': 'tube',
                                         'hair_scale': 1.2, 'hair_depth': 0.3, 'gap_add': 1.0, 'margin_mm': 0.05,
                                         'nearest': {'line': False, 'height_only': True, 'hair_lift_mm': 0.15, 'rows': 14}}),
    # lower lashes painted straight into a face-only skin texture (user: no separate parts, 4 ticks)
    'lp1': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.4, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't4', 'tick_scale': 0.9, 'size': 4096}),
    'lp2': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.4, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't4', 'tick_scale': 1.0, 'size': 4096}),
    'lp3': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.4, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't4', 'tick_scale': 1.15, 'size': 4096}),
    # painted: ink finish (no sheen/subsurface under the ink), short ticks; line width / tick size
    'lp4': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.4, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'size': 4096, 'ink_finish': True}),
    'lp5': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.8, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'size': 4096, 'ink_finish': True}),
    'lp6': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.8, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.15, 'size': 4096, 'ink_finish': True}),
    # painted ticks moved off the lid rim onto the cheek-facing skin; outer line width
    'lp7': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.8, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                        'ink_finish': True}),
    'lp8': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.8, 'line_min_mm': 0.12,
                                        'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 1.0, 'size': 4096,
                                        'ink_finish': True}),
    'lp9': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                        'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.3, 'line_min_mm': 0.12,
                                        'line_power': 2.0, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 1.0, 'size': 4096,
                                        'ink_finish': True}),
    # lp7 with the lid line 1.5x wider and joined smoothly into the upper wing at the outer corner
    'lp10': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True, 'corner_rise_mm': 0.0}),
    'lp11': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 6.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True, 'corner_rise_mm': 1.2}),
    'lp12': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 6.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True, 'corner_rise_mm': 2.4}),
    # lid line 1.5x wide whose outer end bends onto the upper wing's lower edge and runs on under it
    'lp13': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 6.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True,
                                         'follow_wing': {'below_px': 0.4, 'blend_px': 2.0}}),
    'lp14': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 8.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True,
                                         'follow_wing': {'below_px': 0.4, 'blend_px': 2.0}}),
    'lp15': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 10.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 2.7, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'no_neck': True,
                                         'follow_wing': {'below_px': 0.4, 'blend_px': 2.0}}),
    # lp7 on smoothed lower-lid skin (Blender Smooth modifier factor/iterations, Surface Deform layers)
    'lp40': dict(J1_UPPER, lower_paint={'u_outer': 100, 'u_inner': 164, 'u_end': 150, 'join_px': 4.0,
                                         'below_px': 0.3, 'smooth': 16.0, 'line_mm': 1.8, 'line_min_mm': 0.12,
                                         'line_power': 1.6, 'ticks': 't5', 'tick_scale': 1.0, 'gap_add': 0.6, 'size': 4096,
                                         'ink_finish': True, 'lid_smooth': {'radius': 10.0, 'factor': 0.5, 'iters': 20, 's_from': 0.1,
                                         's_fade': 0.1, 'above_mm': 1.5, 'above_s': 0.25}}),
})
BRIDGE_VARIANTS = {
    'g': {'height_mm': 1.5, 'top_mm': 0.6, 'front_mm': 0.5},
    'h': {'height_mm': 2.5, 'top_mm': 0.6, 'front_mm': 0.8},
    'i': {'height_mm': 3.5, 'top_mm': 0.6, 'front_mm': 1.1},
    'j': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.8},
    'k': {'height_mm': 2.5, 'top_mm': 2.5, 'front_mm': 1.0},
    'l': {'height_mm': 2.5, 'top_mm': 3.5, 'front_mm': 1.2},
    'm': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 2.0},
    'n': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 4.0},
    'o': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 6.0},
    's': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.8, 'xmax_mm': 82},
    't': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.8, 'xmax_mm': 86},
    'u': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.8, 'xmax_mm': 89},
    'v': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.3, 'xmax_mm': 82, 'conform': True},
    'w': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 0.7, 'xmax_mm': 82, 'conform': True},
    'x': {'height_mm': 2.5, 'top_mm': 1.5, 'front_mm': 1.2, 'xmax_mm': 82, 'conform': True},
    'y1': {'height_mm': 4.0, 'top_mm': 1.5, 'front_mm': 0.3, 'xmax_mm': 82, 'conform': True},
    'y2': {'height_mm': 6.0, 'top_mm': 1.5, 'front_mm': 0.3, 'xmax_mm': 82, 'conform': True},
    'y3': {'height_mm': 8.0, 'top_mm': 1.5, 'front_mm': 0.3, 'xmax_mm': 82, 'conform': True},
    'z1': {'height_mm': 6.5, 'top_mm': 1.5, 'front_mm': 0.3, 'xmax_mm': 82, 'conform': True, 'rows': 3},
    'z2': {'height_mm': 6.5, 'top_mm': 1.5, 'front_mm': 0.5, 'xmax_mm': 82, 'conform': True, 'rows': 5},
    'z3': {'height_mm': 6.5, 'top_mm': 1.5, 'front_mm': 0.7, 'xmax_mm': 82, 'conform': True, 'rows': 9},
    'z4': {'height_mm': 5.0, 'top_mm': 0.8, 'front_mm': 0.35, 'xmin_mm': 56, 'xmax_mm': 82, 'conform': True, 'rows': 7},
    'z5': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7},
    'z6': {'height_mm': 7.0, 'top_mm': 0.8, 'front_mm': 0.55, 'xmin_mm': 63, 'xmax_mm': 82, 'conform': True, 'rows': 9},
    'w1': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
           'patch_scale': 1.15, 'patch_surface_mm': 0.4},
    'w2': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
           'patch_scale': 1.35, 'patch_surface_mm': 0.7},
    'w3': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
           'patch_scale': 1.60, 'patch_surface_mm': 1.0},
    'aa1': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
            'patch_scale': 1.60, 'patch_surface_mm': 1.0, 'outer_drop_mm': 2.0},
    'aa2': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
            'patch_scale': 1.60, 'patch_surface_mm': 1.0, 'outer_drop_mm': 4.0},
    'aa3': {'height_mm': 6.5, 'top_mm': 0.8, 'front_mm': 0.45, 'xmin_mm': 60, 'xmax_mm': 82, 'conform': True, 'rows': 7,
            'patch_scale': 1.60, 'patch_surface_mm': 1.0, 'outer_drop_mm': 6.0},
}
CORNER_VARIANTS = {
    'p': {'sharpen': 0.40, 'drop_mm': 0.3},
    'q': {'sharpen': 0.65, 'drop_mm': 0.8},
    'r': {'sharpen': 0.85, 'drop_mm': 1.5},
    's1': {'thickness': 0.75, 'drop_mm': 0.0},
    's2': {'thickness': 0.60, 'drop_mm': 0.5},
    's3': {'thickness': 0.45, 'drop_mm': 1.0},
    'u1': {'thickness': 0.45, 'drop_mm': 1.0, 'depth_scale': 0.65, 'surface_mm': 0.2},
    'u2': {'thickness': 0.45, 'drop_mm': 1.0, 'depth_scale': 0.40, 'surface_mm': 0.35},
    'u3': {'thickness': 0.45, 'drop_mm': 1.0, 'depth_scale': 0.15, 'surface_mm': 0.5},
    'v1': {'tip_scale': 0.35, 'shorten_mm': 0.0, 'drop_mm': 0.4, 'surface_mm': 0.2},
    'v2': {'tip_scale': 0.20, 'shorten_mm': 1.5, 'drop_mm': 0.7, 'surface_mm': 0.2},
    'v3': {'tip_scale': 0.08, 'shorten_mm': 3.0, 'drop_mm': 1.0, 'surface_mm': 0.2},
}
BROW_VARIANTS = {
    'b1': {'out_mm': 2.5, 'up_mm': 0.8},
    'b2': {'out_mm': 4.5, 'up_mm': 1.8},
    'b3': {'out_mm': 6.5, 'up_mm': 2.8},
    'b4': {'out_mm': 4.5, 'up_mm': 1.8, 'outer_thin': 0.55, 'outer_extra_up_mm': 3.0, 'inner_down_mm': 1.2},
    'b5': {'out_mm': 4.5, 'up_mm': 1.8, 'outer_thin': 0.75, 'outer_extra_up_mm': 3.8, 'inner_down_mm': 2.0},
    'b6': {'out_mm': 4.5, 'up_mm': 1.8, 'outer_thin': 0.85, 'outer_extra_up_mm': 4.5, 'inner_down_mm': 2.7},
    'b7': {'out_mm': 4.5, 'up_mm': 1.8, 'top_thin': 0.50, 'outer_extra_up_mm': 1.5, 'inner_down_mm': 1.0},
    'b8': {'out_mm': 4.5, 'up_mm': 1.8, 'top_thin': 0.70, 'outer_extra_up_mm': 2.0, 'inner_down_mm': 1.8},
    'b9': {'out_mm': 4.5, 'up_mm': 1.8, 'top_thin': 0.85, 'outer_extra_up_mm': 2.5, 'inner_down_mm': 2.5},
    'm1': {'mode': 'reference_strip', 'smooth_px': 0.8, 'surface_mm': 0.4},
    'm2': {'mode': 'reference_strip', 'smooth_px': 1.5, 'surface_mm': 0.7},
    'm3': {'mode': 'reference_strip', 'smooth_px': 2.5, 'surface_mm': 1.0},
    # iteration-34: skin-flush decal whose shape and colour come from the front,
    # q34R and sideR reference views, combined per surface point.
    'r1': {'mode': 'multiview_decal', 'combine': 'min', 'surface_mm': 0.12, 'gain': 1.0},
    'r2': {'mode': 'multiview_decal', 'combine': 'median', 'surface_mm': 0.12, 'gain': 1.0},
    'r3': {'mode': 'multiview_decal', 'combine': 'mean', 'surface_mm': 0.12, 'gain': 1.0},
}
# Matte liner/lash finish: the reference liner has no glossy highlight.
MATTE_VARIANTS = {
    'mt1': {'roughness': 0.85, 'specular': 0.15},
    'mt2': {'roughness': 0.95, 'specular': 0.08},
}
MATTE_MATERIALS = ('eyes_0c0b0e', 'eyes_100d10')
# The eyeball texture paints a red caruncle blob beside the iris; at the inner corner it shows as
# a round pink patch. Replace it (by redness weight) with the sclera colour of the same row.
CARUNCLE_VARIANTS = {'cr1': {'amount': 0.6}, 'cr2': {'amount': 0.85}, 'cr3': {'amount': 1.0}}
# Inner eye corner (canthus): push skin that covers sclera the reference shows at the inner
# corner (front view, iris-aligned) behind the eyeball, so the white ends in a sharp point.
CANTHUS_VARIANTS = {
    'n1': {'u_min': 150, 'grow_px': 0.0, 'depth_mm': 0.4, 'blend_mm': 0.6},
    'n2': {'u_min': 146, 'grow_px': 0.5, 'depth_mm': 0.5, 'blend_mm': 0.8},
    'n3': {'u_min': 142, 'grow_px': 1.0, 'depth_mm': 0.6, 'blend_mm': 1.0},
    # No eyeball lies behind the reference's sharp inner tip, so carving would open a hole.
    # Instead a thin sclera-coloured patch lies on the skin in the reference sclera shape.
    'w1': {'mode': 'patch', 'u_min': 152, 'edge': (0.40, 0.60), 'colour': (0.62, 0.58, 0.60)},
    'w2': {'mode': 'patch', 'u_min': 149, 'edge': (0.45, 0.55), 'colour': (0.70, 0.66, 0.68)},
    'w3': {'mode': 'patch', 'u_min': 146, 'edge': (0.45, 0.55), 'colour': (0.78, 0.75, 0.77)},
    # The pink blob is the skin folding into the socket past the reference tip. Carve skin
    # inside the reference sclera (eyeball behind) and fill the socket pocket beyond the tip
    # up to the surrounding skin (quadric fitted on a ring), so the white ends in a point.
    # patch built from front-camera rays: covers exactly the skin seen inside the reference sclera tip
    'x1': {'mode': 'raypatch', 'u_min': 150.0, 'colour': (0.72, 0.70, 0.72), 'lift_mm': 0.05},
    'x2': {'mode': 'raypatch', 'u_min': 148.0, 'colour': (0.82, 0.80, 0.82), 'lift_mm': 0.05},
    'x3': {'mode': 'raypatch', 'u_min': 146.0, 'colour': (0.90, 0.88, 0.90), 'lift_mm': 0.05},
    'k1': {'mode': 'reshape', 'tip_u': 158.0, 'fill_r_mm': 4.0, 'ring_mm': 4.0, 'depth_mm': 0.4, 'blend_mm': 0.6},
    'k2': {'mode': 'reshape', 'tip_u': 158.0, 'fill_r_mm': 5.5, 'ring_mm': 4.0, 'depth_mm': 0.5, 'blend_mm': 0.8},
    'k3': {'mode': 'reshape', 'tip_u': 157.0, 'fill_r_mm': 7.0, 'ring_mm': 5.0, 'depth_mm': 0.5, 'blend_mm': 1.0},
}
IRIS_VARIANTS = {
    'i1': {'green': 0.90, 'blue': 0.92},
    'i2': {'green': 0.78, 'blue': 0.82},
    'i3': {'green': 0.66, 'blue': 0.71},
    'c1': {'red': 0.90, 'green': 0.88, 'blue': 0.91},
    'c2': {'red': 0.79, 'green': 0.76, 'blue': 0.81},
    'c3': {'red': 0.69, 'green': 0.66, 'blue': 0.72},
    'd1': {'red': 0.90, 'green': 0.88, 'blue': 0.91, 'white_preserve': True},
    'd2': {'red': 0.79, 'green': 0.76, 'blue': 0.81, 'white_preserve': True},
    'd3': {'red': 0.69, 'green': 0.66, 'blue': 0.72, 'white_preserve': True},
}


def args():
    p = argparse.ArgumentParser()
    p.add_argument('--variant', choices=LASH_VARIANTS)
    p.add_argument('--bridge', choices=BRIDGE_VARIANTS)
    p.add_argument('--corner', choices=CORNER_VARIANTS)
    p.add_argument('--brow', choices=BROW_VARIANTS)
    p.add_argument('--iris', choices=IRIS_VARIANTS)
    p.add_argument('--wing', choices=WING_VARIANTS)
    p.add_argument('--lower', choices=LOWER_VARIANTS)
    p.add_argument('--matte', choices=MATTE_VARIANTS)
    p.add_argument('--canthus', choices=CANTHUS_VARIANTS)
    p.add_argument('--caruncle', choices=CARUNCLE_VARIANTS)
    p.add_argument('--save', type=Path, required=True)
    p.add_argument('--restore', action='store_true')
    p.add_argument('--export', type=Path)
    p.add_argument('--game', type=Path)
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


def restore():
    count = 0
    for name in LASH_NAMES + BASE_NAMES + LINER_NAMES + BROW_NAMES + LOWER_NAMES + EXTRA_LASH_NAMES + FACE_NAMES + FACE_LAYER_NAMES:
        obj = bpy.data.objects[name]
        backup = bpy.data.meshes.get(name + BACKUP_SUFFIX)
        if backup is None:
            continue
        current = obj.data
        replacement = backup.copy()
        obj.data = replacement
        if current.users == 0:
            old_name = current.name
            bpy.data.meshes.remove(current)
            replacement.name = old_name
        count += 1
    for name in MATTE_MATERIALS:
        mat = bpy.data.materials[name]
        bsdf = mat.node_tree.nodes['Principled BSDF']
        if BACKUP_SUFFIX in mat:
            rough, spec = mat[BACKUP_SUFFIX]
            bsdf.inputs['Roughness'].default_value = rough
            bsdf.inputs['Specular IOR Level'].default_value = spec
            del mat[BACKUP_SUFFIX]
    # painted lower lashes live in a face-only copy of the skin material; the mesh backup brings back
    # the original material slot, so the copy and its image can go
    for mname in (FACE_PAINT_MATERIAL,):
        mat = bpy.data.materials.get(mname)
        if mat is not None and mat.users == 0:
            bpy.data.materials.remove(mat)
    img = bpy.data.images.get(FACE_PAINT_IMAGE)
    if img is not None and img.users == 0:
        bpy.data.images.remove(img)
    for name in IRIS_IMAGES:
        img = bpy.data.images.get(name)
        backup = bpy.data.images.get(name + BACKUP_SUFFIX)
        if img is None or backup is None:
            continue
        pixels = np.empty(len(backup.pixels), np.float32)
        backup.pixels.foreach_get(pixels)
        img.pixels.foreach_set(pixels)
        img.pack()
        img.update()
        count += 1
    return count


def back_up(obj):
    name = obj.name + BACKUP_SUFFIX
    if bpy.data.meshes.get(name) is None:
        backup = obj.data.copy()
        backup.name = name
        backup.use_fake_user = True


def back_up_image(img):
    name = img.name + BACKUP_SUFFIX
    if bpy.data.images.get(name) is None:
        backup = img.copy()
        backup.name = name
        backup.use_fake_user = True


def world(obj):
    coords = np.empty((len(obj.data.vertices), 3), np.float32)
    obj.data.vertices.foreach_get('co', coords.ravel())
    mat = np.array(obj.matrix_world)
    return coords.astype(np.float64) @ mat[:3, :3].T + mat[:3, 3]


def put_world(obj, coords):
    mat = np.array(obj.matrix_world)
    local = (coords - mat[:3, 3]) @ np.linalg.inv(mat[:3, :3]).T
    obj.data.vertices.foreach_set('co', local.astype(np.float32).ravel())
    obj.data.update()


def wing_depth(obj, variant):
    """Move the outer wing forward with a smooth zero-slope blend at both ends."""
    q = M.to_local(world(obj))
    x = np.abs(q[:, 0]) * 1000
    t = np.clip((x - 76.0) / 12.0, 0.0, 1.0)
    t = t * t * (3.0 - 2.0 * t)
    q[:, 2] += WING_VARIANTS[variant]['forward_mm'] / 1000 * t
    put_world(obj, M.to_world(q))
    return round(float(t.max() * WING_VARIANTS[variant]['forward_mm']), 3)


def lower_lash_rebuild(variant):
    """Replace the six later-added strands while preserving the four original pieces."""
    for name in LOWER_NAMES:
        obj = bpy.data.objects[name]
        back_up(obj)
        if len(obj.data.vertices) != 422:
            raise ValueError(f'{name}: expected 128 original + 294 added vertices')
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= 128], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    cfg = LOWER_VARIANTS[variant]
    if cfg.get('mode') == 'ribbon':
        lower_lash_ribbons(cfg)
    elif cfg['N']:
        sys.path.insert(0, str(ROOT / 'scripts'))
        import inkwave_face_multiview_fit as fit
        fit.LASH.update(cfg)
        fit.lower_lashes()


def lower_lash_ribbons(cfg):
    """Closed tapered blades sit on the outer lower lid without deforming the face."""
    sys.path.insert(0, str(ROOT / 'scripts'))
    import inkwave_face_look as look
    import inkwave_face_multiview_fit as fit
    lid = np.asarray(look.P['lid_lower'])
    bvh = face_depth_bvh()
    for sign, name in ((1, LOWER_NAMES[0]), (-1, LOWER_NAMES[1])):
        verts, faces = [], []
        for x0_mm, length_mm in zip(cfg['roots'], cfg['lengths']):
            root_y_mm = float(np.interp(x0_mm, lid[:, 0], lid[:, 1])) - 0.25
            direction = np.array([cfg['out_mm'], -length_mm], float)
            transverse = np.array([length_mm, cfg['out_mm']], float)
            transverse /= np.linalg.norm(transverse)
            base = len(verts)
            for t, width_factor in ((0.0, 1.0), (0.35, 0.78), (0.70, 0.38), (1.0, 0.015)):
                centre = np.array([x0_mm + direction[0] * t + 0.25 * t * t,
                                   root_y_mm + direction[1] * t])
                for depth in (0.06, -0.06):
                    for across in (-1, 1):
                        xy = centre + across * transverse * cfg['width_mm'] * width_factor / 2
                        x, y = sign * xy[0] / 1000, xy[1] / 1000
                        hit = bvh.ray_cast(Vector((x, y, 0.3)), Vector((0, 0, -1)))[0]
                        if hit is None:
                            raise ValueError(f'{name}: no skin under lower lash at {xy}')
                        verts.append((x, y, hit.z + (cfg['surface_mm'] + depth) / 1000))
            for ring in range(3):
                a, b = base + 4 * ring, base + 4 * (ring + 1)
                faces.extend(((a, a+1, b+1, b), (a+2, b+2, b+3, a+3),
                              (a, b, b+2, a+2), (a+1, a+3, b+3, b+1)))
            faces.extend(((base, base+2, base+3, base+1),
                          (base+12, base+13, base+15, base+14)))
        fit.append_geometry(bpy.data.objects[name], M.to_world(np.asarray(verts)), faces)


def lash_shape(obj, index, variant):
    """Keep one 16-ring tapered lash; the earlier look pass added two comb teeth to each mesh."""
    if LASH_VARIANTS[variant].get('mode') == 'blade':
        return lash_blade(obj, index, variant)
    if len(obj.data.vertices) not in (128, 384):
        raise ValueError(f'{obj.name}: unexpected lash vertex count {len(obj.data.vertices)}')
    q = M.to_local(world(obj))
    sign = 1 if q[:128, 0].mean() > 0 else -1
    main = q[:128].reshape(16, 8, 3).copy()
    centers = main.mean(axis=1)
    root = centers[0].copy()
    cfg = LASH_VARIANTS[variant]
    inner = index < 2
    width = cfg['inner_width'] if inner else cfg['width']
    length = cfg['inner_length'] if inner else cfg['length']
    for ring in range(16):
        t = ring / 15.0
        center = root + (centers[ring] - root) * length
        center[0] += sign * cfg['out_mm'] / 1000 * t ** 1.25
        center[1] += cfg['lift_mm'] / 1000 * t ** 1.4
        main[ring] = center + (main[ring] - centers[ring]) * width
    q[:128] = main.reshape(128, 3)
    put_world(obj, M.to_world(q))
    if len(obj.data.vertices) > 128:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        bm.verts.index_update()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index >= 128], context='VERTS')
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()


def fitted_lash_axes():
    """Roots on the minus-side liner edge and 3D tip offsets matching the reference views."""
    data = json.loads((ROOT / 'analysis/multiview/lash_reference_multiview.json').read_text())['upper']
    liner = np.vstack([world(bpy.data.objects[n]) for n in ('HEAD_eyes_20', 'HEAD_eyes_21')])
    front_px = np.c_[camera_pixels('front', liner)]
    lashes = []
    for i, (tip, root) in enumerate(data['front']):
        # the liner point projecting on the reference root, preferring the visible top edge
        near = np.linalg.norm(front_px - np.array(root), axis=1)
        k = int(np.argmin(near + 0.5 * np.maximum(front_px[:, 1] - root[1], 0)))
        root_world = liner[k]
        rows, rhs = [], []
        eps = 0.0005
        for view in ('front', 'q34R', 'sideR'):
            obs = data[view][i]
            if obs is None:
                continue
            base = np.c_[camera_pixels(view, [root_world])][0]
            for axis in range(3):
                step = np.zeros(3)
                step[axis] = eps
                rows.append((np.c_[camera_pixels(view, [root_world + step])][0] - base) / eps)
            rhs.append(np.array(obs[0]) - np.array(obs[1]))
        jac = np.vstack([np.array(rows[j:j + 3]).T for j in range(0, len(rows), 3)])
        offset = np.linalg.lstsq(jac, np.concatenate(rhs), rcond=None)[0]
        root_local = M.to_local(np.array([root_world]))[0]
        tip_local = M.to_local(np.array([root_world + offset]))[0]
        lashes.append((root_local, tip_local - root_local))
    return lashes


def lash_fit(obj, index, variant, axes):
    """Replace one lash with a round tapered claw; unused lash meshes become empty."""
    cfg = LASH_VARIANTS[variant]
    slot = index - (7 - len(axes))
    original = obj.data
    new = bpy.data.meshes.new(original.name + '_fit')
    verts, faces = [], []
    if slot >= 0:
        sign = 1 if 'HEAD_eyes_0' in obj.name or obj.name in ('HEAD_eyes_10', 'HEAD_eyes_11') else -1
        root, vec = axes[slot]
        root, vec = root.copy(), vec.copy() * cfg['length']
        if sign > 0:
            root[0], vec[0] = -root[0], -vec[0]
        length = np.linalg.norm(vec)
        along = vec / length
        # bulge toward local up so the lash rises first and hooks outward at the tip
        up = np.array([0.0, 1.0, 0.0]) - along * along[1]
        up /= max(np.linalg.norm(up), 1e-9)
        start = root - along * 0.0006
        ctrl = root + vec * 0.5 + up * cfg['bulge'] * length
        rings, sides = 12, 8
        pts = []
        for r in range(rings + 1):
            t = r / rings
            p = (1 - t) ** 2 * start + 2 * (1 - t) * t * ctrl + t * t * (root + vec)
            d = 2 * (1 - t) * (ctrl - start) + 2 * t * (root + vec - ctrl)
            pts.append((p, d / np.linalg.norm(d), t))
        for p, d, t in pts:
            a = np.cross(d, [0.0, 0.0, 1.0])
            if np.linalg.norm(a) < 1e-6:
                a = np.cross(d, [1.0, 0.0, 0.0])
            a /= np.linalg.norm(a)
            b = np.cross(d, a)
            radius = cfg['radius_mm'] / 1000 * max((1 - t) ** 0.85, 0.04)
            depth = radius * cfg.get('depth_ratio', 1.0)
            for k in range(sides):
                ang = 2 * np.pi * k / sides
                verts.append(p + radius * np.cos(ang) * a + depth * np.sin(ang) * b)
        for r in range(rings):
            for k in range(sides):
                a0, a1 = r * sides + k, r * sides + (k + 1) % sides
                faces.append((a0, a1, a1 + sides, a0 + sides))
        faces.append(tuple(range(sides))[::-1])
        faces.append(tuple(range(rings * sides, rings * sides + sides)))
        world_coords = M.to_world(np.asarray(verts))
        mat = np.array(obj.matrix_world)
        verts = ((world_coords - mat[:3, 3]) @ np.linalg.inv(mat[:3, :3]).T).tolist()
    new.from_pydata(verts, [], faces)
    new.update()
    for material in original.materials:
        new.materials.append(material)
    for poly in new.polygons:
        poly.use_smooth = True
    obj.data = new
    if original.users == 0:
        name = original.name
        bpy.data.meshes.remove(original)
        new.name = name


LASH_GRID_MM = (18.0, 96.0, -34.0, 14.0, 0.2)


def eye_surface_bvh():
    """Local-space height field of skin, sclera and cornea seen from the front."""
    verts, polys = [], []
    for name in EYE_SURFACE_NAMES:
        obj = bpy.data.objects[name]
        base = sum(len(v) for v in verts)
        verts.append(M.to_local(world(obj)))
        polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    verts = np.vstack(verts)
    local = BVHTree.FromPolygons([Vector(v) for v in verts], polys)
    world_tree = BVHTree.FromPolygons([Vector(v) for v in M.to_world(verts)], polys)
    return local, world_tree


def model_opening(view, roi, world_tree, face_polys, ss=3):
    """Where the eyeball is the first surface hit, on the ROI at ss samples per box pixel."""
    scene = bpy.context.scene
    cam = bpy.data.objects['FACE_FIT_CAM_' + view]
    w, h = [int(v) for v in cam['inkwave_resolution']]
    original = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inverse = (cam.calc_matrix_camera(depsgraph, x=w, y=h, scale_x=1, scale_y=1)
               @ cam.matrix_world.inverted()).inverted()
    scene.render.resolution_x, scene.render.resolution_y = original
    xs = roi[0] + (np.arange((roi[2] - roi[0]) * ss) + 0.5) / ss
    ys = roi[1] + (np.arange((roi[3] - roi[1]) * ss) + 0.5) / ss
    mask = np.zeros((len(ys), len(xs)), bool)
    for j, py in enumerate(ys):
        for i, px in enumerate(xs):
            ray = []
            for clip_z in (-1, 1):
                p = inverse @ Vector((2 * px / w - 1, 1 - 2 * py / h, clip_z, 1))
                ray.append(Vector((p.x / p.w, p.y / p.w, p.z / p.w)))
            hit = world_tree.ray_cast(ray[0], (ray[1] - ray[0]).normalized(), 50)
            mask[j, i] = hit[0] is not None and hit[2] >= face_polys
    return mask, xs, ys


def opening_landmarks(mask, xs, ys, count=24):
    """Two eye corners plus upper and lower lid points at matching fractions between them."""
    yy, xx = np.nonzero(mask)
    px, py = xs[xx], ys[yy]
    step = xs[1] - xs[0]
    left = np.array([px.min(), py[px <= px.min() + step].mean()])
    right = np.array([px.max(), py[px >= px.max() - step].mean()])
    axis = right - left
    normal = np.array([axis[1], -axis[0]]) / np.linalg.norm(axis)   # image up
    def inside(p):
        i = int((p[0] - xs[0]) / step + 0.5)
        j = int((p[1] - ys[0]) / step + 0.5)
        return 0 <= i < len(xs) and 0 <= j < len(ys) and mask[j, i]
    points = [left, right]
    for frac in np.linspace(0.06, 0.94, count):
        centre = left + frac * axis
        for sgn in (1, -1):
            # start inside the opening, then walk out to its edge
            t = 0.0
            if not inside(centre):
                found = [tt for tt in np.arange(-15, 15, 0.1) if inside(centre + tt * normal)]
                if not found:
                    raise ValueError('eye opening landmark search failed')
                t = min(found, key=abs)
            while inside(centre + (t + sgn * 0.1) * normal):
                t += sgn * 0.1
            points.append(centre + t * normal)
    return np.array(points)


def tps_fit(src, dst, smooth=1.0):
    """Thin-plate spline mapping src -> dst (2D); returns a callable."""
    n = len(src)
    def kernel(a, b):
        r2 = ((a[:, None, :] - b[None, :, :]) ** 2).sum(-1)
        return np.where(r2 > 0, 0.5 * r2 * np.log(np.maximum(r2, 1e-12)), 0.0)
    K = kernel(src, src) + smooth * np.eye(n)
    P = np.c_[np.ones(n), src]
    A = np.zeros((n + 3, n + 3))
    A[:n, :n], A[:n, n:], A[n:, :n] = K, P, P.T
    coef = np.linalg.solve(A, np.r_[dst, np.zeros((3, 2))])
    def f(pts):
        return kernel(pts, src) @ coef[:n] + np.c_[np.ones(len(pts)), pts] @ coef[n:]
    return f


def lash_decal_field(combine, warp=False, cfg=None):
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    local_tree, world_tree = eye_surface_bvh()
    x0, x1, y0, y1, step = LASH_GRID_MM
    xs, ys = np.arange(x0, x1 + 1e-6, step), np.arange(y0, y1 + 1e-6, step)
    gx, gy = np.meshgrid(xs, ys)
    q = np.zeros((gx.size, 3))
    q[:, 0], q[:, 1] = -gx.ravel() / 1000, gy.ravel() / 1000
    found = np.zeros(len(q), bool)
    for i in range(len(q)):
        hit = local_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if hit is not None:
            q[i, 2], found[i] = hit.z, True
    world_points = M.to_world(q)
    face_polys = len(bpy.data.objects[EYE_SURFACE_NAMES[0]].data.polygons)
    alphas, visible = [], []
    for name, view in zip(data['names'], data['views']):
        if cfg and cfg.get('front_only_views') and str(view) != 'front':
            continue
        u, v = camera_pixels(str(view), world_points)
        if cfg and cfg.get('shift'):
            u, v = u - LASH_VIEW_SHIFT[str(view)][0], v - LASH_VIEW_SHIFT[str(view)][1]
        if str(view) == 'front':
            front_u = u
        roi = data[f'{name}_roi']
        if warp:
            mask, mx, my = model_opening(str(view), roi, world_tree, face_polys)
            model_pts = opening_landmarks(mask, mx, my)
            ref = data[f'{name}_opening'].astype(bool)
            ref_pts = opening_landmarks(ref, roi[0] + np.arange(ref.shape[1]) + 0.5,
                                        roi[1] + np.arange(ref.shape[0]) + 0.5)
            mapped = tps_fit(model_pts, ref_pts)(np.c_[u, v])
            u, v = mapped[:, 0], mapped[:, 1]
            print('LASH_WARP', view, 'landmark shift px', round(float(np.abs(ref_pts - model_pts).mean()), 2))
        alphas.append(bilinear(data[f'{name}_alpha'], u - roi[0], v - roi[1]))
        if f'{name}_lower' in data:
            lower = bilinear(data[f'{name}_lower'].astype(float), u - roi[0], v - roi[1]) > 0.5
        eye = np.array(bpy.data.objects['FACE_FIT_CAM_' + str(view)].matrix_world.translation)
        vis = np.zeros(len(q), bool)
        for i in np.nonzero(found)[0]:
            d = world_points[i] - eye
            dist = np.linalg.norm(d)
            hit = world_tree.ray_cast(Vector(eye), Vector(d / dist), dist + 0.01)
            vis[i] = hit[0] is not None and hit[3] > dist - 0.0008
        visible.append(vis)
    alphas, visible = np.array(alphas), np.array(visible)
    masked = np.where(visible, alphas, np.nan)
    with np.errstate(all='ignore'):
        if combine == 'median':
            alpha = np.nanmedian(masked, 0)
        elif combine == 'min':
            alpha = np.nanmin(masked, 0)
        elif combine == 'frontonly':
            alpha = masked[0]
        else:
            weight = np.where(visible, np.array([2.0, 1.0, 1.0])[:, None], 0)
            alpha = (np.nan_to_num(masked) * weight).sum(0) / weight.sum(0)
    alpha = np.nan_to_num(alpha) * found
    lo, hi = (cfg or {}).get('upper_ramp', (0.2, 0.7))
    upper = np.clip((alpha - lo) / (hi - lo), 0, 1)
    upper = upper * upper * (3 - 2 * upper)
    if cfg and cfg.get('lower_only'):
        alpha = np.where(lower, alpha * cfg['lower_gain'], 0.0)
        if cfg.get('lower_max_u'):
            alpha = alpha * (front_u < cfg['lower_max_u'])
        if cfg.get('lower_floor'):
            alpha = np.where(alpha < cfg['lower_floor'], 0.0, alpha)
    elif cfg and 'lower_gain' in cfg:
        alpha = np.where(lower, alpha * cfg['lower_gain'], upper)
    else:
        alpha = upper
    shape = gx.shape
    return q.reshape(shape + (3,)), alpha.reshape(shape), data['black']


def lash_decal_rebuild(variant):
    """Clear every upper/lower lash piece and rebuild them as one reference-fitted decal."""
    cfg = LASH_VARIANTS[variant]
    for name in LASH_NAMES + BASE_NAMES + LINER_NAMES + LOWER_NAMES + EXTRA_LASH_NAMES:
        obj = bpy.data.objects[name]
        back_up(obj)
        replace_mesh(obj, np.zeros((0, 3)), [], '_cleared')
    surface, alpha, black = lash_decal_field(cfg['combine'], cfg.get('warp', False), cfg)
    # the shaved temple is a hair shell just over the skin; the wing must lie on top of it
    hair = bpy.data.objects.get('HAIR_hair')
    if hair is not None:
        hq = M.to_local(world(hair))
        hair_tree = BVHTree.FromPolygons([Vector(v) for v in hq], [list(p.vertices) for p in hair.data.polygons])
        lifted = 0
        for j, i in zip(*np.nonzero(alpha > 0.0)):
            p = surface[j, i]
            for sgn in (-1, 1):
                start = Vector((sgn * abs(p[0]), p[1], p[2] + 0.00002))
                hit = hair_tree.ray_cast(start, Vector((0, 0, 1)), 0.003)
                if hit[0] is not None and sgn == -1:
                    surface[j, i, 2] = hit[0].z
                    lifted += 1
        print('LASH_DECAL lifted over hair shell', lifted)
    colour = np.broadcast_to(np.asarray(black, float), alpha.shape + (3,))
    img = brow_decal_image('INKWAVE_lash_decal', alpha, colour, 1.0)
    mat = brow_decal_material('INKWAVE_lash_decal', img)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Specular IOR Level'].default_value = 0.1
    ny, nx = alpha.shape
    keep = alpha > 0.004
    for _ in range(2):
        grown = keep.copy()
        grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
        grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
        keep = grown
    for name in LINER_NAMES:
        obj = bpy.data.objects[name]
        sign = 1 if name == 'HEAD_eyes_03' else -1
        index, verts, uvs, faces = {}, [], [], []
        def vid(j, i):
            if (j, i) not in index:
                index[(j, i)] = len(verts)
                p = surface[j, i].copy()
                p[0] = sign * abs(p[0])
                p[2] += cfg['surface_mm'] / 1000
                verts.append(p)
                uvs.append(((i + 0.5) / nx, (j + 0.5) / ny))
            return index[(j, i)]
        for j in range(ny - 1):
            for i in range(nx - 1):
                if keep[j:j + 2, i:i + 2].all():
                    quad = [vid(j, i), vid(j, i + 1), vid(j + 1, i + 1), vid(j + 1, i)]
                    faces.append(quad[::-1] if sign < 0 else quad)
        replace_mesh(obj, np.asarray(verts), faces, '_lash_decal')
        me = obj.data
        me.materials.clear()
        me.materials.append(mat)
        layer = me.uv_layers.new(name='UVMap')
        for loop in me.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
        for poly in me.polygons:
            poly.use_smooth = True
    return float(alpha.sum() * LASH_GRID_MM[4] ** 2)


 # Model minus reference iris-hull centroid per view (box px), measured on the iteration-34
# CYCLES renders of best-current; the reference lash masks are moved by this so they sit
# on the model's eye rather than on the reference sheet's absolute position.
LASH_VIEW_SHIFT = {'front': (1.8, 2.5), 'q34R': (4.8, 0.2), 'sideR': (3.4, 3.2)}
SWEEP_SS = 3                  # samples per reference pixel in the front view
SWEEP_DEPTH_MM = (0.2, 30.0, 0.4)


def camera_matrix(view):
    """World -> clip matrix and pixel size of a fitted reference camera."""
    scene = bpy.context.scene
    cam = bpy.data.objects['FACE_FIT_CAM_' + view]
    w, h = [int(v) for v in cam['inkwave_resolution']]
    original = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mat = np.array(cam.calc_matrix_camera(depsgraph, x=w, y=h, scale_x=1, scale_y=1)
                   @ cam.matrix_world.inverted())
    scene.render.resolution_x, scene.render.resolution_y = original
    return mat, w, h


def to_pixels(mat, w, h, pts):
    clip = np.c_[pts, np.ones(len(pts))] @ mat.T
    ndc = clip[:, :3] / clip[:, 3:4]
    return (ndc[:, 0] + 1) / 2 * w, (1 - ndc[:, 1]) / 2 * h


def gaussian_blur(img, sigma):
    radius = max(1, int(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-radius, radius + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.apply_along_axis(lambda r: np.convolve(np.pad(r, radius, mode='edge'), k, 'valid'), 0, img)
    return np.apply_along_axis(lambda r: np.convolve(np.pad(r, radius, mode='edge'), k, 'valid'), 1, out)


def lash_sweep_rebuild(variant):
    """Clear every lash piece; build one floating lash sheet from the three reference views."""
    cfg = LASH_VARIANTS[variant]
    for name in LASH_NAMES + BASE_NAMES + LINER_NAMES + LOWER_NAMES + EXTRA_LASH_NAMES:
        obj = bpy.data.objects[name]
        back_up(obj)
        replace_mesh(obj, np.zeros((0, 3)), [], '_cleared')
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    names = [str(n) for n in data['names']]
    front = names[0]
    roi = data[f'{front}_roi']
    ss = SWEEP_SS
    fw, fh = (roi[2] - roi[0]) * ss, (roi[3] - roi[1]) * ss
    us = roi[0] + (np.arange(fw) + 0.5) / ss
    vs = roi[1] + (np.arange(fh) + 0.5) / ss
    gu, gv = np.meshgrid(us, vs)
    fs = LASH_VIEW_SHIFT['front'] if cfg.get('shift') else (0.0, 0.0)
    raw = bilinear(data[f'{front}_alpha'], gu.ravel() - fs[0] - roi[0], gv.ravel() - fs[1] - roi[1])
    lower = bilinear(data[f'{front}_lower'].astype(float), gu.ravel() - fs[0] - roi[0], gv.ravel() - fs[1] - roi[1]) > 0.5
    lo, hi = cfg['upper_ramp']
    upper = np.clip((raw - lo) / (hi - lo), 0, 1)
    alpha = np.where(lower, raw * cfg['lower_gain'], upper * upper * (3 - 2 * upper))
    # camera rays through the front samples and their skin intersection
    fmat, w, h = camera_matrix('front')
    inv = np.linalg.inv(fmat)
    def unproject(z):
        ndc = np.c_[2 * gu.ravel() / w - 1, 1 - 2 * gv.ravel() / h, np.full(gu.size, z), np.ones(gu.size)]
        p = ndc @ inv.T
        return p[:, :3] / p[:, 3:4]
    near, far = unproject(-1), unproject(1)
    direction = (far - near) / np.linalg.norm(far - near, axis=1)[:, None]
    _, world_tree = eye_surface_bvh()
    face = bpy.data.objects['HEAD_face']
    face_tree = BVHTree.FromPolygons([Vector(v) for v in world(face)], [list(p.vertices) for p in face.data.polygons])
    active = np.nonzero(raw > 0.01)[0]
    skin_t = np.full(gu.size, np.nan)
    front_t = np.full(gu.size, np.nan)
    for i in active:
        hit = face_tree.ray_cast(Vector(near[i]), Vector(direction[i]), 50)
        if hit[0] is not None:
            skin_t[i] = hit[3]
        hit = world_tree.ray_cast(Vector(near[i]), Vector(direction[i]), 50)
        if hit[0] is not None:
            front_t[i] = hit[3]
    active = active[np.isfinite(skin_t[active]) & np.isfinite(front_t[active])]
    others = []
    for name in names[1:]:
        view = str(data['views'][names.index(name)])
        mat, vw, vh = camera_matrix(view)
        ref_alpha = data[f'{name}_alpha']
        r = data[f'{name}_roi'].astype(float)
        if cfg.get('shift'):
            r = r + np.array(LASH_VIEW_SHIFT[view] * 2)
        others.append((name, mat, vw, vh, r, ref_alpha))
    if cfg.get('fit') == 'spline':
        uu = gu.ravel()[active]
        vv = gv.ravel()[active]
        low = lower[active]
        # height above the liner's lower edge, per column, for the optional forward tilt
        base_v = np.zeros(len(active))
        for col in np.unique(np.round(uu * ss)):
            m = (np.round(uu * ss) == col) & ~low & (raw[active] > 0.5)
            if m.any():
                base_v[np.round(uu * ss) == col] = vv[m].max()
        height = np.clip(base_v - vv, 0, None) * (~low)
        ku = np.linspace(us[0], us[-1], cfg['knots'])
        kl = np.linspace(us[0], us[-1], 5)
        w_a = raw[active]
        def positions(pu, pl, tilt):
            off = np.where(low, np.interp(uu, kl, pl), np.interp(uu, ku, pu) + tilt * height) / 1000
            t = np.minimum(skin_t[active] - off, front_t[active] - 0.0003)
            return near[active] + direction[active] * t[:, None]
        def iou(pu, pl, tilt):
            pts = positions(pu, pl, tilt)
            total = 0.0
            for name, mat, vw, vh, r, ref_alpha in others:
                u, v = to_pixels(mat, vw, vh, pts)
                i = np.floor(u - r[0]).astype(int)
                j = np.floor(v - r[1]).astype(int)
                ok = (i >= 0) & (j >= 0) & (i < ref_alpha.shape[1]) & (j < ref_alpha.shape[0])
                pred = np.zeros_like(ref_alpha)
                np.maximum.at(pred, (j[ok], i[ok]), w_a[ok])
                total += np.minimum(pred, ref_alpha).sum() / max(np.maximum(pred, ref_alpha).sum(), 1e-6)
            return total / len(others)
        grid = np.array([0.2, 1, 2, 3, 4, 5, 6, 8, 10, 12, 14, 17, 20, 24, 28])
        pu, pl, tilt = np.full(len(ku), 2.0), np.full(len(kl), 1.0), 0.0
        if 'lower_max_mm' in cfg:
            kl = np.linspace(us[0], us[-1], 3)
            pl = np.full(len(kl), 0.5)
        best = iou(pu, pl, tilt)
        for sweep in range(4):
            for arr, cap in ((pu, cfg.get('max_mm', 28)), (pl, cfg.get('lower_max_mm', 28))):
                for k in range(len(arr)):
                    keep_v = arr[k]
                    for g in grid[grid <= cap]:
                        arr[k] = g
                        sc = iou(pu, pl, tilt)
                        if sc > best + 1e-6:
                            best, keep_v = sc, g
                    arr[k] = keep_v
            if cfg.get('tilt'):
                for g in np.arange(0, 2.01, 0.1):
                    sc = iou(pu, pl, g)
                    if sc > best + 1e-6:
                        best, tilt = sc, g
            print(f'LASH_SPLINE sweep {sweep} mean IoU {best:.3f}')
        print('LASH_SPLINE upper knots mm', pu.round(1).tolist(), 'lower', pl.round(1).tolist(), 'tilt', round(tilt, 2))
        depth = np.zeros(gu.size)
        depth[active] = skin_t[active] - np.minimum(skin_t[active] - np.where(
            low, np.interp(uu, kl, pl), np.interp(uu, ku, pu) + tilt * height) / 1000, front_t[active] - 0.0003)
        skin_t = skin_t.copy()
    else:
        skin_t = front_t
        d0, d1, dstep = SWEEP_DEPTH_MM
        offsets = np.arange(d0, d1 + 1e-6, dstep) / 1000
        score = np.zeros((len(offsets), gu.size))
        for k, off in enumerate(offsets):
            pts = near[active] + direction[active] * (skin_t[active] - off)[:, None]
            prod = np.ones(len(active))
            for name, mat, vw, vh, r, ref_alpha in others:
                u, v = to_pixels(mat, vw, vh, pts)
                prod *= np.clip(bilinear(ref_alpha, u - r[0], v - r[1]), 0.02, 1)
            score[k, active] = np.sqrt(prod)
        weight = np.zeros(gu.size)
        weight[active] = raw[active]
        sigma = cfg['blur_px'] * ss
        wb = gaussian_blur(weight.reshape(fh, fw), sigma) + 1e-6
        agg = np.array([gaussian_blur((score[k] * weight).reshape(fh, fw), sigma) / wb for k in range(len(offsets))])
        depth = offsets[agg.reshape(len(offsets), -1).argmax(0)]
        depth = gaussian_blur((depth * weight).reshape(fh, fw), ss * 1.5).ravel() / (gaussian_blur(weight.reshape(fh, fw), ss * 1.5).ravel() + 1e-6)
    valid = np.zeros(gu.size, bool)
    valid[active] = True
    pos = near + direction * np.nan_to_num(skin_t - depth)[:, None]
    for tag, sel in (('upper', ~lower), ('lower', lower)):
        m = valid & sel & (raw > 0.5)
        if m.any():
            print(f'LASH_SWEEP {tag} offset mm p10/p50/p90',
                  np.round(np.percentile(depth[m] * 1000, [10, 50, 90]), 2).tolist())
    img = brow_decal_image('INKWAVE_lash_sheet', alpha.reshape(fh, fw)[::-1],
                           np.broadcast_to(np.asarray(data['black'], float), (fh, fw, 3)), 1.0)
    mat = brow_decal_material('INKWAVE_lash_sheet', img)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.9
    bsdf.inputs['Specular IOR Level'].default_value = 0.1
    keep = (valid & (alpha > 0.004)).reshape(fh, fw)
    grown = keep.copy()
    grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
    grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
    keep = grown & valid.reshape(fh, fw)
    local = M.to_local(pos).reshape(fh, fw, 3)
    for name in LINER_NAMES:
        obj = bpy.data.objects[name]
        sign = 1 if name == 'HEAD_eyes_03' else -1
        index, verts, uvs, faces = {}, [], [], []
        def vid(j, i):
            if (j, i) not in index:
                index[(j, i)] = len(verts)
                p = local[j, i].copy()
                if sign > 0:
                    p[0] = -p[0]
                verts.append(p)
                uvs.append(((i + 0.5) / fw, 1 - (j + 0.5) / fh))
            return index[(j, i)]
        for j in range(fh - 1):
            for i in range(fw - 1):
                if keep[j:j + 2, i:i + 2].all():
                    quad = [vid(j, i), vid(j + 1, i), vid(j + 1, i + 1), vid(j, i + 1)]
                    faces.append(quad[::-1] if sign > 0 else quad)
        replace_mesh(obj, np.asarray(verts), faces, '_lash_sheet')
        me = obj.data
        me.materials.clear()
        me.materials.append(mat)
        layer = me.uv_layers.new(name='UVMap')
        for loop in me.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
        for poly in me.polygons:
            poly.use_smooth = True
    return float(np.median(depth[valid & (raw > 0.5)]) * 1000)


def natural_cubic(u, pts, s):
    """Natural cubic spline through pts (n x d) at knots u, evaluated at s."""
    n = len(u)
    h = np.diff(u)
    A = np.zeros((n, n)); rhs = np.zeros((n, pts.shape[1]))
    A[0, 0] = A[-1, -1] = 1
    for i in range(1, n - 1):
        A[i, i - 1], A[i, i], A[i, i + 1] = h[i - 1], 2 * (h[i - 1] + h[i]), h[i]
        rhs[i] = 3 * ((pts[i + 1] - pts[i]) / h[i] - (pts[i] - pts[i - 1]) / h[i - 1])
    c = np.linalg.solve(A, rhs)
    b = (pts[1:] - pts[:-1]) / h[:, None] - h[:, None] * (2 * c[:-1] + c[1:]) / 3
    d = (c[1:] - c[:-1]) / (3 * h[:, None])
    k = np.clip(np.searchsorted(u, s, side='right') - 1, 0, n - 2)
    t = (s - u[k])[:, None]
    return pts[k] + b[k] * t + c[k] * t ** 2 + d[k] * t ** 3


def lash_material():
    mat = bpy.data.materials.get('INKWAVE_lash_black') or bpy.data.materials.new('INKWAVE_lash_black')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.004, 0.003, 0.004, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Specular IOR Level'].default_value = 0.2
    return mat


def set_mesh(obj, verts_local_mm, faces, mat, suffix):
    replace_mesh(obj, np.asarray(verts_local_mm, float).reshape(-1, 3) / 1000, faces, suffix)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for poly in obj.data.polygons:
        poly.use_smooth = True


def slab(front_pts, back_pts, rows, cols, flip):
    """Closed quad slab from two (rows x cols) point grids."""
    verts = np.r_[front_pts.reshape(-1, 3), back_pts.reshape(-1, 3)]
    off = rows * cols
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a, b, c, d = i * cols + j, (i + 1) * cols + j, (i + 1) * cols + j + 1, i * cols + j + 1
            faces.append((a, b, c, d))
            faces.append((d + off, c + off, b + off, a + off))
    for i in range(rows - 1):
        for j in (0, cols - 1):
            a, b = i * cols + j, (i + 1) * cols + j
            faces.append((a, a + off, b + off, b) if j == 0 else (b, b + off, a + off, a))
    for j in range(cols - 1):
        for i in (0, rows - 1):
            a, b = i * cols + j, i * cols + j + 1
            faces.append((b, b + off, a + off, a) if i == 0 else (a, a + off, b + off, b))
    if flip:
        faces = [f[::-1] for f in faces]
    return verts, faces


def tooth(root, tip, across, radius, depth_ratio, rings=10, sides=8, profile=0.9):
    axis = tip - root
    along = axis / np.linalg.norm(axis)
    a = across - along * np.dot(across, along)
    a /= np.linalg.norm(a)
    b = np.cross(along, a)
    verts, faces = [], []
    start = root - along * radius * 0.8
    for r in range(rings + 1):
        t = r / rings
        c = start + (tip - start) * t
        rad = radius * max((1 - t) ** profile, 0.03)
        for k in range(sides):
            ang = 2 * np.pi * k / sides
            verts.append(c + rad * np.cos(ang) * a + rad * depth_ratio * np.sin(ang) * b)
    for r in range(rings):
        for k in range(sides):
            p0, p1 = r * sides + k, r * sides + (k + 1) % sides
            faces.append((p0, p1, p1 + sides, p0 + sides))
    faces.append(tuple(range(sides))[::-1])
    faces.append(tuple(range(rings * sides, rings * sides + sides)))
    return np.array(verts), faces


def lower_lid_margin(u0, u1):
    """3D points (local mm, minus eye) on the skin just below the visible eyeball, per front column."""
    fmat, w, h = camera_matrix('front')
    inv = np.linalg.inv(fmat)
    face = bpy.data.objects['HEAD_face']
    verts = [world(face)]
    polys = [list(p.vertices) for p in face.data.polygons]
    npoly = len(polys)
    for n in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        base = sum(len(v) for v in verts)
        verts.append(world(bpy.data.objects[n]))
        polys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
    tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)
    def cast(u, v):
        ndc = [np.array([2 * u / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
        a, b = [p[:3] / p[3] for p in ndc]
        d = (b - a) / np.linalg.norm(b - a)
        return tree.ray_cast(Vector(a), Vector(d), 50)
    pts = []
    for u in np.arange(u0, u1, 0.5):
        eye_v = [v for v in np.arange(112, 152, 0.25) if (hit := cast(u, v))[0] is not None and hit[2] >= npoly]
        if not eye_v:
            continue
        hit = cast(u, max(eye_v) + 0.35)
        if hit[0] is not None and hit[2] < npoly:
            pts.append((u, M.to_local(np.array([tuple(hit[0])]))[0] * 1000, M.to_local(np.array([tuple(hit[0]) ]))[0]))
    return pts


def tube(points, radius, sides=8):
    """Closed tube along a polyline; radius array per point."""
    verts, faces = [], []
    n = len(points)
    for i, p in enumerate(points):
        t = points[min(i + 1, n - 1)] - points[max(i - 1, 0)]
        t /= np.linalg.norm(t)
        a = np.cross(t, [0.0, 0.0, 1.0])
        a /= np.linalg.norm(a) + 1e-12
        b = np.cross(t, a)
        for k in range(sides):
            ang = 2 * np.pi * k / sides
            verts.append(p + radius[i] * (np.cos(ang) * a + np.sin(ang) * b))
    for i in range(n - 1):
        for k in range(sides):
            p0, p1 = i * sides + k, i * sides + (k + 1) % sides
            faces.append((p0, p1, p1 + sides, p0 + sides))
    faces.append(tuple(range(sides))[::-1])
    faces.append(tuple(range((n - 1) * sides, n * sides)))
    return np.array(verts), faces


def solid_sheet(verts, faces, thickness_mm):
    """Close an open quad sheet into a thin solid (deterministic order, unlike bmesh.ops.solidify)."""
    n = len(verts)
    normals = np.zeros_like(verts)
    for f in faces:
        p = verts[list(f)]
        normals[list(f)] += np.cross(p[1] - p[0], p[2] - p[0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
    back = verts - normals * thickness_mm
    out = list(faces) + [tuple(i + n for i in f[::-1]) for f in faces]
    count = {}
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            key = (min(a, b), max(a, b))
            count[key] = count.get(key, 0) + 1
    for f in faces:
        for a, b in zip(f, f[1:] + f[:1]):
            if count[(min(a, b), max(a, b))] == 1:
                out.append((b, a, a + n, b + n))
    return np.r_[verts, back], out


def lower_band_field(bc, strip_px=None):
    """Solid lower-lash band painted from the front view onto the skin (minus eye grid, local m)."""
    fmat, w, h = camera_matrix('front')
    inv = np.linalg.inv(fmat)
    face = bpy.data.objects['HEAD_face']
    verts = [world(face)]
    polys = [list(p.vertices) for p in face.data.polygons]
    npoly = len(polys)
    for n in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        base = sum(len(v) for v in verts)
        verts.append(world(bpy.data.objects[n]))
        polys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
    tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)
    def first_is_eye(u, v):
        ndc = [np.array([2 * u / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
        a, b = [p[:3] / p[3] for p in ndc]
        hit = tree.ray_cast(Vector(a), Vector((b - a) / np.linalg.norm(b - a)), 50)
        return hit[0] is not None and hit[2] >= npoly
    us, vb = [], []
    for u in np.arange(bc['u_outer'], bc['u_inner'], 0.5):
        eye_v = [v for v in np.arange(112, 152, 0.2) if first_is_eye(u, v)]
        if eye_v:
            us.append(u)
            vb.append(max(eye_v))
    us, vb = np.array(us), np.array(vb)
    coef = np.polyfit(us, vb, 3)                      # smooth lower lid line in the front image
    # skin grid (same as the lash decal): local x/y, front-facing height field
    local_tree = eye_surface_bvh()[0]
    x0, x1, y0, y1, step = LASH_GRID_MM
    xs, ys = np.arange(x0, x1 + 1e-6, step), np.arange(y0, y1 + 1e-6, step)
    gx, gy = np.meshgrid(xs, ys)
    q = np.zeros((gx.size, 3))
    q[:, 0], q[:, 1] = -gx.ravel() / 1000, gy.ravel() / 1000
    found = np.zeros(len(q), bool)
    for i in range(len(q)):
        hit = local_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if hit is not None:
            q[i, 2], found[i] = hit.z, True
    u, v = camera_pixels('front', M.to_world(q))
    # start at the real outer corner of the visible eye; thick right after it, tapering inward,
    # then a thin line along the rest of the lower lid
    start = us.min()
    span = bc['u_end'] - start
    f = np.clip((u - start) / span, 0, 1)
    rise = np.clip(f / bc.get('rise', 0.18), 0, 1)
    fall = np.clip((1 - f) / (1 - bc.get('rise', 0.18)), 0, 1) ** bc.get('taper', 1.0)
    width = np.maximum(bc['width_px'] * np.minimum(rise, fall), bc.get('line_px', 0.5))
    line = np.polyval(coef, np.clip(u, us.min(), us.max()))
    top = line - bc.get('overlap_px', 0.4)
    inside_u = (u >= start) & (u <= bc.get('line_end_u', bc['u_end']))
    join = bc.get('join_px', 0.0)
    if join and strip_px is not None:
        # continue the lid line past the outer corner (straight, along its end slope) and fill up
        # to the upper strip's lower edge so the lower band and the wing overlap
        slope = np.polyval(np.polyder(coef), start)
        ext = u < start
        line = np.where(ext, np.polyval(coef, start) + slope * (u - start), line)
        su, sv = strip_px
        order = np.argsort(su)
        strip_low = np.interp(u, su[order], sv[order], left=np.nan, right=np.nan)
        near = u < start + join
        top = np.where(near & np.isfinite(strip_low), np.minimum(top, strip_low - bc.get('overlap_px', 0.4)), top)
        width = np.where(ext, bc['width_px'] * bc.get('corner_width', 0.6), width)
        inside_u = inside_u | ((u >= start - join) & ext)
    soft = 0.35
    a = np.clip((v - top) / soft + 0.5, 0, 1) * np.clip((line + width - v) / soft + 0.5, 0, 1)
    a *= inside_u * (width > 0.05) * found
    # the eyeball itself stays clear: only paint where the front camera sees skin
    shape = gx.shape
    print('LOWER_BAND lid line fitted on', len(us), 'columns; painted px', round(float(a.sum()) * 0 + float((a > 0.5).sum()), 0))
    return q.reshape(shape + (3,)), a.reshape(shape)


def lower_lashes_3d(cfg, mat):
    """Lower lid line + short lower lashes as separate 3D parts on both eyes."""
    lc = cfg['lower3d']
    margin = lower_lid_margin(lc['u_outer'], lc['u_inner'])
    pts = np.array([m[1] for m in margin])
    # smooth the margin strongly and order it outer -> inner (minus eye: outer is small u)
    win = lc.get('smooth_pts', 5)
    k = np.ones(win) / win
    for _ in range(lc.get('smooth_passes', 1)):
        pts = np.c_[[np.convolve(np.pad(pts[:, a], win // 2, mode='edge'), k, 'valid') for a in range(3)]].T
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]
    if lc.get('resample'):
        even = np.linspace(0, seg[-1], lc['resample'])
        pts = np.c_[[np.interp(even, seg, pts[:, a]) for a in range(3)]].T
        seg = even
    s = seg / seg[-1]
    skin_tree = eye_surface_bvh()[0]
    for side, obj_name in ((-1, 'HEAD_eyes_30'), (1, 'HEAD_eyes_13')):
        line = pts.copy()
        line[:, 0] = side * np.abs(line[:, 0])
        normals = []
        for i, p in enumerate(line):
            hit = skin_tree.ray_cast(Vector((p[0] / 1000, p[1] / 1000, 0.3)), Vector((0, 0, -1)))
            if hit[0] is not None:
                line[i, 2] = hit[0].z * 1000
                normals.append(np.array(hit[1]))
            else:
                normals.append(np.array([0.0, 0.0, 1.0]))
        normals = np.array(normals)
        lifted = line + normals * lc['lift_mm']
        rad = lc['line_mm'] * np.clip((1 - s) / 0.35, 0.25, 1) * np.clip(s / 0.04, 0.3, 1)
        keep = s <= lc['line_end']
        parts = [tube(lifted[keep], rad[keep])]
        if lc.get('band_mm'):
            # one solid painted band under the lid: widest at the outer corner, tapering inward
            sel = np.nonzero(s <= lc['band_end'])[0]
            cols = 6
            front = np.zeros((len(sel), cols, 3))
            for r, i in enumerate(sel):
                tangent = lifted[min(i + 1, len(lifted) - 1)] - lifted[max(i - 1, 0)]
                tangent /= np.linalg.norm(tangent)
                # straight down, kept in the skin plane and across the lid line
                down = np.array([0.0, -1.0, 0.0])
                for axis in (normals[i], tangent):
                    down -= axis * np.dot(down, axis)
                down /= np.linalg.norm(down)
                f = s[i] / lc['band_end']
                width = lc['band_mm'] * (1 - f) ** lc.get('band_taper', 1.2) + 0.15
                for c in range(cols):
                    p = lifted[i] + down * width * c / (cols - 1)
                    hit = skin_tree.ray_cast(Vector((p[0] / 1000, p[1] / 1000, 0.3)), Vector((0, 0, -1)))
                    if hit[0] is not None:
                        p[2] = hit[0].z * 1000 + lc['lift_mm']
                    front[r, c] = p
            back = front - normals[sel][:, None, :] * 0.15
            parts.append(slab(front, back, len(sel), cols, flip=False))
        for j in range(lc['count']):
            f = lc['start'] + (lc['end'] - lc['start']) * j / max(lc['count'] - 1, 1)
            i = int(np.argmin(np.abs(s - f)))
            tangent = lifted[min(i + 1, len(lifted) - 1)] - lifted[max(i - 1, 0)]
            tangent /= np.linalg.norm(tangent)
            outward = -tangent                                   # toward the outer corner
            down = np.cross(normals[i], tangent)
            if down[1] > 0:
                down = -down
            d = np.cos(np.radians(lc['angle_deg'])) * down + np.sin(np.radians(lc['angle_deg'])) * outward
            d += normals[i] * lc['forward']
            d /= np.linalg.norm(d)
            length = lc['len_outer'] + (lc['len_inner'] - lc['len_outer']) * j / max(lc['count'] - 1, 1)
            root = lifted[i] + down * lc.get('gap_mm', 0.0)
            hit = skin_tree.ray_cast(Vector((root[0] / 1000, root[1] / 1000, 0.3)), Vector((0, 0, -1)))
            if hit[0] is not None:
                root[2] = hit[0].z * 1000 + lc['lift_mm']
            root = root - d * 0.2
            parts.append(tooth(root, root + d * length, tangent, lc['lash_mm'], 0.7, rings=6, sides=6,
                               profile=lc.get('profile', 0.9)))
        allv, allf, base = [], [], 0
        for v, f in parts:
            allv.append(v); allf += [tuple(x + base for x in ff) for ff in f]; base += len(v)
        set_mesh(bpy.data.objects[obj_name], np.vstack(allv), allf, mat, '_lower_lashes')
    print('LOWER3D margin points', len(pts), 'length mm', round(float(seg[-1]), 1))


def skin_height_tree():
    """Local BVH of the skin plus eyeballs, for clearance checks along local -z."""
    return eye_surface_bvh()[0]


def skin_z(tree, pts_mm):
    """Surface z (mm) under each local point, found along -z; nan where nothing is hit."""
    out = np.full(len(pts_mm), np.nan)
    nrm = np.tile([0.0, 0.0, 1.0], (len(pts_mm), 1))
    for i, p in enumerate(pts_mm):
        hit = tree.ray_cast(Vector((p[0] / 1000, p[1] / 1000, 0.3)), Vector((0, 0, -1)))
        if hit[0] is not None:
            out[i] = hit[0].z * 1000
            nrm[i] = tuple(hit[1])
    return out, nrm


def smooth_rows(a, sigma, axis=0):
    """Gaussian smoothing along one axis with edge padding (keeps the ends in place)."""
    if sigma <= 0:
        return a
    r = int(np.ceil(3 * sigma))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    a = np.moveaxis(np.asarray(a, float), axis, 0)
    pad = np.concatenate([np.repeat(a[:1], r, 0), a, np.repeat(a[-1:], r, 0)], 0)
    out = np.stack([np.tensordot(k, pad[i:i + 2 * r + 1], axes=(0, 0)) for i in range(len(a))], 0)
    return np.moveaxis(out, 0, axis)


def clear_skin(grid, tree, clear_mm, sigma=2.0, passes=4):
    """Raise a (rows x cols x 3) sheet where it comes closer than clear_mm to the surface below;
    the raise is smoothed so it never adds a kink."""
    g = grid.copy()
    shape = g.shape[:-1]
    for _ in range(passes):
        z, _ = skin_z(tree, g.reshape(-1, 3))
        deficit = np.nan_to_num(clear_mm - (g[..., 2].ravel() - z), nan=0.0).clip(0).reshape(shape)
        if deficit.max() < 1e-3:
            break
        grown = deficit.copy()
        for ax in range(len(shape)):
            grown = np.maximum(grown, np.roll(grown, 1, ax))
            grown = np.maximum(grown, np.roll(grown, -1, ax))
        raise_ = grown
        for ax in range(len(shape)):
            raise_ = smooth_rows(raise_, sigma, ax)
        g[..., 2] += np.maximum(raise_, deficit) * 1.05
    return g


def lower_lid_curve(lc, strip_px=None):
    """Smooth lower lid line (local mm, minus eye) from the front camera: the lowest eyeball pixel per
    column, cubic fit, continued straight past the outer corner by join_px; returns (U, points)."""
    fmat, w, h = camera_matrix('front')
    inv = np.linalg.inv(fmat)
    face = bpy.data.objects['HEAD_face']
    verts = [world(face)]
    polys = [list(p.vertices) for p in face.data.polygons]
    npoly = len(polys)
    for n in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        base = sum(len(v) for v in verts)
        verts.append(world(bpy.data.objects[n]))
        polys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
    tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(verts)], polys)
    def cast(u, v):
        ndc = [np.array([2 * u / w - 1, 1 - 2 * v / h, z, 1]) @ inv.T for z in (-1, 1)]
        a, b = [p[:3] / p[3] for p in ndc]
        return tree.ray_cast(Vector(a), Vector((b - a) / np.linalg.norm(b - a)), 50)
    us, vb = [], []
    for u in np.arange(lc['u_outer'], lc['u_inner'], 0.5):
        eye_v = [v for v in np.arange(112, 152, 0.2) if (hit := cast(u, v))[0] is not None and hit[2] >= npoly]
        if eye_v:
            us.append(u)
            vb.append(max(eye_v))
    us, vb = np.array(us), np.array(vb)
    coef = np.polyfit(us, vb, 3)
    start = us.min()
    slope = np.polyval(np.polyder(coef), start)
    U = np.linspace(start - lc.get('join_px', 0.0), lc['u_end'], 240)
    V = np.where(U < start, np.polyval(coef, start) + slope * (U - start), np.polyval(coef, U))
    if lc.get('follow_wing') and strip_px is not None:
        # past the outer corner, bend onto the upper wing's lower edge (a little below it) so the line
        # runs on under the wing: one smooth dark shape instead of a line ending next to the wing
        su, sv = strip_px
        order = np.argsort(su)
        wing = np.interp(U, su[order], sv[order], left=np.nan, right=np.nan) + lc['follow_wing']['below_px']
        tb = np.clip((start + lc['follow_wing'].get('blend_px', 2.0) - U) / (2 * lc['follow_wing'].get('blend_px', 2.0)), 0, 1)
        tb = tb * tb * (3 - 2 * tb)
        V = np.where(np.isfinite(wing), V * (1 - tb) + np.nan_to_num(wing) * tb, V)
    V = V + lc.get('below_px', 0.3)
    pts = []
    for u, v in zip(U, V):
        # the cubic can pass a little inside the eyeball: step down to the first skin hit
        for dv in np.arange(0, 6, 0.1):
            hit = cast(u, v + dv)
            if hit[0] is not None and hit[2] < npoly:
                break
        else:
            raise ValueError(f'lower lid line: no skin at front pixel {(u, v)}')
        pts.append(tuple(hit[0]))
    local = M.to_local(np.array(pts)) * 1000
    # smooth 3D curve: cubic per coordinate against the image column plus the smoothed remainder
    poly = np.stack([np.polyval(np.polyfit(U, local[:, a], 3), U) for a in range(3)], 1)
    fitted = poly + smooth_rows(local - poly, lc.get('smooth', 10.0))
    px_mm = np.linalg.norm(np.diff(fitted, axis=0), axis=1).sum() / np.hypot(np.diff(U), np.diff(V)).sum()
    print('STRANDS lid columns', len(us), 'outer corner u', round(float(start), 1),
          'fit residual mm', round(float(np.abs(fitted - local).max()), 3), 'mm per front px', round(float(px_mm), 3))
    res = np.linalg.norm(fitted - local, axis=1)
    print('STRANDS residual by column', [(round(float(U[i]), 1), round(float(res[i]), 2)) for i in range(0, len(U), 12)])
    return U, fitted


def ribbon_sheet(centre, across, width, normal, cols, offset):
    """Flat ribbon rows along centre; column c spans offset + width * c/(cols-1) along across."""
    t = np.linspace(0, 1, cols)
    return (centre[:, None, :] + across[:, None, :] * (offset[:, None] + width[:, None] * t[None, :])[..., None]
            + normal[:, None, :] * 0.0)


def sheet_faces(rows, cols):
    faces = []
    for i in range(rows - 1):
        for j in range(cols - 1):
            a = i * cols + j
            faces.append((a, a + cols, a + cols + 1, a + 1))
    return faces


def face_local_tree():
    obj = bpy.data.objects['HEAD_face']
    verts = M.to_local(world(obj))
    return BVHTree.FromPolygons([Vector(v) for v in verts], [list(p.vertices) for p in obj.data.polygons])


def push_out(rings, face_tree, direction, margin_mm, sigma=1.5, passes=4):
    """Move whole rings (rows x k x 3, local mm) along direction (rows x 3) until every vertex is at least
    margin_mm outside the face surface (signed nearest distance); the move is smoothed along the rows."""
    g = rings.copy()
    for _ in range(passes):
        sd = np.empty(g.shape[:2])
        for i in range(g.shape[0]):
            for j in range(g.shape[1]):
                q = Vector(g[i, j] / 1000)
                loc, nrm, _, dist = face_tree.find_nearest(q)
                sd[i, j] = dist * 1000 * np.sign((q - loc).dot(nrm))
        need = np.clip(margin_mm - sd.min(axis=1), 0, None)
        if need.max() < 1e-3:
            break
        grown = np.maximum(need, np.maximum(np.r_[need[1:], 0], np.r_[0, need[:-1]]))
        move = np.maximum(smooth_rows(grown, sigma), need) * 1.1
        g += direction[:, None, :] * move[:, None, None]
    return g


def nearest_on(face_tree, pts_mm):
    """Nearest face-surface point and its normal (outward) for each local mm point."""
    loc, nrm = np.empty_like(pts_mm), np.empty_like(pts_mm)
    for i, p in enumerate(pts_mm):
        hit, n, _, _ = face_tree.find_nearest(Vector(p / 1000))
        loc[i], nrm[i] = np.array(hit) * 1000, np.array(n)
    nrm *= np.where(nrm[:, 2:3] < 0, -1.0, 1.0)
    return loc, nrm


def lower_strands(cfg, mat):
    """Lower lashes: thin smooth lid line + short sparse tapered hairs, each a thin closed sheet
    lying just above the skin, on both eyes."""
    lc = cfg['lower_strands']
    U, curve = lower_lid_curve(lc)
    tree = skin_height_tree()
    ftree = face_local_tree()
    margin = lc.get('margin_mm', 0.0)
    hairs = STRAND_HAIRS[lc['hairs']]
    for side, obj_name in ((-1, 'HEAD_eyes_30'), (1, 'HEAD_eyes_13')):
        c = curve.copy()
        c[:, 0] = side * np.abs(c[:, 0])
        z, nrm = skin_z(tree, c)
        if np.isnan(z).any():
            raise ValueError(f'{obj_name}: lid line leaves the skin')
        # this side's own skin (the face is not exactly symmetric), smoothed so facets do not show
        c[:, 2] = smooth_rows(z, 6.0)
        nrm = smooth_rows(nrm, 8.0)
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        near = lc.get('nearest')
        if near and near.get('line', True):
            # steep skin at the outer corner: follow the nearest surface point, not the -z ray
            loc, nrm = nearest_on(ftree, c)
            c = smooth_rows(loc, near['line_sigma'])
            nrm = smooth_rows(nrm, near['line_sigma'] * 1.5)
            nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
        s = seg / seg[-1]
        tan = np.gradient(c, axis=0)
        tan /= np.linalg.norm(tan, axis=1, keepdims=True)
        down = np.cross(nrm, tan)
        down *= np.where(down[:, 1:2] > 0, -1.0, 1.0)
        down /= np.linalg.norm(down, axis=1, keepdims=True)
        # lid line: widest at the outer corner, thinning smoothly to a fine point on the inner side
        w = lc['line_min_mm'] + (lc['line_mm'] - lc['line_min_mm']) * (1 - s) ** lc.get('line_power', 1.3)
        w *= np.clip(s / 0.03, 0.4, 1.0) ** 0.5
        w[-1] = max(lc['line_min_mm'] * 0.3, 0.01)
        cols = 4
        sheet = ribbon_sheet(c, down, w, nrm, cols, -0.35 * w) + nrm[:, None, :] * lc['lift_mm']
        if not (near and near.get('line', True)):
            sheet = clear_skin(sheet, tree, lc['clear_mm'])
        if margin:
            sheet = push_out(sheet, ftree, nrm, margin + 0.06, sigma=3.0)
        parts = [solid_sheet(sheet.reshape(-1, 3), sheet_faces(len(c), cols), 0.06)]
        k = lc.get('hair_scale', 1.0)
        for (hs, length, width, ang, bend, gap, rise) in hairs:
            length, width, gap = length * k, width * k, gap * k + lc.get('gap_add', 0.0)
            i = int(np.argmin(np.abs(s - hs)))
            outward = -tan[i]
            a = np.radians(ang)
            d = np.cos(a) * down[i] + np.sin(a) * outward
            d -= nrm[i] * np.dot(d, nrm[i])
            d /= np.linalg.norm(d)
            side_dir = np.cross(nrm[i], d)
            side_dir *= np.sign(np.dot(side_dir, outward) + 1e-9)
            rows = 12
            t = np.linspace(0, 1, rows)
            root = c[i] + down[i] * (0.65 * w[i] + gap - 0.35 * w[i]) + nrm[i] * lc.get('hair_lift_mm', lc['lift_mm'])
            if lc.get('hair_shape') == 'tube':
                # grows out of the lid a little (rise), bends gently toward the outer corner
                e = np.radians(rise * lc.get('rise_scale', 1.0))
                d3 = np.cos(e) * d + np.sin(e) * nrm[i]
                centre = (root[None] - d3[None] * 0.2 * width + d3[None] * (length + 0.2 * width) * t[:, None]
                          + side_dir[None] * (bend * length * t ** 2)[:, None])
                if near:
                    rows = near.get('rows', 14)
                    t = np.linspace(0, 1, rows)
                    centre = (root[None] - d[None] * 0.2 * width + d[None] * (length + 0.2 * width) * t[:, None]
                              + side_dir[None] * (bend * length * t ** 2)[:, None])
                    if near.get('height_only'):
                        # keep the dash straight in the skin plane; only its height follows the skin
                        target = near['hair_lift_mm'] + lc.get('hair_depth', 0.55) * 0.5 * width
                        for _ in range(3):
                            sd = np.empty(rows)
                            for q in range(rows):
                                qv = Vector(centre[q] / 1000)
                                hit, hn, _, dist = ftree.find_nearest(qv)
                                sd[q] = dist * 1000 * np.sign((qv - hit).dot(hn))
                            centre = centre + nrm[i][None] * smooth_rows(target - sd, 1.5)[:, None]
                        cn = np.tile(nrm[i], (rows, 1))
                    else:
                        loc, cn = nearest_on(ftree, centre)
                        cn = smooth_rows(cn, 2.0)
                        cn /= np.linalg.norm(cn, axis=1, keepdims=True)
                        centre = smooth_rows(loc + cn * (near['hair_lift_mm'] + lc.get('hair_depth', 0.55) * 0.5 * width), 1.0)
                else:
                    centre = clear_skin(centre[:, None, :], tree, lc.get('hair_clear_mm', lc['clear_mm']) + lc.get('hair_clear', 0.5) * width, sigma=1.5)[:, 0]
                ctan = np.gradient(centre, axis=0)
                ctan /= np.linalg.norm(ctan, axis=1, keepdims=True)
                across = np.cross(nrm[i], ctan)
                across /= np.linalg.norm(across, axis=1, keepdims=True)
                depth = np.cross(ctan, across)
                # round root, straight taper, fine tip
                rp = lc.get('root_prof', 0.65)
                prof = np.clip(t / 0.12, 0, 1) ** 0.5 * (1 - rp) + rp
                r = 0.5 * width * prof * (1 - t) ** 0.9 + 0.006
                r[0] = 0.5 * width * 0.55 * rp / 0.65 if rp < 0.65 else 0.5 * width * min(rp, 0.6)
                if near:
                    # rounded root (no flat cut), straight taper to a fine tip
                    cap = np.sqrt(np.clip(t / 0.1, 0, 1)) * 0.75 + 0.25
                    r = 0.5 * width * cap * (1 - t) ** 0.9 + 0.006
                sides = 8
                ang_k = 2 * np.pi * np.arange(sides) / sides
                ring = (centre[:, None, :] + r[:, None, None] * (np.cos(ang_k)[None, :, None] * across[:, None, :]
                                                                + lc.get('hair_depth', 0.55) * np.sin(ang_k)[None, :, None] * depth[:, None, :]))
                if margin:
                    ring = push_out(ring, ftree, cn if near else np.tile(nrm[i], (rows, 1)), margin)
                verts = ring.reshape(-1, 3)
                faces = []
                for ri in range(rows - 1):
                    for kk in range(sides):
                        p0, p1 = ri * sides + kk, ri * sides + (kk + 1) % sides
                        faces.append((p0, p1, p1 + sides, p0 + sides))
                faces.append(tuple(range(sides))[::-1])
                faces.append(tuple(range((rows - 1) * sides, rows * sides)))
                parts.append((verts, faces))
                continue
            centre = (root[None] - d[None] * 0.15 * width + d[None] * (length + 0.15 * width) * t[:, None]
                      + side_dir[None] * (bend * length * t ** 2)[:, None])
            cz, cn = skin_z(tree, centre)
            centre[:, 2] = np.where(np.isnan(cz), centre[:, 2], cz)
            cn = smooth_rows(cn, 2.0)
            cn /= np.linalg.norm(cn, axis=1, keepdims=True)
            ctan = np.gradient(centre, axis=0)
            ctan /= np.linalg.norm(ctan, axis=1, keepdims=True)
            cross = np.cross(cn, ctan)
            cross /= np.linalg.norm(cross, axis=1, keepdims=True)
            hw = width * np.maximum((1 - t) ** 0.85, 0.0) + 0.012
            hsheet = (centre[:, None, :] + cross[:, None, :] * (hw[:, None] * np.linspace(-0.5, 0.5, 3)[None, :])[..., None]
                      + cn[:, None, :] * (lc['lift_mm'] + 0.02))
            hsheet = clear_skin(hsheet, tree, lc['clear_mm'], sigma=1.0)
            parts.append(solid_sheet(hsheet.reshape(-1, 3), sheet_faces(rows, 3), 0.05))
        allv, allf, base = [], [], 0
        for v, f in parts:
            allv.append(v); allf += [tuple(x + base for x in ff) for ff in f]; base += len(v)
        allv = np.vstack(allv)
        gz, _ = skin_z(tree, allv)
        above = allv[:, 2] - gz
        print('STRANDS', obj_name, 'min height above skin mm', round(float(np.nanmin(above)), 3),
              'vertices below skin', int(np.sum(above < 0)))
        set_mesh(bpy.data.objects[obj_name], allv, allf, mat, '_lash_lower')
        print('STRANDS', obj_name, 'hairs', len(hairs), 'line length mm', round(float(seg[-1]), 2),
              'line width mm', round(float(w.max()), 2), '->', round(float(w.min()), 3))



def lid_region(loc, curve, radius):
    """Per-vertex distance (mm) to the lid line of either eye and the line parameter s (0 outer .. 1 inner)."""
    dist = np.full(len(loc), np.inf)
    spar = np.zeros(len(loc))
    for side in (-1, 1):
        c = curve.copy()
        c[:, 0] = side * np.abs(c[:, 0])
        seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
        s = seg / seg[-1]
        idx = np.nonzero(np.abs(loc[:, 0] - c[:, 0].mean()) < np.ptp(c[:, 0]) / 2 + radius + 2)[0]
        for k in range(0, len(idx), 4096):
            part = idx[k:k + 4096]
            d = np.linalg.norm(loc[part, None, :] - c[None, :, :], axis=2)
            j = np.argmin(d, axis=1)
            dd = d[np.arange(len(part)), j]
            better = dd < dist[part]
            dist[part[better]] = dd[better]
            spar[part[better]] = s[j[better]]
    return dist, spar


def local_mm(obj):
    return M.to_local(world(obj)) * 1000


def with_object(obj, fn):
    """Run fn with obj as the only selected, active object (object mode)."""
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj],
                                   selected_editable_objects=[obj]):
        fn()


def apply_weighted_modifier(obj, weights, kind, **settings):
    """Add a Blender modifier limited to a temporary vertex group (per-vertex weights), apply it, drop the group."""
    vg = obj.vertex_groups.new(name='INKWAVE_lid_edit')
    for w in np.unique(np.round(weights[weights > 0], 3)):
        vg.add([int(i) for i in np.nonzero(np.abs(np.round(weights, 3) - w) < 1e-9)[0]], float(w), 'REPLACE')
    mod = obj.modifiers.new('INKWAVE_lid_edit', kind)
    mod.vertex_group = vg.name
    for key, value in settings.items():
        setattr(mod, key, value)
    apply_modifier(obj, mod)
    obj.vertex_groups.remove(obj.vertex_groups['INKWAVE_lid_edit'])


def apply_modifier(obj, mod):
    """Apply a modifier as the first of the stack."""
    while obj.modifiers[0] != mod:
        with_object(obj, lambda: bpy.ops.object.modifier_move_up(modifier=mod.name))
    with_object(obj, lambda: bpy.ops.object.modifier_apply(modifier=mod.name))



def lid_smooth(face, curve, lc):
    """Smooth the lower-lid skin (both eyes) where the lashes sit, with Blender's own tools: Surface Deform on the
    skin layers lying on the face (HEAD_skin, HEAD_skin_04) bound to the face, a Smooth modifier on the face
    limited to a vertex group that is full on the lid line and fades out with distance, then the layers' Surface
    Deform applied so they follow the face as they lay on it (above or tucked under). Custom normals on this
    skin equal the automatic ones, so shading follows the new surface."""
    sm = lc['lid_smooth']
    layers = [bpy.data.objects[n] for n in FACE_LAYER_NAMES]
    for obj in layers:
        back_up(obj)
    binds = []
    for obj in layers:
        mod = obj.modifiers.new('INKWAVE_lid_follow', 'SURFACE_DEFORM')
        mod.target = face
        while obj.modifiers[0] != mod:
            with_object(obj, lambda: bpy.ops.object.modifier_move_up(modifier=mod.name))
        with_object(obj, lambda: bpy.ops.object.surfacedeform_bind(modifier=mod.name))
        if not mod.is_bound:
            raise RuntimeError(f'Surface Deform could not bind {obj.name} to the face')
        binds.append((obj, mod))
    loc = local_mm(face)
    dist, spar = lid_region(loc, curve, sm['radius'])
    f = np.clip(1 - dist / sm['radius'], 0, 1)
    f = f * f * (3 - 2 * f)
    # fade in past the outer corner (upper lid meets the lower lid there) and at the inner end
    f *= np.clip((spar - sm.get('s_from', 0.06)) / sm.get('s_fade', 0.06), 0, 1) * np.clip((1 - spar) / 0.08, 0, 1)
    if 'above_mm' in sm:
        # keep the upper-lid skin above the line where it is, toward the outer corner (s < above_s)
        ly = np.zeros(len(loc))
        for side in (-1, 1):
            c = curve.copy()
            c[:, 0] = side * np.abs(c[:, 0])
            part = np.nonzero((np.sign(loc[:, 0]) == side) & np.isfinite(dist))[0]
            j = np.argmin(np.linalg.norm(loc[part, None, :] - c[None, :, :], axis=2), axis=1)
            ly[part] = c[j, 1]
        keep = np.clip((ly + sm['above_mm'] - loc[:, 1]) / sm['above_mm'], 0, 1)
        near = np.clip((sm.get('above_s', 1.1) - spar) / 0.05, 0, 1)
        f *= 1 - near * (1 - keep)
    before = world(face)
    apply_weighted_modifier(face, f, 'SMOOTH', factor=sm['factor'], iterations=sm['iters'])
    print('LID_SMOOTH face vertices', int((f > 0).sum()), 'max move mm',
          round(float(np.linalg.norm(world(face) - before, axis=1).max() * 1000), 3))
    for obj, mod in binds:
        before = world(obj)
        apply_modifier(obj, mod)
        print('LID_SMOOTH layer', obj.name, 'max move mm',
              round(float(np.linalg.norm(world(obj) - before, axis=1).max() * 1000), 3))


def lower_paint(cfg, mat, strip_px=None):
    """Lower lashes painted into the face skin: a face-only copy of the skin material gets a texture
    holding the skin colour plus the lid line and a few short ticks, defined on the skin in 3D."""
    lc = cfg['lower_paint']
    U, curve = lower_lid_curve(lc, strip_px)
    tree = skin_height_tree()
    face = bpy.data.objects['HEAD_face']
    back_up(face)
    if lc.get('lid_smooth'):
        lid_smooth(face, curve, lc)
        # the lid line and the skin height field follow the smoothed skin
        U, curve = lower_lid_curve(lc, strip_px)
        tree = skin_height_tree()
    me = face.data
    me.calc_loop_triangles()
    loc = M.to_local(world(face)) * 1000
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers.active.data.foreach_get('uv', uv)
    uv = uv.reshape(-1, 2)
    tris = np.array([t.vertices[:] for t in me.loop_triangles])
    tloops = np.array([t.loops[:] for t in me.loop_triangles])
    size = lc['size']
    skin = bpy.data.materials['skin_b27050']
    base = np.array(skin.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3])
    ink = np.array(mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value[:3])
    alpha = np.zeros((size, size))
    texel_mm = None
    for side in (-1, 1):
        c = curve.copy()
        c[:, 0] = side * np.abs(c[:, 0])
        z, nrm = skin_z(tree, c)
        if np.isnan(z).any():
            raise ValueError('lower paint: lid line leaves the skin')
        c[:, 2] = smooth_rows(z, 6.0)
        nrm = smooth_rows(nrm, 8.0)
        nrm /= np.linalg.norm(nrm, axis=1, keepdims=True)
        seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
        s = seg / seg[-1]
        tan = np.gradient(c, axis=0)
        tan /= np.linalg.norm(tan, axis=1, keepdims=True)
        down = np.cross(nrm, tan)
        down *= np.where(down[:, 1:2] > 0, -1.0, 1.0)
        down /= np.linalg.norm(down, axis=1, keepdims=True)
        w = lc['line_min_mm'] + (lc['line_mm'] - lc['line_min_mm']) * (1 - s) ** lc.get('line_power', 1.3)
        if not lc.get('no_neck'):
            w *= np.clip(s / 0.03, 0.4, 1.0) ** 0.5
        # outer corner: the top edge rises smoothly (toward the eye side) past the corner so the line
        # runs on under the upper wing instead of ending in a neck
        corner = int(np.argmin(np.abs(U - (U[0] + lc.get('join_px', 0.0)))))
        reach = s[corner] + lc.get('corner_blend', 0.04)
        f = np.clip((reach - s) / max(reach, 1e-6), 0, 1)
        rise = lc.get('corner_rise_mm', 0.0) * f * f * (3 - 2 * f)
        ticks = []
        k = lc.get('tick_scale', 1.0)
        for (ts, length, width, ang, gap) in STRAND_HAIRS[lc['ticks']]:
            i = int(np.argmin(np.abs(s - ts)))
            a = np.radians(ang)
            d = np.cos(a) * down[i] - np.sin(a) * tan[i]
            d -= nrm[i] * np.dot(d, nrm[i])
            d /= np.linalg.norm(d)
            root = c[i] + down[i] * (0.3 * w[i] + gap * k + lc.get('gap_add', 0.0))
            ticks.append((root, d, np.cross(nrm[i], d), nrm[i], length * k, width * k))
        # texels of the face triangles near this lid
        near = np.linalg.norm(loc[tris].mean(1) - c.mean(0), axis=1) < np.ptp(c, axis=0).max() * 0.5 + 12
        for tv, tl in zip(tris[near], tloops[near]):
            P, T = loc[tv], uv[tl] * size - 0.5
            lo, hi = np.floor(T.min(0)).astype(int), np.ceil(T.max(0)).astype(int)
            xs, ys = np.meshgrid(np.arange(lo[0], hi[0] + 1), np.arange(lo[1], hi[1] + 1))
            q = np.c_[xs.ravel(), ys.ravel()].astype(float)
            m = np.array([T[1] - T[0], T[2] - T[0]]).T
            if abs(np.linalg.det(m)) < 1e-9:
                continue
            bc = np.linalg.solve(m, (q - T[0]).T).T
            b0 = 1 - bc.sum(1)
            inside = (bc[:, 0] >= -1e-3) & (bc[:, 1] >= -1e-3) & (b0 >= -1e-3)
            if not inside.any():
                continue
            q, bc, b0 = q[inside].astype(int), bc[inside], b0[inside]
            X = P[0] * b0[:, None] + P[1] * bc[:, :1] + P[2] * bc[:, 1:]
            if texel_mm is None:
                texel_mm = np.sqrt(np.linalg.norm(np.cross(P[1] - P[0], P[2] - P[0])) / abs(np.linalg.det(m)))
            # lid line: signed distance (mm) inside the band across the nearest curve sample
            dist = np.linalg.norm(X[:, None, :] - c[None, :, :], axis=2)
            j = np.argmin(dist, axis=1)
            off = X - c[j]
            across = np.sum(off * down[j], axis=1)
            height = np.abs(np.sum(off * nrm[j], axis=1))
            sd = np.minimum(across + 0.35 * w[j] + rise[j], 0.65 * w[j] - across)
            sd = np.where((j > 0) & (j < len(c) - 1) & (height < 3.0), sd, -9.0)
            for root, d, sdir, n, length, width in ticks:
                o = X - root
                t = np.sum(o * d, axis=1) / length
                lat = np.abs(np.sum(o * sdir, axis=1))
                r = 0.5 * width * np.clip(1 - t, 0, 1) ** 0.9
                # rounded root: a half disc of the root radius behind t = 0
                back = np.clip(-t * length / (0.5 * width), 0, 1)
                r = np.where(t < 0, 0.5 * width * np.sqrt(1 - back ** 2), r)
                tsd = np.where((t > -0.5 * width / length) & (t < 1) & (np.abs(np.sum(o * n, axis=1)) < 3.0), r - lat, -9.0)
                sd = np.maximum(sd, tsd)
            cov = np.clip(0.5 + sd / (1.2 * texel_mm), 0, 1)
            yy, xx = np.clip(q[:, 1], 0, size - 1), np.clip(q[:, 0], 0, size - 1)
            alpha[yy, xx] = np.maximum(alpha[yy, xx], cov)
    def to_srgb(x):
        return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)
    colour = to_srgb(base)[None, None, :] * (1 - alpha[..., None]) + to_srgb(ink)[None, None, :] * alpha[..., None]
    img = bpy.data.images.get(FACE_PAINT_IMAGE) or bpy.data.images.new(FACE_PAINT_IMAGE, size, size, alpha=True)
    if tuple(img.size) != (size, size):
        img.scale(size, size)
    img.alpha_mode = 'CHANNEL_PACKED'
    # alpha channel = ink coverage; it switches the skin's sheen/subsurface/coat off under the ink
    rgba = np.concatenate([colour, alpha[..., None] if lc.get('ink_finish') else np.ones((size, size, 1))], axis=2).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    img.update()
    fm = bpy.data.materials.get(FACE_PAINT_MATERIAL)
    if fm is None:
        fm = skin.copy()
        fm.name = FACE_PAINT_MATERIAL
    nodes = fm.node_tree.nodes
    tex = nodes.get('lower_lash_paint') or nodes.new('ShaderNodeTexImage')
    tex.name = 'lower_lash_paint'
    tex.image = img
    tex.interpolation = 'Cubic'
    fm.node_tree.links.new(tex.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])
    if lc.get('ink_finish'):
        bsdf = nodes['Principled BSDF']
        lash = mat.node_tree.nodes['Principled BSDF']
        inv = nodes.get('ink_inverse') or nodes.new('ShaderNodeMath')
        inv.name, inv.operation = 'ink_inverse', 'SUBTRACT'
        inv.inputs[0].default_value = 1.0
        fm.node_tree.links.new(tex.outputs['Alpha'], inv.inputs[1])
        for socket in ('Sheen Weight', 'Subsurface Weight', 'Coat Weight', 'Specular IOR Level', 'Roughness'):
            mix = nodes.get('ink_' + socket) or nodes.new('ShaderNodeMapRange')
            mix.name = 'ink_' + socket
            mix.inputs['From Min'].default_value, mix.inputs['From Max'].default_value = 0.0, 1.0
            mix.inputs['To Min'].default_value = lash.inputs[socket].default_value
            mix.inputs['To Max'].default_value = skin.node_tree.nodes['Principled BSDF'].inputs[socket].default_value
            fm.node_tree.links.new(inv.outputs[0], mix.inputs['Value'])
            fm.node_tree.links.new(mix.outputs['Result'], bsdf.inputs[socket])
    for i, slot in enumerate(me.materials):
        if slot is not None and slot.name == 'skin_b27050':
            me.materials[i] = fm
    print('LOWER_PAINT texel mm', round(float(texel_mm), 3), 'painted texels', int((alpha > 0.5).sum()),
          'ticks per eye', len(STRAND_HAIRS[lc['ticks']]))


def lash_strip_rebuild(variant):
    """Clear every lash piece; rebuild the upper strip, its teeth and the lower lashes."""
    cfg = LASH_VARIANTS[variant]
    for name in LASH_NAMES + BASE_NAMES + LINER_NAMES + LOWER_NAMES + EXTRA_LASH_NAMES:
        obj = bpy.data.objects[name]
        back_up(obj)
        replace_mesh(obj, np.zeros((0, 3)), [], '_cleared')
    fit = json.loads((ROOT / 'analysis/multiview/lash_strip_fit.json').read_text())
    mat = lash_material()
    K = fit['K']
    u = np.linspace(0, 1, K)
    ext = cfg.get('inner_ext', 0.0)            # extend past the inner end along the lid (spline extrapolation)
    S = np.linspace(-ext, 1, 160 + int(ext * 160))
    bottom = natural_cubic(u, np.array(fit['B']), S)
    top = natural_cubic(u, np.array(fit['T']), S)
    tilt = np.radians(cfg.get('tilt_deg', 0.0))
    if tilt:
        # lean the top edge forward about the fixed bottom edge (Rodrigues rotation)
        axis = np.gradient(bottom, axis=0)
        axis /= np.linalg.norm(axis, axis=1, keepdims=True)
        vec = top - bottom
        def rot(v, ang):
            return (v * np.cos(ang) + np.cross(axis, v) * np.sin(ang)
                    + axis * np.sum(axis * v, axis=1, keepdims=True) * (1 - np.cos(ang)))
        fwd = rot(vec, tilt)
        if np.mean(fwd[:, 2]) < np.mean(rot(vec, -tilt)[:, 2]):
            fwd = rot(vec, -tilt)
        top = bottom + fwd
    # thin inner end (s = 0 is the inner corner): the top edge drops toward the fixed bottom edge
    ramp = np.ones_like(S)
    if cfg.get('inner_len'):
        r = np.clip((S + ext) / (cfg['inner_len'] + ext), 0, 1)
        ramp = cfg['inner_min'] + (1 - cfg['inner_min']) * r * r * (3 - 2 * r)
        ramp = np.maximum(ramp, 0.03)                      # needle point, but no zero-area faces
    top = bottom + (top - bottom) * cfg.get('height_scale', 1.0) * ramp[:, None]
    end = cfg.get('wing_trim', 0.0)
    if end:
        keep = S <= 1 - end
        S, bottom, top, ramp = S[keep] / (1 - end), bottom[keep], top[keep], ramp[keep]
    cols = 7
    t = np.linspace(0, 1, cols)
    mid = bottom[:, None, :] * (1 - t[None, :, None]) + top[:, None, :] * t[None, :, None]
    tangent = np.gradient(mid, axis=0)
    across = np.gradient(mid, axis=1)
    normal = np.cross(tangent, across)
    length = np.linalg.norm(normal, axis=2, keepdims=True)
    normal = np.where(length > 1e-9, normal / np.maximum(length, 1e-12), np.nan)
    # zero-width needle ends have no across direction: take the nearest defined normal along the strip
    for j in range(normal.shape[1]):
        col = normal[:, j]
        ok = ~np.isnan(col[:, 0])
        idx = np.where(ok, np.arange(len(col)), 0)
        np.maximum.accumulate(idx, out=idx)
        col = col[idx]
        ok = ~np.isnan(col[:, 0])
        idx = np.where(ok, np.arange(len(col)), len(col) - 1)
        idx = np.minimum.accumulate(idx[::-1])[::-1]
        normal[:, j] = col[idx]
    normal *= np.sign(normal[..., 2:3] + 1e-9)          # outward = toward +z (forward)
    taper = np.clip((1 - S) / 0.12, 0.15, 1)[:, None, None]
    # tooth placement on the final strip, from the front reference (minus side)
    front_top = np.c_[camera_pixels('front', M.to_world(top / 1000))]
    fshift = np.array(LASH_VIEW_SHIFT['front'])
    placed = []
    for spec in fit.get('teeth', []):
        j = int(np.argmin(np.linalg.norm(front_top - fshift - np.array(spec['root_px']), axis=1)))
        up = top[j] - bottom[j]
        up /= np.linalg.norm(up)
        along = np.gradient(top, axis=0)[j]
        along /= np.linalg.norm(along)
        base = np.c_[camera_pixels('front', M.to_world(top[j][None] / 1000))][0]
        jac = np.array([np.c_[camera_pixels('front', M.to_world((top[j] + d * 0.5)[None] / 1000))][0] - base
                        for d in (up, along)]).T / 0.5
        # aim at the reference tip itself: the strip edge can sit a little below the reference root
        want = np.array(spec['root_px']) + np.array(spec['offset_px']) * cfg.get('tooth_len', 1.0) - (base - fshift)
        a_mm, b_mm = np.linalg.solve(jac, want)
        placed.append((j, top[j], top[j] + a_mm * up + b_mm * along, up))
        got = np.c_[camera_pixels('front', M.to_world(placed[-1][2][None] / 1000))][0] - fshift
        print('LASH_TOOTH root_px', np.round(base - fshift, 1).tolist(), 'want_root', spec['root_px'],
              'tip_px', np.round(got, 1).tolist(), 'want_tip', np.round(np.array(spec['root_px']) + spec['offset_px'], 1).tolist())
    half = cfg['thickness_mm'] / 2 * taper * (0.5 + 0.5 * ramp)[:, None, None]
    teeth = fit.get('teeth', [])
    # small inner-corner lashes: in the strip plane, leaned forward, on the inner part of the top edge
    inner = []
    for s_pos, length, radius, fwd_deg in cfg.get('inner_teeth', []):
        j = int(np.argmin(np.abs(S - s_pos)))
        up = top[j] - bottom[j]
        up /= np.linalg.norm(up)
        along = np.gradient(top, axis=0)[j]
        along /= np.linalg.norm(along)
        n = np.cross(along, up)
        n *= np.sign(n[2] + 1e-9)
        ang = np.radians(fwd_deg)
        d = np.cos(ang) * up + np.sin(ang) * n
        inner.append((top[j], top[j] + d * length, along, radius))
    for side in (-1, 1):
        mirror = np.array([side * -1.0, 1.0, 1.0])        # fit is on the minus (x < 0) side
        front = (mid + normal * half) * mirror
        back = (mid - normal * half) * mirror
        verts, faces = slab(front, back, len(S), cols, flip=side > 0)
        liner = 'HEAD_eyes_20' if side < 0 else 'HEAD_eyes_03'
        set_mesh(bpy.data.objects[liner], verts, faces, mat, '_lash_strip')
        lash_objs = LASH_NAMES[7:] if side < 0 else LASH_NAMES[:7]
        for k, obj_name in enumerate(lash_objs):
            if k < len(placed):
                j, root, tip, up = placed[k]
                thick = cfg['thickness_mm'] / cfg['tooth_mm']
                v, f = tooth(root * mirror, tip * mirror, up * mirror, cfg['tooth_mm'], thick)
            elif k - len(placed) < len(inner):
                root, tip, along, radius = inner[k - len(placed)]
                v, f = tooth(root * mirror, tip * mirror, along * mirror, radius, 0.6)
            else:
                continue
            if side > 0:
                f = [ff[::-1] for ff in f]
            set_mesh(bpy.data.objects[obj_name], v, f, mat, '_lash_tooth')
        if cfg.get('lower_paint'):
            if side < 0:
                sb = np.c_[camera_pixels('front', M.to_world(bottom / 1000))]
                lower_paint(cfg, mat, (sb[:, 0], sb[:, 1]))
        elif cfg.get('lower_strands'):
            if side < 0:
                lower_strands(cfg, mat)
        elif cfg.get('lower3d'):
            if side < 0:
                lower_lashes_3d(cfg, mat)
        elif cfg.get('lower_decal') or cfg.get('lower_band'):
            if side < 0 and cfg.get('lower_band'):
                sb = np.c_[camera_pixels('front', M.to_world(bottom / 1000))]
                lsurf, lalpha = lower_band_field(cfg['lower_band'], (sb[:, 0], sb[:, 1]))
                lblack = [18.0, 14.0, 15.0]
                limg = brow_decal_image('INKWAVE_lower_lash_decal', lalpha,
                                        np.broadcast_to(np.asarray(lblack, float), lalpha.shape + (3,)), 1.0)
                lmat = mat                                   # opaque matte black, same as the upper lashes
                surf_tree = eye_surface_bvh()[0]
            elif side < 0:
                dcfg = {'combine': 'frontonly', 'front_only_views': True, 'shift': True, 'lower_only': True,
                        'lower_gain': cfg['lower_decal'], 'upper_ramp': (0.2, 0.6),
                        'lower_max_u': cfg.get('lower_max_u'), 'lower_floor': cfg.get('lower_floor')}
                lsurf, lalpha, lblack = lash_decal_field('frontonly', False, dcfg)
                if cfg.get('lower_min_nz'):
                    # front-projected marks stretch into smears where the skin turns away from the front
                    n = np.cross(np.gradient(lsurf, axis=1), np.gradient(lsurf, axis=0))
                    nz = np.abs(n[..., 2]) / (np.linalg.norm(n, axis=2) + 1e-12)
                    lo = cfg['lower_min_nz']
                    lalpha = lalpha * np.clip((nz - lo) / 0.15, 0, 1)
                limg = brow_decal_image('INKWAVE_lower_lash_decal', lalpha,
                                        np.broadcast_to(np.asarray(lblack, float), lalpha.shape + (3,)), 1.0)
                lmat = brow_decal_material('INKWAVE_lower_lash_decal', limg)
                lmat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
                surf_tree = eye_surface_bvh()[0]
            ny, nx = lalpha.shape
            keep = lalpha > 0.004
            grown = keep.copy()
            grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
            grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
            lift = 0.15
            if cfg.get('lower_band'):
                grown = lalpha > 0.5                         # solid geometry only inside the band
                lift = cfg['lower_band'].get('lift_mm', 0.3)
            index, verts, uvs, faces = {}, [], [], []
            for j in range(ny - 1):
                for i in range(nx - 1):
                    if grown[j:j + 2, i:i + 2].all():
                        quad = []
                        for jj, ii in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
                            if (jj, ii) not in index:
                                index[(jj, ii)] = len(verts)
                                p = lsurf[jj, ii] * 1000
                                p[0] = side * abs(p[0])
                                if side > 0:
                                    # the face is not exactly symmetric: sit on this side's own skin
                                    hit = surf_tree.ray_cast(Vector((p[0] / 1000, p[1] / 1000, 0.3)), Vector((0, 0, -1)))[0]
                                    if hit is not None:
                                        p[2] = hit.z * 1000
                                p[2] += lift
                                verts.append(p)
                                uvs.append(((ii + 0.5) / nx, (jj + 0.5) / ny))
                            quad.append(index[(jj, ii)])
                        faces.append(quad[::-1] if side < 0 else quad)
            lower_obj = bpy.data.objects['HEAD_eyes_30' if side < 0 else 'HEAD_eyes_13']
            if cfg.get('lower_band'):
                verts, faces = solid_sheet(np.asarray(verts), faces, 0.15)
            set_mesh(lower_obj, verts, faces, lmat, '_lash_lower')
            if not cfg.get('lower_band'):
                layer = lower_obj.data.uv_layers.new(name='UVMap')
                for loop in lower_obj.data.loops:
                    layer.data[loop.index].uv = uvs[loop.vertex_index]
        if cfg.get('lower') and 'lower' in fit:
            low = fit['lower']
            ul = np.linspace(0, 1, low['K'])
            SL = np.linspace(0, 1, 80)
            lb, lt = natural_cubic(ul, np.array(low['B']), SL), natural_cubic(ul, np.array(low['T']), SL)
            lmid = lb[:, None, :] * (1 - t[None, :, None]) + lt[:, None, :] * t[None, :, None]
            ln = np.cross(np.gradient(lmid, axis=0), np.gradient(lmid, axis=1))
            ln /= np.linalg.norm(ln, axis=2, keepdims=True)
            ln *= np.sign(ln[..., 2:3] + 1e-9)
            lhalf = cfg['thickness_mm'] / 2 * 0.6
            verts, faces = slab((lmid + ln * lhalf) * mirror, (lmid - ln * lhalf) * mirror, len(SL), cols, flip=False)
            parts = [(verts, faces)]
            for fleck in low.get('flecks', []):
                r0, t0 = np.array(fleck['root']) * mirror, np.array(fleck['tip']) * mirror
                parts.append(tooth(r0, t0, np.array([0.0, 0.0, 1.0]), cfg['tooth_mm'] * 0.45, 0.6))
            allv, allf, base = [], [], 0
            for v, f in parts:
                allv.append(v); allf += [tuple(i + base for i in ff) for ff in f]; base += len(v)
            lower_obj = 'HEAD_eyes_30' if side < 0 else 'HEAD_eyes_13'
            set_mesh(bpy.data.objects[lower_obj], np.vstack(allv), allf, mat, '_lash_lower')
    return len(teeth)


def canthus_patch(variant):
    """Sclera-coloured skin patch where the reference sclera tip lies but the model shows skin."""
    cfg = CANTHUS_VARIANTS[variant]
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    opening = data['front_minus_opening'].astype(float)
    roi = data['front_minus_roi']
    shift = LASH_VIEW_SHIFT['front']
    face = bpy.data.objects['HEAD_face']
    fq = M.to_local(world(face))
    face_tree = BVHTree.FromPolygons([Vector(v) for v in fq], [list(p.vertices) for p in face.data.polygons])
    eq = [M.to_local(world(bpy.data.objects[n])) for n in ('HEAD_eyes_18', 'HEAD_eyes_19')]
    epolys, base = [], 0
    for n, v in zip(('HEAD_eyes_18', 'HEAD_eyes_19'), eq):
        epolys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
        base += len(v)
    eye_tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(eq)], epolys)
    step = 0.08
    xs, ys = np.arange(14.0, 40.0, step), np.arange(-26.0, -4.0, step)
    gx, gy = np.meshgrid(xs, ys)
    q = np.zeros((gx.size, 3))
    q[:, 0], q[:, 1] = -gx.ravel() / 1000, gy.ravel() / 1000
    ok = np.zeros(len(q), bool)
    for i in range(len(q)):
        fh = face_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if fh is None:
            continue
        eh = eye_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if eh is not None and eh.z > fh.z:
            continue                                      # real sclera is already visible here
        q[i, 2], ok[i] = fh.z, True
    u, v = camera_pixels('front', M.to_world(q))
    a = bilinear(opening, u - shift[0] - roi[0], v - shift[1] - roi[1])
    lo, hi = cfg['edge']
    a = np.clip((a - lo) / (hi - lo), 0, 1)
    a = a * np.clip((u - cfg['u_min']) / 1.5, 0, 1) * ok
    alpha = a.reshape(gx.shape)
    surface = q.reshape(gx.shape + (3,))
    img = brow_decal_image('INKWAVE_canthus_patch', alpha,
                           np.broadcast_to(np.array(cfg['colour']) * 255, alpha.shape + (3,)), 1.0)
    mat = brow_decal_material('INKWAVE_canthus_patch', img)
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.45
    ny, nx = alpha.shape
    keep = alpha > 0.004
    grown = keep.copy()
    grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
    grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
    for name, side in (('HEAD_eyes_34', -1), ('HEAD_eyes_17', 1)):
        obj = bpy.data.objects[name]
        back_up(obj)
        index, verts, uvs, faces = {}, [], [], []
        for j in range(ny - 1):
            for i in range(nx - 1):
                if grown[j:j + 2, i:i + 2].all():
                    quad = []
                    for jj, ii in ((j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)):
                        if (jj, ii) not in index:
                            index[(jj, ii)] = len(verts)
                            p = surface[jj, ii] * 1000
                            p[0] = side * abs(p[0])
                            p[2] += 0.05
                            verts.append(p)
                            uvs.append(((ii + 0.5) / nx, (jj + 0.5) / ny))
                        quad.append(index[(jj, ii)])
                    faces.append(quad if side < 0 else quad[::-1])
        set_mesh(obj, verts, faces, mat, '_canthus_patch')
        layer = obj.data.uv_layers.new(name='UVMap')
        for loop in obj.data.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
    print('CANTHUS patch area mm2', round(float(alpha.sum() * step * step), 2))


def canthus_raypatch(variant):
    """Sclera-coloured patch on the skin the front camera sees inside the reference sclera tip."""
    cfg = CANTHUS_VARIANTS[variant]
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    opening = data['front_minus_opening'].astype(float)
    roi = data['front_minus_roi']
    shift = np.array(LASH_VIEW_SHIFT['front'])
    fmat, w, h = camera_matrix('front')
    inv = np.linalg.inv(fmat)
    ss = 6
    us = np.arange(cfg['u_min'] - 2, 172, 1 / ss) + 0.5 / ss
    vs = np.arange(118, 150, 1 / ss) + 0.5 / ss
    gu, gv = np.meshgrid(us, vs)
    def unproject(z):
        ndc = np.c_[2 * gu.ravel() / w - 1, 1 - 2 * gv.ravel() / h, np.full(gu.size, z), np.ones(gu.size)]
        p = ndc @ inv.T
        return p[:, :3] / p[:, 3:4]
    near, far = unproject(-1), unproject(1)
    d = (far - near) / np.linalg.norm(far - near, axis=1)[:, None]
    ref = bilinear(opening, gu.ravel() - shift[0] - roi[0], gv.ravel() - shift[1] - roi[1])
    alpha = np.clip((ref - 0.4) / 0.2, 0, 1) * np.clip((gu.ravel() - cfg['u_min']) / 1.0, 0, 1)
    face = bpy.data.objects['HEAD_face']
    fw = world(face)
    npoly = len(face.data.polygons)
    polys = [list(p.vertices) for p in face.data.polygons]
    eyes = []
    for n in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        base = len(fw) + sum(len(e) for e in eyes)
        e = world(bpy.data.objects[n])
        polys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
        eyes.append(e)
    tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack([fw] + eyes)], polys)
    pos = np.zeros((gu.size, 3))
    on_skin = np.zeros(gu.size, bool)
    for i in np.nonzero(alpha > 0.0)[0]:
        hit = tree.ray_cast(Vector(near[i]), Vector(d[i]), 50)
        if hit[0] is not None and hit[2] < npoly:
            pos[i] = np.array(hit[0]) - d[i] * cfg['lift_mm'] / 1000
            on_skin[i] = True
    alpha = alpha * on_skin
    fh, fw_ = gu.shape
    alpha2 = alpha.reshape(fh, fw_)
    img = brow_decal_image('INKWAVE_canthus_patch', alpha2[::-1],
                           np.broadcast_to(np.array(cfg['colour']) * 255, alpha2.shape + (3,)), 1.0)
    mat = brow_decal_material('INKWAVE_canthus_patch', img)
    mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.4
    keep = (alpha2 > 0.004)
    grown = keep.copy()
    grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
    grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
    grown &= on_skin.reshape(fh, fw_)
    local = M.to_local(pos).reshape(fh, fw_, 3) * 1000
    for name, side in (('HEAD_eyes_34', -1), ('HEAD_eyes_17', 1)):
        obj = bpy.data.objects[name]
        back_up(obj)
        index, verts, uvs, faces = {}, [], [], []
        for j in range(fh - 1):
            for i in range(fw_ - 1):
                if grown[j:j + 2, i:i + 2].all():
                    quad = []
                    for jj, ii in ((j, i), (j + 1, i), (j + 1, i + 1), (j, i + 1)):
                        if (jj, ii) not in index:
                            index[(jj, ii)] = len(verts)
                            p = local[jj, ii].copy()
                            p[0] = side * abs(p[0])
                            verts.append(p)
                            uvs.append(((ii + 0.5) / fw_, 1 - (jj + 0.5) / fh))
                        quad.append(index[(jj, ii)])
                    faces.append(quad)
        set_mesh(obj, verts, faces, mat, '_canthus_patch')
        layer = obj.data.uv_layers.new(name='UVMap')
        for loop in obj.data.loops:
            layer.data[loop.index].uv = uvs[loop.vertex_index]
    print('CANTHUS raypatch covered px', round(float(alpha.sum()) / ss / ss, 1))


def canthus_reshape(variant):
    """Sharp inner corner: carve inside the reference sclera, fill the socket pocket beyond its tip."""
    from mathutils.kdtree import KDTree
    cfg = CANTHUS_VARIANTS[variant]
    face = bpy.data.objects['HEAD_face']
    back_up(face)
    q = M.to_local(world(face))
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    opening = data['front_minus_opening'].astype(float)
    roi = data['front_minus_roi']
    shift = LASH_VIEW_SHIFT['front']
    eq, epolys, base = [], [], 0
    for n in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        v = M.to_local(world(bpy.data.objects[n]))
        eq.append(v)
        epolys += [[base + i for i in p.vertices] for p in bpy.data.objects[n].data.polygons]
        base += len(v)
    eye_tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(eq)], epolys)
    region = np.nonzero((q[:, 0] < -0.012) & (q[:, 0] > -0.050) & (q[:, 1] > -0.034) & (q[:, 1] < 0.004))[0]
    u, v = camera_pixels('front', M.to_world(q[region]))
    ref_open = bilinear(opening, u - shift[0] - roi[0], v - shift[1] - roi[1]) > 0.5
    eye_z = np.full(len(region), np.nan)
    for k, i in enumerate(region):
        hit = eye_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if hit is not None:
            eye_z[k] = hit.z
    target = np.zeros(len(q))
    # A: carve where the reference shows sclera and an eyeball is behind the skin
    for k, i in enumerate(region):
        if ref_open[k] and np.isfinite(eye_z[k]):
            want = eye_z[k] - cfg['depth_mm'] / 1000
            if q[i, 2] > want:
                target[i] = want - q[i, 2]
    # B: fill the pocket past the reference tip with a quadric through the surrounding skin
    corner_row = np.argmin(np.hypot(u - (cfg['tip_u'] + 4), v - 136))
    centre = q[region[corner_row]]
    dist = np.linalg.norm(q[region, :2] - centre[:2], axis=1)
    skin_visible = ~np.isfinite(eye_z) | (q[region, 2] > np.nan_to_num(eye_z, nan=-1))
    ring = (dist > cfg['fill_r_mm'] / 1000) & (dist < (cfg['fill_r_mm'] + cfg['ring_mm']) / 1000) & skin_visible & ~ref_open
    X = q[region][ring]
    A = np.c_[np.ones(len(X)), X[:, 0], X[:, 1], X[:, 0] ** 2, X[:, 0] * X[:, 1], X[:, 1] ** 2]
    coef = np.linalg.lstsq(A, X[:, 2], rcond=None)[0]
    filled = 0
    for k, i in enumerate(region):
        if ref_open[k] or u[k] < cfg['tip_u'] - 0.5 or dist[k] > (cfg['fill_r_mm'] + 1) / 1000:
            continue
        x, y = q[i, 0], q[i, 1]
        z = coef @ [1, x, y, x * x, x * y, y * y]
        w = np.clip(((cfg['fill_r_mm'] + 1) / 1000 - dist[k]) / 0.002, 0, 1)
        if z > q[i, 2]:
            target[i] = (z - q[i, 2]) * w
            filled += 1
    moved = np.nonzero(target != 0)[0]
    tree = KDTree(len(moved))
    for k, i in enumerate(moved):
        tree.insert(Vector(q[i]), k)
    tree.balance()
    disp = np.zeros(len(q))
    r = cfg['blend_mm'] / 1000
    for i in region:
        acc, wsum = 0.0, 0.0
        for co, k, d in tree.find_range(Vector(q[i]), r * 2):
            w = max(0.0, 1 - d / (2 * r)) ** 2
            acc += target[moved[k]] * w
            wsum += w
        own = target[i]
        disp[i] = own if own != 0 else (acc / wsum * min(wsum, 1.0) if wsum else 0.0)
    minus = np.nonzero(disp != 0)[0]
    mt = KDTree(len(minus))
    for k, i in enumerate(minus):
        mt.insert(Vector((-q[i, 0], q[i, 1], q[i, 2])), k)
    mt.balance()
    plus = np.nonzero((q[:, 0] > 0.012) & (q[:, 0] < 0.050) & (q[:, 1] > -0.034) & (q[:, 1] < 0.004))[0]
    for i in plus:
        co, k, d = mt.find(Vector(q[i]))
        if k is not None and d < 0.0006:
            disp[i] = disp[minus[k]]
    q[:, 2] += disp
    put_world(face, M.to_world(q))
    print('CANTHUS reshape carved', int((disp < 0).sum()), 'filled', int((disp > 0).sum()),
          'max carve mm', round(float(-disp.min() * 1000), 2), 'max fill mm', round(float(disp.max() * 1000), 2))


def canthus_carve(variant):
    """Carve the inner-corner skin back behind the eyeball where the reference shows sclera."""
    from mathutils.kdtree import KDTree
    cfg = CANTHUS_VARIANTS[variant]
    if cfg.get('mode') == 'patch':
        return canthus_patch(variant)
    if cfg.get('mode') == 'reshape':
        return canthus_reshape(variant)
    if cfg.get('mode') == 'raypatch':
        return canthus_raypatch(variant)
    face = bpy.data.objects['HEAD_face']
    back_up(face)
    q = M.to_local(world(face))
    data = np.load(ROOT / 'analysis/multiview/lash_reference_multiview.npz')
    opening = data['front_minus_opening'].astype(float)
    roi = data['front_minus_roi']
    shift = LASH_VIEW_SHIFT['front']
    eye_polys, eye_verts = [], []
    for name in ('HEAD_eyes_18', 'HEAD_eyes_19'):
        obj = bpy.data.objects[name]
        base = sum(len(v) for v in eye_verts)
        eye_verts.append(M.to_local(world(obj)))
        eye_polys += [[base + i for i in p.vertices] for p in obj.data.polygons]
    eye_tree = BVHTree.FromPolygons([Vector(v) for v in np.vstack(eye_verts)], eye_polys)
    region = np.nonzero((q[:, 0] < -0.015) & (q[:, 0] > -0.050) & (q[:, 1] > -0.032) & (q[:, 1] < 0.004))[0]
    u, v = camera_pixels('front', M.to_world(q[region]))
    ru, rv = u - shift[0] - roi[0], v - shift[1] - roi[1]
    grow = cfg['grow_px']
    inside = np.zeros(len(region))
    for dx in (-grow, 0, grow):
        for dy in (-grow, 0, grow):
            inside = np.maximum(inside, bilinear(opening, ru + dx, rv + dy))
    target = np.zeros(len(q))
    for k, i in enumerate(region):
        if inside[k] < 0.5 or u[k] < cfg['u_min']:
            continue
        hit = eye_tree.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if hit is None:
            continue
        want = hit.z - cfg['depth_mm'] / 1000
        if q[i, 2] > want:
            target[i] = want - q[i, 2]
    moved = np.nonzero(target < 0)[0]
    # soft blend: every region vertex takes the strongest nearby push, faded over blend_mm
    tree = KDTree(len(moved))
    for k, i in enumerate(moved):
        tree.insert(Vector(q[i]), k)
    tree.balance()
    disp = np.zeros(len(q))
    r = cfg['blend_mm'] / 1000
    for i in region:
        best = 0.0
        for co, k, dist in tree.find_range(Vector(q[i]), r * 2):
            w = 1.0 if dist <= 1e-9 else max(0.0, 1 - dist / (2 * r)) ** 2
            best = min(best, target[moved[k]] * w)
        disp[i] = min(best, target[i])
    # mirror onto the plus-side corner
    minus = np.nonzero(disp < 0)[0]
    mt = KDTree(len(minus))
    for k, i in enumerate(minus):
        mt.insert(Vector((-q[i, 0], q[i, 1], q[i, 2])), k)
    mt.balance()
    plus = np.nonzero((q[:, 0] > 0.015) & (q[:, 0] < 0.050) & (q[:, 1] > -0.032) & (q[:, 1] < 0.004))[0]
    for i in plus:
        co, k, dist = mt.find(Vector(q[i]))
        if k is not None and dist < 0.0006:
            disp[i] = disp[minus[k]]
    q[:, 2] += disp
    put_world(face, M.to_world(q))
    print('CANTHUS moved', int((disp < 0).sum()), 'vertices, max push mm', round(float(-disp.min() * 1000), 2))


def lash_blade(obj, index, variant):
    """Build a continuous pointed fin from the upper edge of the existing eyeliner."""
    cfg = LASH_VARIANTS[variant]
    q = M.to_local(world(obj))
    sign = 1 if q[:128, 0].mean() > 0 else -1
    root_x = float(np.abs(q[:8, 0]).mean())
    liner = bpy.data.objects['HEAD_eyes_03' if sign > 0 else 'HEAD_eyes_20']
    lq = M.to_local(world(liner))
    near = lq[np.abs(np.abs(lq[:, 0]) - root_x) < 0.0018]
    if len(near) < 6:
        raise ValueError(f'{obj.name}: no upper liner vertices at {root_x:.4f}')
    top_y = float(np.percentile(near[:, 1], 96))
    top = near[near[:, 1] >= top_y - 0.001]
    z = float(np.percentile(top[:, 2], 75)) + 0.0004
    # Two very small accents lead into five primary spikes on the outer half.
    scale = cfg.get('scale_pattern', [0.30, 0.45, 0.85, 1.00, 1.05, 0.95, 0.80])[index]
    width_scale = min(scale, cfg.get('width_scale_cap', scale))
    width = cfg['width_mm'] * (0.55 if index < 2 else 1.0) * width_scale / 1000
    height = cfg['height_mm'] * scale / 1000
    out = (cfg['out_mm'] * scale + cfg.get('fan_mm', 0) * (index / 6) ** 1.5) / 1000
    root = np.array([sign * root_x, top_y - 0.0010, z], float)
    tangent = np.array([sign * out, height], float)
    tangent /= max(np.linalg.norm(tangent), 1e-10)
    transverse = np.array([tangent[1], -tangent[0]], float)
    verts = []
    for t, wfac, yfac in ((0.0, 1.0, 0.0), (0.36, 0.68, 0.44), (0.72, 0.30, 0.79), (1.0, 0.025, 1.0)):
        curve = cfg.get('curve_mm', 0) / 1000 * (index / 6) ** 1.5 * t * t
        center = root + np.array([sign * (out * t + curve), height * yfac, 0.0006 * np.sin(np.pi * t)])
        for depth in (0.00016, -0.00016):
            for across in (-1, 1):
                v = center.copy()
                v[:2] += across * transverse * width * wfac / 2
                v[2] += depth
                verts.append(v)
    faces = []
    for i in range(3):
        a, b = i * 4, (i + 1) * 4
        faces += [(a, a+1, b+1, b), (a+2, b+2, b+3, a+3),
                  (a, b, b+2, a+2), (a+1, a+3, b+3, b+1)]
    faces += [(0, 2, 3, 1), (12, 13, 15, 14)]
    original = obj.data
    new = bpy.data.meshes.new(original.name + '_blade')
    world_coords = M.to_world(np.asarray(verts))
    mat = np.array(obj.matrix_world)
    local = (world_coords - mat[:3, 3]) @ np.linalg.inv(mat[:3, :3]).T
    new.from_pydata(local.tolist(), [], faces)
    new.update()
    for material in original.materials:
        new.materials.append(material)
    obj.data = new
    if original.users == 0:
        name = original.name
        bpy.data.meshes.remove(original)
        new.name = name


def lash_bridge(obj, variant):
    """A curved dark ridge connects the spike roots to the upper liner without skin gaps."""
    cfg = BRIDGE_VARIANTS[variant]
    sign = 1 if obj.name == 'HEAD_eyes_04' else -1
    liner = bpy.data.objects['HEAD_eyes_03' if sign > 0 else 'HEAD_eyes_20']
    q = M.to_local(world(liner))
    xmax = cfg.get('xmax_mm', 80) / 1000
    xmin = cfg.get('xmin_mm', 41) / 1000
    xs = np.linspace(xmin, xmax, round((xmax - xmin) * 1000) + 1)
    tops, fronts = [], []
    for x in xs:
        near = q[np.abs(np.abs(q[:, 0]) - x) < 0.0025]
        if len(near) < 4:
            near = q[np.argsort(np.abs(np.abs(q[:, 0]) - x))[:8]]
        top = float(np.percentile(near[:, 1], 92))
        tops.append(top)
        fronts.append(float(np.percentile(near[near[:, 1] > top - 0.002, 2], 85)))
    tops = np.convolve(np.pad(tops, (2, 2), mode='edge'), np.ones(5) / 5, mode='valid')
    fronts = np.convolve(np.pad(fronts, (2, 2), mode='edge'), np.ones(5) / 5, mode='valid')
    face_bvh = face_depth_bvh() if cfg.get('conform') else None
    def face_z(x, y, fallback):
        if face_bvh is None:
            return fallback
        hit = face_bvh.ray_cast(Vector((sign * x, y, 0.3)), Vector((0, 0, -1)))[0]
        return max(float(hit.z), fallback) if hit is not None else fallback
    if 'rows' in cfg:
        rows = cfg['rows']
        verts = []
        for i, x in enumerate(xs):
            fade = 0.02 + 0.98 * max(0.0, np.sin(np.pi * i / (len(xs) - 1))) ** 0.5
            outer = np.clip((x * 1000 - 68) / 10, 0, 1)
            outer = outer * outer * (3 - 2 * outer)
            height = cfg['height_mm'] + cfg.get('outer_drop_mm', 0) * outer
            y0 = tops[i] - height / 1000 * fade
            y1 = tops[i] + cfg['top_mm'] / 1000 * fade
            for j in range(rows):
                y = y0 + (y1 - y0) * j / (rows - 1)
                z = face_z(x, y, fronts[i]) + cfg['front_mm'] / 1000
                verts.extend([[sign * x, y, z + 0.00010],
                              [sign * x, y, z - 0.00010]])
        def index(i, j, depth):
            return 2 * (i * rows + j) + depth
        faces = []
        for i in range(len(xs) - 1):
            for j in range(rows - 1):
                faces.append((index(i,j,0), index(i+1,j,0), index(i+1,j+1,0), index(i,j+1,0)))
                faces.append((index(i,j,1), index(i,j+1,1), index(i+1,j+1,1), index(i+1,j,1)))
            for j in (0, rows-1):
                faces.append((index(i,j,0), index(i,j,1), index(i+1,j,1), index(i+1,j,0)))
        for i in (0, len(xs)-1):
            for j in range(rows - 1):
                faces.append((index(i,j,0), index(i,j+1,0), index(i,j+1,1), index(i,j,1)))
        return replace_mesh(obj, np.asarray(verts), faces, '_bridge')
    lower_z, upper_z = [], []
    for i, x in enumerate(xs):
        fade = np.sin(np.pi * i / (len(xs) - 1)) ** 0.5
        lower_y = tops[i] - cfg['height_mm'] / 1000 * fade
        upper_y = tops[i] + cfg['top_mm'] / 1000 * fade
        lower_z.append(face_z(x, lower_y, fronts[i]))
        upper_z.append(face_z(x, upper_y, fronts[i]))
    if face_bvh is not None:
        lower_z = np.convolve(np.pad(lower_z, (2, 2), mode='edge'), np.ones(5) / 5, mode='valid')
        upper_z = np.convolve(np.pad(upper_z, (2, 2), mode='edge'), np.ones(5) / 5, mode='valid')
    verts = []
    for i, x in enumerate(xs):
        fade = np.sin(np.pi * i / (len(xs) - 1)) ** 0.5
        y0 = tops[i] - cfg['height_mm'] / 1000 * fade
        y1 = tops[i] + cfg['top_mm'] / 1000 * fade
        for depth in (0.00010, -0.00010):
            verts.extend([[sign * x, y0, lower_z[i] + cfg['front_mm'] / 1000 + depth],
                          [sign * x, y1, upper_z[i] + cfg['front_mm'] / 1000 + depth]])
    faces = []
    for i in range(len(xs) - 1):
        a, b = 4 * i, 4 * (i + 1)
        faces += [(a, b, b+1, a+1), (a+2, a+3, b+3, b+2),
                  (a, a+2, b+2, b), (a+1, b+1, b+3, a+3)]
    faces += [(0, 1, 3, 2), (len(verts)-4, len(verts)-2, len(verts)-1, len(verts)-3)]
    return replace_mesh(obj, np.asarray(verts), faces, '_bridge')


def replace_mesh(obj, verts, faces, suffix):
    original = obj.data
    new = bpy.data.meshes.new(original.name + suffix)
    world_coords = M.to_world(verts)
    mat = np.array(obj.matrix_world)
    local = (world_coords - mat[:3, 3]) @ np.linalg.inv(mat[:3, :3]).T
    new.from_pydata(local.tolist(), [], faces)
    new.update()
    for material in original.materials:
        new.materials.append(material)
    obj.data = new
    if original.users == 0:
        name = original.name
        bpy.data.meshes.remove(original)
        new.name = name


def face_depth_bvh():
    face = bpy.data.objects['HEAD_face']
    q = M.to_local(world(face))
    return BVHTree.FromPolygons([Vector(v) for v in q], [list(p.vertices) for p in face.data.polygons])


def add_gap_patches(obj, cfg, bvh):
    """Fill only the small exposed skin islands between the lash wing pieces."""
    data = json.loads((ROOT / 'analysis/multiview/eye_gap_front_minus.json').read_text())
    scene = bpy.context.scene
    cam = bpy.data.objects['FACE_FIT_CAM_front']
    w, h = [int(v) * 4 for v in cam['inkwave_resolution']]
    original_resolution = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inverse = (cam.calc_matrix_camera(depsgraph, x=w, y=h, scale_x=1, scale_y=1)
               @ cam.matrix_world.inverted()).inverted()
    face = bpy.data.objects['HEAD_face']
    face_inv = face.matrix_world.inverted()
    sign = 1 if obj.name == 'HEAD_eyes_04' else -1
    sx, sy = data['front_minus_crop'][:2]
    verts = M.to_local(world(obj)).tolist()
    faces = [tuple(p.vertices) for p in obj.data.polygons]
    def projected(px, py, depth_mm):
        ndc_x = 2 * (sx * 4 + px + 0.5) / w - 1
        ndc_y = 1 - 2 * (sy * 4 + py + 0.5) / h
        ray = []
        for clip_z in (-1, 1):
            point = inverse @ Vector((ndc_x, ndc_y, clip_z, 1))
            ray.append(Vector((point.x/point.w, point.y/point.w, point.z/point.w)))
        origin = face_inv @ ray[0]
        direction = (face_inv.to_3x3() @ (ray[1] - ray[0])).normalized()
        found, hit, _, _ = face.ray_cast(origin, direction, distance=50)
        if not found:
            raise ValueError(f'no face under eyeliner gap at {px},{py}')
        q = M.to_local(np.array([tuple(face.matrix_world @ hit)]))[0]
        q[0] = sign * abs(q[0])
        surface = bvh.ray_cast(Vector((q[0], q[1], 0.3)), Vector((0, 0, -1)))[0]
        if surface is None:
            raise ValueError(f'no mirrored face under eyeliner gap at {px},{py}')
        q[2] = surface.z + depth_mm / 1000
        return q
    try:
        for patch_idx, patch in enumerate(data['polygons']):
            center = np.asarray(patch['center'])
            outline = center + (np.asarray(patch['points']) - center) * cfg['patch_scale']
            offset = cfg['patch_surface_mm'] + patch_idx * 0.02
            front_center = projected(*center, offset + 0.1)
            back_center = projected(*center, offset - 0.1)
            rim_front = [projected(*point, offset + 0.1) for point in outline]
            rim_back = [projected(*point, offset - 0.1) for point in outline]
            start = len(verts)
            verts.extend([front_center.tolist(), back_center.tolist()])
            verts.extend([q.tolist() for pair in zip(rim_front, rim_back) for q in pair])
            n = len(outline)
            for i in range(n):
                a, b = start + 2 + 2*i, start + 2 + 2*((i+1) % n)
                faces.extend([(start, a, b), (start+1, b+1, a+1),
                              (a, a+1, b+1, b)])
    finally:
        scene.render.resolution_x, scene.render.resolution_y = original_resolution
    replace_mesh(obj, np.asarray(verts), faces, '_gap_patch')


def liner_corner(obj, variant, bvh):
    """Taper the bulky inner eyeliner tip toward the existing upper lid edge."""
    cfg = CORNER_VARIANTS[variant]
    if 'tip_scale' in cfg:
        return liner_corner_collapse(obj, cfg, bvh)
    if 'thickness' in cfg:
        return liner_corner_taper(obj, cfg, bvh)
    q = M.to_local(world(obj))
    x = np.abs(q[:, 0]) * 1000
    edge = np.interp(x, [24.5, 26.5, 28, 30, 34, 38, 42],
                     [-23.2, -23.2, -19.5, -15.5, -10.5, -7.4, -5.5]) / 1000 + 0.0004
    t = np.clip((42 - x) / 17.5, 0, 1)
    weight = t * t * (3 - 2 * t)
    dy = np.maximum(q[:, 1] - edge, 0.0)
    displacement = -cfg['sharpen'] * weight * dy
    displacement -= cfg['drop_mm'] / 1000 * np.exp(-((x - 26.5) / 4.5) ** 2) * weight
    for i in np.where(np.abs(displacement) > 1e-6)[0]:
        old, new = q[i].copy(), q[i].copy()
        new[1] += displacement[i]
        a = bvh.ray_cast(Vector((old[0], old[1], 0.3)), Vector((0, 0, -1)))[0]
        b = bvh.ray_cast(Vector((new[0], new[1], 0.3)), Vector((0, 0, -1)))[0]
        if a is not None and b is not None:
            new[2] += b.z - a.z
        q[i] = new
    put_world(obj, M.to_world(q))
    return round(float(np.max(np.abs(displacement)) * 1000), 3)


def liner_corner_taper(obj, cfg, bvh):
    """Narrow the inner end with a monotone cross-section transform."""
    q = M.to_local(world(obj))
    initial = q.copy()
    x = np.abs(q[:, 0]) * 1000
    grid = np.arange(24.0, 43.0, 1.0)
    centers = []
    for xx in grid:
        section = q[np.abs(x - xx) < 1.7, 1]
        if not len(section):
            section = q[np.argsort(np.abs(x - xx))[:8], 1]
        centers.append(np.median(section))
    kernel = np.exp(-0.5 * (np.arange(-3, 4) / 1.4) ** 2)
    kernel /= kernel.sum()
    centers = np.convolve(np.pad(centers, (3, 3), mode='edge'), kernel, mode='valid')
    t = np.clip((42 - x) / 17.5, 0, 1)
    t = t * t * (3 - 2 * t)
    for i in np.where(t > 1e-6)[0]:
        center = np.interp(x[i], grid, centers)
        q[i, 1] = (center + (initial[i, 1] - center) * (1 - (1 - cfg['thickness']) * t[i])
                   - cfg['drop_mm'] / 1000 * t[i])
        old, new = initial[i], q[i]
        a = bvh.ray_cast(Vector((old[0], old[1], 0.3)), Vector((0, 0, -1)))[0]
        b = bvh.ray_cast(Vector((new[0], new[1], 0.3)), Vector((0, 0, -1)))[0]
        if a is not None and b is not None:
            q[i, 2] = old[2] + b.z - a.z
            if 'depth_scale' in cfg:
                relative = old[2] - a.z
                target_z = b.z + cfg['surface_mm'] / 1000 + relative * cfg['depth_scale']
                q[i, 2] += (target_z - q[i, 2]) * t[i]
    put_world(obj, M.to_world(q))
    return round(float(np.max(np.abs(q[:, 1] - initial[:, 1])) * 1000), 3)


def liner_corner_collapse(obj, cfg, bvh):
    """Taper the entire 3D inner liner cross-section to a small point."""
    q = M.to_local(world(obj))
    initial = q.copy()
    x = np.abs(q[:, 0]) * 1000
    grid = np.arange(24.0, 43.0, 1.0)
    centers = []
    for xx in grid:
        section = q[np.abs(x - xx) < 1.7]
        if not len(section):
            section = q[np.argsort(np.abs(x - xx))[:8]]
        centers.append(np.median(section[:, 1:3], axis=0))
    centers = np.asarray(centers)
    kernel = np.exp(-0.5 * (np.arange(-3, 4) / 1.4) ** 2)
    kernel /= kernel.sum()
    for axis in range(2):
        centers[:, axis] = np.convolve(np.pad(centers[:, axis], (3, 3), mode='edge'),
                                       kernel, mode='valid')
    t = np.clip((42 - x) / 18, 0, 1)
    t = t * t * (3 - 2 * t)
    for i in np.where(t > 1e-6)[0]:
        center_y = np.interp(x[i], grid, centers[:, 0])
        center_z = np.interp(x[i], grid, centers[:, 1])
        scale = 1 - (1 - cfg['tip_scale']) * t[i]
        q[i, 0] += np.sign(q[i, 0]) * cfg['shorten_mm'] / 1000 * t[i]
        q[i, 1] = center_y + (initial[i, 1] - center_y) * scale - cfg['drop_mm'] / 1000 * t[i]
        surface = bvh.ray_cast(Vector((q[i, 0], center_y - cfg['drop_mm'] / 1000 * t[i], 0.3)),
                               Vector((0, 0, -1)))[0]
        if surface is not None:
            target_z = surface.z + cfg['surface_mm'] / 1000 + (initial[i, 2] - center_z) * scale
            q[i, 2] = initial[i, 2] * (1 - t[i]) + target_z * t[i]
    put_world(obj, M.to_world(q))
    return round(float(np.max(np.linalg.norm(q - initial, axis=1)) * 1000), 3)


def brow_tail(obj, variant, bvh):
    """Extend and lift only the tapered outer end of each separate eyebrow mesh."""
    cfg = BROW_VARIANTS[variant]
    if cfg.get('mode') == 'reference_strip':
        return brow_reference_mesh(obj, cfg, bvh)
    if cfg.get('mode') == 'multiview_decal':
        return brow_multiview_decal(obj, variant, bvh)
    q = M.to_local(world(obj))
    q0 = q.copy()
    x = np.abs(q[:, 0]) * 1000
    t = np.clip((x - 52) / 18, 0, 1)
    weight = t * t * (3 - 2 * t)
    for i in np.where(weight > 1e-6)[0]:
        old, new = q[i].copy(), q[i].copy()
        new[0] += np.sign(old[0]) * cfg['out_mm'] / 1000 * weight[i]
        new[1] += cfg['up_mm'] / 1000 * weight[i]
        a = bvh.ray_cast(Vector((old[0], old[1], 0.3)), Vector((0, 0, -1)))[0]
        b = bvh.ray_cast(Vector((new[0], new[1], 0.3)), Vector((0, 0, -1)))[0]
        if a is not None and b is not None:
            new[2] += b.z - a.z
        q[i] = new
    if cfg.get('outer_thin'):
        # Shape the independent eyebrow mesh without changing the face topology.
        for i, xx in enumerate(x):
            outer = np.clip((xx - 50) / 12, 0, 1)
            outer = outer * outer * (3 - 2 * outer)
            inner = np.clip((52 - xx) / 16, 0, 1)
            inner = inner * inner * (3 - 2 * inner)
            if outer < 1e-6 and inner < 1e-6:
                continue
            section = q0[np.abs(x - xx) < 1.5, 1]
            center = float(np.median(section))
            q[i, 1] = (center + (q0[i, 1] - center) * (1 - cfg['outer_thin'] * outer)
                       + cfg['up_mm'] / 1000 * weight[i]
                       + cfg['outer_extra_up_mm'] / 1000 * outer
                       - cfg['inner_down_mm'] / 1000 * inner)
            old, new = q0[i], q[i]
            a = bvh.ray_cast(Vector((old[0], old[1], 0.3)), Vector((0, 0, -1)))[0]
            b = bvh.ray_cast(Vector((new[0], new[1], 0.3)), Vector((0, 0, -1)))[0]
            if a is not None and b is not None:
                q[i, 2] = old[2] + b.z - a.z
    elif cfg.get('top_thin'):
        # The smoothed top contour is a stable target for thinning the tail.
        # At each x the y mapping stays monotone, so the brow cannot fold.
        grid = np.arange(14.0, 77.0, 1.0)
        def sample_top(xx):
            section = q0[np.abs(x - xx) < 2.0, 1]
            if not len(section):
                section = q0[np.argsort(np.abs(x - xx))[:8], 1]
            return np.percentile(section, 98)
        top = np.array([sample_top(xx) for xx in grid])
        kernel = np.exp(-0.5 * (np.arange(-4, 5) / 1.5) ** 2)
        kernel /= kernel.sum()
        top = np.convolve(np.pad(top, (4, 4), mode='edge'), kernel, mode='valid')
        for i, xx in enumerate(x):
            outer = np.clip((xx - 50) / 12, 0, 1)
            outer = outer * outer * (3 - 2 * outer)
            inner = np.clip((52 - xx) / 16, 0, 1)
            inner = inner * inner * (3 - 2 * inner)
            if outer < 1e-6 and inner < 1e-6:
                continue
            top_y = np.interp(xx, grid, top)
            q[i, 1] = (q0[i, 1] + cfg['top_thin'] * outer * max(top_y - q0[i, 1], 0)
                       + cfg['up_mm'] / 1000 * weight[i]
                       + cfg['outer_extra_up_mm'] / 1000 * outer
                       - cfg['inner_down_mm'] / 1000 * inner)
            old, new = q0[i], q[i]
            a = bvh.ray_cast(Vector((old[0], old[1], 0.3)), Vector((0, 0, -1)))[0]
            b = bvh.ray_cast(Vector((new[0], new[1], 0.3)), Vector((0, 0, -1)))[0]
            if a is not None and b is not None:
                q[i, 2] = old[2] + b.z - a.z
    put_world(obj, M.to_world(q))
    return round(float(cfg['out_mm'] * weight.max()), 3)


def brow_reference_mesh(obj, cfg, bvh):
    """Project the reference brow contour onto the face as a smooth strip."""
    path = ROOT / 'analysis/multiview/brow_reference_front_minus.json'
    data = json.loads(path.read_text())
    contour = np.asarray(data['points'], float)
    xpx = contour[:, 0]
    def smooth(values):
        radius = max(2, int(np.ceil(3 * cfg['smooth_px'])))
        offsets = np.arange(-radius, radius + 1)
        kernel = np.exp(-0.5 * (offsets / cfg['smooth_px']) ** 2)
        kernel /= kernel.sum()
        return np.convolve(np.pad(values, (radius, radius), mode='edge'), kernel, mode='valid')
    upper, lower = smooth(contour[:, 1]) - 0.15, smooth(contour[:, 2]) + 0.15
    scene = bpy.context.scene
    cam = bpy.data.objects['FACE_FIT_CAM_front']
    w, h = [int(v) for v in cam['inkwave_resolution']]
    original_resolution = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inverse = (cam.calc_matrix_camera(depsgraph, x=w, y=h, scale_x=1, scale_y=1)
               @ cam.matrix_world.inverted()).inverted()
    face = bpy.data.objects['HEAD_face']
    face_inv = face.matrix_world.inverted()
    sx, sy = data['front_minus_eye_crop'][:2]
    sign = 1 if obj.name == 'HEAD_brows' else -1
    rows = 5
    verts = []
    try:
        for i, px in enumerate(xpx):
            for j in range(rows):
                py = upper[i] + (lower[i] - upper[i]) * j / (rows - 1)
                ndc_x = 2 * (sx + px + 0.5) / w - 1
                ndc_y = 1 - 2 * (sy + py + 0.5) / h
                ray = []
                for clip_z in (-1, 1):
                    point = inverse @ Vector((ndc_x, ndc_y, clip_z, 1))
                    ray.append(Vector((point.x/point.w, point.y/point.w, point.z/point.w)))
                origin = face_inv @ ray[0]
                direction = (face_inv.to_3x3() @ (ray[1] - ray[0])).normalized()
                found, hit, _, _ = face.ray_cast(origin, direction, distance=50)
                if not found:
                    raise ValueError(f'no face behind reference eyebrow x={px}, y={py}')
                world_hit = face.matrix_world @ hit
                q = M.to_local(np.array([tuple(world_hit)]))[0]
                q[0] = sign * abs(q[0])
                surface = bvh.ray_cast(Vector((q[0], q[1], 0.3)), Vector((0, 0, -1)))[0]
                if surface is None:
                    raise ValueError(f'no symmetric face under brow x={px}, y={py}')
                q[2] = surface.z + cfg['surface_mm'] / 1000
                verts.extend([(q + [0, 0, 0.00010]).tolist(),
                              (q - [0, 0, 0.00010]).tolist()])
    finally:
        scene.render.resolution_x, scene.render.resolution_y = original_resolution
    def idx(i, j, d):
        return 2 * (i * rows + j) + d
    faces = []
    for i in range(len(xpx) - 1):
        for j in range(rows - 1):
            faces.append((idx(i,j,0), idx(i+1,j,0), idx(i+1,j+1,0), idx(i,j+1,0)))
            faces.append((idx(i,j,1), idx(i,j+1,1), idx(i+1,j+1,1), idx(i+1,j,1)))
        for j in (0, rows - 1):
            faces.append((idx(i,j,0), idx(i,j,1), idx(i+1,j,1), idx(i+1,j,0)))
    for i in (0, len(xpx)-1):
        for j in range(rows - 1):
            faces.append((idx(i,j,0), idx(i,j+1,0), idx(i,j+1,1), idx(i,j,1)))
    replace_mesh(obj, np.asarray(verts), faces, '_reference_brow')
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return round(float(cfg['surface_mm']), 3)


BROW_GRID_MM = (8.0, 78.0, -2.0, 40.0, 0.25)


def camera_pixels(view, world_points):
    """Sheet-box pixel coordinates of world points in a fitted reference camera."""
    from bpy_extras.object_utils import world_to_camera_view
    scene = bpy.context.scene
    cam = bpy.data.objects['FACE_FIT_CAM_' + view]
    w, h = [int(v) for v in cam['inkwave_resolution']]
    original = (scene.render.resolution_x, scene.render.resolution_y)
    scene.render.resolution_x, scene.render.resolution_y = w, h
    try:
        uvz = np.array([tuple(world_to_camera_view(scene, cam, Vector(p))) for p in world_points])
    finally:
        scene.render.resolution_x, scene.render.resolution_y = original
    return uvz[:, 0] * w, (1 - uvz[:, 1]) * h


def bilinear(image, u, v):
    """Sample an HxW(xC) array at pixel-centre coordinates; zero outside."""
    h, w = image.shape[:2]
    x, y = u - 0.5, v - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    out = 0
    for dx, dy, wt in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)),
                       (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
        xi, yi = x0 + dx, y0 + dy
        ok = (xi >= 0) & (yi >= 0) & (xi < w) & (yi < h)
        val = np.zeros((len(u),) + image.shape[2:])
        val[ok] = image[yi[ok], xi[ok]]
        out = out + (wt[:, None] if image.ndim == 3 else wt) * val
    return out


def brow_decal_field(bvh, combine):
    """Reference brow alpha/colour on a surface grid of the minus (x < 0) brow."""
    data = np.load(ROOT / 'analysis/multiview/brow_reference_multiview.npz')
    x0, x1, y0, y1, step = BROW_GRID_MM
    xs, ys = np.arange(x0, x1 + 1e-6, step), np.arange(y0, y1 + 1e-6, step)
    gx, gy = np.meshgrid(xs, ys)
    q = np.zeros((gx.size, 3))
    q[:, 0], q[:, 1] = -gx.ravel() / 1000, gy.ravel() / 1000
    for i in range(len(q)):
        hit = bvh.ray_cast(Vector((q[i, 0], q[i, 1], 0.3)), Vector((0, 0, -1)))[0]
        if hit is None:
            raise ValueError(f'no face under brow grid x={q[i, 0]}, y={q[i, 1]}')
        q[i, 2] = hit.z
    world_points = M.to_world(q)
    alphas, colours = [], []
    for name, view in zip(data['names'], data['views']):
        u, v = camera_pixels(str(view), world_points)
        roi = data[f'{name}_roi']
        alphas.append(bilinear(data[f'{name}_alpha'], u - roi[0], v - roi[1]))
        if f'{name}_lower' in data:
            lower = bilinear(data[f'{name}_lower'].astype(float), u - roi[0], v - roi[1]) > 0.5
        colours.append(bilinear(data[f'{name}_rgb'], u - roi[0], v - roi[1]))
    alphas, colours = np.array(alphas), np.array(colours)
    alpha = {'min': alphas.min(0), 'median': np.median(alphas, 0), 'mean': alphas.mean(0)}[combine]
    weight = alphas + 1e-6
    colour = (colours * weight[..., None]).sum(0) / weight.sum(0)[:, None]
    # Pixels no view covers get the colour of the nearest covered grid point.
    covered = alphas.max(0) > 0.3
    if covered.any():
        pts = np.c_[gx.ravel(), gy.ravel()]
        from mathutils.kdtree import KDTree
        tree = KDTree(int(covered.sum()))
        for k, i in enumerate(np.nonzero(covered)[0]):
            tree.insert((pts[i, 0], pts[i, 1], 0), k)
        tree.balance()
        src = np.nonzero(covered)[0]
        for i in np.nonzero(~covered)[0]:
            colour[i] = colour[src[tree.find((pts[i, 0], pts[i, 1], 0))[1]]]
    shape = gx.shape
    return xs, ys, q.reshape(shape + (3,)), alpha.reshape(shape), colour.reshape(shape + (3,))


def brow_decal_image(name, alpha, colour, gain):
    """Straight-alpha sRGB texture; gain scales the colour in linear light."""
    lin = np.where(colour / 255 <= 0.04045, colour / 255 / 12.92, ((colour / 255 + 0.055) / 1.055) ** 2.4)
    lin = np.clip(lin * gain, 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * lin ** (1 / 2.4) - 0.055)
    h, w = alpha.shape
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = 'sRGB'
    img.alpha_mode = 'STRAIGHT'
    rgba = np.dstack([srgb, alpha]).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    return img


def brow_decal_material(name, img):
    mat = bpy.data.materials.get(name)
    if mat is not None:
        bpy.data.materials.remove(mat)
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = img
    tex.interpolation = 'Cubic'
    tex.extension = 'CLIP'
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(tex.outputs['Alpha'], bsdf.inputs['Alpha'])
    bsdf.inputs['Roughness'].default_value = 0.75
    if hasattr(mat, 'surface_render_method'):
        mat.surface_render_method = 'BLENDED'
    if hasattr(mat, 'blend_method'):
        mat.blend_method = 'BLEND'
    return mat


_BROW_DECAL_CACHE = {}


def brow_multiview_decal(obj, variant, bvh):
    """Replace the eyebrow with a skin-flush textured decal fitted to three reference views."""
    cfg = BROW_VARIANTS[variant]
    if variant not in _BROW_DECAL_CACHE:
        xs, ys, surface, alpha, colour = brow_decal_field(bvh, cfg['combine'])
        img = brow_decal_image('INKWAVE_brow_decal', alpha, colour, cfg['gain'])
        _BROW_DECAL_CACHE[variant] = (xs, ys, surface, alpha, brow_decal_material('INKWAVE_brow_decal', img))
    xs, ys, surface, alpha, mat = _BROW_DECAL_CACHE[variant]
    ny, nx = alpha.shape
    keep = alpha > 0.004
    for _ in range(2):
        grown = keep.copy()
        grown[1:] |= keep[:-1]; grown[:-1] |= keep[1:]
        grown[:, 1:] |= keep[:, :-1]; grown[:, :-1] |= keep[:, 1:]
        keep = grown
    sign = 1 if world(obj)[:, 0].mean() > 0 else -1
    index, verts, uvs = {}, [], []
    def vid(j, i):
        if (j, i) not in index:
            index[(j, i)] = len(verts)
            p = surface[j, i].copy()
            p[0] = sign * abs(p[0])
            p[2] += cfg['surface_mm'] / 1000
            verts.append(p)
            uvs.append(((i + 0.5) / nx, (j + 0.5) / ny))
        return index[(j, i)]
    faces = []
    for j in range(ny - 1):
        for i in range(nx - 1):
            if keep[j:j + 2, i:i + 2].any():
                quad = [vid(j, i), vid(j, i + 1), vid(j + 1, i + 1), vid(j + 1, i)]
                # grid x runs outward, so the minus side needs the reversed winding to face forward
                faces.append(quad[::-1] if sign < 0 else quad)
    replace_mesh(obj, np.asarray(verts), faces, '_brow_decal')
    me = obj.data
    me.materials.clear()
    me.materials.append(mat)
    layer = me.uv_layers.new(name='UVMap')
    for loop in me.loops:
        layer.data[loop.index].uv = uvs[loop.vertex_index]
    for poly in me.polygons:
        poly.use_smooth = True
    return round(float(cfg['surface_mm']), 3)


def caruncle_clean(name, variant):
    """Fade the painted red caruncle into the sclera colour of its texture row."""
    img = bpy.data.images[name]
    back_up_image(img)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    rgba = px.reshape(h, w, 4)
    rgb = rgba[..., :3]
    cx, cy = IRIS_IMAGES[name]
    yy, xx = np.mgrid[0:h, 0:w]
    outside = np.hypot((xx - cx) / 100.0, ((h - 1 - yy) - cy) / 92.0) > 1.0
    red = np.clip((rgb[..., 0] - np.maximum(rgb[..., 1], rgb[..., 2]) - 0.015) / 0.08, 0, 1) * outside
    clean = np.zeros_like(rgb)
    for y in range(h):
        ok = outside[y] & (red[y] < 0.05)
        clean[y] = np.median(rgb[y, ok], axis=0) if ok.any() else rgb[y].mean(0)
    wgt = (red * CARUNCLE_VARIANTS[variant]['amount'])[..., None]
    rgba[..., :3] = rgb * (1 - wgt) + clean * wgt
    img.pixels.foreach_set(rgba.ravel())
    img.pack()
    img.update()
    print('CARUNCLE', name, 'texels touched', int((red > 0.02).sum()))


def iris_tone(name, variant):
    """Darken the teal iris texture while preserving sclera and catchlights."""
    img = bpy.data.images[name]
    back_up_image(img)
    w, h = img.size
    pixels = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(pixels)
    rgba = pixels.reshape(h, w, 4)[::-1].copy()
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy = IRIS_IMAGES[name]
    radius = np.hypot((xx - cx) / 93.5, (yy - cy) / 85.0)
    radial = np.clip((1.01 - radius) / 0.045, 0, 1)
    bright = (rgba[..., :3].min(axis=2) if IRIS_VARIANTS[variant].get('white_preserve')
              else rgba[..., :3].max(axis=2))
    preserve_light = np.clip((0.99 - bright) / 0.10, 0, 1)
    mask = radial * preserve_light
    cfg = IRIS_VARIANTS[variant]
    rgba[..., 0] *= 1 - (1 - cfg.get('red', 1.0)) * mask
    rgba[..., 1] *= 1 - (1 - cfg['green']) * mask
    rgba[..., 2] *= 1 - (1 - cfg['blue']) * mask
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).ravel())
    img.pack()
    img.update()
def main():
    a = args()
    restored = restore()
    if not a.restore:
        needs_bvh = a.corner or a.brow or (a.bridge and 'patch_scale' in BRIDGE_VARIANTS[a.bridge])
        bvh = face_depth_bvh() if needs_bvh else None
        corner_max = None
        if a.corner:
            corner_max = {}
            for name in LINER_NAMES:
                obj = bpy.data.objects[name]
                back_up(obj)
                corner_max[name] = liner_corner(obj, a.corner, bvh)
        brow_max = None
        if a.brow:
            brow_max = {}
            for name in BROW_NAMES:
                obj = bpy.data.objects[name]
                back_up(obj)
                brow_max[name] = brow_tail(obj, a.brow, bvh)
        fit = LASH_VARIANTS[a.variant].get('mode') == 'fit'
        decal = LASH_VARIANTS[a.variant].get('mode') in ('decal', 'sweep', 'strip')
        if decal and (a.corner or a.bridge or a.lower or a.wing):
            raise SystemExit('lash decal rebuild replaces liner, bridge, lower lashes and wing; drop those options')
        for i in range(7):
            for name in (LASH_NAMES[i], LASH_NAMES[i + 7]):
                obj = bpy.data.objects[name]
                back_up(obj)
                if not (fit or decal):
                    lash_shape(obj, i, a.variant)
        if a.bridge:
            for name in BASE_NAMES:
                obj = bpy.data.objects[name]
                back_up(obj)
                lash_bridge(obj, a.bridge)
                if 'patch_scale' in BRIDGE_VARIANTS[a.bridge]:
                    add_gap_patches(obj, BRIDGE_VARIANTS[a.bridge], bvh)
        if decal and LASH_VARIANTS[a.variant]['mode'] == 'strip':
            print('LASH_STRIP teeth', lash_strip_rebuild(a.variant))
        elif decal and LASH_VARIANTS[a.variant]['mode'] == 'sweep':
            print('LASH_SWEEP median offset mm', lash_sweep_rebuild(a.variant))
        elif decal:
            print('LASH_DECAL area_mm2', lash_decal_rebuild(a.variant))
        if fit:
            axes = fitted_lash_axes()
            for i in range(7):
                for name in (LASH_NAMES[i], LASH_NAMES[i + 7]):
                    lash_fit(bpy.data.objects[name], i, a.variant, axes)
        if a.iris:
            for name in IRIS_IMAGES:
                iris_tone(name, a.iris)
        wing_max = None
        if a.wing:
            wing_max = {}
            for name in LINER_NAMES + BASE_NAMES + LASH_NAMES:
                obj = bpy.data.objects[name]
                back_up(obj)
                wing_max[name] = wing_depth(obj, a.wing)
        if a.lower:
            lower_lash_rebuild(a.lower)
        if a.canthus:
            canthus_carve(a.canthus)
        if a.caruncle:
            for name in IRIS_IMAGES:
                caruncle_clean(name, a.caruncle)
        if a.matte:
            for name in MATTE_MATERIALS:
                mat = bpy.data.materials[name]
                bsdf = mat.node_tree.nodes['Principled BSDF']
                mat[BACKUP_SUFFIX] = [bsdf.inputs['Roughness'].default_value,
                                      bsdf.inputs['Specular IOR Level'].default_value]
                bsdf.inputs['Roughness'].default_value = MATTE_VARIANTS[a.matte]['roughness']
                bsdf.inputs['Specular IOR Level'].default_value = MATTE_VARIANTS[a.matte]['specular']
    else:
        wing_max = None
    txt = bpy.data.texts.get('INKWAVE_EYE_REFINEMENT.json') or bpy.data.texts.new('INKWAVE_EYE_REFINEMENT.json')
    txt.from_string(json.dumps({'variant': None if a.restore else a.variant,
                                'parameters': None if a.restore else LASH_VARIANTS[a.variant],
                                'bridge': None if a.restore else a.bridge,
                                'bridge_parameters': None if a.restore or not a.bridge else BRIDGE_VARIANTS[a.bridge],
                                'corner': None if a.restore else a.corner,
                                'corner_parameters': None if a.restore or not a.corner else CORNER_VARIANTS[a.corner],
                                'corner_max_mm': None if a.restore else corner_max,
                                'brow': None if a.restore else a.brow,
                                'brow_parameters': None if a.restore or not a.brow else BROW_VARIANTS[a.brow],
                                'brow_max_mm': None if a.restore else brow_max,
                                'iris': None if a.restore else a.iris,
                                'iris_parameters': None if a.restore or not a.iris else IRIS_VARIANTS[a.iris],
                                'wing': None if a.restore else a.wing,
                                'wing_parameters': None if a.restore or not a.wing else WING_VARIANTS[a.wing],
                                'wing_max_mm': wing_max,
                                'lower': None if a.restore else a.lower,
                                'lower_parameters': None if a.restore or not a.lower else LOWER_VARIANTS[a.lower],
                                'matte': None if a.restore else a.matte,
                                'canthus': None if a.restore else a.canthus,
                                'caruncle': None if a.restore else a.caruncle,
                                'baseline_restored_meshes': restored}, indent=2))
    a.save.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(a.save), compress=True)
    print('EYE_REFINEMENT saved', a.save)
    if a.export:
        import shutil
        sys.path.insert(0, str(ROOT / 'scripts'))
        import inkwave_face_refine as fr
        fr.export_character(a.export)
        if a.game:
            shutil.copyfile(a.export, a.game)


if __name__ == '__main__':
    main()
