"""Export the saved Illustrator master to the site's live SVG folder.

Install scripts/sticker-artwork-requirements.txt, then use --help. The .ai must
be saved with Create PDF Compatible File enabled, and retain numbered layers.
"""
import argparse
import hashlib
import json
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import re
import sys
import time
import xml.etree.ElementTree as ET

import pymupdf

SVG = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG)
ET.register_namespace("xlink", "http://www.w3.org/1999/xlink")
ET.register_namespace("inkscape", "http://www.inkscape.org/namespaces/inkscape")


def signature(source):
    stat = source.stat()
    return stat.st_mtime_ns, stat.st_size


def read_source(source):
    before = signature(source)
    if before[1] > 128 * 1024 * 1024:
        raise ValueError("Illustrator file exceeds the 128 MB sync limit")
    data = source.read_bytes()
    if signature(source) != before or len(data) != before[1]:
        raise ValueError("Illustrator is still saving; waiting for a complete file")
    return data


def sticker_viewbox(page, entry):
    """Keep the usual scale, expanding the frame to contain all visible artwork."""
    scale = 192 / max(entry["width"], entry["height"])
    width, height = entry["width"] * scale, entry["height"] * scale
    center = page.rect.tl + (page.rect.br - page.rect.tl) / 2
    # Measure rendered alpha rather than path bounds: Illustrator clipping masks
    # can hide enormous paths (for example the waves behind the boat).
    # Only measurement is rasterized; the exported artwork stays vector SVG.
    resolution = 2
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(resolution, resolution), alpha=True)
    alpha = pymupdf.Pixmap(None, pixmap)
    samples = alpha.samples
    left, top, right, bottom = alpha.width, alpha.height, 0, 0
    for y in range(alpha.height):
        row = samples[y * alpha.width:(y + 1) * alpha.width]
        visible = row.strip(b"\0")
        if visible:
            left = min(left, len(row) - len(row.lstrip(b"\0")))
            right = max(right, len(row.rstrip(b"\0")))
            top = min(top, y)
            bottom = y + 1
    if right > left:
        # Two PDF points of breathing room include antialiasing and edge strokes.
        bounds = pymupdf.Rect(left, top, right, bottom) / resolution
        bounds += (-2, -2, 2, 2)
        growth = max(1, 2 * (center.x - bounds.x0) / width,
                     2 * (bounds.x1 - center.x) / width,
                     2 * (center.y - bounds.y0) / height,
                     2 * (bounds.y1 - center.y) / height)
        width, height = width * growth, height * growth
    return pymupdf.Rect(center.x - width / 2, center.y - height / 2,
                        center.x + width / 2, center.y + height / 2)


def repair_boat_bow_clip(svg):
    """Restore the bow's white border without changing the curved stern mask."""
    # The original Illustrator mask stops inside the hull's 8.64-point white
    # outline. Extend only its right edge to the 216-point artboard boundary.
    # Match the legacy geometry, not MuPDF's generated clip IDs, so reordered
    # artboards still work and newly drawn masks keep the artist's intent.
    original = "M5.168 200.479V98.479H34.652C40.793 67.352 68.239 43.88 101.168 43.88V2.48H197.167V98.479H101.168 197.167V200.479Z"
    for path in svg.findall(f".//{{{SVG}}}clipPath/{{{SVG}}}path"):
        if path.get("d") == original:
            path.set("d", original.replace("197.167", "216"))


def export_stickers(data, manifest, issues=None):
    """Match artwork by numbered layer and visible artboard, including reordered boards."""
    if issues is None:
        issues = {}
    entries = {entry["layer"]: entry for entry in manifest}
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        if not doc.page_count:
            raise ValueError("No saved artboards; keeping the last good exports")
        layers = {}
        for xref, layer in doc.get_ocgs().items():
            match = re.match(r"^(\d+)\s*-\s*", layer["name"])
            if match:
                number = int(match[1])
                if number in layers:
                    raise ValueError(f"Duplicate numbered layer {number}")
                layers[number] = (xref, layer["name"])
        expected = set(entries)
        for number in expected - layers.keys():
            issues[entries[number]["key"]] = "Numbered layer is missing"
        doc.set_layer(-1, basestate="ON")
        scores = {number: [0.0] * doc.page_count for number in expected & layers.keys()}
        for page in doc:
            for _, bounds, name in page.get_bboxlog(layers=True):
                # MuPDF can decode Unicode layer labels differently in bbox logs
                # and OCG metadata. The stable numbered prefix identifies both.
                match = re.match(r"^(\d+)\s*-\s*", name)
                number = int(match[1]) if match else None
                if number in scores:
                    scores[number][page.number] += (pymupdf.Rect(bounds) & page.rect).get_area()
        page_numbers = {}
        for number, areas in scores.items():
            page_number = max(range(len(areas)), key=areas.__getitem__)
            if areas[page_number] < 1:
                issues[entries[number]["key"]] = "No visible artwork on a saved artboard"
                continue
            page_numbers[number] = page_number
        for number, page_number in list(page_numbers.items()):
            if list(page_numbers.values()).count(page_number) > 1:
                issues[entries[number]["key"]] = "More than one sticker maps to this artboard"
        for number in list(page_numbers):
            if entries[number]["key"] in issues:
                del page_numbers[number]
        exports = {}
        numbered_xrefs = [layer[0] for layer in layers.values()]
        for entry in manifest:
            number = entry["layer"]
            if number not in page_numbers:
                continue
            doc.set_layer(-1, basestate="ON", off=[xref for xref in numbered_xrefs if xref != layers[number][0]])
            page = doc[page_numbers[number]]
            if abs(page.rect.width - 216) > 0.1 or abs(page.rect.height - 216) > 0.1:
                issues[entry["key"]] = "Artboard must be 3 by 3 inches"
                continue
            svg = ET.fromstring(page.get_svg_image(text_as_path=True))
            if entry["key"] == "first-print":
                repair_boat_bow_clip(svg)
            frame = sticker_viewbox(page, entry)
            svg.set("viewBox", f"{frame.x0:.6f} {frame.y0:.6f} {frame.width:.6f} {frame.height:.6f}")
            svg.set("width", str(entry["width"]))
            svg.set("height", str(entry["height"]))
            # Include only self-contained SVG. Browser requests never follow embedded external URLs.
            for element in svg.iter():
                if element.tag.rsplit("}", 1)[-1] in {"script", "foreignObject"}:
                    raise ValueError("Unexpected active content in exported SVG")
                for name, value in element.attrib.items():
                    if name.rsplit("}", 1)[-1] == "href" and not value.startswith(("#", "data:image/")):
                        raise ValueError("Unexpected external resource in exported SVG")
            exports[f"{entry['key']}.svg"] = ET.tostring(svg, encoding="utf-8", xml_declaration=True)
        if not exports:
            raise ValueError("No exportable sticker artboards; keeping the last good exports")
        return exports


def atomic_write(file, data):
    if file.exists() and file.read_bytes() == data:
        return
    temporary = file.with_name(file.name + f".{os.getpid()}.tmp")
    try:
        temporary.write_bytes(data)
        os.replace(temporary, file)
    finally:
        temporary.unlink(missing_ok=True)


def sync(source, manifest, targets, bundled=None):
    data = read_source(source)
    issues = {}
    exports = export_stickers(data, manifest, issues)
    stamp = {"source": source.name, "sha256": hashlib.sha256(data).hexdigest(), "stickers": len(exports), "retained": list(issues)}
    if issues:
        stamp["issues"] = issues
    for target in targets:
        target.mkdir(parents=True, exist_ok=True)
        for name, svg in exports.items():
            atomic_write(target / name, svg)
        atomic_write(target / "sync-status.json", (json.dumps(stamp, indent=2) + "\n").encode())
    if bundled:
        bundled.mkdir(parents=True, exist_ok=True)
        for name, svg in exports.items():
            atomic_write(bundled / ("sticker-" + name), svg)
    if issues:
        logging.warning("Updated %s stickers; retained prior exports for %s", len(exports), "; ".join(f"{key}: {reason}" for key, reason in issues.items()))
    return stamp


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, default=Path(__file__).resolve().parents[1] / "src/lib/sticker-artwork.json")
    parser.add_argument("--target", type=Path, action="append", required=True, help="The stickers subfolder inside ARTWORK_ROOT")
    parser.add_argument("--bundle", type=Path, help="Also refresh bundled fallback SVGs in this public directory")
    parser.add_argument("--watch", action="store_true")
    parser.add_argument("--log-file", type=Path)
    args = parser.parse_args()
    handlers = [logging.StreamHandler()] if sys.stderr else []
    if args.log_file:
        args.log_file.parent.mkdir(parents=True, exist_ok=True)
        handlers.append(RotatingFileHandler(args.log_file, maxBytes=500_000, backupCount=2, encoding="utf-8"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s", handlers=handlers)
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not args.watch:
        logging.info("Synced %s", sync(args.source, manifest, args.target, args.bundle))
        return
    # A process lock prevents duplicate watchers after a restart or login.
    lockfile = (args.log_file or args.source).with_suffix(".watch.lock")
    lock = lockfile.open("a+b")
    lock.seek(0)
    if os.name == "nt":
        import msvcrt
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return
    else:
        import fcntl
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    previous = pending = None
    last_error = None
    while True:
        try:
            current = (signature(args.source), signature(args.manifest))
            if current != previous:
                if current == pending:
                    # Catalog updates arrive independently of Illustrator saves.
                    # Never keep a startup-only copy of the sticker list.
                    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
                    stamp = sync(args.source, manifest, args.target, args.bundle)
                    previous = current
                    logging.info("Synced %s stickers from %s (%s)", stamp["stickers"], args.source.name, stamp["sha256"][:12])
                    last_error = None
                pending = current
        except Exception as error:
            message = str(error)
            if message != last_error:
                logging.error("Sync postponed; last good artwork retained: %s", message)
                last_error = message
        time.sleep(2)


if __name__ == "__main__":
    main()
