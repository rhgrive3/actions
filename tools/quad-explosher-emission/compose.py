import json,sys
from pathlib import Path
from PIL import Image,ImageDraw
root=Path(sys.argv[1]);summary=json.loads((root/'summary.json').read_text())
for row in summary['results']:
 p=root/row['key'];frames=[Image.open(f).convert('RGB') for f in sorted(p.glob('side-*.png'))]
 label=f"{summary['shape']} {summary['originMode']} | {row['id']} | {row['fps']} fps | {'steady' if row['steady'] else 'first'} | native Projectiles + FX | provisional model"
 for i,im in enumerate(frames):
  ImageDraw.Draw(im).rectangle((0,0,600,33),fill='white');ImageDraw.Draw(im).text((5,5),label,fill='black');ImageDraw.Draw(im).text((5,19),f'frame {i} after first birth; simulation timestep {1000/row["fps"]:.2f} ms',fill='black')
 frames[0].save(p/'firing.gif',save_all=True,append_images=frames[1:],duration=1000/row['fps'],loop=0)
 sheet=Image.new('RGB',(1800,1200),'white')
 for n,i in enumerate([0,1,2,4,8,15]):sheet.paste(frames[i],((n%3)*600,(n//3)*600))
 sheet.save(p/'contact-sheet.jpg',quality=93)
