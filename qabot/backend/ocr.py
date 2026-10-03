"""Local OCR using RapidOCR (ONNX models bundled with the package; no system deps)."""
from functools import lru_cache
import logging

from PIL import Image

logger = logging.getLogger(__name__)

MIN_CONFIDENCE = 0.5
MAX_SIDE = 2500  # Downscale huge images: OCR cost grows with pixels, accuracy doesn't.
MIN_SIDE = 32    # Smaller than this is an icon/bullet, not text.


@lru_cache(maxsize=1)
def get_engine():
    from rapidocr import RapidOCR

    logger.info("Loading OCR engine (RapidOCR)...")
    return RapidOCR(params={"Global.log_level": "error"})


def _prepare(image: Image.Image) -> Image.Image | None:
    if min(image.size) < MIN_SIDE:
        return None
    if image.mode not in ("RGB", "L"):
        # Flatten transparency onto white so transparent PNG text stays visible.
        background = Image.new("RGB", image.size, "white")
        rgba = image.convert("RGBA")
        background.paste(rgba, mask=rgba.split()[-1])
        image = background
    if max(image.size) > MAX_SIDE:
        image = image.copy()
        image.thumbnail((MAX_SIDE, MAX_SIDE))
    return image.convert("RGB")


def _reading_order(boxes, texts) -> str:
    """Group detected boxes into lines by vertical position, then read left-to-right."""
    items = []
    for box, text in zip(boxes, texts):
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append({"top": min(ys), "bottom": max(ys), "left": min(xs), "text": text})
    items.sort(key=lambda i: (i["top"], i["left"]))

    lines: list[list[dict]] = []
    for item in items:
        if lines:
            last = lines[-1]
            line_top = min(i["top"] for i in last)
            line_bottom = max(i["bottom"] for i in last)
            overlap = min(line_bottom, item["bottom"]) - max(line_top, item["top"])
            if overlap > 0.5 * (item["bottom"] - item["top"]):
                last.append(item)
                continue
        lines.append([item])
    return "\n".join(" ".join(i["text"] for i in sorted(line, key=lambda i: i["left"])) for line in lines)


def ocr_image(image: Image.Image) -> str:
    """Return the text found in an image ('' if none)."""
    import numpy as np

    prepared = _prepare(image)
    if prepared is None:
        return ""
    result = get_engine()(np.array(prepared))
    if not result.txts:
        return ""
    keep = [(b, t) for b, t, s in zip(result.boxes, result.txts, result.scores) if s >= MIN_CONFIDENCE and t.strip()]
    if not keep:
        return ""
    boxes, texts = zip(*keep)
    return _reading_order(boxes, texts).strip()
