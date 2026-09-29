"""final_boards.py : reference | current(A) | candidate(E) boards (>=800 px face crops), clay boards, eye-only board, 3-colour contour overlays, red/cyan overlay."""
import sys, numpy as np, subprocess
from PIL import Image, ImageDraw
sys.path.insert(0, '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/tools')
EV = '/mnt/workspace/.dev-state/agent-work/evidence/inkwave-face-identity-20260929/'
REF = Image.open('/mnt/workspace/.dev-state/agent-work/checkouts/ink-identity/tools/inkwave-modeler/docs/face-multiview-fit/refs/sheet_5view.png').convert('RGB')
BOX = {'front': (60, 230), 'q34L': (470, 230), 'sideL': (880, 230), 'q34R': (1370, 230), 'sideR': (1790, 230)}
FACE = {'front': (115, 60, 265, 210), 'q34L': (80, 60, 230, 210), 'sideL': (40, 70, 190, 220), 'q34R': (140, 60, 290, 210), 'sideR': (180, 70, 330, 220)}
S = 900
def ref(v):
    x0, y0 = BOX[v]; a, b, c, d = FACE[v]
    return REF.crop((x0 + a, y0 + b, x0 + c, y0 + d)).resize((S, S), Image.LANCZOS)
def mod(d, v, look):
    return Image.open(f'{EV}fin/{d}/{v}_{look}.png').convert('RGB').resize((S, S), Image.LANCZOS)
def label(im, t):
    ImageDraw.Draw(im).text((12, 10), t, fill=(255, 255, 0)); return im
def board(views, out, look, dA, dE):
    rows = []
    for v in views:
        ims = [label(ref(v), f'REFERENCE {v}'), label(mod(dA, v, look), 'CURRENT'), label(mod(dE, v, look), 'CANDIDATE E')]
        rows.append(np.concatenate([np.asarray(i) for i in ims], 1))
    Image.fromarray(np.concatenate(rows, 0)).save(out)
def redcyan(v, out):
    ref_g = np.asarray(ref(v).convert('L'), float); m_g = np.asarray(mod('E', v, 'beauty').convert('L'), float)
    o = np.stack([m_g, ref_g, ref_g], -1).clip(0, 255).astype(np.uint8)   # red = candidate, cyan = reference
    Image.fromarray(o).save(out)
if __name__ == '__main__':
    board(['front'], EV + 'fin/1_front.png', 'beauty', 'A', 'E')
    board(['q34L', 'q34R'], EV + 'fin/2_q34.png', 'beauty', 'A', 'E')
    board(['sideL', 'sideR'], EV + 'fin/3_side.png', 'beauty', 'A', 'E')
    board(['front', 'q34L', 'q34R', 'sideL', 'sideR'], EV + 'fin/6_clay.png', 'clay', 'Ac', 'Ec')
    for v in ['front', 'q34L', 'q34R', 'sideR']:
        redcyan(v, EV + f'fin/7_redcyan_ref_vs_E_{v}.png')
