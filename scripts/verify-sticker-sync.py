"""Exercise real vector exports, reordered artboards and failed-save retention."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
import unittest
import xml.etree.ElementTree as ET
import pymupdf

spec = importlib.util.spec_from_file_location("sticker_sync", Path(__file__).with_name("sync-sticker-artwork.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

MANIFEST = [
    {"key": "first", "layer": 1, "width": 160, "height": 160},
    {"key": "second", "layer": 2, "width": 160, "height": 181},
]


def fixture(reorder=False, updated=False, unicode_labels=False):
    doc = pymupdf.open()
    first = doc.add_ocg("01 - Three\u2019s a Charm" if unicode_labels else "01 - First sticker")
    second = doc.add_ocg("02 - 2 Spools\u2019 Worth" if unicode_labels else "02 - Second sticker")
    for oc, color in [(first, (0, 1, 0) if updated else (1, 0, 0)), (second, (0, 0, 1))]:
        page = doc.new_page(width=216, height=216)
        page.draw_circle((108, 108), 50, color=None, fill=color, oc=oc)
    if reorder:
        doc.select([1, 0])
    data = doc.tobytes()
    doc.close()
    return data


class StickerSyncTests(unittest.TestCase):
    def test_boat_bow_border_keeps_curved_stern_and_other_masks(self):
        svg = ET.fromstring(f'''<svg xmlns="{sync.SVG}"><defs>
          <clipPath id="renumbered-hull"><path transform="matrix(1,0,0,-1,0,216)"
            d="M5.168 200.479V98.479H34.652C40.793 67.352 68.239 43.88 101.168 43.88V2.48H197.167V98.479H101.168 197.167V200.479Z"/></clipPath>
          <clipPath id="waves"><path d="M32 112C32 74 63 43 101 43H184V180H32Z"/></clipPath>
        </defs><g clip-path="url(#renumbered-hull)"/></svg>''')
        hull, waves = svg.findall(f".//{{{sync.SVG}}}clipPath/{{{sync.SVG}}}path")
        old_hull, old_waves = dict(hull.attrib), dict(waves.attrib)
        sync.repair_boat_bow_clip(svg)
        self.assertEqual(hull.get('d'), old_hull['d'].replace('197.167', '216'))
        self.assertEqual(hull.get('transform'), old_hull['transform'])
        self.assertEqual(waves.attrib, old_waves)
        self.assertEqual(svg.find(f"{{{sync.SVG}}}g").get('clip-path'), 'url(#renumbered-hull)')
        # Subsequent syncs and an artist's replacement mask are left untouched.
        repaired = ET.tostring(svg)
        sync.repair_boat_bow_clip(svg)
        self.assertEqual(ET.tostring(svg), repaired)
        hull.set('d', old_hull['d'].replace('197.167', '203'))
        custom = ET.tostring(svg)
        sync.repair_boat_bow_clip(svg)
        self.assertEqual(ET.tostring(svg), custom)

    def test_edge_artwork_is_fully_framed_for_square_and_tall_stickers(self):
        with pymupdf.open() as doc:
            for entry in MANIFEST:
                layer = doc.add_ocg(f"{entry['layer']:02} - Edge artwork")
                page = doc.new_page(width=216, height=216)
                page.draw_rect((1, 3, 214, 215), color=None, fill=(1, 0, 0), oc=layer)
            exports = sync.export_stickers(doc.tobytes(), MANIFEST)
        for entry in MANIFEST:
            svg = ET.fromstring(exports[entry['key'] + '.svg'])
            x, y, width, height = map(float, svg.get('viewBox').split())
            self.assertLessEqual(x, -1)
            self.assertLessEqual(y, 1)
            self.assertGreaterEqual(x + width, 216)
            self.assertGreaterEqual(y + height, 217)
            self.assertAlmostEqual(width / height, entry['width'] / entry['height'])
            self.assertEqual(svg.get('width'), str(entry['width']))
            self.assertEqual(svg.get('height'), str(entry['height']))
            self.assertNotIn(b'<image', exports[entry['key'] + '.svg'])

    def test_fitting_artwork_keeps_its_original_frame(self):
        exports = sync.export_stickers(fixture(), MANIFEST)
        for entry in MANIFEST:
            svg = ET.fromstring(exports[entry['key'] + '.svg'])
            x, y, width, height = map(float, svg.get('viewBox').split())
            scale = 192 / max(entry['width'], entry['height'])
            self.assertAlmostEqual(width, entry['width'] * scale, places=5)
            self.assertAlmostEqual(height, entry['height'] * scale, places=5)
            self.assertAlmostEqual(x + width / 2, 108, places=5)
            self.assertAlmostEqual(y + height / 2, 108, places=5)

    def test_hidden_path_bounds_do_not_expand_the_frame(self):
        with pymupdf.open() as doc:
            layer = doc.add_ocg('01 - Masked artwork')
            page = doc.new_page(width=216, height=216)
            page.draw_rect((-1000, -1000, 1000, 1000), color=None, fill=(1, 0, 0), oc=layer)
            content = page.get_contents()[0]
            doc.update_stream(content, b'q 60 60 96 96 re W n\n' + doc.xref_stream(content) + b'\nQ')
            exports = sync.export_stickers(doc.tobytes(), MANIFEST[:1])
        svg = ET.fromstring(exports['first.svg'])
        self.assertEqual(list(map(float, svg.get('viewBox').split())), [12, 12, 192, 192])

    def test_running_watcher_reloads_catalog_without_another_source_save(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source, manifest, target = root / "stickers.ai", root / "manifest.json", root / "live"
            source.write_bytes(fixture())
            manifest.write_text(json.dumps(MANIFEST[:1]), encoding="utf-8")
            child = subprocess.Popen([
                sys.executable, str(Path(__file__).with_name("sync-sticker-artwork.py")),
                "--source", str(source), "--manifest", str(manifest), "--target", str(target),
                "--watch", "--log-file", str(root / "watch.log"),
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

            def wait_for_export(name):
                deadline = time.monotonic() + 12
                while time.monotonic() < deadline:
                    if (target / name).exists():
                        return
                    time.sleep(0.1)
                self.fail((root / "watch.log").read_text(encoding="utf-8"))

            try:
                wait_for_export("first.svg")
                self.assertFalse((target / "second.svg").exists())
                manifest.write_text(json.dumps(MANIFEST), encoding="utf-8")
                wait_for_export("second.svg")
            finally:
                child.terminate()
                child.wait(timeout=5)

    def test_unicode_layer_labels_keep_sticker_identity(self):
        exports = sync.export_stickers(fixture(unicode_labels=True), MANIFEST)
        self.assertEqual(set(exports), {"first.svg", "second.svg"})

    def test_extra_empty_artboard_does_not_stop_exports(self):
        with pymupdf.open(stream=fixture(), filetype="pdf") as doc:
            doc.new_page(width=216, height=216)
            exports = sync.export_stickers(doc.tobytes(), MANIFEST)
        self.assertEqual(set(exports), {"first.svg", "second.svg"})

    def test_removed_artboard_preserves_only_its_export(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source, target = root / "stickers.ai", root / "live"
            source.write_bytes(fixture())
            sync.sync(source, MANIFEST, [target])
            first = (target / "first.svg").read_bytes()
            second = (target / "second.svg").read_bytes()
            with pymupdf.open(stream=fixture(updated=True), filetype="pdf") as doc:
                doc.delete_page(1)
                source.write_bytes(doc.tobytes())
            status = sync.sync(source, MANIFEST, [target])
            self.assertNotEqual((target / "first.svg").read_bytes(), first)
            self.assertEqual((target / "second.svg").read_bytes(), second)
            self.assertEqual(status["stickers"], 1)
            self.assertEqual(status["retained"], ["second"])
            self.assertEqual(set(status["issues"]), {"second"})

    def test_reordered_artboards_keep_sticker_identity(self):
        original = sync.export_stickers(fixture(), MANIFEST)
        reordered = sync.export_stickers(fixture(reorder=True), MANIFEST)
        for key in original:
            with pymupdf.open(stream=original[key], filetype="svg") as left, pymupdf.open(stream=reordered[key], filetype="svg") as right:
                self.assertEqual(left[0].get_pixmap().samples, right[0].get_pixmap().samples)
        self.assertIn(b'height="181"', original["second.svg"])
        self.assertNotIn(b"<image", original["first.svg"])

    def test_valid_save_replaces_outputs_and_invalid_save_preserves_them(self):
        with TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "stickers.ai"
            target = root / "live"
            source.write_bytes(fixture())
            sync.sync(source, MANIFEST, [target])
            original = (target / "first.svg").read_bytes()
            source.write_bytes(fixture(updated=True))
            sync.sync(source, MANIFEST, [target])
            changed = (target / "first.svg").read_bytes()
            self.assertNotEqual(original, changed)
            source.write_bytes(b"unfinished Illustrator save")
            with self.assertRaises(Exception):
                sync.sync(source, MANIFEST, [target])
            self.assertEqual((target / "first.svg").read_bytes(), changed)
            self.assertFalse(list(target.glob("*.tmp")))


if __name__ == "__main__":
    unittest.main()
