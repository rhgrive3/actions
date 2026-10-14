import importlib.util, pathlib, unittest, tempfile
from PIL import Image
p=pathlib.Path(__file__).parents[1]/'verify-inkwave-crowd-integration-png.py'
spec=importlib.util.spec_from_file_location('gate',p); gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)

class PNGGate(unittest.TestCase):
    def fixture(self):
        image=Image.new('RGBA',(640,480),(0,0,0,255))
        for i in range(32): image.putpixel((i,0),(i,i+1,i+2,255))
        return image
    def test_valid_and_exact(self):
        image=self.fixture();gate.validate_rgba(image);gate.assert_exact_pixels(image,image.copy())
    def test_reject_same_alpha_one_rgb_pixel(self):
        image=self.fixture();changed=image.copy();changed.putpixel((100,100),(1,0,0,255))
        with self.assertRaisesRegex(AssertionError,'pixel difference'): gate.assert_exact_pixels(image,changed)
    def test_reject_transparent_pixel(self):
        image=self.fixture();image.putpixel((100,100),(0,0,0,254))
        with self.assertRaisesRegex(AssertionError,'transparent'): gate.validate_rgba(image)
    def test_reject_uniform_output(self):
        with self.assertRaisesRegex(AssertionError,'empty'): gate.validate_rgba(Image.new('RGBA',(640,480),(40,50,60,255)))
    def test_reject_absent_pngs(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(AssertionError): gate.verify(directory)
    def test_reject_wrong_size(self):
        with self.assertRaisesRegex(AssertionError,'image size'): gate.validate_rgba(Image.new('RGBA',(1,1),(0,0,0,255)))

if __name__=='__main__': unittest.main()
