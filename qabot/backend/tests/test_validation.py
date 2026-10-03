import io
import zipfile

import pytest

import validation
from pdf_factory import make_docx
from validation import (
    ValidationError,
    clean_question,
    sanitize_filename,
    validate_page_count,
    validate_upload,
)

PDF = b"%PDF-1.4\n% minimal body"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 20
WEBP = b"RIFF\x00\x00\x00\x00WEBPVP8 " + b"\x00" * 20


class TestSanitizeFilename:
    def test_strips_unix_path_traversal(self):
        assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"

    def test_strips_windows_paths(self):
        assert sanitize_filename("C:\\Users\\me\\report.pdf") == "report.pdf"

    def test_removes_control_characters(self):
        assert sanitize_filename("re\x00po\x1frt.pdf") == "report.pdf"

    def test_empty_and_none(self):
        assert sanitize_filename("") == ""
        assert sanitize_filename(None) == ""

    def test_truncates_long_names(self):
        assert len(sanitize_filename("a" * 400 + ".pdf")) == validation.MAX_FILENAME_CHARS


class TestValidateUpload:
    def test_accepts_valid_pdf(self):
        assert validate_upload("notes.pdf", "application/pdf", PDF) == ("notes.pdf", "pdf")

    def test_accepts_uppercase_extension(self):
        assert validate_upload("NOTES.PDF", "application/pdf", PDF) == ("NOTES.PDF", "pdf")

    def test_accepts_octet_stream_content_type(self):
        assert validate_upload("a.pdf", "application/octet-stream", PDF) == ("a.pdf", "pdf")

    def test_accepts_leading_bytes_before_pdf_header(self):
        assert validate_upload("a.pdf", "application/pdf", b"\n\n" + PDF)[1] == "pdf"

    def test_accepts_docx(self):
        assert validate_upload("report.docx", DOCX_MIME, make_docx(["Hello"])) == ("report.docx", "docx")

    @pytest.mark.parametrize(
        "name, mime, data",
        [
            ("scan.png", "image/png", PNG),
            ("photo.jpg", "image/jpeg", JPG),
            ("photo.JPEG", "image/jpeg", JPG),
            ("pic.webp", "image/webp", WEBP),
        ],
    )
    def test_accepts_images(self, name, mime, data):
        assert validate_upload(name, mime, data) == (name, "image")

    @pytest.mark.parametrize("name", ["", None, "   "])
    def test_rejects_missing_filename(self, name):
        with pytest.raises(ValidationError, match="file name is required"):
            validate_upload(name, "application/pdf", PDF)

    @pytest.mark.parametrize("name", ["notes.txt", "deck.pptx", "doc.pdf.exe", "pdf", "anim.gif"])
    def test_rejects_unsupported_extension(self, name):
        with pytest.raises(ValidationError, match="Unsupported file type"):
            validate_upload(name, "application/pdf", PDF)

    def test_rejects_legacy_doc_with_guidance(self):
        with pytest.raises(ValidationError, match="save it as .docx"):
            validate_upload("old.doc", "application/msword", b"\xd0\xcf\x11\xe0")

    def test_rejects_mismatched_content_type(self):
        with pytest.raises(ValidationError, match="doesn't match"):
            validate_upload("a.pdf", "image/png", PDF)

    def test_rejects_empty_file(self):
        with pytest.raises(ValidationError, match="empty"):
            validate_upload("a.pdf", "application/pdf", b"")

    def test_rejects_oversized_file_with_413(self, monkeypatch):
        monkeypatch.setattr(validation, "MAX_UPLOAD_BYTES", 10)
        with pytest.raises(ValidationError) as exc:
            validate_upload("a.pdf", "application/pdf", PDF)
        assert exc.value.status_code == 413

    @pytest.mark.parametrize(
        "name, mime, data, label",
        [
            ("fake.pdf", "application/pdf", b"PK\x03\x04 zip data", "PDF"),
            ("fake.png", "image/png", PDF, "image"),
            ("fake.jpg", "image/jpeg", b"GIF89a....", "image"),
            ("fake.docx", DOCX_MIME, PDF, "Word document"),
        ],
    )
    def test_rejects_wrong_signature(self, name, mime, data, label):
        with pytest.raises(ValidationError, match=f"valid {label}"):
            validate_upload(name, mime, data)

    def test_rejects_zip_that_is_not_docx(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("hello.txt", "hi")
        with pytest.raises(ValidationError, match="valid Word document"):
            validate_upload("fake.docx", DOCX_MIME, buf.getvalue())

    def test_rejects_truncated_zip_docx(self):
        with pytest.raises(ValidationError, match="valid Word document"):
            validate_upload("broken.docx", DOCX_MIME, b"PK\x03\x04" + b"\x00" * 30)

    def test_returns_sanitized_name(self):
        assert validate_upload("../secret.pdf", "application/pdf", PDF)[0] == "secret.pdf"


class TestPageCount:
    def test_within_limit(self):
        validate_page_count(validation.MAX_PAGES)

    def test_over_limit(self):
        with pytest.raises(ValidationError, match="Maximum supported"):
            validate_page_count(validation.MAX_PAGES + 1)


class TestCleanQuestion:
    def test_trims_whitespace(self):
        assert clean_question("   What is RAG?  \n") == "What is RAG?"

    def test_strips_control_characters(self):
        assert clean_question("Wh\x00at?") == "What?"

    @pytest.mark.parametrize("q", ["", "   ", "\n\t", "a"])
    def test_rejects_empty_or_too_short(self, q):
        with pytest.raises(ValidationError, match="Please enter a question"):
            clean_question(q)

    def test_accepts_max_length(self):
        q = "x" * validation.MAX_QUESTION_CHARS
        assert clean_question(q) == q

    def test_rejects_over_max_length(self):
        with pytest.raises(ValidationError, match="too long"):
            clean_question("x" * (validation.MAX_QUESTION_CHARS + 1))

    def test_rejects_non_string(self):
        with pytest.raises(ValidationError):
            clean_question(123)
