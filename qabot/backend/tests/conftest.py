import os
import sys
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

os.environ["PRELOAD_MODELS"] = "0"  # don't load real models when TestClient starts the app
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.insert(0, os.path.dirname(__file__))

import llm  # noqa: E402
import main  # noqa: E402
import ocr  # noqa: E402


class FakeVectorStore:
    """Stands in for Chroma: no embeddings, deterministic retrieval."""

    def __init__(self, chunks, metadatas):
        self.chunks = chunks
        self.metadatas = metadatas
        self.deleted = False
        self.last_query = None

    def as_retriever(self, **_kwargs):
        store = self

        class _Retriever:
            def invoke(self, query):
                store.last_query = query
                return [
                    SimpleNamespace(page_content=c, metadata=m)
                    for c, m in list(zip(store.chunks, store.metadatas))[:4]
                ]

        return _Retriever()

    def get(self, include=None):
        # Return in reverse to prove the summarizer re-sorts by chunk_index.
        return {"documents": self.chunks[::-1], "metadatas": self.metadatas[::-1]}

    def delete_collection(self):
        self.deleted = True


class FakeLLM:
    """Records calls to llm.generate and returns canned answers."""

    def __init__(self):
        self.calls = []
        self.reply = "A grounded answer (p. 1)."
        self.error = None

    def __call__(self, system, prompt, effort="low"):
        self.calls.append({"system": system, "prompt": prompt, "effort": effort})
        if self.error:
            raise self.error
        return self.reply


class FakeOCR:
    """Replaces the real OCR engine; returns queued answers ('' once the queue is empty)."""

    def __init__(self):
        self.answers: list[str] = []
        self.calls = []

    def __call__(self, image):
        self.calls.append(image.size)
        return self.answers.pop(0) if self.answers else ""


@pytest.fixture(autouse=True)
def fake_ocr(request, monkeypatch):
    # Tests marked `real_ocr` exercise the actual RapidOCR engine.
    if request.node.get_closest_marker("real_ocr"):
        return None
    fake = FakeOCR()
    monkeypatch.setattr(ocr, "ocr_image", fake)
    return fake


@pytest.fixture
def fake_llm(monkeypatch):
    fake = FakeLLM()
    monkeypatch.setattr(llm, "generate", fake)
    return fake


@pytest.fixture
def client(monkeypatch, tmp_path, fake_llm):
    monkeypatch.setattr(main, "CHROMA_DIR", str(tmp_path / "chroma"))
    monkeypatch.setattr(main, "build_vector_store", lambda chunks, metas: FakeVectorStore(chunks, metas))
    main.vector_store = None
    main.doc_metadata = None
    with TestClient(main.app) as test_client:
        yield test_client
    main.vector_store = None
    main.doc_metadata = None
