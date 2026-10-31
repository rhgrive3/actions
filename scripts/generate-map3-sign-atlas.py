#!/usr/bin/env python3
"""Build original MAP3 print artwork using the game's vendored OFL fonts.

No font/network/canvas work runs in the game. A compact paletted RLE stream
decodes once into the shared 512² DataTexture; the source remains reproducible.
Usage: python3 scripts/generate-map3-sign-atlas.py [--preview /tmp/atlas.png]
Requires Pillow + fontTools with Brotli support (authoring tools only).
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'inkwave-public/src/world/stages/map3-sign-atlas.js'
SIZE, W, H, S = 512, 256, 128, 3
NAMES = ['market', 'bakery', 'drinks', 'poster', 'terminal', 'departures', 'service', 'cargo']
CREAM, INK, TEAL, RUST, GOLD, PALE = '#f3e8cf', '#273e42', '#427c73', '#b65e45', '#d8ae60', '#b9c9b0'

def font(name, size):
    f = TTFont(ROOT / 'inkwave-public/assets/fonts' / (name + '-latin.woff2'))
    f.flavor = None
    out = io.BytesIO(); f.save(out); out.seek(0)
    return ImageFont.truetype(out, size * S)

def tile(name):
    image = Image.new('RGB', (W*S, H*S), CREAM)
    d = ImageDraw.Draw(image)
    def rect(box, color, radius=0, outline=None, width=1):
        coords = tuple(round(x*S) for x in box)
        if radius: d.rounded_rectangle(coords, radius=radius*S, fill=color, outline=outline, width=width*S)
        else: d.rectangle(coords, fill=color, outline=outline, width=width*S)
    def line(points, color, width=2): d.line([(round(x*S),round(y*S)) for x,y in points], fill=color, width=width*S, joint='curve')
    def ellipse(box, color, outline=None, width=1): d.ellipse(tuple(round(x*S) for x in box), fill=color, outline=outline, width=width*S)
    def text(x,y,value,size=18,color=INK,bold=False): d.text((x*S,y*S),value,font=font('TitanOne' if bold else 'Rubik',size),fill=color,stroke_width=0)
    def arrow(x,y, color=GOLD):
        line([(x,y),(x+26,y)],color,4); line([(x+17,y-8),(x+26,y),(x+17,y+8)],color,4)
    rect((5,5,251,123),None,7,INK,2)
    if name == 'market':
        rect((7,7,249,44),TEAL,6)
        text(17,12,'TIDE MARKET',24,CREAM,True)
        text(18,51,'FRESH FROM THE COAST',12)
        for i in range(3):
            ellipse((23+i*18,83,47+i*18,107),[RUST,GOLD,TEAL][i])
            line([(34+i*18,84),(39+i*18,76)],TEAL,3)
        text(95,80,'OPEN DAILY',16,TEAL,True)
        text(95,101,'BREAD  /  GREENS  /  TEA',9)
    elif name == 'bakery':
        rect((7,7,249,121),RUST,6)
        for x in range(16,245,18): rect((x,10,x+5,19),CREAM)
        text(21,28,'MORNING',25,CREAM,True); text(22,62,'BAKEHOUSE',20,CREAM,True)
        line([(23,96),(150,96)],GOLD,2); text(23,102,'SMALL BATCH · SINCE 08',9,CREAM)
        ellipse((180,43,231,95),GOLD)
        for x in [188,200,212]: line([(x,66),(x+8,58)],CREAM,3)
    elif name == 'drinks':
        rect((7,7,249,121),TEAL,6)
        text(17,14,'SALT & CITRUS',22,CREAM,True)
        text(18,49,'COLD BREW  /  FRESH SODA',11,CREAM)
        for x,c in [(30,GOLD),(82,RUST),(134,PALE)]:
            rect((x,77,x+30,109),c,3); line([(x+15,79),(x+20,64),(x+28,64)],CREAM,3)
            ellipse((x+3,83,x+15,95),CREAM)
        arrow(193,93,CREAM)
    elif name == 'poster':
        rect((7,7,249,121),GOLD,6)
        text(16,12,'HARBOR DAYS',23,INK,True)
        text(18,45,'MUSIC   /   FOOD   /   CRAFT',11)
        for y in [77,87,97]:
            line([(15,y),(35,y-5),(55,y),(75,y-5),(95,y),(115,y-5),(135,y)],TEAL,3)
        text(165,63,'31',36,RUST,True); text(163,105,'ON THE QUAY',8)
    elif name == 'terminal':
        rect((7,7,249,121),INK,6)
        text(18,14,'KELP LINE',23,CREAM,True)
        text(19,48,'FERRY TERMINAL',12,PALE)
        rect((17,73,76,110),GOLD,5); text(27,75,'03',26,INK,True)
        text(89,77,'BOARDING',14,CREAM,True); text(90,98,'UPPER DECK',10,CREAM)
        arrow(211,89,CREAM)
    elif name == 'departures':
        rect((7,7,249,121),INK,6)
        text(16,12,'CONNECTIONS',19,CREAM,True)
        text(18,39,'PIER 03    /    CITY LOOP',10,PALE)
        line([(27,69),(81,69),(113,95),(171,95),(212,68)],GOLD,4)
        line([(80,68),(112,53),(170,53),(211,68)],TEAL,4)
        for x,y in [(27,69),(81,69),(113,95),(171,95),(212,68)]:
            ellipse((x-5,y-5,x+5,y+5),CREAM); ellipse((x-2,y-2,x+2,y+2),INK)
        text(16,106,'MARKET',8,CREAM); text(104,106,'QUAY',8,CREAM); text(195,106,'CITY',8,CREAM)
    elif name == 'service':
        rect((7,7,249,34),GOLD,6)
        text(18,10,'SERVICE / 04',18,INK,True)
        text(17,43,'VENTILATION UNIT',13,INK,True)
        text(17,65,'CHECKED   ·   KEEP CLEAR',10)
        for y in [87,96,105]:
            rect((17,y,24,y+6),None,0,TEAL,1); line([(19,y+3),(21,y+5),(25,y)],TEAL,1)
            line([(33,y+3),(147,y+3)],'#91a299',1)
        ellipse((183,76,225,116),None,TEAL,3); text(188,84,'OK',16,TEAL,True)
    else:
        text(17,13,'QUAYSIDE',22,INK,True); text(17,43,'FREIGHT CO.',12,RUST,True)
        rect((181,13,237,63),TEAL,4); text(190,22,'08',25,CREAM,True)
        line([(17,68),(237,68)],INK,2)
        for i in range(36):
            x=18+i*3; rect((x,80,x+(1 if i%3 else 2),104-(i%4)*2),INK)
        text(18,110,'KL / TWD / 0831',7)
        arrow(167,94,INK); line([(220,106),(220,82),(213,89),(220,82),(227,89)],INK,3)
    # The ink belongs to a printed board: a small paper edge, no random noise.
    return image.resize((W,H), Image.Resampling.LANCZOS)

def build():
    atlas=Image.new('RGB',(SIZE,SIZE),CREAM)
    for i,name in enumerate(NAMES): atlas.paste(tile(name),((i%2)*W,(i//2)*H))
    pal=atlas.quantize(colors=64,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    palette=pal.getpalette()[:64*3]; pixels=list(pal.getdata()); alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    stream=[]; i=0
    while i<len(pixels):
        color=pixels[i]; count=1
        while i+count<len(pixels) and pixels[i+count]==color and count<64: count+=1
        stream.append(alphabet[color]+alphabet[count-1]);i+=count
    encoded=''.join(stream)
    entries={name:{'x':i%2*W,'y':i//2*H,'w':W,'h':H} for i,name in enumerate(NAMES)}
    # Crop the same pixels for the long roof fascias; never stretch a complete
    # 2:1 timetable into a 10:1 sign or allocate another texture for its title.
    entries['terminalHeader']={'x':14,'y':268,'w':222,'h':34}
    src='// Generated by scripts/generate-map3-sign-atlas.py using the vendored OFL fonts.\n'
    src+='// Original market / passenger / maintenance print artwork; 1 MiB RGBA, shared across live MAP3 scenes.\n'
    src+="import * as THREE from 'three';\n"
    src+='export const MAP3_SIGN_TILES = Object.freeze('+json.dumps(entries,separators=(',',':'))+');\n'
    src+='const PALETTE = '+json.dumps(palette,separators=(',',':'))+';\n'
    src+='const PIXELS =\n'+ '\n'.join('  '+json.dumps(encoded[i:i+160]) + (';' if i+160>=len(encoded) else ' +') for i in range(0,len(encoded),160))+'\n'
    src+="""
export function createMap3SignAtlas() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', data = new Uint8Array(512 * 512 * 4);
  let offset = 0;
  for (let i = 0; i < PIXELS.length; i += 2) {
    const color = alphabet.indexOf(PIXELS[i]) * 3, count = alphabet.indexOf(PIXELS[i + 1]) + 1;
    for (let j = 0; j < count; j++) {
      data[offset++] = PALETTE[color]; data[offset++] = PALETTE[color + 1]; data[offset++] = PALETTE[color + 2]; data[offset++] = 255;
    }
  }
  if (offset !== data.length) throw new Error('MAP3 sign atlas is incomplete');
  const texture = new THREE.DataTexture(data, 512, 512, THREE.RGBAFormat);
  texture.name = 'map3-shared-print-atlas'; texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.anisotropy = 2; texture.needsUpdate = true;
  return texture;
}
"""
    OUT.write_text(src)
    print(json.dumps({'output':str(OUT),'sourceBytes':len(src.encode()),'rgbaBytes':SIZE*SIZE*4,'paletteColors':64,'artworkSha256':hashlib.sha256(pal.convert('RGB').tobytes()).hexdigest()}))
    return pal.convert('RGB')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--preview',type=Path);args=parser.parse_args()
    image=build()
    if args.preview: image.save(args.preview)
