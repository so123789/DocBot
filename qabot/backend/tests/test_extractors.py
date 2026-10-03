import pytest
from PIL import Image

import extractors
import ocr
from pdf_factory import image_bytes, make_docx, make_pdf, text_image
from validation import ValidationError

LONG_TEXT = "This page has a real text layer with plenty of words."


# ── PDF ──────────────────────────────────────────────────────────
class TestPdf:
    def test_text_pages_skip_ocr(self, fake_ocr):
        result = extractors.extract_pdf(make_pdf([LONG_TEXT, LONG_TEXT]))
        assert [s.number for s in result.sections] == [1, 2]
        assert result.ocr_items == 0
        assert fake_ocr.calls == []

    def test_scanned_page_is_rendered_and_ocrd(self, fake_ocr):
        fake_ocr.answers = ["Text recovered from a scan"]
        result = extractors.extract_pdf(make_pdf([{"image": text_image(["x"])}]))
        assert result.sections[0].text == "Text recovered from a scan"
        assert result.sections[0].ocr is True
        assert result.ocr_items == 1
        # Rendered at OCR_DPI: a US-letter page is ~1700 x 2200 px at 200 DPI.
        width, height = fake_ocr.calls[0]
        assert 1600 < width < 1800 and 2100 < height < 2300

    def test_keeps_tiny_text_when_ocr_finds_nothing(self, fake_ocr):
        result = extractors.extract_pdf(make_pdf(["Page 7"]))
        assert result.sections[0].text == "Page 7"
        assert result.sections[0].ocr is False

    def test_embedded_image_text_is_appended(self, fake_ocr):
        fake_ocr.answers = ["Figure 2: Revenue by region"]
        page = {"text": LONG_TEXT, "image": text_image(["x"]), "rect": (72, 300, 300, 120)}
        result = extractors.extract_pdf(make_pdf([page]))
        section = result.sections[0]
        assert section.text.startswith(LONG_TEXT)
        assert "[Text from image]\nFigure 2: Revenue by region" in section.text
        assert section.ocr is True
        # Only the image region was OCR'd: 300x120 pt at 200 DPI.
        width, height = fake_ocr.calls[0]
        assert 800 < width < 870 and 310 < height < 360

    def test_small_icons_are_ignored(self, fake_ocr):
        page = {"text": LONG_TEXT, "image": text_image(["x"]), "rect": (72, 300, 20, 20)}
        extractors.extract_pdf(make_pdf([page]))
        assert fake_ocr.calls == []

    def test_searchable_scan_is_not_ocrd_twice(self, fake_ocr):
        page = {"text": LONG_TEXT, "image": text_image(["x"]), "rect": (0, 0, 612, 792)}
        result = extractors.extract_pdf(make_pdf([page]))
        assert fake_ocr.calls == []
        assert result.sections[0].text == LONG_TEXT

    def test_ocr_budget_limits_work(self, fake_ocr, monkeypatch):
        monkeypatch.setattr(extractors, "MAX_OCR_ITEMS", 2)
        fake_ocr.answers = ["one", "two", "three"]
        result = extractors.extract_pdf(make_pdf(["", "", "", ""]))
        assert len(fake_ocr.calls) == 2
        assert result.ocr_items == 2
        assert result.ocr_skipped == 2
        assert [s.text for s in result.sections] == ["one", "two"]

    def test_ocr_crash_on_one_page_does_not_fail_upload(self, monkeypatch):
        calls = iter([RuntimeError("onnx exploded"), "Recovered page"])

        def flaky(_image):
            outcome = next(calls)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        monkeypatch.setattr(ocr, "ocr_image", flaky)
        result = extractors.extract_pdf(make_pdf(["", ""]))
        assert [s.text for s in result.sections] == ["Recovered page"]

    def test_corrupted_pdf(self):
        with pytest.raises(ValidationError, match="Could not read this PDF"):
            extractors.extract_pdf(b"%PDF-1.4 garbage")


# ── DOCX ─────────────────────────────────────────────────────────
class TestDocx:
    def test_paragraphs_tables_and_images_in_order(self, fake_ocr):
        fake_ocr.answers = ["Chart: sales up 20%"]
        doc = make_docx([
            "First paragraph.",
            [["Name", "Score"], ["Ada", "95"]],
            text_image(["x"]),
            "Closing paragraph.",
        ])
        result = extractors.extract_docx(doc)
        text = result.sections[0].text
        order = [text.index(s) for s in ["First paragraph.", "Name | Score", "Ada | 95", "Chart: sales up 20%", "Closing paragraph."]]
        assert order == sorted(order)
        assert result.sections[0].ocr is True
        assert result.ocr_items == 1
        assert result.unit == "section"

    def test_long_documents_split_into_sections(self, fake_ocr, monkeypatch):
        monkeypatch.setattr(extractors, "DOCX_SECTION_CHARS", 50)
        result = extractors.extract_docx(make_docx([f"Paragraph number {i} with some words." for i in range(6)]))
        assert result.total_units == len(result.sections) > 1
        assert [s.number for s in result.sections] == list(range(1, len(result.sections) + 1))
        assert all(s.ocr is False for s in result.sections)

    def test_empty_docx_has_no_sections(self):
        assert extractors.extract_docx(make_docx([])).sections == []

    def test_image_without_text_is_skipped(self, fake_ocr):
        result = extractors.extract_docx(make_docx(["Only text.", text_image([])]))
        assert result.sections[0].text == "Only text."
        assert result.sections[0].ocr is False


# ── Images ───────────────────────────────────────────────────────
class TestImage:
    def test_ocr_whole_image(self, fake_ocr):
        fake_ocr.answers = ["Receipt total 42.00"]
        result = extractors.extract_image(image_bytes(text_image(["x"]), "JPEG"))
        assert result.sections[0].text == "Receipt total 42.00"
        assert (result.kind, result.unit, result.total_units) == ("image", "image", 1)

    def test_exif_rotation_is_applied(self, fake_ocr):
        img = Image.new("RGB", (400, 100), "white")
        exif = img.getexif()
        exif[0x0112] = 6  # Orientation: rotate 90° CW
        import io

        buf = io.BytesIO()
        img.save(buf, format="JPEG", exif=exif)
        extractors.extract_image(buf.getvalue())
        assert fake_ocr.calls[0] == (100, 400)

    def test_rejects_decompression_bomb(self, monkeypatch):
        monkeypatch.setattr(extractors, "MAX_IMAGE_PIXELS", 1000)
        with pytest.raises(ValidationError, match="too large"):
            extractors.extract_image(image_bytes(Image.new("RGB", (100, 100))))


def test_location_labels():
    assert extractors.location_label("page", 3) == "p. 3"
    assert extractors.location_label("section", 2) == "section 2"
    assert extractors.location_label("image", 1) == "image"


# ── Real OCR engine (no fakes) ───────────────────────────────────
@pytest.mark.real_ocr
class TestRealOcr:
    def test_reads_image(self):
        text = ocr.ocr_image(text_image(["Mitochondria produce ATP.", "Invoice total: 1,250 USD"]))
        assert "Mitochondria produce ATP" in text
        assert "1,250" in text
        assert text.index("Mitochondria") < text.index("Invoice")  # reading order

    def test_ignores_tiny_and_blank_images(self):
        assert ocr.ocr_image(Image.new("RGB", (20, 20), "white")) == ""
        assert ocr.ocr_image(Image.new("RGB", (600, 400), "white")) == ""

    def test_transparent_png_text_is_read(self):
        img = text_image(["Transparent label 77"]).convert("RGBA")
        # Make the white background fully transparent.
        img.putdata([(0, 0, 0, 0) if p[:3] == (255, 255, 255) else p for p in img.getdata()])
        assert "Transparent label 77" in ocr.ocr_image(img)

    def test_scanned_pdf_end_to_end(self):
        scan = text_image(["Chapter 4: Cell Division", "Mitosis has four phases."], size=(1200, 400), font_size=48)
        result = extractors.extract_pdf(make_pdf([{"image": scan, "rect": (36, 400, 540, 180)}]))
        assert "Cell Division" in result.sections[0].text
        assert "Mitosis" in result.sections[0].text
        assert result.ocr_items == 1

    def test_docx_image_end_to_end(self):
        doc = make_docx(["Lab notes", text_image(["Sample B pH 7.4"])])
        text = extractors.extract_docx(doc).sections[0].text
        assert "Lab notes" in text
        assert "pH 7.4" in text

    def test_line_grouping_reads_columns_left_to_right(self):
        img = Image.new("RGB", (1000, 140), "white")
        from PIL import ImageDraw, ImageFont

        draw = ImageDraw.Draw(img)
        font = ImageFont.load_default(size=40)
        draw.text((30, 40), "Name:", fill="black", font=font)
        draw.text((520, 44), "Ada Lovelace", fill="black", font=font)
        assert "Name: Ada Lovelace" in ocr.ocr_image(img)
