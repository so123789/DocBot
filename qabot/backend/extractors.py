"""Text extraction for PDF, DOCX and image uploads, with OCR for scanned pages and embedded images."""
from dataclasses import dataclass, field
import io
import logging
import os

from PIL import Image, ImageOps, UnidentifiedImageError

import ocr
from validation import MAX_IMAGE_PIXELS, ValidationError, validate_page_count

logger = logging.getLogger(__name__)

# Upper bound on OCR work per upload (scanned pages + embedded images), to keep requests bounded.
MAX_OCR_ITEMS = int(os.getenv("MAX_OCR_ITEMS", "60"))
OCR_DPI = 200
MIN_PAGE_TEXT = 25          # Below this, a PDF page is treated as scanned and OCR'd whole.
MIN_IMAGE_PT = 40           # Skip embedded PDF images smaller than this (points) — icons, bullets.
FULL_PAGE_IMAGE_RATIO = 0.8 # An image covering most of a page that already has text = searchable scan.
DOCX_SECTION_CHARS = 3000   # DOCX has no pages; group text into numbered sections for citations.
VML_IMAGEDATA = "{urn:schemas-microsoft-com:vml}imagedata"  # not in python-docx's namespace map

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS


@dataclass
class Section:
    number: int
    text: str
    ocr: bool = False


@dataclass
class Extraction:
    kind: str                  # pdf | docx | image
    unit: str                  # page | section | image
    total_units: int
    sections: list[Section] = field(default_factory=list)
    ocr_items: int = 0         # pages/images that produced OCR text
    ocr_skipped: int = 0       # pages/images not OCR'd because the budget ran out

    @property
    def characters(self) -> int:
        return sum(len(s.text) for s in self.sections)


def location_label(unit: str, number: int) -> str:
    return {"page": f"p. {number}", "section": f"section {number}"}.get(unit, "image")


class _OcrBudget:
    def __init__(self, limit: int):
        self.remaining = limit
        self.used = 0
        self.skipped = 0

    def run(self, image: Image.Image) -> str:
        if self.remaining <= 0:
            self.skipped += 1
            return ""
        self.remaining -= 1
        try:
            text = ocr.ocr_image(image)
        except Exception as e:  # OCR failure on one image shouldn't fail the whole upload
            logger.warning(f"OCR failed: {e}")
            return ""
        if text:
            self.used += 1
        return text


def _open_image(blob: bytes) -> Image.Image | None:
    try:
        image = Image.open(io.BytesIO(blob))
        if image.width * image.height > MAX_IMAGE_PIXELS:
            return None
        image.load()
        return ImageOps.exif_transpose(image)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        return None


# ── PDF ──────────────────────────────────────────────────────────
def extract_pdf(content: bytes) -> Extraction:
    import pdfplumber

    budget = _OcrBudget(MAX_OCR_ITEMS)
    try:
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            total = len(pdf.pages)
            validate_page_count(total)
            sections = [s for i, page in enumerate(pdf.pages, start=1) if (s := _pdf_page(i, page, budget))]
    except ValidationError:
        raise
    except Exception as e:
        logger.warning(f"Could not parse PDF: {e}")
        raise ValidationError("Could not read this PDF. It may be corrupted or password-protected.")

    return Extraction("pdf", "page", total, sections, budget.used, budget.skipped)


def _pdf_page(number: int, page, budget: _OcrBudget) -> Section | None:
    text = (page.extract_text() or "").strip()

    if len(text) < MIN_PAGE_TEXT:
        # Scanned / image-only page: OCR the whole rendered page.
        rendered = page.to_image(resolution=OCR_DPI).original
        ocr_text = budget.run(rendered)
        if len(ocr_text) > len(text):
            return Section(number, ocr_text, ocr=True)
        return Section(number, text) if text else None

    # Text page: also read text inside embedded images (diagrams, screenshots, charts).
    page_area = float(page.width * page.height) or 1.0
    px0, ptop, px1, pbottom = page.bbox
    image_texts = []
    for img in page.images:
        x0, top = max(img["x0"], px0), max(img["top"], ptop)
        x1, bottom = min(img["x1"], px1), min(img["bottom"], pbottom)
        w, h = x1 - x0, bottom - top
        if w < MIN_IMAGE_PT or h < MIN_IMAGE_PT:
            continue
        if (w * h) / page_area > FULL_PAGE_IMAGE_RATIO:
            continue  # searchable scan: the text layer already covers it
        try:
            crop = page.crop((x0, top, x1, bottom)).to_image(resolution=OCR_DPI).original
        except Exception as e:
            logger.warning(f"Could not render image on page {number}: {e}")
            continue
        if found := budget.run(crop):
            image_texts.append(f"[Text from image]\n{found}")

    if image_texts:
        return Section(number, "\n\n".join([text, *image_texts]), ocr=True)
    return Section(number, text)


# ── DOCX ─────────────────────────────────────────────────────────
def extract_docx(content: bytes) -> Extraction:
    from docx import Document
    from docx.oxml.ns import qn

    try:
        doc = Document(io.BytesIO(content))
    except Exception as e:
        logger.warning(f"Could not parse DOCX: {e}")
        raise ValidationError("Could not read this Word document. It may be corrupted.")

    budget = _OcrBudget(MAX_OCR_ITEMS)
    related = doc.part.related_parts

    def text_of(el) -> str:
        return "".join(t.text or "" for t in el.iter(qn("w:t"))).strip()

    def images_in(el) -> list[str]:
        found = []
        rel_ids = [b.get(qn("r:embed")) for b in el.iter(qn("a:blip"))]
        rel_ids += [v.get(qn("r:id")) for v in el.iter(VML_IMAGEDATA)]  # legacy VML images
        for rid in rel_ids:
            part = related.get(rid) if rid else None
            image = _open_image(part.blob) if part is not None else None
            if image is not None and (text := budget.run(image)):
                found.append(f"[Text from image]\n{text}")
        return found

    blocks: list[tuple[str, bool]] = []  # (text, came_from_ocr), in document order
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            if text := text_of(child):
                blocks.append((text, False))
        elif tag == "tbl":
            rows = []
            for row in child.iter(qn("w:tr")):
                cells = [text_of(cell) for cell in row.iter(qn("w:tc"))]
                if any(cells):
                    rows.append(" | ".join(cells))
            if rows:
                blocks.append(("\n".join(rows), False))
        else:
            continue
        blocks.extend((t, True) for t in images_in(child))

    sections: list[Section] = []
    current, size, has_ocr = [], 0, False
    for text, from_ocr in blocks:
        if current and size + len(text) > DOCX_SECTION_CHARS:
            sections.append(Section(len(sections) + 1, "\n\n".join(current), has_ocr))
            current, size, has_ocr = [], 0, False
        current.append(text)
        size += len(text)
        has_ocr = has_ocr or from_ocr
    if current:
        sections.append(Section(len(sections) + 1, "\n\n".join(current), has_ocr))

    return Extraction("docx", "section", len(sections), sections, budget.used, budget.skipped)


# ── Images ───────────────────────────────────────────────────────
def extract_image(content: bytes) -> Extraction:
    image = _open_image(content)
    if image is None:
        raise ValidationError("Could not read this image. It may be corrupted or too large.")
    budget = _OcrBudget(1)
    text = budget.run(image)
    sections = [Section(1, text, ocr=True)] if text else []
    return Extraction("image", "image", 1, sections, budget.used, budget.skipped)


EXTRACTORS = {"pdf": extract_pdf, "docx": extract_docx, "image": extract_image}


def extract(kind: str, content: bytes) -> Extraction:
    return EXTRACTORS[kind](content)
