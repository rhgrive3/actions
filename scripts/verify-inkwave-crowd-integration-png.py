import sys, pathlib, json
from PIL import Image, ImageChops

def validate_rgba(image):
    image=image.convert('RGBA')
    assert image.size==(640,480), ('image size',image.size)
    assert image.getextrema()[3]==(255,255), 'transparent image'
    colors=image.getcolors(640*480)
    assert colors and len(colors)>=32, 'empty or nearly uniform image'

def assert_exact_pixels(baseline, compared):
    assert baseline.size==compared.size, 'different image sizes'
    # RGBA defaults can ignore RGB-only differences when alpha is unchanged.
    assert ImageChops.difference(baseline.convert('RGBA'),compared.convert('RGBA')).getbbox(alpha_only=False) is None, 'pixel difference'

def verify(root):
    root=pathlib.Path(root); total=0; comparisons=0
    for bank in ['default','mixed']:
        folders=[root/bank/k for k in ['A1','B1','B2','A2']]
        names=sorted(p.name for p in folders[0].glob('*.png'))
        assert len(names)==25, (bank,len(names))
        for folder in folders:
            assert sorted(p.name for p in folder.glob('*.png'))==names
            for name in names:
                with Image.open(folder/name) as image: validate_rgba(image)
                total+=1
        for name in names:
            with Image.open(folders[0]/name) as baseline:
                for folder in folders[1:]:
                    with Image.open(folder/name) as compared: assert_exact_pixels(baseline,compared)
                    comparisons+=1
    return {'accepted':True,'opaqueNonemptyPngs':total,'strictZeroPixelComparisons':comparisons}

if __name__=='__main__': print(json.dumps(verify(sys.argv[1])))
