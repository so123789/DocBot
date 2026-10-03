"""Input validation for uploads and questions.

Kept free of FastAPI/LLM imports so it can be unit-tested in isolation.
"""
import io
import os
import re
import zipfile

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "20")) * 1024 * 1024
MAX_PAGES = int(os.getenv("MAX_PDF_PAGES", "300"))
MAX_IMAGE_PIXELS = 50_000_000  # ~50 MP; guards against decompression bombs
MIN_QUESTION_CHARS = 2
MAX_QUESTION_CHARS = 2000
MAX_FILENAME_CHARS = 255

# kind -> (extensions, accepted content types)
FILE_KINDS = {
    "pdf": ({".pdf"}, {"application/pdf", "application/x-pdf"}),
    "docx": (
        {".docx"},
        {"application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip"},
    ),
    "image": (
        {".png", ".jpg", ".jpeg", ".webp"},
        {"image/png", "image/jpeg", "image/jpg", "image/pjpeg", "image/webp"},
    ),
}
# Some browsers/OSes send these for any file; we then rely on the file signature.
GENERIC_CONTENT_TYPES = {"application/octet-stream", ""}

SUPPORTED_LABEL = "PDF, Word (.docx) or image (PNG, JPG, WEBP)"

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class ValidationError(ValueError):
    """Raised when user input fails validation. `status_code` maps to HTTP."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def sanitize_filename(filename: str | None) -> str:
    """Strip any path components and control characters from a client filename."""
    if not filename:
        return ""
    name = filename.replace("\\", "/").split("/")[-1]
    name = _CONTROL_CHARS.sub("", name).strip()
    return name[:MAX_FILENAME_CHARS]


def kind_from_extension(name: str) -> str | None:
    ext = os.path.splitext(name.lower())[1]
    for kind, (extensions, _) in FILE_KINDS.items():
        if ext in extensions:
            return kind
    return None


def _signature_matches(kind: str, content: bytes) -> bool:
    if kind == "pdf":
        # The PDF header must appear within the first 1024 bytes (spec allows leading junk).
        return b"%PDF-" in content[:1024]
    if kind == "docx":
        if not content.startswith(b"PK\x03\x04"):
            return False
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                return "word/document.xml" in zf.namelist()
        except zipfile.BadZipFile:
            return False
    if kind == "image":
        return (
            content.startswith(b"\x89PNG\r\n\x1a\n")
            or content.startswith(b"\xff\xd8\xff")
            or (content[:4] == b"RIFF" and content[8:12] == b"WEBP")
        )
    return False


def validate_upload(filename: str | None, content_type: str | None, content: bytes) -> tuple[str, str]:
    """Validate an upload and return (sanitized_filename, kind) where kind is pdf/docx/image.

    Checks run cheapest-first: name, declared type, size, then file signature.
    """
    name = sanitize_filename(filename)
    if not name:
        raise ValidationError("A file name is required.")

    if name.lower().endswith(".doc"):
        raise ValidationError("Legacy .doc files aren't supported. Please save it as .docx or PDF.")
    kind = kind_from_extension(name)
    if kind is None:
        raise ValidationError(f"Unsupported file type. Please upload a {SUPPORTED_LABEL} file.")

    declared = (content_type or "").split(";")[0].strip().lower()
    if declared not in FILE_KINDS[kind][1] | GENERIC_CONTENT_TYPES:
        raise ValidationError(f"Content type '{declared}' doesn't match the file extension.")

    if not content:
        raise ValidationError("The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        limit_mb = MAX_UPLOAD_BYTES // (1024 * 1024)
        raise ValidationError(f"File is too large. Maximum size is {limit_mb} MB.", status_code=413)

    if not _signature_matches(kind, content):
        label = {"pdf": "PDF", "docx": "Word document", "image": "image"}[kind]
        raise ValidationError(f"This file does not look like a valid {label}.")

    return name, kind


def validate_page_count(pages: int) -> None:
    if pages > MAX_PAGES:
        raise ValidationError(f"PDF has {pages} pages. Maximum supported is {MAX_PAGES}.")


def clean_question(question: str) -> str:
    """Normalize a question and enforce length bounds. Returns the cleaned text."""
    if not isinstance(question, str):
        raise ValidationError("Question must be text.", status_code=422)
    cleaned = _CONTROL_CHARS.sub("", question).strip()
    if len(cleaned) < MIN_QUESTION_CHARS:
        raise ValidationError("Please enter a question.", status_code=422)
    if len(cleaned) > MAX_QUESTION_CHARS:
        raise ValidationError(
            f"Question is too long. Maximum is {MAX_QUESTION_CHARS} characters.", status_code=422
        )
    return cleaned
