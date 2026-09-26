import sys
from PIL import Image
pre = sys.argv[1]
pairs = [('front','ref_front_hi.png',(380,60,760,360)), ('side','ref_side_hi.png',(420,40,800,340))]
for name, ref, box in pairs:
    r = Image.open(ref).convert('RGB').crop(box); r = r.resize((r.width*2, r.height*2), Image.LANCZOS)
    m = Image.open(f'{pre}_{name}.png').convert('RGB')
    W = Image.new('RGB', (r.width*3, r.height))
    W.paste(r, (0,0)); W.paste(m, (r.width,0)); W.paste(Image.blend(r, m, 0.5), (r.width*2, 0))
    W.save(f'{pre}_cmp_{name}.png')
