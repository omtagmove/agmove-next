"""Checks for complete editable pages and safe, deterministic static builds."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from common import PAGES, REDIRECTS, read_page
from build_site import build, MARKER

class SiteTests(TestCase):
    def test_pages_are_complete_and_only_tablet_is_separate(self):
        for name in PAGES:
            source = (ROOT / name / "index.html").read_text()
            self.assertIn("<!doctype html>", source)
            self.assertIn("<main", source)
            self.assertNotIn("<!-- include:", source)
            self.assertTrue((ROOT / name / "style.css").is_file())
            self.assertTrue((ROOT / name / "script.js").is_file())
        self.assertIn("<!-- tablet-showcase -->", (ROOT / "home/index.html").read_text())
        self.assertNotIn("<!-- tablet-showcase -->", read_page("home"))
        self.assertIn('id="control-app"', read_page("home"))

    def test_build_is_complete_and_deterministic(self):
        with TemporaryDirectory() as temp:
            output = build(Path(temp) / "site")
            self.assertEqual((output / "index.html").read_text(), read_page("home"))
            for name in REDIRECTS:
                self.assertTrue((output / name).is_file())
            self.assertFalse((output / "tools").exists())
            self.assertFalse((output / "home/tablet/index.html").exists())
            self.assertFalse((output / "product/rover/RoverExperience.jsx").exists())
            self.assertFalse((output / "product/rover/source-images").exists())
            self.assertFalse((output / "assets/product-3d/build-report.json").exists())
            self.assertFalse((output / "assets/product-3d/prepaint.js").exists())
            self.assertTrue((output / "implements/assembled/arms.webp").is_file())
            self.assertTrue((output / "models/rover.glb").is_file())
            product = (output / "product/index.html").read_text()
            self.assertNotIn("<!-- rover-startup -->", product)
            self.assertIn("rover-boot-3d", product.split("</head>")[0])
            self.assertFalse(any(p.suffix in (".jsx", ".bip", ".py", ".md") for p in output.rglob("*")))
            before = {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()}
            build(output)
            self.assertEqual(before, {p.relative_to(output): p.read_bytes() for p in output.rglob("*") if p.is_file()})

    def test_build_preserves_unowned_files_and_previous_output_on_failure(self):
        with TemporaryDirectory() as temp:
            unowned = Path(temp) / "unowned"
            unowned.mkdir()
            (unowned / "important.txt").write_text("keep")
            with self.assertRaisesRegex(ValueError, "non-generated"):
                build(unowned)
            self.assertEqual((unowned / "important.txt").read_text(), "keep")
            output = build(Path(temp) / "site")
            previous = (output / "index.html").read_bytes()
            with patch("build_site.read_page", side_effect=ValueError("missing tablet")):
                with self.assertRaises(ValueError):
                    build(output)
            self.assertEqual(previous, (output / "index.html").read_bytes())

if __name__ == "__main__":
    main()
