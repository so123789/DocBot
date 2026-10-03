import anthropic
import httpx2
import pytest

import llm
import main
import extractors
import validation
from pdf_factory import image_bytes, make_docx, make_pdf, text_image

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def upload(client, data: bytes, name="report.pdf", content_type="application/pdf"):
    return client.post("/upload", files={"file": (name, data, content_type)})


def api_error(cls, status):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("error", response=httpx2.Response(status, request=request), body=None)


@pytest.fixture
def loaded(client):
    res = upload(client, make_pdf(["Photosynthesis converts light into energy.", "Chlorophyll is green."]))
    assert res.status_code == 200, res.text
    return client


# ── Health ───────────────────────────────────────────────────────
def test_health_reports_model_and_state(client):
    body = client.get("/").json()
    assert body["status"] == "running"
    assert body["model"] == "claude-sonnet-5-5"
    assert body["pdf_loaded"] is False


# ── Upload ───────────────────────────────────────────────────────
class TestUpload:
    def test_valid_pdf_is_indexed(self, client):
        res = upload(client, make_pdf(["Page one text.", "Page two text."]))
        assert res.status_code == 200
        body = res.json()
        assert body["filename"] == "report.pdf"
        assert body["pages"] == 2
        assert body["chunks"] == 2
        assert body["characters"] > 0
        assert client.get("/").json()["pdf_loaded"] is True

    def test_chunks_carry_page_metadata(self, client):
        upload(client, make_pdf(["First.", "", "Third."]))
        pages = [m["page"] for m in main.vector_store.metadatas]
        assert pages == [1, 3]
        assert main.doc_metadata["pages"] == 3  # blank page still counts toward total

    def test_rejects_non_pdf_extension(self, client):
        res = upload(client, b"hello", name="notes.txt", content_type="text/plain")
        assert res.status_code == 400
        assert "Unsupported file type" in res.json()["detail"]

    def test_rejects_renamed_file(self, client):
        res = upload(client, b"just text pretending", name="fake.pdf")
        assert res.status_code == 400
        assert "valid PDF" in res.json()["detail"]

    def test_rejects_empty_file(self, client):
        res = upload(client, b"")
        assert res.status_code == 400
        assert "empty" in res.json()["detail"]

    def test_rejects_oversized_file(self, client, monkeypatch):
        monkeypatch.setattr(validation, "MAX_UPLOAD_BYTES", 100)
        res = upload(client, make_pdf(["x"]))
        assert res.status_code == 413

    def test_rejects_corrupted_pdf(self, client):
        res = upload(client, b"%PDF-1.4\n garbage that is not a pdf body")
        assert res.status_code == 400
        assert "Could not read this PDF" in res.json()["detail"]

    def test_rejects_pdf_without_text_even_after_ocr(self, client, fake_ocr):
        res = upload(client, make_pdf(["", ""]))
        assert res.status_code == 422
        assert "No readable text found, even after OCR" in res.json()["detail"]
        assert len(fake_ocr.calls) == 2  # both blank pages were tried

    def test_rejects_too_many_pages(self, client, monkeypatch):
        monkeypatch.setattr(extractors, "validate_page_count", lambda n: validation.validate_page_count(n + 10_000))
        res = upload(client, make_pdf(["a"]))
        assert res.status_code == 400
        assert "Maximum supported" in res.json()["detail"]

    def test_missing_file_field(self, client):
        res = client.post("/upload")
        assert res.status_code == 422

    def test_failed_upload_keeps_previous_document(self, loaded):
        previous = main.vector_store
        res = upload(loaded, b"not a pdf", name="bad.pdf")
        assert res.status_code == 400
        assert main.vector_store is previous
        assert loaded.get("/stats").json()["filename"] == "report.pdf"

    def test_new_upload_replaces_previous(self, loaded):
        old_store = main.vector_store
        upload(loaded, make_pdf(["New doc."]), name="second.pdf")
        assert old_store.deleted is True
        assert loaded.get("/stats").json()["filename"] == "second.pdf"

    def test_path_in_filename_is_stripped(self, client):
        res = upload(client, make_pdf(["x y z"]), name="../../evil.pdf")
        assert res.json()["filename"] == "evil.pdf"


# ── OCR uploads (engine faked; see test_extractors for real OCR) ──
class TestOcrUploads:
    def test_scanned_pdf_is_ocrd(self, client, fake_ocr):
        fake_ocr.answers = ["Scanned page about enzymes and catalysts."]
        res = upload(client, make_pdf(["", "Typed page with plenty of selectable text."]))
        assert res.status_code == 200
        body = res.json()
        assert body["kind"] == "pdf"
        assert body["unit"] == "page"
        assert body["pages"] == 2
        assert body["ocr_pages"] == 1
        assert main.vector_store.metadatas[0] == {
            "page": 1, "location": "p. 1", "ocr": True, "chunk_index": 0, "source": "report.pdf",
        }
        assert main.vector_store.metadatas[1]["ocr"] is False

    def test_ocr_sources_are_flagged_in_prompt_and_response(self, client, fake_ocr, fake_llm):
        fake_ocr.answers = ["Scanned page about enzymes and catalysts."]
        upload(client, make_pdf([""]))
        body = client.post("/ask", json={"question": "What about enzymes?"}).json()
        assert body["sources"][0]["ocr"] is True
        assert body["sources"][0]["location"] == "p. 1"
        assert 'ocr="true"' in fake_llm.calls[-1]["prompt"]

    def test_docx_upload(self, client, fake_ocr):
        fake_ocr.answers = ["Diagram label: Krebs cycle"]
        doc = make_docx(["Intro paragraph about metabolism.", [["Term", "Meaning"], ["ATP", "energy"]], text_image(["x"])])
        res = upload(client, doc, name="notes.docx", content_type=DOCX_MIME)
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["kind"] == "docx"
        assert body["unit"] == "section"
        assert body["ocr_pages"] == 1
        text = "\n".join(main.vector_store.chunks)
        assert "Intro paragraph" in text and "ATP | energy" in text and "Krebs cycle" in text
        assert main.vector_store.metadatas[0]["location"] == "section 1"

    def test_image_upload(self, client, fake_ocr):
        fake_ocr.answers = ["Whiteboard: exam on Friday"]
        res = upload(client, image_bytes(text_image(["x"])), name="board.png", content_type="image/png")
        assert res.status_code == 200
        body = res.json()
        assert (body["kind"], body["unit"], body["pages"], body["ocr_pages"]) == ("image", "image", 1, 1)
        assert main.vector_store.metadatas[0]["location"] == "image"

    def test_image_without_text(self, client):
        res = upload(client, image_bytes(text_image([])), name="blank.jpg", content_type="image/jpeg")
        assert res.status_code == 422
        assert "even after OCR" in res.json()["detail"]

    def test_corrupted_image(self, client):
        res = upload(client, b"\x89PNG\r\n\x1a\n" + b"\x00" * 50, name="bad.png", content_type="image/png")
        assert res.status_code == 400
        assert "Could not read this image" in res.json()["detail"]

    def test_corrupted_docx(self, client):
        import io
        import zipfile

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("word/document.xml", "<not really xml")
        res = upload(client, buf.getvalue(), name="bad.docx", content_type=DOCX_MIME)
        assert res.status_code == 400
        assert "Could not read this Word document" in res.json()["detail"]


# ── Stats ────────────────────────────────────────────────────────
def test_stats_without_document(client):
    assert client.get("/stats").status_code == 400


def test_stats_with_document(loaded):
    body = loaded.get("/stats").json()
    assert body == {
        "filename": "report.pdf",
        "kind": "pdf",
        "unit": "page",
        "pages": 2,
        "chunks": 2,
        "characters": body["characters"],
        "ocr_pages": 0,
        "ocr_skipped": 0,
    }


# ── Ask ──────────────────────────────────────────────────────────
class TestAsk:
    def test_requires_document(self, client):
        res = client.post("/ask", json={"question": "What is this?"})
        assert res.status_code == 400
        assert "upload a document" in res.json()["detail"]

    def test_returns_answer_and_sources(self, loaded, fake_llm):
        res = loaded.post("/ask", json={"question": "What is photosynthesis?"})
        assert res.status_code == 200
        body = res.json()
        assert body["answer"] == fake_llm.reply
        assert body["sources"][0]["page"] == 1
        assert "Photosynthesis" in body["sources"][0]["preview"]

    def test_prompt_wraps_context_and_uses_low_effort(self, loaded, fake_llm):
        loaded.post("/ask", json={"question": "  What is chlorophyll?  "})
        call = fake_llm.calls[-1]
        assert call["effort"] == "low"
        assert "<document>" in call["prompt"]
        assert '<excerpt location="p. 2" ocr="false">' in call["prompt"]
        assert call["prompt"].endswith("Question: What is chlorophyll?")  # trimmed
        assert "untrusted" in call["system"]
        assert main.vector_store.last_query == "What is chlorophyll?"

    @pytest.mark.parametrize("question", ["", "   ", "a"])
    def test_rejects_blank_question(self, loaded, question, fake_llm):
        res = loaded.post("/ask", json={"question": question})
        assert res.status_code == 422
        assert res.json()["detail"] == "Please enter a question."
        assert fake_llm.calls == []

    def test_rejects_too_long_question(self, loaded):
        res = loaded.post("/ask", json={"question": "x" * 2001})
        assert res.status_code == 422
        assert "too long" in res.json()["detail"]

    def test_rejects_missing_or_wrong_type(self, loaded):
        assert loaded.post("/ask", json={}).status_code == 422
        assert loaded.post("/ask", json={"question": 42}).status_code == 422

    @pytest.mark.parametrize(
        "error, status, message",
        [
            (llm.LLMRefusal("cyber"), 422, "declined"),
            (llm.LLMConfigError("missing"), 500, "not configured"),
            (api_error(anthropic.AuthenticationError, 401), 502, "rejected"),
            (api_error(anthropic.RateLimitError, 429), 429, "Too many requests"),
            (api_error(anthropic.InternalServerError, 500), 502, "Claude returned an error"),
        ],
    )
    def test_llm_errors_map_to_friendly_responses(self, loaded, fake_llm, error, status, message):
        fake_llm.error = error
        res = loaded.post("/ask", json={"question": "Anything?"})
        assert res.status_code == status
        assert message in res.json()["detail"]

    def test_connection_error_maps_to_503(self, loaded, fake_llm):
        fake_llm.error = anthropic.APIConnectionError(
            request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        )
        res = loaded.post("/ask", json={"question": "Anything?"})
        assert res.status_code == 503


# ── Summarize ────────────────────────────────────────────────────
class TestSummarize:
    def test_requires_document(self, client):
        assert client.post("/summarize").status_code == 400

    def test_short_document_single_call(self, loaded, fake_llm):
        fake_llm.reply = "## Overview\nShort."
        res = loaded.post("/summarize")
        assert res.status_code == 200
        assert res.json()["summary"] == "## Overview\nShort."
        assert len(fake_llm.calls) == 1
        assert fake_llm.calls[0]["effort"] == "medium"
        # Chunks are re-ordered by chunk_index even though the store returns them reversed
        prompt = fake_llm.calls[0]["prompt"]
        assert prompt.index("Photosynthesis") < prompt.index("Chlorophyll")

    def test_long_document_map_reduce(self, client, fake_llm, monkeypatch):
        monkeypatch.setattr(main, "MAX_BATCH_CHARS", 20)
        upload(client, make_pdf(["Alpha section text here.", "Beta section text here.", "Gamma section."]))
        res = client.post("/summarize")
        assert res.status_code == 200
        # 3 section summaries + 1 combine step
        assert len(fake_llm.calls) == 4
        assert "<section_summary>" in fake_llm.calls[-1]["prompt"]

    def test_llm_failure_surfaces(self, loaded, fake_llm):
        fake_llm.error = api_error(anthropic.RateLimitError, 429)
        assert loaded.post("/summarize").status_code == 429


# ── Helpers ──────────────────────────────────────────────────────
def test_batch_chunks_respects_limit():
    batches = main.batch_chunks(["aaaa", "bbbb", "cccc"], max_chars=8)
    assert batches == ["aaaa\n\nbbbb", "cccc"]


def test_preview_only_marks_truncated_text():
    assert main.preview("  short text  ") == "short text"
    long = main.preview("word " * 100, limit=20)
    assert long.endswith("…") and len(long) <= 21


def test_batch_chunks_keeps_oversized_chunk_whole():
    assert main.batch_chunks(["x" * 50], max_chars=10) == ["x" * 50]
